import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSeededRandom } from './slot-engine.mjs';
import { reelStrip, spinReels } from './reel-motion.mjs';

const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pageLoads = 0;

function element() {
  const messages = [];
  const listeners = new Map();
  return {
    children: [],
    disabled: false,
    attributes: new Map(),
    attributeLog: [],
    classList: { toggle() {} },
    style: { setProperty() {} },
    value: '',
    messages,
    get textContent() { return messages.at(-1) ?? ''; },
    set textContent(value) { messages.push(String(value)); },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      this.attributeLog.push([name, String(value)]);
    },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    change() { listeners.get('change')?.(); },
    focus() { document.activeElement = this; },
    showModal() { this.open = true; },
    close() { this.open = false; listeners.get('close')?.(); },
    click() { if (!this.disabled) return listeners.get('click')?.(); },
  };
}

async function page(context, seed, reducedMotion = false) {
  const nodes = Object.fromEntries([...markup.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, element()]));
  context.mock.method(Math, 'random', createSeededRandom(seed));
  context.mock.method(globalThis, 'fetch', async url => new Response(readFileSync(url)));
  globalThis.document = {
    getElementById: id => nodes[id], createElement: element, body: element(), addEventListener() {},
  };
  globalThis.matchMedia = () => ({ matches: reducedMotion });
  context.after(() => {
    delete globalThis.document;
    delete globalThis.matchMedia;
  });
  await import(`./game.mjs?test=${pageLoads++}`);
  return nodes;
}

test('待機→回転→0連鎖の確定で操作が戻る', async context => {
  const nodes = await page(context, 1);
  assert.equal(nodes.phase.textContent, '回転待ち');
  assert.equal(nodes.skip.disabled, true);
  const running = nodes.spin.click();
  assert.equal(nodes.phase.textContent, '回転中');
  assert.equal(nodes.board.attributes.get('aria-busy'), 'true');
  assert.equal(nodes.spin.disabled, true);
  assert.equal(nodes.reset.disabled, true);
  assert.equal(nodes.bet.disabled, true);
  assert.equal(nodes.spin.click(), undefined);
  await running;
  assert.deepEqual(nodes.phase.messages, ['回転待ち', '回転中', '結果確定']);
  assert.match(nodes.result.textContent, /1回目 · 0連鎖/);
  assert.equal(nodes.spin.disabled, false);
  assert.equal(nodes.skip.disabled, true);
  assert.equal(nodes.board.children.length, 42);
  assert.match(nodes['receipt-note'].textContent, /成立なし/);
});

test('通常・スキップ・動き軽減は同じ連鎖結果になる', async context => {
  const normal = await page(context, 2);
  await normal.spin.click();
  assert.ok(normal.phase.messages.includes('第1連鎖 · ×1'));
  assert.ok(normal.matches.messages.some(message => /[5-9]個/.test(message)));
  assert.equal(normal.matches.textContent, '');
  assert.match(normal.result.textContent, /1回目 · 1連鎖/);
  const expected = [normal.result.textContent, normal.balance.textContent, normal.payout.textContent];

  const fast = await page(context, 2);
  const running = fast.spin.click();
  assert.equal(fast.skip.disabled, false);
  fast.skip.click();
  await running;
  assert.equal(fast.phase.textContent, '結果確定');
  assert.deepEqual([fast.result.textContent, fast.balance.textContent, fast.payout.textContent], expected);
  assert.equal(fast.spin.disabled, false);

  const still = await page(context, 2, true);
  await still.spin.click();
  assert.equal(still.phase.textContent, '結果確定');
  assert.equal(still.skip.disabled, true);
  assert.deepEqual([still.result.textContent, still.balance.textContent, still.payout.textContent], expected);
});

test('払い出しゼロ・ベット未満・元返し・超過で今回の差引を表示する', async context => {
  const rounds = [
    [1, 1, '0', '-1', 'マイナス'],
    [0, 5, '1', '-4', 'マイナス'],
    [36, 1, '1', '0', '元返し'],
    [6, 1, '1.6', '+0.6', 'プラス'],
  ];
  for (const [seed, bet, payout, net, outcome] of rounds) {
    const nodes = await page(context, seed, true);
    nodes.bet.value = String(bet);
    await nodes.spin.click();
    assert.equal(nodes['round-stake'].textContent, String(bet));
    assert.equal(nodes.payout.textContent, payout);
    assert.equal(nodes['round-net'].textContent, net);
    assert.match(nodes.result.textContent, new RegExp(outcome));
    nodes.bet.value = '10';
    nodes.bet.change();
    assert.equal(nodes['round-stake'].textContent, String(bet));
  }
});

