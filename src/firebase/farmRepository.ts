import {
  doc,
  getDocFromServer,
  runTransaction,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { createInitialFarmState } from '../game/rules';
import type { FarmState } from '../game/types';
import { db } from './config';
import { handleFirestoreError, isPermissionError, OperationType } from './errors';
import {
  checkAtomicRevisionMatch,
  deserializeFarmFromFirestore,
  type LoadResolution,
  type PendingLocalSnapshot,
  resolveLoadState,
  RevisionConflictError,
  serializeFarmPayload,
} from './syncLogic';

const PENDING_STORAGE_PREFIX = 'mazraati_pending_v1_';

function pendingStorageKey(uid: string): string {
  return `${PENDING_STORAGE_PREFIX}${uid}`;
}

export function loadPendingLocalSnapshot(uid: string): PendingLocalSnapshot | null {
  try {
    const raw = window.localStorage.getItem(pendingStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLocalSnapshot;
    if (!parsed || parsed.uid !== uid || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePendingLocalSnapshot(snapshot: PendingLocalSnapshot): void {
  try {
    window.localStorage.setItem(pendingStorageKey(snapshot.uid), JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearPendingLocalSnapshot(uid: string): void {
  try {
    window.localStorage.removeItem(pendingStorageKey(uid));
  } catch {
    // Ignore storage errors
  }
}

export async function fetchServerFarm(uid: string): Promise<FarmState | null> {
  const path = `farms/${uid}`;
  const ref = doc(db, 'farms', uid);
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return null;
    return deserializeFarmFromFirestore(snap.data() as Record<string, unknown>, uid);
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, path);
    }
    throw error;
  }
}

export async function loadOrCreateCloudFarm(uid: string): Promise<{
  resolution: LoadResolution;
  createdInitial: boolean;
}> {
  const path = `farms/${uid}`;
  const ref = doc(db, 'farms', uid);
  const pendingLocal = loadPendingLocalSnapshot(uid);

  const serverState = await fetchServerFarm(uid);
  const initialResolution = resolveLoadState(serverState, pendingLocal);
  if (initialResolution.kind !== 'create_initial') {
    return { resolution: initialResolution, createdInitial: false };
  }

  // Create initial farm directly via setDoc so Firestore evaluates allow create cleanly;
  // if a concurrent session wins the race, allow update rejects revision=1 and we re-fetch.
  try {
    const nowTs = Timestamp.now();
    const fresh = createInitialFarmState(uid, nowTs.toMillis());
    const payload = serializeFarmPayload(fresh, 1);

    await setDoc(ref, {
      ...payload,
      createdAt: nowTs,
      updatedAt: nowTs,
    });

    const finalRes = resolveLoadState(fresh, pendingLocal);
    if (finalRes.kind === 'use_server') {
      return { resolution: finalRes, createdInitial: true };
    }
    return { resolution: finalRes, createdInitial: false };
  } catch (error) {
    // Check if another tab/session created the document concurrently
    try {
      const racedServer = await fetchServerFarm(uid);
      if (racedServer) {
        const racedRes = resolveLoadState(racedServer, pendingLocal);
        return { resolution: racedRes, createdInitial: false };
      }
    } catch {
      // Fall through to original error handling
    }

    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    throw error;
  }
}

export async function saveCloudFarmWithRevisionCheck(
  uid: string,
  stateToSave: FarmState,
  expectedServerRevision: number,
): Promise<FarmState> {
  const path = `farms/${uid}`;
  const ref = doc(db, 'farms', uid);

  try {
    const nowTs = Timestamp.now();
    const nextRevision = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        const freshPayload = serializeFarmPayload(stateToSave, 1);
        tx.set(ref, {
          ...freshPayload,
          createdAt: nowTs,
          updatedAt: nowTs,
        });
        return 1;
      }

      const currentServer = deserializeFarmFromFirestore(
        snap.data() as Record<string, unknown>,
        uid,
      );

      if (!checkAtomicRevisionMatch(currentServer.revision, expectedServerRevision)) {
        throw new RevisionConflictError(expectedServerRevision, currentServer);
      }

      const targetRevision = currentServer.revision + 1;
      const payload = serializeFarmPayload(stateToSave, targetRevision);
      tx.update(ref, {
        ...payload,
        updatedAt: nowTs,
      });
      return targetRevision;
    });

    clearPendingLocalSnapshot(uid);
    return {
      ...stateToSave,
      revision: nextRevision,
      updatedAtMs: Date.now(),
    };
  } catch (error) {
    if (error instanceof RevisionConflictError) {
      throw error;
    }
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    throw error;
  }
}
