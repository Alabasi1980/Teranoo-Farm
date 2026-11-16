import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buySeeds,
  computeLevelFromXp,
  createInitialFarmState,
  evaluateRescueGrant,
  getIntroGoalProgress,
  getPlotDerivedInfo,
  harvestPlot,
  plantPlot,
  resetFarmState,
  sellCrops,
  waterPlot,
} from './rules';

test('initial state matches Batch 1 specification', () => {
  const s = createInitialFarmState('user-1', 1000);
  assert.equal(s.coins, 200);
  assert.equal(s.xp, 0);
  assert.equal(s.plots.length, 6);
  assert.equal(s.seeds.wheat, 5);
  assert.equal(s.seeds.carrot, 3);
  assert.equal(s.crops.wheat, 0);
  assert.equal(s.crops.carrot, 0);
  assert.equal(s.revision, 1);
  assert.equal(s.schemaVersion, 1);
});

test('prevents buying seeds without sufficient coins or invalid quantities', () => {
  const s = createInitialFarmState('user-1', 1000);
  const badQty = buySeeds(s, 'wheat', 0, 1000);
  assert.equal(badQty.ok, false);
  assert.equal(badQty.code, 'invalid_quantity');

  const negQty = buySeeds(s, 'wheat', -2, 1000);
  assert.equal(negQty.ok, false);

  const tooExpensive = buySeeds(s, 'carrot', 20, 1000); // 20 * 15 = 300 > 200
  assert.equal(tooExpensive.ok, false);
  assert.equal(tooExpensive.code, 'insufficient_coins');
  assert.equal(tooExpensive.state.coins, 200);

  const valid = buySeeds(s, 'carrot', 2, 1000); // 2 * 15 = 30
  assert.equal(valid.ok, true);
  assert.equal(valid.state.coins, 170);
  assert.equal(valid.state.seeds.carrot, 5);
});

test('prevents planting without seeds or on an occupied plot', () => {
  let s = createInitialFarmState('user-1', 1000);
  // Drain wheat seeds (5 plots)
  for (let i = 1; i <= 5; i += 1) {
    const res = plantPlot(s, `plot-${i}` as `plot-${1 | 2 | 3 | 4 | 5 | 6}`, 'wheat', 1000 + i);
    assert.equal(res.ok, true);
    s = res.state;
  }
  assert.equal(s.seeds.wheat, 0);

  // Planting without wheat seeds fails
  const noSeeds = plantPlot(s, 'plot-6', 'wheat', 2000);
  assert.equal(noSeeds.ok, false);
  assert.equal(noSeeds.code, 'insufficient_seeds');

  // Planting carrot on occupied plot-1 fails
  const occupied = plantPlot(s, 'plot-1', 'carrot', 2000);
  assert.equal(occupied.ok, false);
  assert.equal(occupied.code, 'plot_occupied');
});

test('crop does not grow before watering and repeated watering does not reset timer', () => {
  const start = 10_000;
  let s = createInitialFarmState('user-1', start);
  s = plantPlot(s, 'plot-1', 'wheat', start).state;

  // Even 120 seconds later, unwatered crop has 0 progress
  const unwateredInfo = getPlotDerivedInfo(s.plots[0], start + 120_000);
  assert.equal(unwateredInfo.status, 'planted_unwatered');
  assert.equal(unwateredInfo.progress, 0);

  const earlyHarvest = harvestPlot(s, 'plot-1', start + 120_000);
  assert.equal(earlyHarvest.ok, false);
  assert.equal(earlyHarvest.code, 'not_watered');

  // First water at start + 5000
  const waterTime = start + 5_000;
  const watered = waterPlot(s, 'plot-1', waterTime);
  assert.equal(watered.ok, true);
  s = watered.state;
  assert.equal(s.plots[0].wateredAt, waterTime);

  // Repeated watering at waterTime + 15000 fails and keeps original wateredAt
  const repeat = waterPlot(s, 'plot-1', waterTime + 15_000);
  assert.equal(repeat.ok, false);
  assert.equal(repeat.code, 'already_watered');
  assert.equal(repeat.state.plots[0].wateredAt, waterTime);
});

