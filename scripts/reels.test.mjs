import assert from 'node:assert/strict';
import test from 'node:test';

function element() {
  let onClick;
  return {
    disabled: false,
    children: [],
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    append(child) { this.children.push(child); },
    addEventListener(type, listener) {
      assert.equal(type, 'click');
      onClick = listener;
    },
    focus() {},
    click() { if (!this.disabled) onClick?.(); },
  };
}

async function loadGame(context, directory, ids, count, draws) {
  const controls = Object.fromEntries([...ids, 'payout-table'].map(id => [id, element()]));
  const reels = Array.from({ length: count }, element);
  context.mock.method(Math, 'random', () => {
    assert.ok(draws.length, 'requested more symbols than expected');
    return draws.shift();
  });
  globalThis.document = {
    querySelector: selector => controls[selector.slice(1)],
    querySelectorAll: () => reels,
    createElement: element,
  };
  context.after(() => { delete globalThis.document; });
  await import(`../${directory}/game.mjs`);
  return { controls, reels };
}

test('Vault Reels preserves held positions and settles one time', async context => {
  const { controls, reels } = await loadGame(
    context, 'VaultReels', ['status', 'credits', 'spin', 'collect', 'reroll', 'reset'],
    3, [0, 0, 0.99, 0],
  );
  controls.spin.click();
  assert.equal(controls.credits.textContent, 99);
  reels[0].click();
  reels[1].click();
  assert.equal(reels[1].attributes.get('aria-pressed'), 'true');
  controls.reroll.click();
  assert.equal(controls.credits.textContent, 101);
  controls.collect.click();
  assert.equal(controls.credits.textContent, 101);
  controls.reset.click();
  assert.equal(controls.credits.textContent, 100);
  assert.ok(reels.every(reel => reel.textContent === '—'));
});

test('Route Reels accepts a matching diagonal and rejects a jump', async context => {
  const { controls, reels } = await loadGame(
    context, 'RouteReels', ['status', 'credits', 'spin', 'collect', 'undo', 'reset'],
    9, [0, 0.99, 0, 0.99, 0, 0.99, 0.99, 0, 0.99],
  );
  controls.spin.click();
  assert.equal(reels[1].disabled, true);
  reels[0].click();
  assert.equal(reels[4].disabled, false);
  assert.equal(reels[7].disabled, true);
  reels[4].click();
  controls.undo.click();
  assert.equal(reels[0].attributes.get('aria-pressed'), 'false');
  reels[0].click();
  reels[4].click();
  reels[2].click();
  controls.collect.click();
  assert.equal(controls.credits.textContent, 101);
  assert.match(controls.status.textContent, /3マス/);
});

test('Star Reels pays a constellation only once and ends after 12 spins', async context => {
  const draws = [0, 0, 0, 0, 0, 0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, ...Array(24).fill(0.85)];
  const { controls, reels } = await loadGame(
    context, 'StarReels',
    ['status', 'credits', 'spin', 'skip', 'reset', 'remaining', 'album', 'constellations'],
    3, draws,
  );
  for (let index = 0; index < 4; index++) {
    controls.spin.click();
    assert.equal(reels[1].disabled, true);
    reels[0].click();
  }
  assert.match(controls.constellations.children[0].textContent, /完成/);
  assert.equal(controls.credits.textContent, 110);
  for (let index = 0; index < 8; index++) {
    controls.spin.click();
    controls.skip.click();
  }
  assert.equal(controls.remaining.textContent, 0);
  assert.equal(controls.spin.disabled, true);
  assert.match(controls.status.textContent, /終了 · 星座 1\/3/);
  assert.equal(controls.credits.textContent, 150);
  controls.reset.click();
  assert.equal(controls.credits.textContent, 100);
  assert.equal(controls.remaining.textContent, 12);
  assert.equal(controls.album.textContent, '登録なし');
});
