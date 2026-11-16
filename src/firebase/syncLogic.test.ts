import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialFarmState, plantPlot } from '../game/rules';
import {
  checkAtomicRevisionMatch,
  deserializeFarmFromFirestore,
  resolveLoadState,
  serializeFarmPayload,
} from './syncLogic';

test('never overwrites an existing cloud save when resolving load state', () => {
  const existingServer = createInitialFarmState('uid-123', 10_000);
  existingServer.coins = 540;
  existingServer.revision = 4;

  const res = resolveLoadState(existingServer, null);
  assert.equal(res.kind, 'use_server');
  if (res.kind === 'use_server') {
    assert.equal(res.state.coins, 540);
    assert.equal(res.state.revision, 4);
  }
});

test('creates initial farm only when server document does not exist', () => {
  const res = resolveLoadState(null, null);
  assert.equal(res.kind, 'create_initial');
});

test('queues pending local edits for retry if baseRevision matches server revision', () => {
  const server = createInitialFarmState('uid-123', 10_000);
  server.revision = 3;

  const localEdited = plantPlot(server, 'plot-1', 'wheat', 11_000).state;
  const res = resolveLoadState(server, {
    uid: 'uid-123',
    baseRevision: 3,
    state: localEdited,
    queuedAtMs: 11_000,
  });

  assert.equal(res.kind, 'retry_pending');
  if (res.kind === 'retry_pending') {
    assert.equal(res.state.plots[0].cropId, 'wheat');
    assert.equal(res.baseRevision, 3);
  }
});

test('detects revision conflict without auto-merging balances or inventory', () => {
  const server = createInitialFarmState('uid-123', 10_000);
  server.revision = 5;
  server.coins = 310;

  const staleLocal = createInitialFarmState('uid-123', 10_000);
  staleLocal.revision = 3;
  staleLocal.coins = 250;

  const res = resolveLoadState(server, {
    uid: 'uid-123',
    baseRevision: 3,
    state: staleLocal,
    queuedAtMs: 12_000,
  });

  assert.equal(res.kind, 'conflict');
  if (res.kind === 'conflict') {
    // Balances are kept separate and NOT merged/summed
    assert.equal(res.serverState.coins, 310);
    assert.equal(res.pendingState.coins, 250);
  }
});

test('atomic revision check rejects stale session revisions', () => {
  assert.equal(checkAtomicRevisionMatch(4, 4), true);
  assert.equal(checkAtomicRevisionMatch(5, 4), false);
});

test('serializes and deserializes farm payload with non-negative integers and 6 plots', () => {
  let s = createInitialFarmState('uid-abc', 20_000);
  s = plantPlot(s, 'plot-2', 'carrot', 21_000).state;

  const payload = serializeFarmPayload(s, 2);
  assert.equal(payload.revision, 2);
  assert.equal(payload.plots.length, 6);
  assert.equal(payload.plots[1].cropId, 'carrot');

  const roundTrip = deserializeFarmFromFirestore(
    {
      ...payload,
      createdAt: { toMillis: () => 20_000 },
      updatedAt: { toMillis: () => 21_000 },
    },
    'uid-abc',
  );
  assert.equal(roundTrip.ownerUid, 'uid-abc');
  assert.equal(roundTrip.revision, 2);
  assert.equal(roundTrip.plots[1].cropId, 'carrot');
  assert.equal(roundTrip.seeds.carrot, 2);
});
