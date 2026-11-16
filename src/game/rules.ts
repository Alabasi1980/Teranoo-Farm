import { CROP_DEFINITIONS, INITIAL_FARM_CONFIG, type CropId } from '../content/crops';
import type {
  ActionOutcome,
  FarmState,
  IntroGoalProgress,
  LevelInfo,
  PlotDerivedInfo,
  PlotId,
  PlotState,
} from './types';

const PLOT_IDS: readonly PlotId[] = [
  'plot-1',
  'plot-2',
  'plot-3',
  'plot-4',
  'plot-5',
  'plot-6',
];

export function createEmptyPlots(): PlotState[] {
  return PLOT_IDS.map((id) => ({
    id,
    cropId: '',
    plantedAt: 0,
    wateredAt: 0,
  }));
}

export function createInitialFarmState(ownerUid: string, nowMs = Date.now()): FarmState {
  const safeNow = Math.max(1, Math.floor(nowMs));
  return {
    schemaVersion: INITIAL_FARM_CONFIG.schemaVersion,
    revision: 1,
    ownerUid,
    coins: INITIAL_FARM_CONFIG.startingCoins,
    xp: INITIAL_FARM_CONFIG.startingXp,
    seeds: { ...INITIAL_FARM_CONFIG.startingSeeds },
    crops: { ...INITIAL_FARM_CONFIG.startingCrops },
    plots: createEmptyPlots(),
    stats: {
      totalPlanted: 0,
      totalHarvested: 0,
      totalRevenue: 0,
      rescueGrants: 0,
    },
    createdAtMs: safeNow,
    updatedAtMs: safeNow,
  };
}

export function resetFarmState(current: FarmState, nowMs = Date.now()): FarmState {
  const safeNow = Math.max(1, Math.floor(nowMs));
  return {
    schemaVersion: INITIAL_FARM_CONFIG.schemaVersion,
    revision: current.revision,
    ownerUid: current.ownerUid,
    coins: INITIAL_FARM_CONFIG.startingCoins,
    xp: INITIAL_FARM_CONFIG.startingXp,
    seeds: { ...INITIAL_FARM_CONFIG.startingSeeds },
    crops: { ...INITIAL_FARM_CONFIG.startingCrops },
    plots: createEmptyPlots(),
    stats: {
      totalPlanted: 0,
      totalHarvested: 0,
      totalRevenue: 0,
      rescueGrants: 0,
    },
    createdAtMs: current.createdAtMs,
    updatedAtMs: safeNow,
  };
}

export function computeLevelFromXp(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  const step = INITIAL_FARM_CONFIG.xpPerLevel;
  const level = Math.floor(safeXp / step) + 1;
  const currentLevelXp = safeXp % step;
  return {
    level,
    currentLevelXp,
    xpForNextLevel: step,
    progressPercent: Math.round((currentLevelXp / step) * 100),
  };
}

export function getIntroGoalProgress(state: FarmState): IntroGoalProgress {
  const target = INITIAL_FARM_CONFIG.introGoalTargetHarvests;
  const current = Math.min(state.stats.totalHarvested, target);
  return {
    titleAr: 'احصد 3 محاصيل',
    current,
    target,
    completed: state.stats.totalHarvested >= target,
  };
}

export function getPlotDerivedInfo(plot: PlotState, nowMs: number): PlotDerivedInfo {
  if (!plot.cropId) {
    return {
      status: 'empty',
      cropId: null,
      progress: 0,
      remainingMs: 0,
      totalGrowthMs: 0,
    };
  }

  const def = CROP_DEFINITIONS[plot.cropId];
  const totalGrowthMs = def.growthSeconds * 1000;

  if (plot.wateredAt <= 0) {
    return {
      status: 'planted_unwatered',
      cropId: plot.cropId,
      progress: 0,
      remainingMs: totalGrowthMs,
      totalGrowthMs,
    };
  }

  const elapsedMs = Math.max(0, nowMs - plot.wateredAt);
  const remainingMs = Math.max(0, totalGrowthMs - elapsedMs);
  const progress = Math.min(1, elapsedMs / totalGrowthMs);

  return {
    status: remainingMs === 0 ? 'ready' : 'growing',
    cropId: plot.cropId,
    progress,
    remainingMs,
    totalGrowthMs,
  };
}

