import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ChainLimitError, createSeededRandom, createSlotEngine } from '../slot-engine.mjs';

function run(config) {
  const { trials, seed } = config;
  if (!Number.isSafeInteger(trials) || trials < 1) {
    throw new RangeError('trials は正の安全な整数にしてください');
  }
  const started = performance.now();
  const engine = createSlotEngine(config, createSeededRandom(seed));
  const board = engine.createBoard();
  const { betUnits } = engine;
  const distribution = new Map([[0, 0]]);
  const categories = { zero: 0, belowBet: 0, breakEven: 0, aboveBet: 0 };
  const thresholds = [10, 50, 100].map(multiplier => ({
    multiplier,
    units: BigInt(multiplier) * betUnits,
    count: 0,
  }));
  let totalPayout = 0n;
  for (let spin = 0; spin < trials; spin++) {
    engine.fillBoard(board);
    let result;
    try {
      result = engine.resolveBoard(board);
    } catch (error) {
      if (!(error instanceof ChainLimitError)) throw error;
      console.error(`${spin + 1}回転目で中断しました。完了回転数は${spin}です。`);
      console.error('使用した設定');
      console.error(JSON.stringify(config, null, 2));
      throw error;
    }
    const { payoutUnits, chains } = result;
    totalPayout += payoutUnits;
    if (payoutUnits === 0n) categories.zero++;
    else if (payoutUnits < betUnits) categories.belowBet++;
    else if (payoutUnits === betUnits) categories.breakEven++;
    else categories.aboveBet++;
    distribution.set(chains, (distribution.get(chains) ?? 0) + 1);
    for (const threshold of thresholds) {
      if (payoutUnits >= threshold.units) threshold.count++;
    }
  }
  const elapsedMs = performance.now() - started;
  const share = count => ({ count, percentage: (100 * count) / trials });
  return {
    trials,
    seed,
    averagePayoutMultiplier: engine.payoutAsNumber(totalPayout, trials),
    payoutCategories: Object.fromEntries(Object.entries(categories).map(([name, count]) => [name, share(count)])),
    chainDistribution: Object.fromEntries([...distribution].map(([chains, count]) => [chains, share(count)])),
    payoutThresholds: Object.fromEntries(thresholds.map(({ multiplier, count }) => [multiplier, share(count)])),
    elapsedMs,
  };
}

try {
  const [path, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('使い方: node simulator/simulate.mjs [設定ファイル.json]');
  const config = JSON.parse(readFileSync(path ?? new URL('./config.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
  console.log(JSON.stringify(run(config), null, 2));
} catch (error) {
  console.error(`エラー: ${error.message}`);
  process.exitCode = 1;
}
