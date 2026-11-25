/* All sound is synthesised with the Web Audio API, so there are no audio files to load. */
(function (GH) {
  'use strict';
  let ac = null, master, sfxBus, musicBus;
  let track = null, timer = null, step = 0, nextTime = 0;

  /* Each track: tempo, bass line and melody as semitone offsets from A (null = rest). */
  const TRACKS = {
    home:    { bpm: 92,  root: 220, wave: 'triangle', bass: [0, null, null, null, -4, null, null, null, -7, null, null, null, -2, null, null, null], lead: [12, null, 16, null, 19, null, 16, null, 17, null, 12, null, 14, null, 10, null] },
    invaders:{ bpm: 128, root: 110, wave: 'square',   bass: [0, 0, null, 0, 0, 0, null, 3, -2, -2, null, -2, -4, -4, null, -5], lead: [24, null, null, 27, null, null, 31, null, 22, null, null, 26, null, 20, null, 19] },
    pong:    { bpm: 112, root: 220, wave: 'square',   bass: [0, null, 0, null, 5, null, 5, null, 7, null, 7, null, 5, null, 3, null], lead: [null, 12, null, 15, null, 17, null, 19, null, 22, null, 19, null, 17, null, 15] },
    fruit:   { bpm: 120, root: 220, wave: 'triangle', bass: [0, null, 7, null, 0, null, 7, null, 5, null, 12, null, 7, null, 14, null], lead: [12, 16, 19, null, 16, null, 21, 19, 17, null, 21, null, 19, 16, 14, null] }
  };

  const settings = () => GH.storage.settings;

  function context() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.connect(master);
      apply();
    }
    return ac;
  }

  function apply() {
    if (ac) {
      const s = settings();
      master.gain.value = s.muted ? 0 : 1;
      sfxBus.gain.value = s.sfx ? s.sfxVolume : 0;
      musicBus.gain.value = s.music ? s.musicVolume * 0.5 : 0;
    }
    syncMusic();
  }

  function note(bus, freq, start, dur, wave, vol, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(bus);
    o.start(start); o.stop(start + dur + 0.02);
  }

  function noise(dur, vol, cutoff, type) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = type || 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
  }

  const seq = (freqs, gap, dur, wave, vol) =>
    freqs.forEach((f, i) => note(sfxBus, f, ac.currentTime + i * gap, dur, wave, vol));

  const SFX = {
    click:   t => note(sfxBus, 520, t, 0.07, 'triangle', 0.25),
    shoot:   t => note(sfxBus, 880, t, 0.11, 'square', 0.12, 220),
    hit:     () => noise(0.09, 0.35, 2200),
    explode: () => noise(0.35, 0.55, 900),
    hurt:    t => note(sfxBus, 220, t, 0.35, 'sawtooth', 0.3, 60),
    bounce:  t => note(sfxBus, 300, t, 0.08, 'square', 0.18),
    paddle:  t => note(sfxBus, 480, t, 0.1, 'square', 0.22, 640),
    place:   t => note(sfxBus, 390, t, 0.1, 'triangle', 0.3, 520),
    slice:   () => noise(0.14, 0.45, 3200, 'highpass'),
    combo:   () => seq([660, 880, 1180], 0.06, 0.13, 'triangle', 0.25),
    level:   () => seq([440, 554, 659, 880], 0.09, 0.16, 'square', 0.14),
    win:     () => seq([523, 659, 784, 1047], 0.11, 0.2, 'triangle', 0.3),
    lose:    () => seq([392, 330, 262, 196], 0.14, 0.24, 'sawtooth', 0.18),
    draw:    () => seq([392, 392], 0.16, 0.15, 'triangle', 0.25),
    buzz:    t => note(sfxBus, 90, t, 0.5, 'sawtooth', 0.35)
  };

  function schedule() {
    if (!ac || !track) return;
    const t = TRACKS[track], len = 60 / t.bpm / 2;
    if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
    while (nextTime < ac.currentTime + 0.25) {
      const i = step % 16, hz = n => t.root * Math.pow(2, n / 12);
      if (t.bass[i] !== null) note(musicBus, hz(t.bass[i] - 12), nextTime, len * 1.7, 'triangle', 0.35);
      if (t.lead[i] !== null) note(musicBus, hz(t.lead[i]), nextTime, len * 0.9, t.wave, t.wave === 'square' ? 0.07 : 0.16);
      nextTime += len; step++;
    }
  }

  function syncMusic() {
    const s = settings();
    const wanted = !!(ac && track && s.music && !s.muted && s.musicVolume > 0 && !document.hidden);
    if (wanted && timer === null) { nextTime = 0; timer = window.setInterval(schedule, 80); }
    if (!wanted && timer !== null) { window.clearInterval(timer); timer = null; }
  }

  GH.audio = {
    /* Browsers only allow audio after a user gesture. */
    unlock() {
      const c = context();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
      syncMusic();
    },
    sfx(name) {
      const s = settings();
      if (!ac || s.muted || !s.sfx || !SFX[name]) return;
      SFX[name](ac.currentTime);
    },
    tone(freq, seconds) {
      const s = settings();
      if (!ac || s.muted || !s.sfx) return;
      note(sfxBus, freq, ac.currentTime, seconds, 'sine', 0.55);
      note(sfxBus, freq * 2, ac.currentTime, seconds, 'triangle', 0.08);
    },
    /* name = a key of TRACKS, or null for silence. */
    music(name) { if (track !== name) { track = name; step = 0; nextTime = 0; } syncMusic(); },
    get track() { return track; },
    get musicRunning() { return timer !== null; },
    apply
  };

  document.addEventListener('visibilitychange', syncMusic);
})(window.GH = window.GH || {});