export function evaluateRescueGrant(state: FarmState): { state: FarmState; granted: boolean } {
  const { minCoinsThreshold, wheatSeedsGranted } = INITIAL_FARM_CONFIG.rescueGrant;
  const totalSeeds = state.seeds.wheat + state.seeds.carrot;
  const totalCrops = state.crops.wheat + state.crops.carrot;
  const hasOccupiedPlot = state.plots.some((plot) => plot.cropId !== '');

  if (
    state.coins < minCoinsThreshold &&
    totalSeeds === 0 &&
    totalCrops === 0 &&
    !hasOccupiedPlot
  ) {
    return {
      granted: true,
      state: {
        ...state,
        seeds: {
          ...state.seeds,
          wheat: wheatSeedsGranted,
        },
        stats: {
          ...state.stats,
          rescueGrants: state.stats.rescueGrants + 1,
        },
      },
    };
  }

  return { granted: false, state };
}

export function buySeeds(
  state: FarmState,
  cropId: CropId,
  quantity: number,
  nowMs = Date.now(),
): ActionOutcome {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      state,
      code: 'invalid_quantity',
      messageAr: 'يرجى اختيار كمية صحيحة موجبة للشراء.',
    };
  }

  const def = CROP_DEFINITIONS[cropId];
  const totalCost = def.seedCost * quantity;

  if (state.coins < totalCost) {
    return {
      ok: false,
      state,
      code: 'insufficient_coins',
      messageAr: `رصيدك غير كافٍ لشراء ${quantity} من ${def.seedNameAr} (المطلوب ${totalCost} عملة).`,
    };
  }

  const nextState: FarmState = {
    ...state,
    coins: state.coins - totalCost,
    seeds: {
      ...state.seeds,
      [cropId]: state.seeds[cropId] + quantity,
    },
    updatedAtMs: Math.floor(nowMs),
  };

  return {
    ok: true,
    state: nextState,
    code: 'success',
    messageAr: `تم شراء ${quantity} من ${def.seedNameAr} مقابل ${totalCost} عملة.`,
  };
}

export function plantPlot(
  state: FarmState,
  plotId: PlotId,
  cropId: CropId,
  nowMs = Date.now(),
): ActionOutcome {
  const plotIndex = state.plots.findIndex((p) => p.id === plotId);
  if (plotIndex === -1) {
    return {
      ok: false,
      state,
      code: 'plot_not_found',
      messageAr: 'تعذر العثور على قطعة الأرض المحددة.',
    };
  }

  const targetPlot = state.plots[plotIndex];
  if (targetPlot.cropId !== '') {
    return {
      ok: false,
      state,
      code: 'plot_occupied',
      messageAr: 'هذه القطعة مزروعة بالفعل ولا يمكن زراعتها الآن.',
    };
  }

  const def = CROP_DEFINITIONS[cropId];
  if (state.seeds[cropId] < 1) {
    return {
      ok: false,
      state,
      code: 'insufficient_seeds',
      messageAr: `لا توجد ${def.seedNameAr} كافية في مخزونك. اشترِ بذورًا من المتجر.`,
    };
  }

  const safeNow = Math.max(1, Math.floor(nowMs));
  const updatedPlots = state.plots.map((p, idx) =>
    idx === plotIndex
      ? {
          ...p,
          cropId,
          plantedAt: safeNow,
          wateredAt: 0,
        }
      : p,
  );

  const nextState: FarmState = {
    ...state,
    seeds: {
      ...state.seeds,
      [cropId]: state.seeds[cropId] - 1,
    },
    plots: updatedPlots,
    stats: {
      ...state.stats,
      totalPlanted: state.stats.totalPlanted + 1,
    },
    updatedAtMs: safeNow,
  };

  return {
    ok: true,
    state: nextState,
    code: 'success',
    messageAr: `تمت زراعة ${def.nameAr}. اسقِ القطعة لبدء النمو.`,
  };
}

