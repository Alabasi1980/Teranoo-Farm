import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buySeeds,
  createInitialFarmState,
  plantPlot,
} from '../game/rules';
import type { FarmState } from '../game/types';
import { classifyFirestoreConnectionError } from './connectionCheck';
import {
  type PendingPersistResult,
  runInitialFarmCreationInTx,
  runSaveFarmInTx,
} from './farmRepository';
import {
  FarmSyncCoordinator,
  type PendingStoragePort,
} from './syncCoordinator';
import {
  deserializeFarmFromFirestore,
  OwnerMismatchError,
  type PendingLocalSnapshot,
  resolveLoadState,
  RevisionConflictError,
  serializeFarmPayload,
} from './syncLogic';

function createDeferred<T>() {
  let resolve!: (val: T | PromiseLike<T>) => void;
  let reject!: (err?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class InMemoryPendingStorage implements PendingStoragePort {
  public readonly items = new Map<string, PendingLocalSnapshot>();
  public failNextSave = false;

  savePending(snapshot: PendingLocalSnapshot): PendingPersistResult {
    if (this.failNextSave) {
      this.failNextSave = false;
      return { ok: false, error: new Error('Simulated QuotaExceededError') };
    }
    if (snapshot.state.ownerUid !== snapshot.uid) {
      return {
        ok: false,
        error: new OwnerMismatchError(snapshot.uid, snapshot.state.ownerUid),
      };
    }
    this.items.set(snapshot.uid, structuredClone(snapshot));
    return { ok: true };
  }

  loadPending(uid: string): PendingLocalSnapshot | null {
    const item = this.items.get(uid);
    return item ? structuredClone(item) : null;
  }

  clearPending(uid: string): PendingPersistResult {
    this.items.delete(uid);
    return { ok: true };
  }

  clearIfMatching(uid: string, expectedSeq: number): PendingPersistResult {
    const existing = this.items.get(uid);
    if (!existing) return { ok: true };
    if ((existing.seq ?? 1) === expectedSeq) {
      this.items.delete(uid);
    }
    return { ok: true };
  }

  rebasePending(
    uid: string,
    confirmedSeq: number,
    newBaseRevision: number,
  ): PendingPersistResult {
    const existing = this.items.get(uid);
    if (!existing) return { ok: true };
    if ((existing.seq ?? 1) <= confirmedSeq) return { ok: true };
    this.items.set(uid, {
      ...existing,
      baseRevision: newBaseRevision,
      state: {
        ...existing.state,
        revision: newBaseRevision,
      },
    });
    return { ok: true };
  }
}

class InMemoryCloudDb {
  public readonly docs = new Map<string, Record<string, unknown>>();
  public saveCalls: Array<{ uid: string; coins: number; expectedRevision: number; ownerUid: string }> = [];

  seedServerFarm(state: FarmState): void {
    const payload = serializeFarmPayload(state, state.revision);
    this.docs.set(state.ownerUid, {
      ...payload,
      createdAt: state.createdAtMs,
      updatedAt: state.updatedAtMs,
    });
  }

  getServerFarm(uid: string): FarmState | null {
    const raw = this.docs.get(uid);
    return raw ? deserializeFarmFromFirestore(raw, uid) : null;
  }

  async saveWithRevision(
    uid: string,
    stateToSave: FarmState,
    expectedServerRevision: number,
  ): Promise<FarmState> {
    this.saveCalls.push({
      uid,
      coins: stateToSave.coins,
      expectedRevision: expectedServerRevision,
      ownerUid: stateToSave.ownerUid,
    });

    const nextRev = await runSaveFarmInTx(
      {
        get: async () => {
          const raw = this.docs.get(uid);
          return { exists: Boolean(raw), data: raw };
        },
        set: (data) => {
          this.docs.set(uid, data);
        },
        update: (data) => {
          const existing = this.docs.get(uid) ?? {};
          this.docs.set(uid, { ...existing, ...data });
        },
      },
      uid,
      stateToSave,
      expectedServerRevision,
      Date.now(),
      Date.now(),
    );

    return {
      ...stateToSave,
      revision: nextRev,
      updatedAtMs: Date.now(),
    };
  }
}

test('Req 1: retry_pending restores pending edit and actually saves restored state (never local-preview)', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const serverInitial = createInitialFarmState('uid-retry', 10_000);
  serverInitial.revision = 3;
  db.seedServerFarm(serverInitial);

  // User had planted wheat & spent 15 coins while offline on top of rev 3
  const planted = plantPlot(serverInitial, 'plot-1', 'wheat', 11_000).state;
  const bought = buySeeds(planted, 'carrot', 1, 11_500).state; // 185 coins
  storage.savePending({
    uid: 'uid-retry',
    baseRevision: 3,
    state: bought,
    queuedAtMs: 11_500,
    seq: 4,
  });

  const coord = new FarmSyncCoordinator({
    debounceMs: 10,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded_permission_denied' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: (uid, st, rev) => db.saveWithRevision(uid, st, rev),
    },
  });

  await coord.handleAuthChange('uid-retry');

  assert.equal(db.saveCalls.length, 1);
  assert.equal(db.saveCalls[0].ownerUid, 'uid-retry');
  assert.equal(db.saveCalls[0].coins, 185);
  assert.equal(db.saveCalls[0].expectedRevision, 3);

  const serverAfter = db.getServerFarm('uid-retry')!;
  assert.equal(serverAfter.revision, 4);
  assert.equal(serverAfter.coins, 185);
  assert.equal(serverAfter.plots[0].cropId, 'wheat');

  assert.equal(coord.getSnapshot().saveStatus, 'saved');
  assert.equal(storage.loadPending('uid-retry'), null);
  coord.dispose();
});

