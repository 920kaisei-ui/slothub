import assert from 'node:assert/strict';
import test from 'node:test';
import { ChainLimitError, createSeededRandom, createSlotEngine, WILD } from '../slot-engine.mjs';

const A = 0;
const B = 1;
const C = 2;
const D = 3;

function fixture(width, height, minimumClusterSize, options = {}) {
  return {
    width,
    height,
    minimumClusterSize,
    gems: ['A', 'B', 'C', 'D'].map((name, index) => ({
      name,
      initialWeight: 1,
      refillWeight: 1,
      payouts: [{ count: minimumClusterSize, amount: (index + 1) / 10 }],
    })),
    wildCounts: [{ count: 1, weight: 1 }],
    chainMultipliers: [1, 2],
    maxChains: 100,
    ...options,
  };
}

test('L字の5個を1回だけ配当する', () => {
  const engine = createSlotEngine(fixture(3, 3, 5), () => 0.9);
  const board = Int32Array.of(
    A, B, C,
    A, C, B,
    A, A, A,
  );
  assert.equal(engine.step(board, 1), 1n);
  assert.equal(board.filter(gem => gem === A).length, 0);
});

test('斜めだけの5個とワイルドだけの連結は不成立', () => {
  const diagonal = createSlotEngine(fixture(5, 5, 5));
  const board = Int32Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;
    return row === column ? A : (row + column) % 2 ? B : C;
  });
  assert.deepEqual(diagonal.resolveBoard(board), { payoutUnits: 0n, chains: 0 });
  assert.equal(diagonal.step(new Int32Array(25).fill(WILD), 1), null);
});

test('複数色が同じワイルドを使い、それぞれ配当される', () => {
  const engine = createSlotEngine(fixture(5, 3, 5), () => 0.9);
  const board = Int32Array.of(
    A, A, C, B, B,
    A, A, WILD, B, B,
    C, C, D, C, C,
  );
  assert.equal(engine.step(board, 1), 3n);
  assert.equal(board[7], WILD);
  assert.equal(board.includes(A) || board.includes(B), false);
});

test('ワイルドを飛ばす落下が次の消去を起こし、連鎖倍率を適用する', () => {
  const draws = [0.3, 0.6];
  const engine = createSlotEngine(fixture(2, 5, 3), () => draws.shift() ?? 0.9);
  const board = Int32Array.of(
    B, C,
    A, B,
    WILD, C,
    A, B,
    C, C,
  );
  assert.equal(engine.step(board, 1), 1n);
  assert.deepEqual([...board], [
    C, C,
    B, B,
    WILD, C,
    B, B,
    C, C,
  ]);
  assert.equal(engine.step(board, 2), 4n);
  assert.equal(board[4], WILD);
});

test('ゼロ配当の消去も連鎖に数える', () => {
  const config = fixture(3, 1, 3);
  config.gems[A].payouts[0].amount = 0;
  const draws = [0.3, 0.6, 0.9];
  const engine = createSlotEngine(config, () => draws.shift());
  assert.deepEqual(engine.resolveBoard(Int32Array.of(A, A, A)), { payoutUnits: 0n, chains: 1 });
});

test('初期配置と補充の重みを分け、指定個数のワイルドを置く', () => {
  const config = fixture(5, 1, 5, { wildCounts: [{ count: 2, weight: 1 }] });
  config.gems.forEach((gem, index) => {
    gem.initialWeight = Number(index === A);
    gem.refillWeight = Number(index === B);
  });
  const engine = createSlotEngine(config, createSeededRandom(7));
  const board = engine.fillBoard(engine.createBoard());
  const initialWilds = board.map(gem => Number(gem === WILD));
  assert.equal(initialWilds.reduce((total, value) => total + value), 2);
  assert.equal(board.filter(gem => gem === A).length, 3);
  assert.equal(engine.step(board, 1), 1n);
  assert.deepEqual(board.map(gem => Number(gem === WILD)), initialWilds);
  assert.equal(board.filter(gem => gem === B).length, 3);
});

test('連鎖上限で中断し、無効な設定を拒否する', () => {
  const config = fixture(2, 1, 2, { maxChains: 2 });
  const engine = createSlotEngine(config, () => 0);
  assert.throws(() => engine.resolveBoard(Int32Array.of(WILD, A)), ChainLimitError);
  assert.throws(() => createSlotEngine({ ...config, wildCounts: [{ count: 3, weight: 1 }] }), /wildCounts/);
  config.gems.forEach(gem => { gem.refillWeight = 0; });
  assert.throws(() => createSlotEngine(config), /補充の重み/);
});
