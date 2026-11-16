import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { createInitialFarmState } from '../game/rules';
import type { FarmState } from '../game/types';
import { db } from './config';
import { handleFirestoreError, isPermissionError, OperationType } from './errors';
import {
  assertOwnerUidMatch,
  checkAtomicRevisionMatch,
  deserializeFarmFromFirestore,
  type LoadResolution,
  type PendingLocalSnapshot,
  resolveLoadState,
  RevisionConflictError,
  serializeFarmPayload,
} from './syncLogic';

const PENDING_STORAGE_PREFIX = 'mazraati_pending_v1_';

export interface PendingPersistResult {
  ok: boolean;
  error?: unknown;
}

export interface TxDocAdapter {
  get(): Promise<{ exists: boolean; data?: Record<string, unknown> }>;
  set(data: Record<string, unknown>): void;
  update(data: Record<string, unknown>): void;
}

function pendingStorageKey(uid: string): string {
  return `${PENDING_STORAGE_PREFIX}${uid}`;
}

export function loadPendingLocalSnapshot(uid: string): PendingLocalSnapshot | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(pendingStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLocalSnapshot;
    if (
      !parsed ||
      parsed.uid !== uid ||
      !parsed.state ||
      parsed.state.ownerUid !== uid ||
      parsed.state.ownerUid === 'local-preview'
    ) {
      return null;
    }
    return {
      ...parsed,
      seq: typeof parsed.seq === 'number' && Number.isFinite(parsed.seq) ? parsed.seq : 1,
    };
  } catch {
    return null;
  }
}

export function savePendingLocalSnapshot(snapshot: PendingLocalSnapshot): PendingPersistResult {
  try {
    assertOwnerUidMatch(snapshot.state, snapshot.uid);
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: new Error('localStorage is unavailable') };
    }
    const normalized: PendingLocalSnapshot = {
      ...snapshot,
      seq: typeof snapshot.seq === 'number' && Number.isFinite(snapshot.seq) ? snapshot.seq : 1,
    };
    window.localStorage.setItem(pendingStorageKey(snapshot.uid), JSON.stringify(normalized));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export function clearPendingLocalSnapshot(uid: string): PendingPersistResult {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: new Error('localStorage is unavailable') };
    }
    window.localStorage.removeItem(pendingStorageKey(uid));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Removes the pending local snapshot ONLY if its sequence number matches expectedSeq.
 * Protects newer edits written while an earlier save was in-flight.
 */
export function clearPendingLocalSnapshotIfMatching(
  uid: string,
  expectedSeq: number,
): PendingPersistResult {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: new Error('localStorage is unavailable') };
    }
    const current = loadPendingLocalSnapshot(uid);
    if (!current) return { ok: true };
    if ((current.seq ?? 1) !== expectedSeq) {
      return { ok: true };
    }
    window.localStorage.removeItem(pendingStorageKey(uid));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Rebases an unconfirmed pending local snapshot whose seq is newer than confirmedSeq
 * onto the newly confirmed server revision so the next sequential save and any reload
 * after browser close continue from the updated server revision cleanly.
 */
export function rebasePendingLocalSnapshot(
  uid: string,
  confirmedSeq: number,
  newBaseRevision: number,
): PendingPersistResult {
  try {
    const current = loadPendingLocalSnapshot(uid);
    if (!current) return { ok: true };
    const currentSeq = current.seq ?? 1;
    if (currentSeq <= confirmedSeq) return { ok: true };

    return savePendingLocalSnapshot({
      ...current,
      baseRevision: newBaseRevision,
      state: {
        ...current.state,
        revision: newBaseRevision,
      },
    });
  } catch (error) {
    return { ok: false, error };
  }
}

export async function runInitialFarmCreationInTx(
  docTx: TxDocAdapter,
  uid: string,
  nowMs: number,
  serverTimeValue: unknown,
): Promise<{ state: FarmState; createdInitial: boolean }> {
  const snap = await docTx.get();
  if (snap.exists && snap.data) {
    return {
      state: deserializeFarmFromFirestore(snap.data, uid, nowMs),
      createdInitial: false,
    };
  }

  const fresh = createInitialFarmState(uid, nowMs);
  assertOwnerUidMatch(fresh, uid);
  const payload = serializeFarmPayload(fresh, 1);

  docTx.set({
    ...payload,
    createdAt: serverTimeValue,
    updatedAt: serverTimeValue,
  });

  return { state: fresh, createdInitial: true };
}

export async function runSaveFarmInTx(
  docTx: TxDocAdapter,
  uid: string,
  stateToSave: FarmState,
  expectedServerRevision: number,
  nowMs: number,
  serverTimeValue: unknown,
): Promise<number> {
  assertOwnerUidMatch(stateToSave, uid);
  const snap = await docTx.get();

  if (!snap.exists || !snap.data) {
    const freshPayload = serializeFarmPayload(stateToSave, 1);
    docTx.set({
      ...freshPayload,
      createdAt: serverTimeValue,
      updatedAt: serverTimeValue,
    });
    return 1;
  }

  const currentServer = deserializeFarmFromFirestore(snap.data, uid, nowMs);
  if (!checkAtomicRevisionMatch(currentServer.revision, expectedServerRevision)) {
    throw new RevisionConflictError(expectedServerRevision, currentServer);
  }

  const targetRevision = currentServer.revision + 1;
  const payload = serializeFarmPayload(stateToSave, targetRevision);
  docTx.update({
    ...payload,
    updatedAt: serverTimeValue,
  });
  return targetRevision;
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

  try {
    const nowMs = Date.now();
    const txResult = await runTransaction(db, async (tx) => {
      return runInitialFarmCreationInTx(
        {
          async get() {
            const snap = await tx.get(ref);
            return {
              exists: snap.exists(),
              data: snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
            };
          },
          set(data) {
            tx.set(ref, data);
          },
          update(data) {
            tx.update(ref, data);
          },
        },
        uid,
        nowMs,
        serverTimestamp(),
      );
    });

    const finalRes = resolveLoadState(txResult.state, pendingLocal);
    if (finalRes.kind === 'use_server') {
      return { resolution: finalRes, createdInitial: txResult.createdInitial };
    }
    return { resolution: finalRes, createdInitial: false };
  } catch (error) {
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
  assertOwnerUidMatch(stateToSave, uid);
  const path = `farms/${uid}`;
  const ref = doc(db, 'farms', uid);

  try {
    const nowMs = Date.now();
    const nextRevision = await runTransaction(db, async (tx) => {
      return runSaveFarmInTx(
        {
          async get() {
            const snap = await tx.get(ref);
            return {
              exists: snap.exists(),
              data: snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
            };
          },
          set(data) {
            tx.set(ref, data);
          },
          update(data) {
            tx.update(ref, data);
          },
        },
        uid,
        stateToSave,
        expectedServerRevision,
        nowMs,
        serverTimestamp(),
      );
    });

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

/**
 * Flushes pending cloud saves with strict sequence/revision checks.
 * Guarantees that local pending snapshots are NOT cleared until server confirmation
 * of the exact sequence, ensuring sequential operation order and preventing data loss.
 */
export async function flushCloudSave(
  uid: string,
  stateToSave: FarmState,
  expectedServerRevision: number,
  expectedSeq = 1,
): Promise<FarmState> {
  assertOwnerUidMatch(stateToSave, uid);
  const savedState = await saveCloudFarmWithRevisionCheck(
    uid,
    stateToSave,
    expectedServerRevision,
  );
  clearPendingLocalSnapshotIfMatching(uid, expectedSeq);
  return savedState;
}