test('Req 1: rescue grant immediately saves explicit ownerUid state and rejects ownerUid mismatch writes', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const brokeFarm = createInitialFarmState('uid-broke', 10_000);
  brokeFarm.coins = 0;
  brokeFarm.seeds = { wheat: 0, carrot: 0 };
  brokeFarm.revision = 2;
  db.seedServerFarm(brokeFarm);

  const coord = new FarmSyncCoordinator({
    debounceMs: 10,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: (uid, st, rev) => db.saveWithRevision(uid, st, rev),
    },
  });

  await coord.handleAuthChange('uid-broke');

  assert.equal(db.saveCalls.length, 1);
  assert.equal(db.saveCalls[0].ownerUid, 'uid-broke');
  const after = db.getServerFarm('uid-broke')!;
  assert.equal(after.seeds.wheat, 3);
  assert.equal(after.stats.rescueGrants, 1);
  assert.equal(after.revision, 3);

  // Verify direct ownerUid mismatch guard before write
  const previewState = createInitialFarmState('local-preview', 20_000);
  await assert.rejects(
    () => db.saveWithRevision('uid-broke', previewState, 3),
    OwnerMismatchError,
  );
  coord.dispose();
});

test('Req 2: edit B during delayed save A stays protected in localStorage, rebases revision, never shows saved prematurely, and flushes sequentially', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const initial = createInitialFarmState('uid-seq', 10_000);
  db.seedServerFarm(initial);

  const saveADeferred = createDeferred<FarmState>();
  let saveAttempt = 0;

  const coord = new FarmSyncCoordinator({
    debounceMs: 1000,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: async (uid, st, rev) => {
        saveAttempt += 1;
        if (saveAttempt === 1) {
          // Persist A onto server only when test resolves saveADeferred
          const result = await db.saveWithRevision(uid, st, rev);
          await saveADeferred.promise;
          return result;
        }
        return db.saveWithRevision(uid, st, rev);
      },
    },
  });

  await coord.handleAuthChange('uid-seq');

  // Edit A: plant wheat on plot-1 (coins 200, seeds.wheat 4)
  const stateA = plantPlot(coord.getSnapshot().farmState, 'plot-1', 'wheat', 11_000).state;
  coord.recordGameplayMutation(stateA);

  // Trigger save A and let it suspend mid-flight
  const flushAPromise = coord.flushNow();
  await Promise.resolve();

  // Edit B arrives while Save A is in-flight: buy 1 carrot seed (coins 185, seeds.carrot 4)
  const stateB = buySeeds(coord.getSnapshot().farmState, 'carrot', 1, 12_000).state;
  coord.recordGameplayMutation(stateB);

  // localStorage must hold B (seq 2)
  const pendingMidFlight = storage.loadPending('uid-seq')!;
  assert.equal(pendingMidFlight.seq, 2);
  assert.equal(pendingMidFlight.state.coins, 185);

  // Resolve Save A (which had revision 1 -> 2)
  // Wait first just before sequential B runs by inspecting intermediate state via onStateChange!
  const observedStatusesAfterA: string[] = [];
  const origTestDbSave = db.saveWithRevision.bind(db);
  let snapshotBeforeB: PendingLocalSnapshot | null = null;
  db.saveWithRevision = async (uid, st, rev) => {
    if (st.coins === 185) {
      snapshotBeforeB = storage.loadPending(uid);
      observedStatusesAfterA.push(coord.getSnapshot().saveStatus);
    }
    return origTestDbSave(uid, st, rev);
  };

  saveADeferred.resolve(stateA);
  await flushAPromise;

  // Before Save B committed, snapshot B was NOT cleared and was rebased onto revision 2!
  assert.ok(snapshotBeforeB, 'Pending snapshot B must still exist when Save A finishes');
  assert.equal((snapshotBeforeB as PendingLocalSnapshot).seq, 2);
  assert.equal((snapshotBeforeB as PendingLocalSnapshot).baseRevision, 2);
  assert.notEqual(observedStatusesAfterA[0], 'saved');

  // After sequential Save B finishes cleanly:
  const finalServer = db.getServerFarm('uid-seq')!;
  assert.equal(finalServer.revision, 3);
  assert.equal(finalServer.coins, 185);
  assert.equal(finalServer.plots[0].cropId, 'wheat');
  assert.equal(finalServer.seeds.carrot, 4);
  assert.equal(db.saveCalls.length, 2);
  assert.equal(db.saveCalls[0].expectedRevision, 1);
  assert.equal(db.saveCalls[1].expectedRevision, 2);
  assert.equal(coord.getSnapshot().saveStatus, 'saved');
  assert.equal(storage.loadPending('uid-seq'), null);
  coord.dispose();
});

