const names = ['spin', 'stop', 'match', 'land', 'orb', 'win'];

export function createAudioPlayer() {
  let context;
  let gain;
  let enabled = false;
  let volume = 0.42;
  const buffers = new Map();
  const voices = new Set();

  function stopVoice(source) {
    voices.delete(source);
    source.stop();
  }

  function stop() {
    for (const voice of voices) stopVoice(voice);
  }

  return {
    setEnabled(value) {
      if (!value) {
        enabled = false;
        stop();
        return false;
      }
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!Context) return false;
      try {
        if (!context) {
          context = new Context();
          gain = context.createGain();
          gain.gain.value = volume;
          gain.connect(context.destination);
          for (const name of names) {
            fetch(new URL(`./assets/audio/${name}.wav`, import.meta.url))
              .then(response => {
                if (!response.ok) throw new Error('音源が読み込めません');
                return response.arrayBuffer();
              })
              .then(data => context.decodeAudioData(data))
              .then(buffer => buffers.set(name, buffer))
              .catch(() => {});
          }
        }
        enabled = true;
        context.resume().catch(() => {});
      } catch {
        enabled = false;
      }
      return enabled;
    },
    setVolume(value) {
      if (!Number.isFinite(value)) return;
      volume = Math.max(0, Math.min(value, 1));
      if (gain) gain.gain.value = volume;
    },
    play(name, stage = 1) {
      if (!enabled || context.state !== 'running' || volume === 0 || !buffers.has(name)) return;
      if (voices.size >= 3) stopVoice(voices.values().next().value);
      const voice = context.createBufferSource();
      voice.buffer = buffers.get(name);
      if (name === 'match') voice.playbackRate.value = 1 + 0.1 * Math.min(Math.max(stage - 1, 0), 5);
      voice.connect(gain);
      voice.onended = () => {
        voices.delete(voice);
        voice.disconnect();
      };
      voices.add(voice);
      voice.start();
    },
    stop,
  };
}
