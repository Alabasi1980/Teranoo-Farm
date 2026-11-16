import { INITIAL_FARM_CONFIG } from '../content/crops';
import { createEmptyPlots } from '../game/rules';
import type { FarmState, PlotId, PlotState } from '../game/types';

export interface PendingLocalSnapshot {
  uid: string;
  baseRevision: number;
  state: FarmState;
  queuedAtMs: number;
}

export class RevisionConflictError extends Error {
  public readonly expectedRevision: number;
  public readonly serverState: FarmState;

  constructor(expectedRevision: number, serverState: FarmState) {
    super(
      `Revision conflict: expected ${expectedRevision}, but server has ${serverState.revision}`,
    );
    this.name = 'RevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.serverState = serverState;
  }
}

export type LoadResolution =
  | { kind: 'use_server'; state: FarmState }
  | { kind: 'retry_pending'; state: FarmState; baseRevision: number }
  | { kind: 'conflict'; serverState: FarmState; pendingState: FarmState }
  | { kind: 'create_initial' };

export function clampNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function sanitizePlotsForFirestore(plots: PlotState[]): PlotState[] {
  const defaultPlots = createEmptyPlots();
  return defaultPlots.map((defPlot, idx) => {
    const incoming = plots[idx];
    if (!incoming || incoming.id !== defPlot.id) return defPlot;
    const cropId = incoming.cropId === 'wheat' || incoming.cropId === 'carrot' ? incoming.cropId : '';
    if (!cropId) {
      return { id: defPlot.id as PlotId, cropId: '', plantedAt: 0, wateredAt: 0 };
    }
    const plantedAt = Math.max(1, clampNonNegativeInt(incoming.plantedAt, 1));
    const wateredAtRaw = clampNonNegativeInt(incoming.wateredAt, 0);
    const wateredAt = wateredAtRaw > 0 ? Math.max(plantedAt, wateredAtRaw) : 0;
    return {
      id: defPlot.id as PlotId,
      cropId,
      plantedAt,
      wateredAt,
    };
  });
}

export function serializeFarmPayload(state: FarmState, nextRevision: number) {
  return {
    schemaVersion: INITIAL_FARM_CONFIG.schemaVersion,
    revision: Math.max(1, Math.floor(nextRevision)),
    ownerUid: state.ownerUid,
    coins: clampNonNegativeInt(state.coins, 0),
    xp: clampNonNegativeInt(state.xp, 0),
    seeds: {
      wheat: clampNonNegativeInt(state.seeds.wheat, 0),
      carrot: clampNonNegativeInt(state.seeds.carrot, 0),
    },
    crops: {
      wheat: clampNonNegativeInt(state.crops.wheat, 0),
      carrot: clampNonNegativeInt(state.crops.carrot, 0),
    },
    plots: sanitizePlotsForFirestore(state.plots),
    stats: {
      totalPlanted: clampNonNegativeInt(state.stats.totalPlanted, 0),
      totalHarvested: clampNonNegativeInt(state.stats.totalHarvested, 0),
      totalRevenue: clampNonNegativeInt(state.stats.totalRevenue, 0),
      rescueGrants: clampNonNegativeInt(state.stats.rescueGrants, 0),
    },
  };
}

function timestampToMs(val: unknown, fallbackMs: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.floor(val);
  if (val && typeof val === 'object') {
    const maybe = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return Math.floor(maybe.toMillis());
    if (typeof maybe.seconds === 'number') return Math.floor(maybe.seconds * 1000);
  }
  return fallbackMs;
}

export function deserializeFarmFromFirestore(
  raw: Record<string, unknown>,
  uid: string,
  nowMs = Date.now(),
): FarmState {
  const seedsRaw = (raw.seeds as Record<string, unknown>) || {};
  const cropsRaw = (raw.crops as Record<string, unknown>) || {};
  const statsRaw = (raw.stats as Record<string, unknown>) || {};
  const plotsRaw = Array.isArray(raw.plots) ? (raw.plots as PlotState[]) : [];

  return {
    schemaVersion: clampNonNegativeInt(raw.schemaVersion, 1) || 1,
    revision: Math.max(1, clampNonNegativeInt(raw.revision, 1)),
    ownerUid: typeof raw.ownerUid === 'string' && raw.ownerUid ? raw.ownerUid : uid,
    coins: clampNonNegativeInt(raw.coins, 0),
    xp: clampNonNegativeInt(raw.xp, 0),
    seeds: {
      wheat: clampNonNegativeInt(seedsRaw.wheat, 0),
      carrot: clampNonNegativeInt(seedsRaw.carrot, 0),
    },
    crops: {
      wheat: clampNonNegativeInt(cropsRaw.wheat, 0),
      carrot: clampNonNegativeInt(cropsRaw.carrot, 0),
    },
    plots: sanitizePlotsForFirestore(plotsRaw),
    stats: {
      totalPlanted: clampNonNegativeInt(statsRaw.totalPlanted, 0),
      totalHarvested: clampNonNegativeInt(statsRaw.totalHarvested, 0),
      totalRevenue: clampNonNegativeInt(statsRaw.totalRevenue, 0),
      rescueGrants: clampNonNegativeInt(statsRaw.rescueGrants, 0),
    },
    createdAtMs: timestampToMs(raw.createdAt, nowMs),
    updatedAtMs: timestampToMs(raw.updatedAt, nowMs),
  };
}

export function resolveLoadState(
  serverState: FarmState | null,
  pendingLocal: PendingLocalSnapshot | null,
): LoadResolution {
  if (!serverState) {
    return { kind: 'create_initial' };
  }

  if (!pendingLocal || pendingLocal.uid !== serverState.ownerUid) {
    return { kind: 'use_server', state: serverState };
  }

  // Only replay pending local edits if they were built directly on top of the current server revision.
  // Never auto-merge balances or inventory if another session already advanced the server revision.
  if (pendingLocal.baseRevision === serverState.revision) {
    return {
      kind: 'retry_pending',
      state: pendingLocal.state,
      baseRevision: pendingLocal.baseRevision,
    };
  }

  return {
    kind: 'conflict',
    serverState,
    pendingState: pendingLocal.state,
  };
}

export function checkAtomicRevisionMatch(
  serverRevision: number,
  expectedRevision: number,
): boolean {
  return serverRevision === expectedRevision;
}