test('Req 2: if browser closes after Save A succeeds and before Save B flushes, reload recovers rebased B cleanly', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();
  db.seedServerFarm(createInitialFarmState('uid-reopen', 10_000));

  const saveADeferred = createDeferred<void>();
  let online = true;

  const coord1 = new FarmSyncCoordinator({
    debounceMs: 1000,
    followUpDelayMs: 50,
    isOnline: () => online,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: async (uid, st, rev) => {
        const res = await db.saveWithRevision(uid, st, rev);
        await saveADeferred.promise;
        return res;
      },
    },
  });

  await coord1.handleAuthChange('uid-reopen');
  const stateA = plantPlot(coord1.getSnapshot().farmState, 'plot-1', 'wheat', 11_000).state;
  coord1.recordGameplayMutation(stateA);
  const p = coord1.flushNow();
  await Promise.resolve();

  const stateB = buySeeds(coord1.getSnapshot().farmState, 'wheat', 1, 12_000).state; // 190 coins
  coord1.recordGameplayMutation(stateB);

  // Drop offline right before Save A resolves so B won't auto-flush yet, simulating tab close before B uploads
  online = false;
  saveADeferred.resolve();
  await p;
  coord1.dispose();

  // Tab reopens online later
  const coord2 = new FarmSyncCoordinator({
    debounceMs: 10,
    followUpDelayMs: 0,
    isOnline: () => true,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: (uid, st, rev) => db.saveWithRevision(uid, st, rev),
    },
  });

  await coord2.handleAuthChange('uid-reopen');
  const recoveredServer = db.getServerFarm('uid-reopen')!;
  assert.equal(recoveredServer.revision, 3);
  assert.equal(recoveredServer.coins, 190);
  assert.equal(coord2.getSnapshot().conflict, null);
  assert.equal(coord2.getSnapshot().saveStatus, 'saved');
  coord2.dispose();
});

test('Req 2: localStorage write failure never claims pending_offline or saved locally', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();
  db.seedServerFarm(createInitialFarmState('uid-quota', 10_000));

  const toasts: string[] = [];
  const coord = new FarmSyncCoordinator({
    isOnline: () => false,
    storage,
    onToast: (t) => toasts.push(t.text),
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: (uid, st, rev) => db.saveWithRevision(uid, st, rev),
    },
  });

  await coord.handleAuthChange('uid-quota');
  storage.failNextSave = true;

  const mutated = plantPlot(coord.getSnapshot().farmState, 'plot-1', 'wheat', 11_000).state;
  coord.recordGameplayMutation(mutated);

  assert.equal(coord.getSnapshot().localPersistFailed, true);
  assert.equal(coord.getSnapshot().saveStatus, 'error');
  assert.notEqual(coord.getSnapshot().saveStatus, 'pending_offline');
  assert.ok(toasts.some((t) => t.includes('تعذر حفظ التعديلات محليًا')));
  coord.dispose();
});

