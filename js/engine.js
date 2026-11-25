/* Shared game plumbing. A Scope owns every listener, timer and animation frame a game
   creates, so leaving a game releases all of them in one call. */
(function (GH) {
  'use strict';
  const live = new Set();

  class Scope {
    constructor() {
      this.listeners = [];
      this.timers = new Set();
      this.frames = new Set();
      this.cleanups = [];
      this.paused = false;
      this.dead = false;
      live.add(this);
    }
    on(target, type, fn, opts) {
      if (this.dead) return;
      target.addEventListener(type, fn, opts);
      this.listeners.push([target, type, fn, opts]);
    }
    /* Pause-aware timeout. */
    wait(ms, fn) {
      if (this.dead) return null;
      const t = { left: ms, fn, id: null, since: 0 };
      this.timers.add(t);
      if (!this.paused) this._arm(t);
      return t;
    }
    cancel(t) { if (t) { window.clearTimeout(t.id); this.timers.delete(t); } }
    _arm(t) {
      t.since = performance.now();
      t.id = window.setTimeout(() => { this.timers.delete(t); t.fn(); }, t.left);
    }
    /* Animation loop; update(dt seconds) is skipped while paused. */
    loop(update) {
      let last = null;
      const tick = now => {
        this.frames.delete(handle);
        if (this.dead || this.paused) return;
        const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
        last = now;
        update(dt);
        if (!this.dead && !this.paused) request();
      };
      let handle = null;
      const request = () => { handle = window.requestAnimationFrame(tick); this.frames.add(handle); };
      this._restarters = this._restarters || [];
      this._restarters.push(() => { last = null; request(); });
      if (!this.paused) request();
    }
    pause() {
      if (this.paused || this.dead) return;
      this.paused = true;
      const now = performance.now();
      this.timers.forEach(t => { window.clearTimeout(t.id); t.left = Math.max(0, t.left - (now - t.since)); });
      this.frames.forEach(id => window.cancelAnimationFrame(id));
      this.frames.clear();
    }
    resume() {
      if (!this.paused || this.dead) return;
      this.paused = false;
      this.timers.forEach(t => this._arm(t));
      (this._restarters || []).forEach(fn => fn());
    }
    add(cleanup) { this.cleanups.push(cleanup); }
    dispose() {
      if (this.dead) return;
      this.dead = true;
      this.timers.forEach(t => window.clearTimeout(t.id));
      this.frames.forEach(id => window.cancelAnimationFrame(id));
      this.listeners.forEach(([t, type, fn, o]) => t.removeEventListener(type, fn, o));
      this.cleanups.forEach(fn => fn());
      this.timers.clear(); this.frames.clear();
      this.listeners = []; this.cleanups = []; this._restarters = [];
      live.delete(this);
    }
  }

  /* A canvas that fills its parent. With fixed {width,height} the world is letterboxed;
     with only {height} the world width follows the aspect ratio. */
  function createCanvas(scope, parent, world, onResize) {
    const el = document.createElement('canvas');
    el.className = 'game-canvas';
    parent.appendChild(el);
    const g = el.getContext('2d');
    const view = { el, g, width: world.width || 400, height: world.height, scale: 1 };

    let ready = false;
    function resize() {
      const pw = parent.clientWidth, ph = parent.clientHeight;
      if (!pw || !ph) return;
      let cw = pw, ch = ph;
      if (world.width) {
        const k = Math.min(pw / world.width, ph / world.height);
        cw = world.width * k; ch = world.height * k;
      } else {
        view.width = world.height * (pw / ph);
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.style.width = cw + 'px'; el.style.height = ch + 'px';
      el.width = Math.round(cw * dpr); el.height = Math.round(ch * dpr);
      view.scale = cw / view.width;
      g.setTransform(el.width / view.width, 0, 0, el.height / view.height, 0, 0);
      if (ready && onResize) onResize(view);
    }
    /* Pointer event to world coordinates. */
    view.point = e => {
      const r = el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * view.width, y: (e.clientY - r.top) / r.height * view.height };
    };
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(resize);
      ro.observe(parent);
      scope.add(() => ro.disconnect());
    } else scope.on(window, 'resize', resize);
    resize();
    ready = true;
    return view;
  }

  /* Small particle system shared by the canvas games. */
  function particles() {
    let list = [];
    return {
      burst(x, y, color, count, speed, gravity) {
        if (!GH.storage.settings.effects) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2, v = speed * (0.25 + Math.random() * 0.75);
          list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: gravity || 0, life: 0.35 + Math.random() * 0.45, age: 0, size: 2 + Math.random() * 3.5, color });
        }
        if (list.length > 500) list = list.slice(-500);
      },
      update(dt) {
        for (const p of list) { p.age += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        list = list.filter(p => p.age < p.life);
      },
      draw(g) {
        for (const p of list) {
          g.globalAlpha = Math.max(0, 1 - p.age / p.life);
          g.fillStyle = p.color;
          g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        g.globalAlpha = 1;
      },
      get count() { return list.length; }
    };
  }

  const games = [];
  GH.games = {
    register(def) { games.push(def); },
    all: () => games.slice(),
    get: id => games.find(g => g.id === id) || null
  };

  GH.engine = {
    Scope, createCanvas, particles,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    rand: (a, b) => a + Math.random() * (b - a),
    vibrate(ms) { if (GH.storage.settings.vibration && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } },
    /* Diagnostics used by the tests. */
    activity() {
      let listeners = 0, timers = 0, frames = 0;
      live.forEach(s => { listeners += s.listeners.length; timers += s.timers.size; frames += s.frames.size; });
      return { scopes: live.size, listeners, timers, frames };
    }
  };
})(window.GH = window.GH || {});
