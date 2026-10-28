import { db } from './db';
import { getFirestoreDB, getStoredFirebaseConfig } from './firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import type { Evaluation, Criterion, Player, PlayerNote } from '../types';
import { DEFAULT_CRITERIA_TEMPLATES, INITIAL_DEFAULT_SESSION } from '../data/defaultData';
import { parseRoute } from './team';

/** Returns the team slug from the current URL, or 'default' as a fallback. */
function getTeamSlug(): string {
  const route = parseRoute();
  return route.kind === 'team' ? route.slug : 'default';
}

export class SyncService {
  private static isSyncing = false;
  private static isOnline = navigator.onLine;
  private static listeners: ((online: boolean, syncing: boolean, pendingCount: number) => void)[] = [];
  private static unsubscribers: Unsubscribe[] = [];

  public static isFirebaseConfigured(): boolean {
    return getStoredFirebaseConfig() !== null;
  }

  public static subscribeStatus(listener: (online: boolean, syncing: boolean, pendingCount: number) => void) {
    this.listeners.push(listener);
    this.notify();
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static async notify() {
    const pendingCount = await db.syncQueue.count();
    this.listeners.forEach(cb => cb(this.isOnline, this.isSyncing, pendingCount));
  }

  public static async initDB() {
    // Check if initial session exists locally
    const sessionCount = await db.sessions.count();
    if (sessionCount === 0) {
      const slug = getTeamSlug();
      // Use deterministic IDs (slug-scoped) so concurrent devices converge on the same records.
      const sessionId = `session-${slug}-1`;
      await db.sessions.add({ ...INITIAL_DEFAULT_SESSION, id: sessionId });

      // Add default criteria (no sample players for new teams)
      const criteriaToAdd: Criterion[] = DEFAULT_CRITERIA_TEMPLATES.map((c, idx) => ({
        ...c,
        id: `crit-${slug}-s1-${idx + 1}`,
        session_id: sessionId
      }));
      await db.criteria.bulkAdd(criteriaToAdd);
    }

    // Set up network listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueue();
      this.notify();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notify();
    });

    // Start Realtime Firestore listeners if configured
    this.startFirestoreListeners();

