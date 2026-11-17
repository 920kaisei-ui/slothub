import { createWallet, drawSymbol, drawSymbols, PAIR_PAYOUT, reelPayout, renderSymbol, triplePayoutText } from '../shared/reels.mjs';

const wallet = createWallet();
const status = document.querySelector('#status');
const spin = document.querySelector('#spin');
const reroll = document.querySelector('#reroll');
const collect = document.querySelector('#collect');
const reset = document.querySelector('#reset');
const credits = document.querySelector('#credits');
const buttons = [...document.querySelectorAll('.reel')];
document.querySelector('#payout-table').textContent = `2つ揃いは${PAIR_PAYOUT}、3つ揃いは${triplePayoutText}クレジット。`;
let reels = [];
let held = [false, false, false];
let pending = false;

function render() {
  credits.textContent = wallet.credits;
  spin.disabled = pending || wallet.credits === 0;
  reroll.disabled = !pending || held.every(Boolean);
  collect.disabled = !pending;
  buttons.forEach((button, index) => {
    const symbol = reels[index];
    renderSymbol(button, symbol);
    button.setAttribute('aria-label', `リール${index + 1} ${symbol?.name ?? '図柄なし'}`);
    button.setAttribute('aria-pressed', held[index]);
    button.disabled = !pending;
  });
}

function finish() {
  const payout = reelPayout(reels);
  wallet.award(payout);
  status.textContent = wallet.credits === 0
    ? '払い出し 0。最初からボタンで再開できます。'
    : `払い出し ${payout}クレジット`;
  pending = false;
  render();
  (wallet.credits ? spin : reset).focus();
}

spin.addEventListener('click', () => {
  if (pending || !wallet.spend()) return;
  reels = drawSymbols(3);
  held = [false, false, false];
  pending = true;
  status.textContent = '保留する図柄を選んで引き直すか、この出目で確定してください。';
  render();
  buttons[0].focus();
});

buttons.forEach((button, index) => button.addEventListener('click', () => {
  if (!pending) return;
  held[index] = !held[index];
  render();
}));

reroll.addEventListener('click', () => {
  if (!pending || held.every(Boolean)) return;
  reels = reels.map((symbol, index) => held[index] ? symbol : drawSymbol());
  finish();
});

collect.addEventListener('click', () => {
  if (pending) finish();
});

reset.addEventListener('click', () => {
  wallet.reset();
  reels = [];
  held = [false, false, false];
  pending = false;
  status.textContent = '回すボタンで開始します。';
  render();
  spin.focus();
});
render();
