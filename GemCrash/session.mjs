export const BET_OPTIONS = [1, 5, 10];
export const STARTING_CREDITS = 100;

export function createGameSession(engine) {
  const startingBalance = BigInt(STARTING_CREDITS) * engine.betUnits;
  const board = engine.createBoard();
  let balance = startingBalance;
  let spins = 0;

  function snapshot() {
    return { balance, profit: balance - startingBalance, spins };
  }

  return {
    snapshot,
    reset() {
      balance = startingBalance;
      spins = 0;
      return snapshot();
    },
    canSpin(bet) {
      return BET_OPTIONS.includes(bet) && BigInt(bet) * engine.betUnits <= balance;
    },
    spin(bet) {
      if (!BET_OPTIONS.includes(bet)) throw new RangeError('選べるベット額を指定してください');
      const stake = BigInt(bet) * engine.betUnits;
      if (stake > balance) throw new RangeError('クレジットが足りません');

      engine.fillBoard(board);
      const initialBoard = board.slice();
      const frames = [];
      let payout = 0n;
      for (let stage = 1; ; stage++) {
        let frame;
        const amount = engine.step(board, stage, (cleared, groups, multiplier) => {
          const activeWilds = new Set();
          const matches = groups.map(({ color, cells, amount }) => {
            for (const cell of cells) if (cleared[cell] === 0) activeWilds.add(cell);
            return { color, cells, award: amount * multiplier * BigInt(bet) };
          });
          frame = { cleared, matches, activeWilds };
        });
        if (amount === null) break;
        payout += amount * BigInt(bet);
        frames.push({ ...frame, board: board.slice(), payout });
      }

      // 上限エラーなどで回転が完了しなかった場合、クレジットを消費しない。
      const balanceAfterBet = balance - stake;
      balance = balanceAfterBet + payout;
      spins++;
      return { ...snapshot(), balanceAfterBet, initialBoard, frames, stake, payout, net: payout - stake };
    },
  };
}
