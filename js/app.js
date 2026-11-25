/* The shell: home page, start / pause / game-over screens, settings, fullscreen. */
(function (GH) {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = GH.storage, audio = GH.audio;

  const ICONS = {
    home: '<path d="M15 5l-7 7 7 7"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 9a4 4 0 010 6M19.5 6.5a8 8 0 010 11"/>',
    muted: '<path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    exitFull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v === true ? '' : v);
    }
    node.append(...children.filter(Boolean));
    return node;
  }

  let current = null;      /* { def, scope, instance, state: 'menu'|'playing'|'paused'|'over' } */
  let toastTimer = null;

  function toast(message) {
    const t = $('toast');
    t.textContent = message; t.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Home ---------- */
  function renderHome() {
    const cards = $('cards');
    cards.textContent = '';
    for (const def of GH.games.all()) {
      const best = store.best(def.id);
      cards.append(el('article', { class: 'card', style: `--accent:${def.accent}`, 'data-game': def.id },
        el('div', { class: 'card-art' }, el('img', { src: `assets/images/${def.id}.svg`, alt: `${def.name} illustration`, width: 320, height: 180 })),
        el('div', { class: 'card-body' },
          el('h2', { text: def.name }),
          el('p', { text: def.description }),
          el('div', { class: 'card-foot' },
            el('div', { class: 'card-best' }, el('span', { text: def.bestLabel }), el('strong', { text: best ? String(best) : '–' })),
            el('a', { class: 'btn btn-accent', href: `#/game/${def.id}`, 'aria-label': `Play ${def.name}`, text: 'Play' })))));
    }
    const last = GH.games.get(store.lastPlayed);
    const link = $('continue-link');
    link.hidden = !last;
    if (last) { link.href = `#/game/${last.id}`; link.textContent = `Continue with ${last.name}`; }
  }

  /* ---------- Game lifecycle ---------- */
  function teardown() {
    if (!current) return;
    if (current.instance) {
      /* Keep the result of a run that is abandoned before game over. */
      if (current.state !== 'over' && current.instance.result) {
        const r = current.instance.result();
        if (r && r.score > 0) { store.updateBest(current.def.id, r.score); store.addHistory(current.def.id, r.score, r.note + ' (left early)'); }
      }
      current.scope.dispose();
      current.instance = null; current.scope = null;
    }
    $('stage').textContent = '';
    $('hud').textContent = '';
  }

  function options(def) {
    const saved = store.getPrefs(def.id), out = {};
    for (const o of def.options) {
      const ok = o.choices.some(c => c[0] === saved[o.key]);
      out[o.key] = ok ? saved[o.key] : o.default;
    }
    return out;
  }

  function startGame() {
    const def = current.def;
    teardown();
    hideOverlay();
    const scope = new GH.engine.Scope();
    current.scope = scope;
    current.state = 'playing';
    store.setLastPlayed(def.id);
    const mine = () => current && current.scope === scope;
    const ctx = {
      stage: $('stage'), scope, options: options(def),
      setOption(key, value) { store.setPref(def.id, key, value); this.options[key] = value; },
      setHud(items) {
        if (!mine()) return;
        const hud = $('hud');
        if (hud.children.length !== items.length) {
          hud.textContent = '';
          for (let i = 0; i < items.length; i++) hud.append(el('div', { class: 'stat' }, el('span'), el('strong')));
        }
        items.forEach(([label, value], i) => {
          const [l, v] = hud.children[i].children;
          if (l.textContent !== label) l.textContent = label;
          if (v.textContent !== String(value)) v.textContent = value;
        });
      },
      refreshSide() { if (mine()) renderSide(def); },
      gameOver(result) { if (mine()) finish(result); }
    };
    current.instance = def.create(ctx);
    audio.music(def.music);
    updateChrome();
    renderSide(def);
    $('stage').focus({ preventScroll: true });
  }

  function finish({ score, note, title, lines }) {
    const def = current.def;
    const isBest = store.updateBest(def.id, score);
    store.addHistory(def.id, score, note);
    current.state = 'over';
    current.scope.pause();
    audio.music(null);
    audio.sfx(isBest ? 'win' : 'lose');
    updateChrome();
    renderSide(def);
    showOverlay(
      el('h2', { text: title || 'Game over' }),
      el('div', { class: 'final-score' }, el('span', { text: 'Score' }), el('strong', { id: 'final-score', text: score })),
      el('p', { class: isBest ? 'new-best' : 'muted', text: isBest ? 'New personal best!' : `Personal best: ${store.best(def.id)}` }),
      ...(lines || []).map(t => el('p', { class: 'muted', text: t })),
      el('div', { class: 'overlay-actions' },
        el('button', { class: 'btn btn-accent', type: 'button', id: 'btn-again', onclick: startGame, text: 'Play again' }),
        el('button', { class: 'btn', type: 'button', onclick: showMenu, text: 'Game menu' }),
        el('a', { class: 'btn btn-ghost', href: '#/', text: 'Home' })));
  }

  function showMenu() {
    const def = current.def;
    teardown();
    current.state = 'menu';
    audio.music(def.music);
    updateChrome();
    renderSide(def);
    const prefs = options(def);
    const groups = def.options.map(o => el('fieldset', { class: 'segment' },
      el('legend', { text: o.label }),
      el('div', { class: 'segment-row' }, ...o.choices.map(([value, label]) => {
        const input = el('input', { type: 'radio', name: o.key, value, checked: prefs[o.key] === value,
          onchange: () => { store.setPref(def.id, o.key, value); audio.sfx('click'); } });
        return el('label', {}, input, el('span', { text: label }));
      }))));
    showOverlay(
      el('img', { class: 'menu-art', src: `assets/images/${def.id}.svg`, alt: '' }),
      el('h2', { text: def.name }),
      el('p', { class: 'muted', text: def.howTo }),
      el('p', { class: 'menu-best', text: `${def.bestLabel}: ${store.best(def.id) || '–'}` }),
      ...groups,
      el('div', { class: 'overlay-actions' },
        el('button', { class: 'btn btn-accent btn-big', type: 'button', id: 'btn-start', onclick: startGame, text: 'Start game' })));
  }

  function pause() {
    if (!current || current.state !== 'playing') return;
    current.state = 'paused';
    current.scope.pause();
    if (current.instance.pause) current.instance.pause();
    audio.music(null);
    updateChrome();
    showOverlay(
      el('h2', { text: 'Paused' }),
      el('p', { class: 'muted', text: current.def.howTo }),
      el('div', { class: 'overlay-actions' },
        el('button', { class: 'btn btn-accent', type: 'button', id: 'btn-resume', onclick: resume, text: 'Resume' }),
        el('button', { class: 'btn', type: 'button', id: 'btn-restart', onclick: startGame, text: 'Restart' }),
        el('button', { class: 'btn', type: 'button', id: 'btn-menu', onclick: showMenu, text: 'Game menu' }),
        el('a', { class: 'btn btn-ghost', href: '#/', text: 'Home' })));
  }

  function resume() {
    if (!current || current.state !== 'paused') return;
    current.state = 'playing';
    hideOverlay();
    current.scope.resume();
    audio.music(current.def.music);
    updateChrome();
    $('stage').focus({ preventScroll: true });
  }

  function showOverlay(...nodes) {
    const o = $('overlay');
    o.textContent = '';
    o.append(el('div', { class: 'panel' }, ...nodes));
    o.hidden = false;
    o.scrollTop = 0;
    const primary = o.querySelector('.btn-accent');
    if (primary) primary.focus({ preventScroll: true });
  }
  function hideOverlay() { $('overlay').hidden = true; $('overlay').textContent = ''; }

  function renderSide(def) {
    const history = store.history(def.id);
    const side = $('side');
    side.textContent = '';
    side.append(
      el('section', {}, el('h3', { text: 'Controls' }),
        el('dl', {}, ...def.controls.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))),
      el('section', {}, el('h3', { text: def.bestLabel }), el('p', { class: 'side-best', text: store.best(def.id) || '–' })),
      el('section', {}, el('h3', { text: 'Recent results' }),
        history.length
          ? el('ol', { class: 'history' }, ...history.map(h => el('li', {}, el('strong', { text: h.score }), el('span', { text: h.note }),
              el('time', { text: new Date(h.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }))))
          : el('p', { class: 'muted', text: 'No games finished yet.' })));
  }

  function updateChrome() {
    const inGame = !!current;
    $('btn-home').hidden = !inGame;
    const pauseBtn = $('btn-pause');
    pauseBtn.hidden = !inGame || !(current.state === 'playing' || current.state === 'paused');
    if (inGame) {
      const paused = current.state === 'paused';
      pauseBtn.innerHTML = icon(paused ? 'play' : 'pause');
      pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    }
    $('brand-text').textContent = inGame ? current.def.name : 'Gaming Hub';
  }

  function route(r) {
    if (settingsDialog.open) settingsDialog.close();
    teardown();
    hideOverlay();
    current = null;
    const inGame = r.view === 'game';
    $('home').hidden = inGame;
    $('game').hidden = !inGame;
    document.body.classList.toggle('in-game', inGame);
    window.scrollTo(0, 0);
    if (inGame) {
      const def = GH.games.get(r.id);
      current = { def, state: 'menu', instance: null, scope: null };
      document.body.style.setProperty('--accent', def.accent);
      document.title = `${def.name} · Gaming Hub`;
      showMenu();
    } else {
      document.body.style.removeProperty('--accent');
      document.title = 'Gaming Hub';
      audio.music('home');
      updateChrome();
      renderHome();
    }
  }

  /* ---------- Settings, mute, fullscreen ---------- */
  const settingsDialog = $('settings');
  let resumeAfterSettings = false, resetArmed = false;

  function syncSettingsUI() {
    for (const input of settingsDialog.querySelectorAll('[data-setting]')) {
      const v = store.settings[input.dataset.setting];
      if (input.type === 'checkbox') input.checked = !!v; else input.value = v;
    }
    const muted = store.settings.muted;
    $('btn-mute').innerHTML = icon(muted ? 'muted' : 'sound');
    $('btn-mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    $('btn-mute').setAttribute('aria-pressed', String(muted));
  }

  function setSetting(key, value) { store.setSetting(key, value); audio.apply(); syncSettingsUI(); }

  function openSettings() {
    resumeAfterSettings = !!current && current.state === 'playing';
    if (resumeAfterSettings) pause();
    resetArmed = false;
    $('btn-reset').textContent = 'Erase saved data';
    syncSettingsUI();
    if (settingsDialog.showModal) settingsDialog.showModal(); else settingsDialog.setAttribute('open', '');
  }

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function syncFullscreen() {
    const on = !!fsElement() || document.body.classList.contains('immersive');
    $('btn-fullscreen').innerHTML = icon(on ? 'exitFull' : 'full');
    $('btn-fullscreen').setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
  }
  function toggleFullscreen() {
    const root = document.documentElement;
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    const fallback = () => {
      const on = document.body.classList.toggle('immersive');
      toast(on ? 'This browser has no fullscreen mode, so the side panels are hidden instead.' : 'Focus view off');
      syncFullscreen();
    };
    if (fsElement()) exit.call(document);
    else if (document.body.classList.contains('immersive') || !request) fallback();
    else Promise.resolve(request.call(root)).catch(fallback);
  }

  /* ---------- Wiring ---------- */
  function init() {
    $('btn-home').innerHTML = icon('home');
    $('btn-settings').innerHTML = icon('gear');
    $('btn-home').addEventListener('click', GH.navigation.home);
    $('btn-pause').addEventListener('click', () => (current && current.state === 'paused' ? resume() : pause()));
    $('btn-mute').addEventListener('click', () => { audio.unlock(); setSetting('muted', !store.settings.muted); });
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-close-settings').addEventListener('click', () => settingsDialog.close());
    settingsDialog.addEventListener('close', () => { if (resumeAfterSettings) resume(); resumeAfterSettings = false; });
    settingsDialog.addEventListener('input', e => {
      const input = e.target.closest('[data-setting]');
      if (input) setSetting(input.dataset.setting, input.type === 'checkbox' ? input.checked : Number(input.value));
    });
    $('btn-reset').addEventListener('click', () => {
      if (!resetArmed) { resetArmed = true; $('btn-reset').textContent = 'Tap again to erase'; return; }
      resumeAfterSettings = false;
      if (current) { current.state = 'over'; }
      store.reset(); audio.apply(); syncSettingsUI(); settingsDialog.close();
      route(GH.navigation.parse(location.hash));
      toast('Saved data erased');
    });

    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => audio.unlock(), { capture: true });
    document.addEventListener('keydown', e => {
      if (settingsDialog.open || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyM') $('btn-mute').click();
      else if (e.code === 'KeyF') toggleFullscreen();
      else if ((e.code === 'KeyP' || e.code === 'Escape') && current) {
        if (current.state === 'playing') pause(); else if (current.state === 'paused') resume();
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('blur', pause);
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    /* Leaving the page mid-run still saves the score. */
    window.addEventListener('pagehide', () => {
      if (current && current.instance && current.state !== 'over' && current.instance.result) {
        const r = current.instance.result();
        if (r && r.score > 0) store.updateBest(current.def.id, r.score);
      }
    });

    syncSettingsUI();
    syncFullscreen();
    GH.navigation.start(route);
  }

  GH.app = { toast, get current() { return current; } };
  init();
})(window.GH);
