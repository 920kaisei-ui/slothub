export const symbols = Object.freeze([
  { id: 'cherry', icon: '🍒', name: 'チェリー', weight: 7, value: 2 },
  { id: 'lemon', icon: '🍋', name: 'レモン', weight: 6, value: 3 },
  { id: 'bell', icon: '🔔', name: 'ベル', weight: 5, value: 4 },
  { id: 'moon', icon: '🌙', name: '月', weight: 4, value: 6 },
  { id: 'star', icon: '⭐', name: '星', weight: 3, value: 8 },
].map(Object.freeze));

const weightTotal = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
export const PAIR_PAYOUT = 1;
export const triplePayoutText = symbols.map(symbol => `${symbol.name}${symbol.value}`).join('、');

export function drawSymbol(random = Math.random) {
  let index = random() * weightTotal;
  for (const symbol of symbols) {
    index -= symbol.weight;
    if (index < 0) return symbol;
  }
  throw new RangeError('乱数は0以上1未満で指定してください');
}

export function drawSymbols(count, draw = drawSymbol) {
  return Array.from({ length: count }, () => draw());
}

export function reelPayout(reels) {
  const counts = new Map();
  for (const reel of reels) counts.set(reel, (counts.get(reel) ?? 0) + 1);
  for (const [symbol, count] of counts) {
    if (count === 3) return symbol.value;
    if (count === 2) return PAIR_PAYOUT;
  }
  return 0;
}

export function createWallet(initial = 100) {
  let credits = initial;
  return {
    get credits() { return credits; },
    spend() {
      if (credits < 1) return false;
      credits--;
      return true;
    },
    award(payout) {
      if (!Number.isSafeInteger(payout) || payout < 0) throw new RangeError('払い出し額が無効です');
      credits += payout;
    },
    reset() { credits = initial; },
  };
}

export function renderSymbol(element, symbol) {
  element.textContent = symbol?.icon ?? '—';
  element.setAttribute('aria-label', symbol?.name ?? '図柄なし');
}