test('実際の8連鎖到達とレインボーオーブ成立のみを結果に記録する', async context => {
  const cases = [
    [1, 0, false, null],
    [719, 7, false, null],
    [1255, 8, true, null],
    [222, 9, true, null],
    [1909, 6, false, 400],
    [56841, 8, true, 800],
  ];
  for (const [seed, chains, milestone, orbAward] of cases) {
    const nodes = await page(context, seed, seed !== 56841);
    const running = nodes.spin.click();
    if (seed === 56841) nodes.skip.click();
    await running;
    assert.match(nodes.result.textContent, new RegExp(`· ${chains}連鎖`));
    assert.equal(nodes.milestone.textContent.includes('8連鎖到達'), milestone);
    assert.equal(nodes.milestone.textContent.includes('レインボーオーブ成立'), orbAward !== null);
    if (orbAward !== null) assert.ok(nodes.milestone.textContent.includes(` ${orbAward}クレジット`));
  }
});

test('効果音の発動条件を確定済みの状態に対応させる', async context => {
  const cues = nodes => nodes.phase.attributeLog.filter(([name]) => name === 'data-cue').map(([, cue]) => cue);
  const belowStake = await page(context, 0);
  await belowStake.spin.click();
  assert.deepEqual(cues(belowStake), ['idle', 'spin', 'match', 'land', 'settle']);

  const netWin = await page(context, 6, true);
  await netWin.spin.click();
  assert.deepEqual(cues(netWin), ['idle', 'spin', 'win']);

  const skipped = await page(context, 1909);
  const running = skipped.spin.click();
  skipped.skip.click();
  await running;
  assert.deepEqual(cues(skipped), ['idle', 'spin', 'win']);
});

test('演出の3設定で最終盤面・残高・表示が一致し、結果のみに待ち時間がない', async context => {
  const receipts = [];
  for (const mode of ['normal', 'quick', 'instant']) {
    const nodes = await page(context, 2);
    nodes.pace.value = mode;
    const running = nodes.spin.click();
    assert.equal(nodes.pace.disabled, mode !== 'instant');
    await running;
    receipts.push([nodes.board.children.map(cell => cell.textContent), nodes.balance.textContent, nodes.result.textContent]);
    assert.equal(nodes.phase.messages.includes('第1連鎖 · ×1'), mode !== 'instant');
    assert.equal(nodes.pace.disabled, false);
  }
  assert.deepEqual(receipts[0], receipts[1]);
  assert.deepEqual(receipts[0], receipts[2]);
});

test('途中スキップ後も全段階を表示し、群と段階の合計を追える', async context => {
  const many = await page(context, 222);
  const running = many.spin.click();
  many.skip.click();
  await running;
  assert.equal(many.receipt.children.length, 9);
  const total = many.receipt.children.reduce((sum, item) =>
    sum + Math.round(Number(item.textContent.split(' · 計 ')[1]) * 100), 0);
  assert.equal(total, Math.round(Number(many.payout.textContent) * 100));

  const mixed = await page(context, 1909, true);
  await mixed.spin.click();
  const fourth = mixed.receipt.children[3].textContent;
  assert.match(fourth, /、レインボーオーブ [5-9]個 400 · 計 400.8/);
  mixed.reset.click();
  assert.equal(mixed.receipt.children.length, 0);
});

test('見本を開閉しても配当・残高・次回の乱数が変わらない', async context => {
  const nodes = await page(context, 6, true);
  nodes.bet.value = '5';
  nodes.practice.click();
  assert.ok(nodes['practice-dialog'].open);
  nodes['practice-reveal'].click();
  assert.equal(nodes['practice-result'].textContent, 'ルビー 5個');
  nodes['practice-next'].click();
  nodes['practice-reveal'].click();
  assert.equal(nodes['practice-result'].textContent, 'ルビー 5個 · サファイア 5個');
  nodes['practice-dialog'].close();
  assert.equal(document.activeElement, nodes.practice);
  assert.equal(nodes.balance.textContent, '100');
  assert.equal(nodes.bet.value, '5');
  await nodes.spin.click();
  assert.equal(nodes.payout.textContent, '8');
});