test('Req 3: account switch during delayed load & sign-out during delayed save isolate sessions and preserve pending edits', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const farmA = createInitialFarmState('uid-A', 10_000);
  farmA.coins = 111;
  const farmB = createInitialFarmState('uid-B', 10_000);
  farmB.coins = 999;
  db.seedServerFarm(farmA);
  db.seedServerFarm(farmB);

  const loadADeferred = createDeferred<void>();
  const saveADeferred = createDeferred<void>();

  const coord = new FarmSyncCoordinator({
    debounceMs: 1000,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => {
        if (uid === 'uid-A') {
          await loadADeferred.promise;
        }
        return {
          resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
          createdInitial: false,
        };
      },
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: async (uid, st, rev) => {
        if (uid === 'uid-A') {
          await saveADeferred.promise;
        }
        return db.saveWithRevision(uid, st, rev);
      },
    },
  });

  // Start delayed load for uid-A
  const loadAPromise = coord.handleAuthChange('uid-A');
  // Switch to uid-B before uid-A load finishes
  await coord.handleAuthChange('uid-B');
  // Now resolve late uid-A load
  loadADeferred.resolve();
  await loadAPromise;

  // uid-B state must remain completely untouched
  assert.equal(coord.getSnapshot().activeUid, 'uid-B');
  assert.equal(coord.getSnapshot().farmState.ownerUid, 'uid-B');
  assert.equal(coord.getSnapshot().farmState.coins, 999);

  // Now sign into uid-A cleanly, edit, and sign out while save A is delayed/failing
  const loadADeferred2 = createDeferred<void>();
  loadADeferred2.resolve();
  // Create second coordinator where load is fast and save is delayed
  const saveDelay2 = createDeferred<FarmState>();
  const coordSignOut = new FarmSyncCoordinator({
    debounceMs: 1000,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: async () => saveDelay2.promise,
    },
  });

  await coordSignOut.handleAuthChange('uid-A');
  const editedA = plantPlot(coordSignOut.getSnapshot().farmState, 'plot-1', 'wheat', 12_000).state;
  coordSignOut.recordGameplayMutation(editedA);
  const saveInFlight = coordSignOut.flushNow();
  await Promise.resolve();

  // Sign out before delayed save finishes
  await coordSignOut.handleAuthChange(null);
  assert.equal(coordSignOut.getSnapshot().screenMode, 'title');
  assert.equal(coordSignOut.getSnapshot().activeUid, null);

  // Reject late save A — must NOT pollute title state AND must preserve uid-A pending snapshot in localStorage!
  saveDelay2.reject(new Error('Network aborted'));
  await saveInFlight;

  assert.equal(coordSignOut.getSnapshot().screenMode, 'title');
  assert.equal(coordSignOut.getSnapshot().saveStatus, 'idle');
  const preserved = storage.loadPending('uid-A');
  assert.ok(preserved, 'Pending edit for uid-A must stay preserved on sign-out');
  assert.equal(preserved!.state.plots[0].cropId, 'wheat');

  coord.dispose();
  coordSignOut.dispose();
});

