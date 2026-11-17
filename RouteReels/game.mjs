import { createWallet, drawSymbols, PAIR_PAYOUT, renderSymbol, triplePayoutText } from '../shared/reels.mjs';

const wallet = createWallet();
const status = document.querySelector('#status');
const credits = document.querySelector('#credits');
const spin = document.querySelector('#spin');
const undo = document.querySelector('#undo');
const collect = document.querySelector('#collect');
const cells = [...document.querySelectorAll('.reel')];
document.querySelector('#payout-table').textContent = `同じ図柄を2つつなぐと${PAIR_PAYOUT}、3つつなぐと${triplePayoutText}クレジット。`;
let board = [];
let route = [];
let pending = false;

function canExtend(index) {
  if (!pending) return false;
  const column = index % 3;
  if (route.length === 0) return column === 0;
  const previous = route.at(-1);
  const distance = Math.abs(Math.floor(index / 3) - Math.floor(previous / 3));
  return column === previous % 3 + 1 && distance <= 1 && board[index] === board[previous];
}

function render() {
  credits.textContent = wallet.credits;
  spin.disabled = pending || wallet.credits === 0;
  undo.disabled = !pending || route.length === 0;
  collect.disabled = !pending;
  cells.forEach((cell, index) => {
    renderSymbol(cell, board[index]);
    cell.setAttribute('aria-label', `${Math.floor(index / 3) + 1}段 ${index % 3 + 1}列 ${board[index]?.name ?? '図柄なし'}`);
    cell.setAttribute('aria-pressed', route.includes(index));
    cell.disabled = !canExtend(index);
  });
}

spin.addEventListener('click', () => {
  if (pending || !wallet.spend()) return;
  board = drawSymbols(9);
  route = [];
  pending = true;
  status.textContent = '左端の図柄を選んでください。';
  render();
  cells[0].focus();
});

cells.forEach((cell, index) => cell.addEventListener('click', () => {
  if (!canExtend(index)) return;
  route.push(index);
  const hasNext = cells.some((_, next) => canExtend(next));
  status.textContent = hasNext
    ? `${route.length}マス選択中。次の図柄を選べます。`
    : `${route.length}マス選択済み。確定するか、選び直してください。`;
  render();
  if (hasNext) cells.find((_, next) => canExtend(next)).focus();
  else collect.focus();
}));

undo.addEventListener('click', () => {
  if (!pending) return;
  route = [];
  status.textContent = '左端の図柄を選んでください。';
  render();
  cells[0].focus();
});

collect.addEventListener('click', () => {
  if (!pending) return;
  const payoutByLength = [0, 0, PAIR_PAYOUT, board[route[0]]?.value];
  const payout = payoutByLength[route.length];
  wallet.award(payout);
  pending = false;
  status.textContent = `${route.length}マス · 払い出し ${payout}クレジット${wallet.credits ? '' : ' · 最初からボタンで再開'}`;
  render();
  (wallet.credits ? spin : document.querySelector('#reset')).focus();
});

document.querySelector('#reset').addEventListener('click', () => {
  wallet.reset();
  board = [];
  route = [];
  pending = false;
  status.textContent = '回すボタンで開始します。';
  render();
  spin.focus();
});
render();