    // Try background sync if online
    if (this.isOnline) {
      this.flushQueue();
    }
  }

  // Realtime listeners to pull evaluations and notes from other coaches
  public static startFirestoreListeners() {
    // Clear previous
    this.unsubscribers.forEach(u => u());
    this.unsubscribers = [];

    const firestore = getFirestoreDB();
    if (!firestore) return;

    try {
      const slug = getTeamSlug();
      const teamBase = `teams/${slug}`;

      // Listen to evaluations
      const evalsCol = collection(firestore, teamBase, 'evaluations');
      const unsubEvals = onSnapshot(evalsCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as Evaluation;
            if (data && data.id) {
              await db.evaluations.put({ ...data, is_synced: true });
            }
          } else if (change.type === 'removed') {
            await db.evaluations.delete(change.doc.id);
          }
        });
      }, (err) => {
        console.warn('Firestore eval subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubEvals);

      // Listen to notes
      const notesCol = collection(firestore, teamBase, 'player_notes');
      const unsubNotes = onSnapshot(notesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as PlayerNote;
            if (data && data.id) {
              await db.notes.put({ ...data, is_synced: true });
            }
          } else if (change.type === 'removed') {
            await db.notes.delete(change.doc.id);
          }
        });
      }, (err) => {
        console.warn('Firestore notes subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubNotes);

      // Listen to players (locks, colors, status)
      const playersCol = collection(firestore, teamBase, 'players');
      const unsubPlayers = onSnapshot(playersCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as Player;
            if (data && data.id) {
              await db.players.put(data);
            }
          } else if (change.type === 'removed') {
            await db.players.delete(change.doc.id);
          }
        });
      }, (err) => {
        console.warn('Firestore players subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubPlayers);

      // Listen to criteria (custom criteria, edits, exemplars)
      const criteriaCol = collection(firestore, teamBase, 'criteria');
      const unsubCriteria = onSnapshot(criteriaCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as Criterion;
            if (data && data.id) {
              await db.criteria.put(data);
            }
          } else if (change.type === 'removed') {
            await db.criteria.delete(change.doc.id);
          }
        });
      }, (err) => {
        console.warn('Firestore criteria subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubCriteria);

      // Listen to sessions (active/finalized status changes by coaches)
      const sessionsCol = collection(firestore, teamBase, 'sessions');
      const unsubSessions = onSnapshot(sessionsCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as any;
            if (data && data.id) {
              await db.sessions.put(data);
            }
          }
        });
      }, (err) => {
        console.warn('Firestore sessions subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubSessions);

    } catch (e) {
      console.warn('Failed to start Firestore listeners:', e);
    }
  }

  // Save evaluation optimistically to local DB and enqueue for Firestore sync
  public static async saveEvaluation(evaluation: Omit<Evaluation, 'id' | 'updated_at'>) {
    const existing = await db.evaluations
      .where({
        session_id: evaluation.session_id,
        player_id: evaluation.player_id,
        criterion_id: evaluation.criterion_id,
        evaluator_name: evaluation.evaluator_name
      })
      .first();

    const id = existing ? existing.id : `eval_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullEval: Evaluation = {
      ...evaluation,
      id,
      updated_at: new Date().toISOString(),
      is_synced: false
    };

    await db.evaluations.put(fullEval);

    // Queue for Firestore
    await db.syncQueue.put({
      id: `queue_${id}`,
      type: 'evaluation',
      payload: fullEval,
      timestamp: Date.now()
    });

    this.notify();
    this.flushQueue();
    return fullEval;
  }

  // Delete evaluation optimistically from local DB and enqueue deletion for Firestore sync
  public static async deleteEvaluation(params: Pick<Evaluation, 'session_id' | 'player_id' | 'criterion_id' | 'evaluator_name'>) {
    const existing = await db.evaluations
      .where({
        session_id: params.session_id,
        player_id: params.player_id,
        criterion_id: params.criterion_id,
        evaluator_name: params.evaluator_name
      })
      .first();

    if (!existing) return;

    await db.evaluations.delete(existing.id);

    await db.syncQueue.put({
      id: `queue_${existing.id}`,
      type: 'evaluation_delete',
      payload: { id: existing.id },
      timestamp: Date.now()
    });

    this.notify();
    this.flushQueue();
  }

  // Delete all evaluations and notes for a given evaluator in a session
  public static async deleteEvaluator(evaluatorName: string, sessionId: string) {
    // Find all matching records
    const evals = await db.evaluations
      .where('session_id').equals(sessionId)
      .filter(e => e.evaluator_name === evaluatorName)
      .toArray();
    const notes = await db.notes
      .where('session_id').equals(sessionId)
      .filter(n => n.evaluator_name === evaluatorName)
      .toArray();

    // Delete locally
    await db.evaluations.bulkDelete(evals.map(e => e.id));
    await db.notes.bulkDelete(notes.map(n => n.id));

    // Queue Firestore deletions
    const now = Date.now();
    for (const e of evals) {
      await db.syncQueue.put({
        id: `queue_${e.id}`,
        type: 'evaluation_delete',
        payload: { id: e.id },
        timestamp: now
      });
    }
    for (const n of notes) {
      await db.syncQueue.put({
        id: `queue_${n.id}`,
        type: 'note_delete',
        payload: { id: n.id },
        timestamp: now
      });
    }

    this.notify();
    this.flushQueue();
  }

  // Save note optimistically
  public static async saveNote(note: Omit<PlayerNote, 'id' | 'created_at'>) {
    const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullNote: PlayerNote = {
      ...note,
      id,
      created_at: new Date().toISOString(),
      is_synced: false
    };

    await db.notes.put(fullNote);

    await db.syncQueue.put({
      id: `queue_${id}`,
      type: 'note',
      payload: fullNote,
      timestamp: Date.now()
    });

    this.notify();
    this.flushQueue();
    return fullNote;
  }

  // Sync player updates (locks, statuses) to Firebase
  public static async syncPlayer(player: Player) {
    await db.players.put(player);
    await db.syncQueue.put({
      id: `queue_player_${player.id}`,
      type: 'player_update',
      payload: player,
      timestamp: Date.now()
    });
    this.notify();
    this.flushQueue();
  }

  // Delete a player locally and in Firebase. Reuses the upsert queue id so a pending update is replaced.
  public static async deletePlayer(playerId: string) {
    await db.players.delete(playerId);
    await db.syncQueue.put({
      id: `queue_player_${playerId}`,
      type: 'player_delete',
      payload: { id: playerId },
      timestamp: Date.now()
    });
    this.notify();
    this.flushQueue();
  }

  // Sync criterion add / edit to Firebase
  public static async syncCriterion(criterion: Criterion) {
    await db.criteria.put(criterion);
    await db.syncQueue.put({
      id: `queue_criterion_${criterion.id}`,
      type: 'criterion_update',
      payload: criterion,
      timestamp: Date.now()
    });
    this.notify();
    this.flushQueue();
  }

  // Delete a criterion locally and in Firebase. Reuses the upsert queue id so a pending update is replaced.
  public static async deleteCriterion(criterionId: string) {
    await db.criteria.delete(criterionId);
    await db.syncQueue.put({
      id: `queue_criterion_${criterionId}`,
      type: 'criterion_delete',
      payload: { id: criterionId },
      timestamp: Date.now()
    });
    this.notify();
    this.flushQueue();
  }

  // Sync session status updates (finalize / unlock) to Firebase
  public static async syncSession(session: any) {
    await db.sessions.put(session);
    await db.syncQueue.put({
      id: `queue_session_${session.id}`,
      type: 'session_update',
      payload: session,
      timestamp: Date.now()
    });
    this.notify();
    this.flushQueue();
  }

  // Flush offline queue to Firebase Firestore
  public static async flushQueue() {
    if (this.isSyncing || !this.isOnline) return;

    const firestore = getFirestoreDB();
    if (!firestore) return;

    this.isSyncing = true;
    this.notify();

    let needsRerun = false;
    try {
      const slug = getTeamSlug();
      const teamBase = `teams/${slug}`;
      const items = await db.syncQueue.toArray();
      for (const item of items) {
        try {
          if (item.type === 'evaluation') {
            const evalItem = item.payload as Evaluation;
            const evalDocRef = doc(firestore, teamBase, 'evaluations', evalItem.id);
            await setDoc(evalDocRef, evalItem, { merge: true });
            await db.evaluations.update(evalItem.id, { is_synced: true });
          } else if (item.type === 'evaluation_delete') {
            await deleteDoc(doc(firestore, teamBase, 'evaluations', item.payload.id));
          } else if (item.type === 'note_delete') {
            await deleteDoc(doc(firestore, teamBase, 'player_notes', item.payload.id));
          } else if (item.type === 'note') {
            const noteItem = item.payload as PlayerNote;
            const noteDocRef = doc(firestore, teamBase, 'player_notes', noteItem.id);
            await setDoc(noteDocRef, noteItem, { merge: true });
            await db.notes.update(noteItem.id, { is_synced: true });
          } else if (item.type === 'player_update' || item.type === 'player_lock') {
            const playerItem = item.payload as Player;
            const playerDocRef = doc(firestore, teamBase, 'players', playerItem.id);
            await setDoc(playerDocRef, playerItem, { merge: true });
          } else if (item.type === 'player_delete') {
            await deleteDoc(doc(firestore, teamBase, 'players', item.payload.id));
          } else if (item.type === 'session_update') {
            const sessionItem = item.payload;
            const sessionDocRef = doc(firestore, teamBase, 'sessions', sessionItem.id);
            await setDoc(sessionDocRef, sessionItem, { merge: true });
          } else if (item.type === 'criterion_update') {
            const critItem = item.payload as Criterion;
            const critDocRef = doc(firestore, teamBase, 'criteria', critItem.id);
            await setDoc(critDocRef, critItem, { merge: true });
          } else if (item.type === 'criterion_delete') {
            await deleteDoc(doc(firestore, teamBase, 'criteria', item.payload.id));
          }
          // Only dequeue if the item was not replaced (same queue id) while we were sending it
          const current = await db.syncQueue.get(item.id);
          if (current && current.timestamp === item.timestamp) {
            await db.syncQueue.delete(item.id);
          } else if (current) {
            needsRerun = true;
          }
        } catch (e) {
          // If network / quota issue, stop loop until next trigger
          break;
        }
      }
    } catch (e) {
      // ignore
    } finally {
      this.isSyncing = false;
      this.notify();
    }
    // An item was replaced mid-flight; its own flush call returned early, so send it now
    if (needsRerun) this.flushQueue();
  }
}