test('チャレンジは完了した10回だけを集計し、区間終了後に通常へ戻る', async context => {
  const nodes = await page(context, 6, true);
  nodes.challenge.click();
  assert.equal(nodes.bet.disabled, true);
  for (let index = 0; index < 10; index++) await nodes.spin.click();
  assert.match(nodes['challenge-summary'].textContent, /^10回転で終了 · 差引 /);
  assert.ok(nodes['challenge-summary'].textContent.includes(`差引 ${nodes.profit.textContent}`));
  assert.equal(nodes.bet.disabled, false);
  const last = nodes['challenge-summary'].textContent;
  await nodes.spin.click();
  assert.equal(nodes['challenge-summary'].textContent, last);
  nodes.challenge.click();
  await nodes.spin.click();
  nodes.challenge.click();
  assert.match(nodes['challenge-summary'].textContent, /^1回転で終了/);
  nodes.reset.click();
  assert.equal(nodes['challenge-summary'].textContent, '記録なし');
});

test('色に依存せず各図柄を識別でき、配当表と盤面の名前が一致する', async context => {
  const nodes = await page(context, 1, true);
  await nodes.spin.click();
  const labels = new Map(nodes.paytable.children.map(item => item.textContent.split(' ').slice(0, 2)));
  assert.equal(labels.size, 6);
  const payouts = nodes.paytable.children.map(item => item.textContent).join('\n');
  assert.match(payouts, /サファイア 5個以上 0\.2倍/);
  assert.match(payouts, /ダイヤモンド 5個以上 0\.6倍/);
  assert.match(payouts, /レインボーオーブ 5個以上 100倍/);
  assert.doesNotMatch(payouts, /アンバー/);
  for (const cell of nodes.board.children) {
    if (cell.attributes.get('data-gem') === 'Wild') {
      assert.equal(cell.textContent, '✦');
      assert.equal(cell.attributes.get('aria-label'), 'ワイルド');
    } else {
      assert.equal(cell.attributes.get('aria-label'), labels.get(cell.textContent));
    }
  }
});

test('リール帯の先頭が確定盤面で、停止順と中断が列ごとに処理される', async context => {
  const board = Int32Array.of(3, 1, 0, 2, 1, 3);
  const previous = Int32Array.of(1, 2, 2, 3, 3, 0);
  const input = { width: 2, height: 3, colors: 4, board, previous };
  assert.deepEqual(reelStrip({ ...input, column: 1 }).slice(0, 3), [1, 2, 3]);
  assert.deepEqual(reelStrip({ ...input, column: 1 }).slice(-3), [2, 3, 0]);
  const overlay = element();
  const timers = [];
  globalThis.document = { createElement: () => Object.assign(element(), {
    scrollHeight: 300,
    clientHeight: 60,
    animate(keyframes, timing) {
      const { promise, resolve, reject } = Promise.withResolvers();
      const item = { keyframes, timing, resolve, cancel: () => reject(Error('abort')), finished: promise };
      timers.push(item);
      return item;
    },
  }) };
  context.after(() => { delete globalThis.document; });
  const paintCells = (cells, values) => cells.forEach((cell, i) => { cell.textContent = values[i]; });
  const abort = new AbortController();
  let stopped = 0;
  const running = spinReels({ ...input, overlay, signal: abort.signal, paintCells, stop: () => stopped++ });
  assert.equal(overlay.children.length, 2);
  assert.deepEqual(overlay.children[0].children[0].children.slice(0, 3).map(cell => cell.textContent), ['3', '0', '1']);
  assert.equal(timers[0].keyframes.at(-1).transform, 'translateY(0)');
  assert.ok(timers[0].timing.duration < timers[1].timing.duration);
  timers[0].resolve();
  await Promise.resolve();
  assert.equal(stopped, 1);
  abort.abort();
  await running;
  assert.equal(stopped, 1);
  assert.equal(overlay.children.length, 0);
});
