export type CropId = 'wheat' | 'carrot';

export interface CropDefinition {
  id: CropId;
  nameAr: string;
  seedNameAr: string;
  seedCost: number;
  sellPrice: number;
  growthSeconds: number;
  harvestXp: number;
  accentColor: string;
}

export const CROP_IDS: readonly CropId[] = ['wheat', 'carrot'] as const;

export const CROP_DEFINITIONS: Record<CropId, CropDefinition> = {
  wheat: {
    id: 'wheat',
    nameAr: 'القمح',
    seedNameAr: 'بذور القمح',
    seedCost: 10,
    sellPrice: 25,
    growthSeconds: 30,
    harvestXp: 5,
    accentColor: '#eab308',
  },
  carrot: {
    id: 'carrot',
    nameAr: 'الجزر',
    seedNameAr: 'بذور الجزر',
    seedCost: 15,
    sellPrice: 40,
    growthSeconds: 60,
    harvestXp: 8,
    accentColor: '#f97316',
  },
};

export const INITIAL_FARM_CONFIG = {
  schemaVersion: 1,
  startingCoins: 200,
  startingXp: 0,
  plotCount: 6,
  startingSeeds: {
    wheat: 5,
    carrot: 3,
  } as Record<CropId, number>,
  startingCrops: {
    wheat: 0,
    carrot: 0,
  } as Record<CropId, number>,
  xpPerLevel: 100,
  introGoalTargetHarvests: 3,
  rescueGrant: {
    minCoinsThreshold: 10,
    wheatSeedsGranted: 3,
  },
} as const;
