import type { CropId } from '../content/crops';

export type PlotId = 'plot-1' | 'plot-2' | 'plot-3' | 'plot-4' | 'plot-5' | 'plot-6';

export type ToolId = 'seed_wheat' | 'seed_carrot' | 'water' | 'harvest';

export type PlotLifecycleStatus = 'empty' | 'planted_unwatered' | 'growing' | 'ready';

export interface PlotState {
  id: PlotId;
  cropId: CropId | '';
  plantedAt: number; // Unix ms, 0 when empty
  wateredAt: number; // Unix ms, 0 when unwatered or empty
}

export interface FarmStats {
  totalPlanted: number;
  totalHarvested: number;
  totalRevenue: number;
  rescueGrants: number;
}

export interface FarmState {
  schemaVersion: number;
  revision: number;
  ownerUid: string;
  coins: number;
  xp: number;
  seeds: Record<CropId, number>;
  crops: Record<CropId, number>;
  plots: PlotState[];
  stats: FarmStats;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PlotDerivedInfo {
  status: PlotLifecycleStatus;
  cropId: CropId | null;
  progress: number; // 0 to 1
  remainingMs: number;
  totalGrowthMs: number;
}

export interface LevelInfo {
  level: number;
  currentLevelXp: number;
  xpForNextLevel: number;
  progressPercent: number;
}

export interface IntroGoalProgress {
  titleAr: string;
  current: number;
  target: number;
  completed: boolean;
}

export type SaveStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'pending_offline'
  | 'error'
  | 'conflict'
  | 'local_preview';

export interface ActionOutcome {
  ok: boolean;
  state: FarmState;
  code:
    | 'success'
    | 'insufficient_coins'
    | 'insufficient_seeds'
    | 'insufficient_crops'
    | 'invalid_quantity'
    | 'plot_not_found'
    | 'plot_occupied'
    | 'plot_empty'
    | 'already_watered'
    | 'not_watered'
    | 'not_ready';
  messageAr: string;
  rescueGranted?: boolean;
  earnedCoins?: number;
  earnedXp?: number;
}
