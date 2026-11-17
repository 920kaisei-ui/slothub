import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSeededRandom, createSlotEngine, WILD } from './slot-engine.mjs';
import { createGameSession } from './session.mjs';

const preset = JSON.parse(readFileSync(new URL('./simulator/presets/6x7.json', import.meta.url)));

test('段階表示ありの回転が同じ乱数列の一括シミュレーションと一致する', () => {
  const engine = createSlotEngine(preset, createSeededRandom(preset.seed));
  const session = createGameSession(engine);
  const cli = createSlotEngine(preset, createSeededRandom(preset.seed));
  const board = cli.createBoard();
  let balance = 100n * cli.betUnits;

  for (let spin = 1; spin <= 40; spin++) {
    const bet = spin % 5 === 0 ? 5 : 1;
    const round = session.spin(bet);
    assert.deepEqual(round.initialBoard, cli.fillBoard(board));
    const { chains, payoutUnits } = cli.resolveBoard(board);
    assert.equal(round.frames.length, chains);
    assert.deepEqual(round.frames.at(-1)?.board ?? round.initialBoard, board);
    const payout = payoutUnits * BigInt(bet);
    assert.equal(round.balanceAfterBet, balance - BigInt(bet) * cli.betUnits);
    balance = round.balanceAfterBet + payout;
    assert.equal(round.payout, payout);
    assert.equal(round.stake, BigInt(bet) * cli.betUnits);
    assert.equal(round.net, payout - round.stake);
    assert.equal(round.balance, balance);
    assert.equal(round.profit, balance - 100n * cli.betUnits);
    assert.equal(round.spins, spin);
    let cumulative = 0n;
    for (const frame of round.frames) {
      cumulative += frame.matches.reduce((sum, match) => sum + match.award, 0n);
      assert.equal(frame.payout, cumulative);
      for (const index of frame.activeWilds) {
        assert.equal(round.initialBoard[index], WILD);
        assert.ok(frame.matches.some(match => match.cells.includes(index)));
      }
      frame.cleared.forEach((mask, index) => {
        if (round.initialBoard[index] === WILD) {
          assert.equal(mask, 0);
          assert.equal(frame.board[index], WILD);
        }
      });
    }
  }
});

test('残高不足ではベットできず、リセットで開始状態に戻る', () => {
  const engine = createSlotEngine({
    ...preset,
    width: 5,
    height: 1,
    wildCounts: [{ count: 1, weight: 1 }],
  }, createSeededRandom(10));
  const session = createGameSession(engine);
  const initial = session.snapshot();
  for (let spin = 0; spin < 10; spin++) assert.equal(session.spin(10).payout, 0n);
  assert.equal(session.canSpin(1), false);
  assert.throws(() => session.spin(1), /足りません/);
  assert.throws(() => session.spin(0), /選べるベット額/);
  assert.equal(session.snapshot().balance, 0n);
  assert.deepEqual(session.reset(), initial);
  assert.equal(session.canSpin(10), true);
});

test('連鎖上限で中断した回転のベット額を消費しない', () => {
  const engine = createSlotEngine({ ...preset, maxChains: 1 }, () => 0);
  const session = createGameSession(engine);
  const initial = session.snapshot();
  assert.throws(() => session.spin(10), /連鎖上限/);
  assert.deepEqual(session.snapshot(), initial);
});
