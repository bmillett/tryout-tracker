import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin/app';
import {
  validateCreatePayload,
  validateEditPayload,
  validateSlug
} from './_lib/validate.js';

// ---------------------------------------------------------------------------
// Firebase Admin — initialised once per cold start
// ---------------------------------------------------------------------------

function getDB(): Firestore {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new MissingEnvError('FIREBASE_SERVICE_ACCOUNT');
    }
    let parsed: ServiceAccount;
    try {
      // Accept plain JSON or base64-encoded JSON.
      const jsonStr = raw.trim().startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');
      parsed = JSON.parse(jsonStr) as ServiceAccount;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64-encoded JSON)');
    }
    initializeApp({ credential: cert(parsed) });
  }
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

class MissingEnvError extends Error {
  constructor(varName: string) {
    super(`Server configuration error: environment variable "${varName}" is not set`);
    this.name = 'MissingEnvError';
  }
}

/**
 * Constant-time comparison using SHA-256 digests so the comparison is
 * always on equal-length buffers regardless of the actual secret lengths.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Returns null on success, or an error response payload. */
function checkAuth(req: VercelRequest): { status: number; error: string } | null {
  const pin = process.env.SUPER_ADMIN_PIN;
  if (!pin) {
    return { status: 500, error: new MissingEnvError('SUPER_ADMIN_PIN').message };
  }
  const provided = req.headers['x-super-admin-pin'];
  if (typeof provided !== 'string' || !safeEqual(provided, pin)) {
    return { status: 401, error: 'Unauthorized: missing or incorrect x-super-admin-pin header' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Delay helper (applied on every auth failure to blunt brute force)
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  // ---- Auth ----------------------------------------------------------------
  const authErr = checkAuth(req);
  if (authErr) {
    // Fixed delay on failed auth — serverless functions are stateless so this
    // does NOT replace real rate limiting; see security note in the README.
    await delay(700);
    return res.status(authErr.status).json({ error: authErr.error });
  }

  // ---- Route to sub-handlers -----------------------------------------------
  try {
    if (method === 'GET') return await handleGet(req, res);
    if (method === 'POST') return await handlePost(req, res);
    if (method === 'PUT' || method === 'PATCH') return await handlePut(req, res);
    return res.status(405).json({ error: `Method ${method} not allowed` });
  } catch (err: unknown) {
    if (err instanceof MissingEnvError) {
      return res.status(500).json({ error: err.message });
    }
    console.error('[api/teams] unhandled error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// GET /api/teams — list all teams
// ---------------------------------------------------------------------------

async function handleGet(_req: VercelRequest, res: VercelResponse) {
  const db = getDB();
  const snap = await db.collection('teams').get();
  const teams = snap.docs.map((d) => {
    const data = d.data();
    return {
      slug: d.id,
      name: typeof data['name'] === 'string' ? data['name'] : d.id,
      coach_pin: typeof data['coach_pin'] === 'string' ? data['coach_pin'] : '',
      mixed_gender: data['mixed_gender'] === true,
      created_at: data['created_at'] ?? null,
      updated_at: data['updated_at'] ?? null
    };
  });
  return res.status(200).json({ teams });
}

// ---------------------------------------------------------------------------
// POST /api/teams — create a team
// ---------------------------------------------------------------------------

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = validateCreatePayload(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const slug = (body.slug as string).toLowerCase();
  const name = (body.name as string).trim();
  const coach_pin = body.coach_pin as string;
  const mixed_gender = body.mixed_gender as boolean;

  const db = getDB();
  const ref = db.collection('teams').doc(slug);

  // Use a transaction so two concurrent creates with the same slug fail cleanly.
  let alreadyExists = false;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      alreadyExists = true;
      return;
    }
    const now = new Date().toISOString();
    tx.set(ref, {
      name,
      coach_pin,
      mixed_gender,
      created_at: now,
      updated_at: now,
      member_uids: []
    });
  });

  if (alreadyExists) {
    return res.status(409).json({ error: `A team with slug "${slug}" already exists` });
  }

  return res.status(201).json({
    team: { slug, name, coach_pin, mixed_gender }
  });
}

// ---------------------------------------------------------------------------
// PUT/PATCH /api/teams — edit a team (slug from query param or body)
// ---------------------------------------------------------------------------

async function handlePut(req: VercelRequest, res: VercelResponse) {
  // Accept slug from query string (?slug=foo) or request body.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawSlug = req.query['slug'] ?? body['slug'];

  const slugErr = validateSlug(rawSlug);
  if (slugErr) {
    return res.status(400).json({ error: 'Validation failed', details: [slugErr] });
  }
  const slug = (rawSlug as string).toLowerCase();

  // Build the edit payload (only fields provided in the body).
  const editPayload: Record<string, unknown> = {};
  if (body['name'] !== undefined) editPayload['name'] = body['name'];
  if (body['coach_pin'] !== undefined) editPayload['coach_pin'] = body['coach_pin'];
  if (body['mixed_gender'] !== undefined) editPayload['mixed_gender'] = body['mixed_gender'];

  const errors = validateEditPayload(editPayload);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const db = getDB();
  const ref = db.collection('teams').doc(slug);
  const snap = await ref.get();
  if (!snap.exists) {
    return res.status(404).json({ error: `Team "${slug}" not found` });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (editPayload['name'] !== undefined) update['name'] = (editPayload['name'] as string).trim();
  if (editPayload['coach_pin'] !== undefined) update['coach_pin'] = editPayload['coach_pin'];
  if (editPayload['mixed_gender'] !== undefined) update['mixed_gender'] = editPayload['mixed_gender'];

  await ref.update(update);

  const prevData = snap.data() ?? {};
  return res.status(200).json({
    team: {
      slug,
      name: update['name'] ?? prevData['name'],
      coach_pin: update['coach_pin'] ?? prevData['coach_pin'],
      mixed_gender: update['mixed_gender'] ?? prevData['mixed_gender']
    }
  });
}
