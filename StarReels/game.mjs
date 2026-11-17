import { createWallet, drawSymbols, PAIR_PAYOUT, reelPayout, renderSymbol, symbols, triplePayoutText } from '../shared/reels.mjs';

const rounds = 12;
const constellations = [
  { name: '果樹園', needs: { cherry: 2, lemon: 2 }, payout: 4 },
  { name: '鐘の塔', needs: { lemon: 2, bell: 2, moon: 1 }, payout: 6 },
  { name: '北の空', needs: { moon: 2, star: 2 }, payout: 8 },
];

const initialCredits = 100;
const wallet = createWallet(initialCredits);
const status = document.querySelector('#status');
const credits = document.querySelector('#credits');
const remaining = document.querySelector('#remaining');
const album = document.querySelector('#album');
const lists = document.querySelector('#constellations');
const spin = document.querySelector('#spin');
const skip = document.querySelector('#skip');
const reset = document.querySelector('#reset');
const buttons = [...document.querySelectorAll('.reel')];
document.querySelector('#payout-table').textContent = `2つ揃いは${PAIR_PAYOUT}、3つ揃いは${triplePayoutText}クレジット。`;
const tiles = constellations.map(() => {
  const tile = document.createElement('li');
  lists.append(tile);
  return tile;
});
const collected = new Map();
const completed = new Set();
let reels = [];
let spins = 0;
let pending = false;
let roundPayout = 0;

function render() {
  credits.textContent = wallet.credits;
  remaining.textContent = rounds - spins;
  spin.disabled = pending || spins === rounds;
  skip.disabled = !pending;
  buttons.forEach((button, index) => {
    const symbol = reels[index];
    renderSymbol(button, symbol);
    button.setAttribute('aria-label', symbol ? `${symbol.name}を登録` : '図柄なし');
    button.disabled = !pending || reels.indexOf(symbol) !== index;
  });
  album.textContent = symbols
    .filter(symbol => collected.has(symbol.id))
    .map(symbol => `${symbol.icon} ${symbol.name}×${collected.get(symbol.id)}`)
    .join(' · ') || '登録なし';
  constellations.forEach(({ name, needs, payout }, index) => {
    const progress = symbols.filter(symbol => needs[symbol.id]).map(symbol =>
      `${symbol.name} ${Math.min(collected.get(symbol.id) ?? 0, needs[symbol.id])}/${needs[symbol.id]}`
    ).join('、');
    tiles[index].textContent = `${name} · ${progress} · ${payout}クレジット${completed.has(name) ? ' · 完成' : ''}`;
  });
}

function finish(symbol) {
  if (!pending) return;
  if (symbol) collected.set(symbol.id, (collected.get(symbol.id) ?? 0) + 1);
  const newConstellations = constellations.filter(({ name, needs }) =>
    !completed.has(name) && Object.entries(needs).every(([id, count]) => (collected.get(id) ?? 0) >= count)
  );
  for (const starMap of newConstellations) {
    completed.add(starMap.name);
    wallet.award(starMap.payout);
  }
  const feedback = [`回転の払い出し ${roundPayout}`, symbol ? `${symbol.name}を登録` : '登録なし'];
  if (newConstellations.length) feedback.push(`${newConstellations.map(item => item.name).join('、')}が完成`);
  if (spins === rounds) feedback.push(`終了 · 星座 ${completed.size}/${constellations.length} · 収支 ${wallet.credits - initialCredits}`);
  status.textContent = feedback.join(' · ');
  pending = false;
  render();
  (spins === rounds ? reset : spin).focus();
}

spin.addEventListener('click', () => {
  if (pending || spins === rounds || !wallet.spend()) return;
  spins++;
  reels = drawSymbols(3);
  roundPayout = reelPayout(reels);
  wallet.award(roundPayout);
  pending = true;
  status.textContent = `払い出し ${roundPayout}クレジット。図鑑に登録する図柄を選んでください。`;
  render();
  buttons[0].focus();
});

buttons.forEach((button, index) => button.addEventListener('click', () => finish(reels[index])));
skip.addEventListener('click', () => finish());
reset.addEventListener('click', () => {
  wallet.reset();
  spins = 0;
  reels = [];
  pending = false;
  collected.clear();
  completed.clear();
  status.textContent = '回すボタンで開始します。';
  render();
  spin.focus();
});
render();
