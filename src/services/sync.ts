import { db } from './db';
import { getFirestoreDB, getStoredFirebaseConfig } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  type Unsubscribe 
} from 'firebase/firestore';
import type { Evaluation, Criterion, Player, PlayerNote } from '../types';
import { DEFAULT_CRITERIA_TEMPLATES, INITIAL_DEFAULT_SESSION, INITIAL_SAMPLE_PLAYERS } from '../data/defaultData';

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
      await db.sessions.add(INITIAL_DEFAULT_SESSION);
      
      // Add default criteria for session 1
      const criteriaToAdd: Criterion[] = DEFAULT_CRITERIA_TEMPLATES.map((c, idx) => ({
        ...c,
        id: `crit-s1-${idx + 1}`,
        session_id: INITIAL_DEFAULT_SESSION.id
      }));
      await db.criteria.bulkAdd(criteriaToAdd);

      // Add default sample players
      const playersToAdd: Player[] = INITIAL_SAMPLE_PLAYERS.map((p, idx) => ({
        ...p,
        id: `player-s1-${idx + 1}`,
        session_id: INITIAL_DEFAULT_SESSION.id
      }));
      await db.players.bulkAdd(playersToAdd);
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
      // Listen to evaluations
      const evalsCol = collection(firestore, 'evaluations');
      const unsubEvals = onSnapshot(evalsCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as Evaluation;
            if (data && data.id) {
              await db.evaluations.put({ ...data, is_synced: true });
            }
          }
        });
      }, (err) => {
        console.warn('Firestore eval subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubEvals);

      // Listen to notes
      const notesCol = collection(firestore, 'player_notes');
      const unsubNotes = onSnapshot(notesCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as PlayerNote;
            if (data && data.id) {
              await db.notes.put({ ...data, is_synced: true });
            }
          }
        });
      }, (err) => {
        console.warn('Firestore notes subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubNotes);

      // Listen to players (locks, colors, status)
      const playersCol = collection(firestore, 'players');
      const unsubPlayers = onSnapshot(playersCol, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data() as Player;
            if (data && data.id) {
              await db.players.put(data);
            }
          }
        });
      }, (err) => {
        console.warn('Firestore players subscription notice:', err.message);
      });
      this.unsubscribers.push(unsubPlayers);

      // Listen to sessions (active/finalized status changes by coaches)
      const sessionsCol = collection(firestore, 'sessions');
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

  // Sync session status updates (finalize / unlock) to Firebase
  public static async syncSession(session: any) {
    await db.sessions.put(session);
    await db.syncQueue.put({
      id: `queue_session_${session.id}`,
      type: 'session_update' as any,
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

    try {
      const items = await db.syncQueue.toArray();
      for (const item of items) {
        try {
          if (item.type === 'evaluation') {
            const evalItem = item.payload as Evaluation;
            const evalDocRef = doc(firestore, 'evaluations', evalItem.id);
            await setDoc(evalDocRef, evalItem, { merge: true });
            await db.evaluations.update(evalItem.id, { is_synced: true });
          } else if (item.type === 'note') {
            const noteItem = item.payload as PlayerNote;
            const noteDocRef = doc(firestore, 'player_notes', noteItem.id);
            await setDoc(noteDocRef, noteItem, { merge: true });
            await db.notes.update(noteItem.id, { is_synced: true });
          } else if (item.type === 'player_update' || item.type === 'player_lock') {
            const playerItem = item.payload as Player;
            const playerDocRef = doc(firestore, 'players', playerItem.id);
            await setDoc(playerDocRef, playerItem, { merge: true });
          } else if ((item.type as string) === 'session_update') {
            const sessionItem = item.payload;
            const sessionDocRef = doc(firestore, 'sessions', sessionItem.id);
            await setDoc(sessionDocRef, sessionItem, { merge: true });
          }
          await db.syncQueue.delete(item.id);
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
  }
}
