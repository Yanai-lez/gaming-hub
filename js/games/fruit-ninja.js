/* Fruit Ninja: world height 600, width follows the screen. */
(function (GH) {
  'use strict';
  const H = 600, GRAVITY = 620;
  const FRUITS = [
    { name: 'watermelon', r: 42, skin: '#2fae55', flesh: '#ff4d6d', seeds: '#2a0a14' },
    { name: 'orange',     r: 32, skin: '#ff9f1c', flesh: '#ffc55c', seeds: '#fff1cc' },
    { name: 'apple',      r: 31, skin: '#e3263a', flesh: '#fff0c2', seeds: '#5a3418' },
    { name: 'lime',       r: 28, skin: '#6fbf1f', flesh: '#d9f77a', seeds: '#f7ffd6' },
    { name: 'kiwi',       r: 27, skin: '#8a6239', flesh: '#a6e22e', seeds: '#1d1d12' },
    { name: 'plum',       r: 26, skin: '#7b3fb5', flesh: '#f0a8e8', seeds: '#4a1f5e' }
  ];
  const STAR = { name: 'golden', r: 25, skin: '#ffd21f', flesh: '#fff6b0', seeds: '#c98f00', points: 5 };

  /* Does the segment a–b touch the circle? Uses the closest point on the segment. */
  function segmentHitsCircle(ax, ay, bx, by, cx, cy, r) {
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len)) : 0;
    return Math.hypot(ax + t * dx - cx, ay + t * dy - cy) <= r;
  }

  function create(ctx) {
    const { scope, stage } = ctx;
    const { clamp, rand, vibrate } = GH.engine;
    const duration = Number(ctx.options.time);
    const bombsOn = ctx.options.bombs === 'on';
    const fx = GH.engine.particles();
    const box = document.createElement('div');
    box.className = 'canvas-box';
    stage.append(box);
    let lastWidth;
    const view = GH.engine.createCanvas(scope, box, { height: H }, v => {
      /* Keep everything on screen when the device rotates or the window changes. */
      { const k = v.width / lastWidth; for (const o of s.items.concat(s.halves)) { o.x *= k; o.vx *= k; } }
      lastWidth = v.width; draw();
    });
    lastWidth = view.width;
    const g = view.g;
    const s = {
      score: 0, lives: 3, left: duration, elapsed: 0, over: false,
      items: [], halves: [], texts: [], trails: [], spawnIn: 0.8, shake: 0
    };
    const strokes = new Map();
    let shownSecond = null;

    function hud() {
      shownSecond = Math.ceil(s.left);
      ctx.setHud([['Score', s.score], ['Time', shownSecond + 's'], ['Lives', '♥'.repeat(s.lives) || '0']]);
    }

    function launch(type, bomb) {
      const W = view.width, r = bomb ? 28 : type.r;
      const x = rand(r + 10, W - r - 10);
      const y = H + r;
      const apex = rand(H * 0.14, H * 0.5);
      const vy = -Math.sqrt(2 * GRAVITY * (y - apex));
      const airtime = -2 * vy / GRAVITY;
      /* Aim the landing spot inside the screen so the arc never leaves the sides. */
      const vx = (rand(r + 10, W - r - 10) - x) / airtime;
      s.items.push({ type, bomb, r, x, y, vx, vy, angle: rand(0, 6), spin: rand(-3, 3) });
    }

    function spawn() {
      const heat = Math.min(1, s.elapsed / 60);
      const count = 1 + Math.floor(Math.random() * (1.4 + heat * 3));
      for (let i = 0; i < count; i++) {
        const golden = Math.random() < 0.04;
        scope.wait(i * 110, () => { if (!s.over) launch(golden ? STAR : FRUITS[Math.floor(Math.random() * FRUITS.length)], false); });
      }
      if (bombsOn && s.elapsed > 6 && Math.random() < 0.14 + heat * 0.22) launch(null, true);
      s.spawnIn = rand(1.25, 1.75) - heat * 0.6;
    }

    function end(title) {
      if (s.over) return;
      s.over = true; hud(); draw();
      ctx.gameOver({ score: s.score, note: `${duration}s round`, title, lines: [] });
    }

    function loseLife(x, y) {
      s.lives--;
      s.texts.push({ x, y, text: '✕', color: '#ff5d73', age: 0 });
      GH.audio.sfx('hurt'); vibrate(70);
      hud();
      if (s.lives <= 0) end('Out of lives');
    }

    function slice(item, dx, dy, stroke) {
      item.dead = true;
      if (item.bomb) {
        fx.burst(item.x, item.y, '#ff9f1c', 60, 380);
        s.shake = 0.45; GH.audio.sfx('explode');
        loseLife(item.x, item.y);
        return;
      }
      const cut = Math.atan2(dy, dx), nx = -Math.sin(cut), ny = Math.cos(cut);
      for (const side of [1, -1])
        s.halves.push({ type: item.type, r: item.r, x: item.x, y: item.y, vx: item.vx + nx * side * 110, vy: item.vy * 0.5 + ny * side * 110, angle: cut, spin: side * rand(1.5, 4), side });
      fx.burst(item.x, item.y, item.type.flesh, 22, 240, 500);
      const points = item.type.points || 1;
      s.score += points;
      s.texts.push({ x: item.x, y: item.y, text: '+' + points, color: '#fff', age: 0 });
      stroke.combo++; stroke.since = 0; stroke.at = { x: item.x, y: item.y };
      GH.audio.sfx('slice'); vibrate(10);
      hud();
    }

    /* Three or more fruits in one quick swipe earn a bonus equal to the fruit count. */
    function bankCombo(stroke) {
      if (stroke.combo >= 3 && !s.over) {
        s.score += stroke.combo;
        const x = clamp(stroke.at.x, 90, view.width - 90);
        s.texts.push({ x, y: stroke.at.y - 40, text: `${stroke.combo} COMBO +${stroke.combo}`, color: '#ffe15e', age: 0 });
        GH.audio.sfx('combo'); hud();
      }
      stroke.combo = 0;
    }

    function cut(stroke, p) {
      const a = stroke.last;
      stroke.last = p;
      if (Math.hypot(p.x - a.x, p.y - a.y) < 2) return;
      s.trails.push({ ax: a.x, ay: a.y, bx: p.x, by: p.y, age: 0 });
      for (const item of s.items) {
        if (s.over) return;
        if (!item.dead && segmentHitsCircle(a.x, a.y, p.x, p.y, item.x, item.y, item.r)) slice(item, p.x - a.x, p.y - a.y, stroke);
      }
    }

    function update(dt) {
      if (s.over) return;
      s.elapsed += dt;
      s.left = Math.max(0, s.left - dt);
      s.shake = Math.max(0, s.shake - dt);
      s.spawnIn -= dt;
      if (s.spawnIn <= 0 && s.left > 1.5) spawn();
      for (const o of s.items.concat(s.halves)) { o.vy += GRAVITY * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.angle += o.spin * dt; }
      for (const item of s.items) {
        if (!item.dead && item.vy > 0 && item.y > H + item.r + 2) {
          item.dead = true;
          if (!item.bomb && item.type !== STAR && !s.over) loseLife(clamp(item.x, 30, view.width - 30), H - 30);
        }
      }
      s.items = s.items.filter(o => !o.dead);
      s.halves = s.halves.filter(o => o.y < H + 80);
      for (const t of s.texts) { t.age += dt; t.y -= 40 * dt; }
      s.texts = s.texts.filter(t => t.age < 0.9);
      for (const t of s.trails) t.age += dt;
      s.trails = s.trails.filter(t => t.age < 0.16);
      for (const k of strokes.values()) { k.since += dt; if (k.combo && k.since > 0.28) bankCombo(k); }
      fx.update(dt);
      if (!s.over && s.left <= 0) { strokes.forEach(bankCombo); end("Time's up"); return; }
      if (!s.over && Math.ceil(s.left) !== shownSecond) hud();
    }

    function fruitShape(type, r) {
      g.fillStyle = type.skin; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      if (type.name === 'watermelon') {
        g.strokeStyle = '#1d7a3a'; g.lineWidth = 5;
        for (const k of [-0.55, 0, 0.55]) { g.beginPath(); g.ellipse(k * r, 0, r * 0.14, r * Math.cos(k) * 0.96, 0, 0, Math.PI * 2); g.stroke(); }
      }
      g.fillStyle = '#ffffff40'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.17, -0.7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4d7c1f'; g.beginPath(); g.ellipse(r * 0.18, -r * 0.98, r * 0.28, r * 0.12, -0.5, 0, Math.PI * 2); g.fill();
      if (type === STAR) { g.fillStyle = '#fff'; g.font = `${r}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 0, 2); g.textBaseline = 'alphabetic'; }
    }

    function draw() {
      if (!g || !s) return;
      const W = view.width;
      g.save();
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b0f33'); bg.addColorStop(1, '#0f0a1e');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      if (s.shake > 0 && GH.storage.settings.effects) g.translate(rand(-7, 7) * s.shake * 2, rand(-7, 7) * s.shake * 2);
      fx.draw(g);
      for (const h of s.halves) {
        g.save(); g.translate(h.x, h.y); g.rotate(h.angle);
        g.beginPath(); g.rect(-h.r * 1.5, h.side > 0 ? 0 : -h.r * 1.5, h.r * 3, h.r * 1.5); g.clip();
        g.fillStyle = h.type.skin; g.beginPath(); g.arc(0, 0, h.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = h.type.flesh; g.beginPath(); g.ellipse(0, 0, h.r * 0.86, h.r * 0.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = h.type.seeds;
        for (const k of [-0.45, 0, 0.45]) { g.beginPath(); g.arc(k * h.r, h.side * h.r * 0.22, 2.5, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      for (const o of s.items) {
        g.save(); g.translate(o.x, o.y); g.rotate(o.angle);
        if (o.bomb) {
          g.fillStyle = '#16161c'; g.strokeStyle = '#ff5d73'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, o.r, 0, Math.PI * 2); g.fill(); g.stroke();
          g.beginPath(); g.moveTo(-9, -9); g.lineTo(9, 9); g.moveTo(9, -9); g.lineTo(-9, 9); g.stroke();
          g.strokeStyle = '#c9a46a'; g.beginPath(); g.moveTo(0, -o.r); g.quadraticCurveTo(10, -o.r - 14, 18, -o.r - 8); g.stroke();
          g.fillStyle = Math.random() < 0.5 ? '#ffe15e' : '#ff9f1c'; g.beginPath(); g.arc(18, -o.r - 8, 5, 0, Math.PI * 2); g.fill();
        } else fruitShape(o.type, o.r);
        g.restore();
      }
      g.lineCap = 'round'; g.strokeStyle = '#fff';
      for (const t of s.trails) {
        const k = 1 - t.age / 0.16; g.globalAlpha = k; g.lineWidth = 1 + 7 * k;
        g.beginPath(); g.moveTo(t.ax, t.ay); g.lineTo(t.bx, t.by); g.stroke();
      }
      g.textAlign = 'center'; g.font = '900 26px system-ui, sans-serif';
      for (const t of s.texts) { g.globalAlpha = Math.max(0, 1 - t.age / 0.9); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y); }
      g.globalAlpha = 1;
      if (s.elapsed < 3 && !s.over) { g.fillStyle = '#fff'; g.font = '700 22px system-ui, sans-serif'; g.fillText(bombsOn ? 'Swipe the fruit, avoid bombs' : 'Swipe the fruit', W / 2, H * 0.25); }
      g.restore();
    }

    scope.on(stage, 'pointerdown', e => {
      if (scope.paused || s.over) return;
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      strokes.set(e.pointerId, { last: view.point(e), combo: 0, since: 0, at: null });
    });
    scope.on(stage, 'pointermove', e => {
      const k = strokes.get(e.pointerId);
      if (!k || scope.paused || s.over) return;
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const c of events.length ? events : [e]) cut(k, view.point(c));
    });
    for (const type of ['pointerup', 'pointercancel']) scope.on(stage, type, e => {
      const k = strokes.get(e.pointerId);
      if (k) { bankCombo(k); strokes.delete(e.pointerId); }
    });

    hud();
    scope.loop(dt => { update(dt); draw(); });

    return {
      state: s, view, launch: (i) => launch(FRUITS[i || 0], false),
      pause() { strokes.forEach(bankCombo); strokes.clear(); },
      result: () => ({ score: s.score, note: `${duration}s round` })
    };
  }

  GH.games.register({
    id: 'fruit-ninja', name: 'Fruit Ninja', accent: '#ff5d8f', music: 'fruit', bestLabel: 'High score',
    description: 'Slash flying fruit, chain combos and keep clear of the bombs.',
    howTo: 'Swipe with a finger, or hold the mouse button and drag. Dropped fruit costs a life.',
    controls: [['Swipe / drag', 'Slice fruit'], ['P / Esc', 'Pause'], ['Combo', '3+ fruit in one swipe adds a bonus'], ['Golden ★', 'Worth 5; safe to miss'], ['Bombs', 'Slicing one costs a life']],
    options: [
      { key: 'time', label: 'Round length', default: '60', choices: [['60', '60 s'], ['90', '90 s'], ['120', '120 s']] },
      { key: 'bombs', label: 'Bombs', default: 'on', choices: [['on', 'On'], ['off', 'Off']] }
    ],
    logic: { segmentHitsCircle },
    create
  });
})(window.GH);