test('Req 3: confirmNewFarm serializes behind in-flight save A, blocks gameplay during loading/conflict/resetting, and prevents save A from reverting reset', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const initial = createInitialFarmState('uid-reset', 10_000);
  db.seedServerFarm(initial);

  const saveADeferred = createDeferred<void>();
  let saveCallCount = 0;

  const coord = new FarmSyncCoordinator({
    debounceMs: 1000,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => ({
        resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
        createdInitial: false,
      }),
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: async (uid, st, rev) => {
        saveCallCount += 1;
        if (saveCallCount === 1) {
          const saved = await db.saveWithRevision(uid, st, rev);
          await saveADeferred.promise;
          return saved;
        }
        return db.saveWithRevision(uid, st, rev);
      },
    },
  });

  // Loading blocks gameplay
  const loadingPromise = coord.handleAuthChange('uid-reset');
  assert.equal(coord.canAcceptGameplayAction(), false);
  await loadingPromise;
  assert.equal(coord.canAcceptGameplayAction(), true);

  // Edit A (plant + spend coins: 200 -> 180) and start Save A
  const planted = plantPlot(coord.getSnapshot().farmState, 'plot-1', 'wheat', 11_000).state;
  const bought = buySeeds(planted, 'carrot', 1, 11_100).state; // coins = 180
  coord.recordGameplayMutation(bought);
  const saveAPromise = coord.flushNow();
  await Promise.resolve();

  // Trigger New Farm while Save A is in-flight!
  const resetPromise = coord.confirmNewFarm();
  assert.equal(coord.getSnapshot().isResetting, true);
  assert.equal(coord.canAcceptGameplayAction(), false);

  // Attempt blocked gameplay mutation while resetting -> ignored
  const blockedEdit = buySeeds(coord.getSnapshot().farmState, 'wheat', 1, 11_200).state;
  coord.recordGameplayMutation(blockedEdit);
  assert.equal(coord.getSnapshot().farmState.coins, 200);

  // Resolve Save A (coins = 180, rev 1 -> 2)
  saveADeferred.resolve();
  await Promise.all([saveAPromise, resetPromise]);

  // Verify Save A did NOT revert reset state and reset wrote sequentially from rev 2 -> rev 3
  assert.equal(coord.getSnapshot().isResetting, false);
  assert.equal(coord.getSnapshot().saveStatus, 'saved');
  assert.equal(coord.getSnapshot().farmState.coins, 200);
  assert.equal(coord.getSnapshot().farmState.plots[0].cropId, '');

  const finalServer = db.getServerFarm('uid-reset')!;
  assert.equal(finalServer.revision, 3);
  assert.equal(finalServer.coins, 200);
  assert.equal(finalServer.plots[0].cropId, '');
  assert.equal(db.saveCalls[1].expectedRevision, 2);
  coord.dispose();
});

test('Req 4: two concurrent initial farm transactions serialize atomically without overwriting existing farm', async () => {
  // Simulate Firestore transaction semantics with optimistic concurrency retry:
  // Session 1 and Session 2 both read "does not exist", Session 1 commits first with coins=200 (and advances to 350),
  // Session 2 retries its transaction and observes exists=true, returning the existing doc without overwriting.
  let serverDoc: Record<string, unknown> | null = null;
  let version = 0;

  async function runSerializedTransaction(
    fn: (tx: {
      get: () => Promise<{ exists: boolean; data?: Record<string, unknown> }>;
      set: (data: Record<string, unknown>) => void;
      update: (data: Record<string, unknown>) => void;
    }) => Promise<{ state: FarmState; createdInitial: boolean }>,
  ) {
    while (true) {
      const readVersion = version;
      let pendingWrite: Record<string, unknown> | null = null;
      const result = await fn({
        get: async () => ({
          exists: serverDoc !== null,
          data: serverDoc ? structuredClone(serverDoc) : undefined,
        }),
        set: (data) => {
          pendingWrite = data;
        },
        update: (data) => {
          pendingWrite = { ...(serverDoc ?? {}), ...data };
        },
      });
      if (!pendingWrite) {
        return result;
      }
      if (readVersion !== version) {
        // Optimistic transaction contention: retry against updated doc
        continue;
      }
      serverDoc = pendingWrite;
      version += 1;
      return result;
    }
  }

  const gate1 = createDeferred<void>();
  const gate2 = createDeferred<void>();
  let calls1 = 0;
  let calls2 = 0;

  const p1 = runSerializedTransaction(async (tx) => {
    calls1 += 1;
    if (calls1 === 1) await gate1.promise;
    return runInitialFarmCreationInTx(
      {
        get: () => tx.get(),
        set: (data) => tx.set({ ...data, coins: 350 }), // mark winner's committed payload
        update: (data) => tx.update(data),
      },
      'uid-race',
      10_000,
      10_000,
    );
  });

  const p2 = runSerializedTransaction(async (tx) => {
    calls2 += 1;
    if (calls2 === 1) await gate2.promise;
    return runInitialFarmCreationInTx(tx, 'uid-race', 10_500, 10_500);
  });

  // Both read before committing; Session 1 commits first
  await Promise.resolve();
  gate1.resolve();
  const r1 = await p1;
  gate2.resolve();
  const r2 = await p2;

  assert.equal(r1.createdInitial, true);
  assert.equal(r2.createdInitial, false);
  assert.equal(r2.state.coins, 350);
  assert.equal((serverDoc as unknown as Record<string, unknown>).coins, 350);
});

