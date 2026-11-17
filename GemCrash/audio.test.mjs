import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAudioPlayer } from './audio.mjs';

const durations = { spin: 0.72, stop: 0.12, match: 0.23, land: 0.16, orb: 0.62, win: 0.5 };

test('6つの保存音源は有音で、無音から開始・終了するPCM WAV', () => {
  for (const [name, seconds] of Object.entries(durations)) {
    const data = readFileSync(new URL(`./assets/audio/${name}.wav`, import.meta.url));
    assert.equal(data.toString('ascii', 0, 4), 'RIFF');
    assert.equal(data.toString('ascii', 8, 12), 'WAVE');
    assert.equal(data.readUInt16LE(20), 1);
    assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 44100);
    assert.equal(data.readUInt16LE(34), 16);
    assert.equal(data.readUInt32LE(40), data.length - 44);
    assert.equal((data.length - 44) / 88200, seconds);
    assert.equal(data.readInt16LE(44), 0);
    assert.equal(data.readInt16LE(data.length - 2), 0);
    let peak = 0;
    for (let offset = 44; offset < data.length; offset += 2) {
      peak = Math.max(peak, Math.abs(data.readInt16LE(offset)));
    }
    assert.ok(peak > 1000 && peak < 32000, name);
  }
});

test('初期無音、音量、段階音の音程、同時発音数、停止を制御する', async context => {
  const output = [];
  const level = { value: 0 };
  globalThis.AudioContext = class {
    state = 'running';
    createGain() { return { gain: level, connect() {} }; }
    resume() { return Promise.resolve(); }
    async decodeAudioData(data) { return data; }
    createBufferSource() {
      const source = {
        playbackRate: { value: 1 },
        start() { output.push(source); },
        stop() { source.stopped = true; source.onended(); },
        connect() {},
        disconnect() {},
      };
      return source;
    }
  };
  let fetched = 0;
  context.mock.method(globalThis, 'fetch', async () => {
    fetched++;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
  });
  context.after(() => { delete globalThis.AudioContext; });
  const audio = createAudioPlayer();
  audio.play('win');
  assert.equal(fetched, 0);
  assert.equal(output.length, 0);
  assert.equal(audio.setEnabled(true), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fetched, 6);
  assert.equal(level.value, 0.42);
  audio.setVolume(0.2);
  assert.equal(level.value, 0.2);
  audio.play('match', 9);
  audio.play('stop');
  audio.play('land');
  audio.play('orb');
  assert.equal(output.length, 4);
  assert.equal(output[0].playbackRate.value, 1.5);
  assert.equal(output[0].stopped, true);
  assert.equal(audio.setEnabled(false), false);
  assert.ok(output.every(voice => voice.stopped));
  audio.play('win');
  assert.equal(output.length, 4);
});
