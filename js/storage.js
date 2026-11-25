/* Persistent data: settings, preferences, high scores, history. */
(function (GH) {
  'use strict';
  const KEY = 'gaming-hub:v1';
  const HISTORY_LIMIT = 10;

  const defaults = () => ({
    settings: { muted: false, sfx: true, sfxVolume: 0.7, music: true, musicVolume: 0.4, vibration: true, effects: true },
    prefs: {},
    scores: {},
    stats: {},
    lastPlayed: null
  });

  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  function load() {
    const base = defaults();
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY));
      if (!isObject(raw)) return base;
      Object.assign(base.settings, isObject(raw.settings) ? raw.settings : {});
      for (const k of ['prefs', 'scores', 'stats']) if (isObject(raw[k])) base[k] = raw[k];
      if (typeof raw.lastPlayed === 'string') base.lastPlayed = raw.lastPlayed;
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return base;
  }

  let data = load();
  let persistent = true;

  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(data)); persistent = true; }
    catch (e) { persistent = false; }
  }

  function entry(id) {
    const s = data.scores[id];
    if (!isObject(s) || !Array.isArray(s.history)) data.scores[id] = { best: Number(s && s.best) || 0, history: [] };
    return data.scores[id];
  }

  GH.storage = {
    get settings() { return data.settings; },
    setSetting(key, value) { data.settings[key] = value; save(); },
    getPrefs(id) { return Object.assign({}, data.prefs[id]); },
    setPref(id, key, value) { (data.prefs[id] || (data.prefs[id] = {}))[key] = value; save(); },
    best(id) { return entry(id).best; },
    history(id) { return entry(id).history.slice(); },
    /* Returns true when the score beats the previous best. */
    updateBest(id, score) {
      const e = entry(id);
      if (!(score > e.best)) return false;
      e.best = score; save(); return true;
    },
    addHistory(id, score, note) {
      const e = entry(id);
      e.history.unshift({ score, note: note || '', at: Date.now() });
      e.history.length = Math.min(e.history.length, HISTORY_LIMIT);
      save();
    },
    getStats(id, fallback) { return Object.assign({}, fallback, data.stats[id]); },
    setStats(id, value) { data.stats[id] = value; save(); },
    get lastPlayed() { return data.lastPlayed; },
    setLastPlayed(id) { data.lastPlayed = id; save(); },
    reset() { data = defaults(); try { window.localStorage.removeItem(KEY); } catch (e) {} },
    get persistent() { return persistent; }
  };
})(window.GH = window.GH || {});
