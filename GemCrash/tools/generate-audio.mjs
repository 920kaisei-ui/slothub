import { mkdirSync, writeFileSync } from 'node:fs';

const rate = 44100;
const directory = new URL('../assets/audio/', import.meta.url);
mkdirSync(directory, { recursive: true });
const sine = (hz, time) => Math.sin(2 * Math.PI * hz * time);
const gate = time => Math.max(0, Math.min(1, time * 180));
const ring = (time, hz, decay) => time < 0 ? 0 : gate(time) * Math.exp(-decay * time) * sine(hz, time);
const tone = (time, hz, decay) => ring(time, hz, decay) + 0.28 * ring(time, hz * 2.013, decay * 1.8);

let noiseSeed = 77;
function noise() {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  return noiseSeed / 0x80000000 - 1;
}

const effects = {
  spin: [0.72, t => Math.min(gate(t), gate(0.72 - t)) *
    (0.17 * sine(86 + 84 * t, t) + 0.11 * noise() * (0.55 + 0.45 * sine(24 + 18 * t, t))) * Math.exp(-2.3 * t)],
  stop: [0.12, t => gate(t) * 0.35 * noise() * Math.exp(-70 * t)
    + 0.21 * ring(t, 170, 42) + 0.08 * ring(t - 0.018, 520, 62)],
  match: [0.23, t => 0.24 * tone(t, 523.25, 18) + 0.10 * ring(t, 1318.51, 34)],
  land: [0.16, t => 0.21 * ring(t, 124, 34) + 0.11 * ring(t - 0.022, 247, 38)
    + 0.09 * gate(t) * noise() * Math.exp(-52 * t)],
  orb: [0.62, t => 0.16 * tone(t, 784, 9) + 0.15 * tone(t - 0.058, 1174.66, 12)
    + 0.21 * tone(t - 0.137, 1567.98, 8) + 0.12 * ring(t - 0.165, 2349.32, 8)],
  win: [0.50, t => 0.19 * tone(t, 392, 12) + 0.16 * tone(t - 0.07, 493.88, 12)
    + 0.17 * tone(t - 0.14, 659.25, 12) + 0.10 * tone(t - 0.14, 783.99, 14)],
};

for (const [name, [duration, sample]] of Object.entries(effects)) {
  const count = Math.round(duration * rate);
  const data = Buffer.alloc(44 + count * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(count * 2, 40);
  for (let index = 0; index < count; index++) {
    const value = sample(index / rate) * Math.min(1, (count - index - 1) / (0.012 * rate));
    data.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, value))), 44 + index * 2);
  }
  writeFileSync(new URL(`${name}.wav`, directory), data);
}