test('prevents early or duplicate harvest and persists offline growth across reload', () => {
  const waterTime = 50_000;
  let s = createInitialFarmState('user-1', waterTime - 1000);
  s = plantPlot(s, 'plot-1', 'wheat', waterTime - 1000).state; // 30s growth
  s = waterPlot(s, 'plot-1', waterTime).state;

  // 29s after watering -> not ready
  const early = harvestPlot(s, 'plot-1', waterTime + 29_000);
  assert.equal(early.ok, false);
  assert.equal(early.code, 'not_ready');

  // Simulate reload (serialize -> deserialize) 35s after watering
  const reloaded: typeof s = JSON.parse(JSON.stringify(s));
  const derivedAfterReload = getPlotDerivedInfo(reloaded.plots[0], waterTime + 35_000);
  assert.equal(derivedAfterReload.status, 'ready');

  const harvested = harvestPlot(reloaded, 'plot-1', waterTime + 35_000);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.crops.wheat, 1);
  assert.equal(harvested.state.xp, 5);
  assert.equal(harvested.state.stats.totalHarvested, 1);
  assert.equal(harvested.state.plots[0].cropId, '');

  // Duplicate harvest on now-empty plot fails
  const duplicate = harvestPlot(harvested.state, 'plot-1', waterTime + 36_000);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.code, 'plot_empty');
});

test('selling updates coins and inventory accurately without adding XP', () => {
  const t = 10_000;
  let s = createInitialFarmState('user-1', t);
  s = plantPlot(s, 'plot-1', 'carrot', t).state;
  s = waterPlot(s, 'plot-1', t).state;
  s = harvestPlot(s, 'plot-1', t + 60_000).state;

  assert.equal(s.crops.carrot, 1);
  assert.equal(s.xp, 8);

  const tooMany = sellCrops(s, 'carrot', 2, t + 61_000);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.code, 'insufficient_crops');

  const sold = sellCrops(s, 'carrot', 1, t + 61_000);
  assert.equal(sold.ok, true);
  assert.equal(sold.state.coins, 240);
  assert.equal(sold.state.crops.carrot, 0);
  assert.equal(sold.state.stats.totalRevenue, 40);
  assert.equal(sold.state.xp, 8); // No XP added on sell
});

test('level derivation grants 1 level per 100 XP', () => {
  assert.equal(computeLevelFromXp(0).level, 1);
  assert.equal(computeLevelFromXp(99).level, 1);
  assert.equal(computeLevelFromXp(100).level, 2);
  assert.equal(computeLevelFromXp(245).level, 3);
  assert.equal(computeLevelFromXp(245).currentLevelXp, 45);
});

test('rescue grant triggers once when coins < 10 and no seeds/crops/active plots exist', () => {
  let s = createInitialFarmState('user-1', 1000);
  s = {
    ...s,
    coins: 9,
    seeds: { wheat: 0, carrot: 0 },
    crops: { wheat: 0, carrot: 0 },
  };
  const first = evaluateRescueGrant(s);
  assert.equal(first.granted, true);
  assert.equal(first.state.seeds.wheat, 3);
  assert.equal(first.state.stats.rescueGrants, 1);

  // Calling again does not repeat while player has those 3 seeds
  const second = evaluateRescueGrant(first.state);
  assert.equal(second.granted, false);
  assert.equal(second.state.seeds.wheat, 3);
  assert.equal(second.state.stats.rescueGrants, 1);
});

test('reset farm and intro goal progress behave accurately', () => {
  const t = 1000;
  let s = createInitialFarmState('user-1', t);
  for (let i = 1; i <= 3; i += 1) {
    const pid = `plot-${i}` as `plot-${1 | 2 | 3}`;
    s = plantPlot(s, pid, 'wheat', t).state;
    s = waterPlot(s, pid, t).state;
    s = harvestPlot(s, pid, t + 30_000).state;
  }

  const goalBeforeReset = getIntroGoalProgress(s);
  assert.equal(goalBeforeReset.current, 3);
  assert.equal(goalBeforeReset.completed, true);

  const reset = resetFarmState({ ...s, revision: 7 }, t + 50_000);
  assert.equal(reset.coins, 200);
  assert.equal(reset.xp, 0);
  assert.equal(reset.seeds.wheat, 5);
  assert.equal(reset.seeds.carrot, 3);
  assert.equal(reset.stats.totalHarvested, 0);
  assert.equal(reset.revision, 7);
  assert.equal(getIntroGoalProgress(reset).current, 0);
  assert.equal(getIntroGoalProgress(reset).completed, false);
});
