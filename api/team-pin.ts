import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import type { ServiceAccount } from 'firebase-admin/app';
import { validateCoachPin, validateSlug } from './_lib/validate.js';

// POST /api/team-pin  { slug, coach_pin }
//
// Lets the coach change their team's PIN from the in-app Settings tab. The
// caller is already past the client-side PIN keypad, so no current PIN is
// required. Like the rest of the app, the only "credential" is knowing the
// team slug (see firestore.rules). The super-admin PIN is NOT used here.

function getDB(): Firestore {
  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      throw new Error('Server configuration error: environment variable "FIREBASE_SERVICE_ACCOUNT" is not set');
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = [validateSlug(body['slug']), validateCoachPin(body['coach_pin'])].filter(
    (e): e is NonNullable<typeof e> => e !== null
  );
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const slug = (body['slug'] as string).toLowerCase();
  const coach_pin = body['coach_pin'] as string;

  try {
    const ref = getDB().collection('teams').doc(slug);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: `Team "${slug}" not found` });
    }
    await ref.update({ coach_pin, updated_at: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/team-pin] unhandled error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
