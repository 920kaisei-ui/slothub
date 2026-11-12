export const WILD = -1;
const EMPTY = -2;

function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} は ${min}～${max} の整数にしてください`);
  }
}

function nonnegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} は有限の非負数にしてください`);
  }
}

function entries(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${name} は空でない配列にしてください`);
  }
  return value;
}

function weightedPicker(values, weights, name) {
  let total = 0;
  const cumulative = weights.map((weight, index) => {
    nonnegative(weight, `${name}[${index}]`);
    total += weight;
    return total;
  });
  if (!Number.isFinite(total) || total <= 0) {
    throw new RangeError(`${name} の合計は有限の正数にしてください`);
  }
  // 正規化後に比較し、乱数と極小・極大の重みの積による丸めを避ける。
  const thresholds = cumulative.map(weight => weight / total);
  return random => {
    const draw = random();
    let index = 0;
    while (draw >= thresholds[index]) index++;
    return values[index];
  };
}

// Mulberry32。CLIとブラウザで同じシードから同じ乱数列を得る。
export function createSeededRandom(seed) {
  integer(seed, 0, 0xffffffff, 'seed');
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

// 10進設定値を共通単位の整数に直し、元返しや閾値を正確に判定する。
function decimal(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { digits: BigInt(whole + fraction), places: fraction.length - Number(exponent) };
}

function decimalScale(values) {
  return values.reduce((places, value) => Math.max(places, decimal(value).places), 0);
}

function toUnits(value, places) {
  const parts = decimal(value);
  return parts.digits * 10n ** BigInt(places - parts.places);
}

export class ChainLimitError extends Error {
  constructor(stage) {
    super(`連鎖上限（${stage}段階）に達しました`);
    this.name = 'ChainLimitError';
  }
}

// 盤面は左上から行優先。通常宝石は gems の添字、ワイルドは WILD。
// エンジンごとに探索領域を保持する。random は [0, 1) を返す関数。
export function createSlotEngine(config, random = Math.random) {
  const { width, height, minimumClusterSize, maxChains } = config;
  const size = width * height;
  integer(width, 1, 0x7fffffff, 'width');
  integer(height, 1, 0x7fffffff, 'height');
  integer(size, 1, 0x7fffffff, '盤面マス数');
  integer(minimumClusterSize, 1, size, 'minimumClusterSize');
  integer(maxChains, 1, Number.MAX_SAFE_INTEGER, 'maxChains');

  const gems = entries(config.gems, 'gems');
  const ids = gems.map((_, index) => index);
  const pickInitial = weightedPicker(ids, gems.map(gem => gem.initialWeight), '初期配置の重み');
  const pickRefill = weightedPicker(ids, gems.map(gem => gem.refillWeight), '補充の重み');
  const wilds = entries(config.wildCounts, 'wildCounts');
  for (const { count } of wilds) integer(count, 1, size, 'wildCounts の個数');
  if (new Set(wilds.map(wild => wild.count)).size !== wilds.length) {
    throw new RangeError('wildCounts の個数は重複できません');
  }
  const pickWildCount = weightedPicker(wilds.map(wild => wild.count), wilds.map(wild => wild.weight), 'ワイルド数の重み');

  const names = new Set();
  const payoutTiers = gems.map(({ name, payouts }, index) => {
    if (typeof name !== 'string' || !name.trim() || names.has(name)) {
      throw new TypeError(`gems[${index}].name は空でない一意の名前にしてください`);
    }
    names.add(name);
    const tiers = entries(payouts, `${name} の配当`);
    let previous = minimumClusterSize - 1;
    for (const { count, amount } of tiers) {
      integer(count, previous + 1, size, `${name} の配当個数`);
      nonnegative(amount, `${name} の配当額`);
      previous = count;
    }
    if (tiers[0].count !== minimumClusterSize) {
      throw new RangeError(`${name} の最初の配当個数は minimumClusterSize と一致させてください`);
    }
    return tiers;
  });
  const multipliers = entries(config.chainMultipliers, 'chainMultipliers');
  multipliers.forEach((value, index) => nonnegative(value, `chainMultipliers[${index}]`));
  const payoutPlaces = decimalScale(payoutTiers.flatMap(tiers => tiers.map(tier => tier.amount)));
  const multiplierPlaces = decimalScale(multipliers);
  const places = payoutPlaces + multiplierPlaces;
  const betUnits = 10n ** BigInt(places);
  const payoutBySize = payoutTiers.map(tiers => {
    let tier = 0;
    const amounts = tiers.map(({ amount }) => toUnits(amount, payoutPlaces));
    return Array.from({ length: size + 1 }, (_, count) => {
      if (count === tiers[tier + 1]?.count) tier++;
      return amounts[tier];
    });
  });
  const multiplierUnits = multipliers.map(value => toUnits(value, multiplierPlaces));

  const neighbors = Array.from({ length: size }, (_, cell) => {
    const adjacent = [];
    const column = cell % width;
    if (column > 0) adjacent.push(cell - 1);
    if (column + 1 < width) adjacent.push(cell + 1);
    if (cell >= width) adjacent.push(cell - width);
    if (cell < size - width) adjacent.push(cell + width);
    return adjacent;
  });
  const positions = Int32Array.from({ length: size }, (_, index) => index);
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  const cleared = new Uint8Array(size);
  const affectedColumns = new Uint8Array(width);

  function fillBoard(board) {
    const wildCount = pickWildCount(random);
    for (let index = 0; index < wildCount; index++) {
      const pick = index + Math.floor(random() * (size - index));
      const cell = positions[pick];
      positions[pick] = positions[index];
      positions[index] = cell;
    }
    board.fill(EMPTY);
    for (let index = 0; index < wildCount; index++) board[positions[index]] = WILD;
    for (let cell = 0; cell < size; cell++) {
      if (board[cell] === EMPTY) board[cell] = pickInitial(random);
    }
    return board;
  }

  // stage は1始まり。盤面を更新し、払い出し単位数か消去なしを示す null を返す。
  function step(board, stage) {
    cleared.fill(0);
    affectedColumns.fill(0);
    let basePayout = 0n;
    let hasClear = false;
    for (const color of ids) {
      visited.fill(0);
      for (let cell = 0; cell < size; cell++) {
        // 通常宝石から始めることで、ワイルドだけの成分を除外する。
        if (visited[cell] || board[cell] !== color) continue;
        queue[0] = cell;
        visited[cell] = 1;
        let count = 1;
        for (let index = 0; index < count; index++) {
          for (const next of neighbors[queue[index]]) {
            if (visited[next] || (board[next] !== color && board[next] !== WILD)) continue;
            visited[next] = 1;
            queue[count++] = next;
          }
        }
        if (count < minimumClusterSize) continue;
        hasClear = true;
        basePayout += payoutBySize[color][count];
        for (let index = 0; index < count; index++) {
          const matched = queue[index];
          if (board[matched] === WILD) continue;
          cleared[matched] = 1;
          affectedColumns[matched % width] = 1;
        }
      }
    }
    if (!hasClear) return null;
    if (stage >= maxChains) throw new ChainLimitError(stage);

    for (let column = 0; column < width; column++) {
      if (!affectedColumns[column]) continue;
      let write = size - width + column;
      for (let read = write; read >= 0; read -= width) {
        if (cleared[read] || board[read] === WILD) continue;
        while (board[write] === WILD) write -= width;
        board[write] = board[read];
        write -= width;
      }
      for (; write >= 0; write -= width) {
        if (board[write] !== WILD) board[write] = pickRefill(random);
      }
    }
    return basePayout * multiplierUnits[Math.min(stage, multiplierUnits.length) - 1];
  }

  function resolveBoard(board) {
    let payoutUnits = 0n;
    for (let stage = 1; ; stage++) {
      const payout = step(board, stage);
      if (payout === null) return { payoutUnits, chains: stage - 1 };
      payoutUnits += payout;
    }
  }

  return {
    createBoard: () => new Int32Array(size),
    fillBoard,
    step,
    resolveBoard,
    betUnits,
    payoutAsNumber(units, divisor = 1) {
      if (divisor === 1) return Number(`${units}e-${places}`);
      // 先に整数で割り、払い出し合計が Number の範囲を超える場合も平均を求める。
      const scaledAverage = units * 10n ** 32n / BigInt(divisor);
      return Number(`${scaledAverage}e-${places + 32}`);
    },
  };
}