test('Req 6: classifyFirestoreConnectionError distinguishes probe permission-denied, offline, missing DB, quota, and service errors', () => {
  const probeDenied = classifyFirestoreConnectionError({
    code: 'permission-denied',
    message: 'Missing or insufficient permissions.',
  });
  assert.equal(probeDenied.reachable, true);
  assert.equal(probeDenied.status, 'server_responded_permission_denied');

  const offline = classifyFirestoreConnectionError({
    code: 'unavailable',
    message: 'Failed to get document because the client is offline.',
  });
  assert.equal(offline.reachable, false);
  assert.equal(offline.status, 'network_offline');

  const missingDb = classifyFirestoreConnectionError({
    code: 'not-found',
    message: 'Database ai-studio-missing does not exist.',
  });
  assert.equal(missingDb.reachable, false);
  assert.equal(missingDb.status, 'config_or_missing_db');

  const quota = classifyFirestoreConnectionError({
    code: 'resource-exhausted',
    message: 'Quota exceeded.',
  });
  assert.equal(quota.reachable, false);
  assert.equal(quota.status, 'quota_exceeded');

  const unknown = classifyFirestoreConnectionError(new Error('Unexpected 500 internal'));
  assert.equal(unknown.reachable, false);
  assert.equal(unknown.status, 'service_error');
});

test('Req 3: conflict blocks gameplay & reset until resolved, and same-UID auth re-emission does not reload session', async () => {
  const db = new InMemoryCloudDb();
  const storage = new InMemoryPendingStorage();

  const server = createInitialFarmState('uid-conf', 10_000);
  server.revision = 4;
  server.coins = 310;
  db.seedServerFarm(server);

  const staleLocal = createInitialFarmState('uid-conf', 10_000);
  staleLocal.revision = 2;
  staleLocal.coins = 250;
  storage.savePending({
    uid: 'uid-conf',
    baseRevision: 2,
    state: staleLocal,
    queuedAtMs: 11_000,
    seq: 1,
  });

  let loadCalls = 0;
  const coord = new FarmSyncCoordinator({
    debounceMs: 10,
    followUpDelayMs: 0,
    storage,
    cloud: {
      testConnection: async () => ({ reachable: true, status: 'server_responded' }),
      loadOrCreateCloudFarm: async (uid) => {
        loadCalls += 1;
        return {
          resolution: resolveLoadState(db.getServerFarm(uid), storage.loadPending(uid)),
          createdInitial: false,
        };
      },
      fetchServerFarm: async (uid) => db.getServerFarm(uid),
      saveCloudFarmWithRevisionCheck: (uid, st, rev) => db.saveWithRevision(uid, st, rev),
    },
  });

  await coord.handleAuthChange('uid-conf');
  assert.equal(loadCalls, 1);
  assert.equal(coord.getSnapshot().saveStatus, 'conflict');
  assert.equal(coord.canAcceptGameplayAction(), false);

  // Token refresh re-emits same UID — must NOT trigger extra reload!
  await coord.handleAuthChange('uid-conf');
  assert.equal(loadCalls, 1);

  // Gameplay & reset are blocked while conflict is active
  coord.recordGameplayMutation(plantPlot(staleLocal, 'plot-1', 'wheat', 12_000).state);
  await coord.confirmNewFarm();
  assert.equal(db.saveCalls.length, 0);
  assert.equal(coord.getSnapshot().farmState.coins, 250);

  // Resolve conflict cleanly using server state
  await coord.resolveConflictUseServer();
  assert.equal(coord.getSnapshot().conflict, null);
  assert.equal(coord.getSnapshot().saveStatus, 'saved');
  assert.equal(coord.getSnapshot().farmState.coins, 310);
  assert.equal(coord.canAcceptGameplayAction(), true);
  assert.equal(storage.loadPending('uid-conf'), null);
  coord.dispose();
});