export function waterPlot(
  state: FarmState,
  plotId: PlotId,
  nowMs = Date.now(),
): ActionOutcome {
  const plotIndex = state.plots.findIndex((p) => p.id === plotId);
  if (plotIndex === -1) {
    return {
      ok: false,
      state,
      code: 'plot_not_found',
      messageAr: 'تعذر العثور على قطعة الأرض المحددة.',
    };
  }

  const targetPlot = state.plots[plotIndex];
  if (targetPlot.cropId === '') {
    return {
      ok: false,
      state,
      code: 'plot_empty',
      messageAr: 'ازرع بذرة أولًا قبل ري هذه القطعة.',
    };
  }

  if (targetPlot.wateredAt > 0) {
    return {
      ok: false,
      state,
      code: 'already_watered',
      messageAr: 'هذه القطعة مروية بالفعل وتنمو في موعدها.',
    };
  }

  const safeNow = Math.max(targetPlot.plantedAt, Math.floor(nowMs));
  const updatedPlots = state.plots.map((p, idx) =>
    idx === plotIndex
      ? {
          ...p,
          wateredAt: safeNow,
        }
      : p,
  );

  const def = CROP_DEFINITIONS[targetPlot.cropId];
  const nextState: FarmState = {
    ...state,
    plots: updatedPlots,
    updatedAtMs: safeNow,
  };

  return {
    ok: true,
    state: nextState,
    code: 'success',
    messageAr: `تم ري ${def.nameAr}. سينضج خلال ${def.growthSeconds} ثانية.`,
  };
}

export function harvestPlot(
  state: FarmState,
  plotId: PlotId,
  nowMs = Date.now(),
): ActionOutcome {
  const plotIndex = state.plots.findIndex((p) => p.id === plotId);
  if (plotIndex === -1) {
    return {
      ok: false,
      state,
      code: 'plot_not_found',
      messageAr: 'تعذر العثور على قطعة الأرض المحددة.',
    };
  }

  const targetPlot = state.plots[plotIndex];
  if (targetPlot.cropId === '') {
    return {
      ok: false,
      state,
      code: 'plot_empty',
      messageAr: 'هذه القطعة فارغة حاليًا.',
    };
  }

  const derived = getPlotDerivedInfo(targetPlot, nowMs);
  if (derived.status === 'planted_unwatered') {
    return {
      ok: false,
      state,
      code: 'not_watered',
      messageAr: 'يجب ري المحصول أولًا قبل أن ينمو للحصاد.',
    };
  }

  if (derived.status !== 'ready') {
    const secs = Math.ceil(derived.remainingMs / 1000);
    return {
      ok: false,
      state,
      code: 'not_ready',
      messageAr: `المحصول لم ينضج بعد؛ المتبقي ${secs} ثانية.`,
    };
  }

  const cropId = targetPlot.cropId;
  const def = CROP_DEFINITIONS[cropId];
  const safeNow = Math.floor(nowMs);

  const updatedPlots = state.plots.map((p, idx) =>
    idx === plotIndex
      ? {
          ...p,
          cropId: '' as const,
          plantedAt: 0,
          wateredAt: 0,
        }
      : p,
  );

  const nextState: FarmState = {
    ...state,
    xp: state.xp + def.harvestXp,
    crops: {
      ...state.crops,
      [cropId]: state.crops[cropId] + 1,
    },
    plots: updatedPlots,
    stats: {
      ...state.stats,
      totalHarvested: state.stats.totalHarvested + 1,
    },
    updatedAtMs: safeNow,
  };

  return {
    ok: true,
    state: nextState,
    code: 'success',
    earnedXp: def.harvestXp,
    messageAr: `تم حصاد ${def.nameAr}! (+${def.harvestXp} خبرة، أُضيف إلى المستودع).`,
  };
}

export function sellCrops(
  state: FarmState,
  cropId: CropId,
  quantity: number,
  nowMs = Date.now(),
): ActionOutcome {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return {
      ok: false,
      state,
      code: 'invalid_quantity',
      messageAr: 'يرجى اختيار كمية صحيحة موجبة للبيع.',
    };
  }

  const def = CROP_DEFINITIONS[cropId];
  if (state.crops[cropId] < quantity) {
    return {
      ok: false,
      state,
      code: 'insufficient_crops',
      messageAr: `لا يوجد لديك ${quantity} من محصول ${def.nameAr} في المستودع.`,
    };
  }

  const revenue = def.sellPrice * quantity;
  const rawNextState: FarmState = {
    ...state,
    coins: state.coins + revenue,
    crops: {
      ...state.crops,
      [cropId]: state.crops[cropId] - quantity,
    },
    stats: {
      ...state.stats,
      totalRevenue: state.stats.totalRevenue + revenue,
    },
    updatedAtMs: Math.floor(nowMs),
  };

  const rescue = evaluateRescueGrant(rawNextState);

  return {
    ok: true,
    state: rescue.state,
    code: 'success',
    earnedCoins: revenue,
    rescueGranted: rescue.granted,
    messageAr: `تم بيع ${quantity} من ${def.nameAr} مقابل ${revenue} عملة.`,
  };
}
