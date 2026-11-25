/* Space Invaders: portrait 400x600 world. */
(function (GH) {
  'use strict';
  const W = 400, H = 600, SHIP_Y = 552;
  const TYPES = {
    tank:    { points: 30, hp: 2, color: '#ff6bd0' },
    fighter: { points: 20, hp: 1, color: '#ffb23e' },
    scout:   { points: 10, hp: 1, color: '#7dffb2' }
  };
  const LEVELS = {
    easy:   { speed: 0.75, fire: 0.65, damage: 34 },
    normal: { speed: 1,    fire: 1,    damage: 50 },
    hard:   { speed: 1.3,  fire: 1.45, damage: 50 }
  };
  const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;

  function create(ctx) {
    const { scope, stage } = ctx;
    const { clamp, rand, vibrate } = GH.engine;
    const level = LEVELS[ctx.options.difficulty];
    const auto = ctx.options.autofire === 'on';
    const fx = GH.engine.particles();
    const keys = new Set();
    const held = { left: false, right: false, fire: false };
    let drag = null;

    const box = document.createElement('div');
    box.className = 'canvas-box';
    const pad = document.createElement('div');
    pad.className = 'pad';
    pad.innerHTML = '<button type="button" data-k="left" aria-label="Move left">◀</button><button type="button" data-k="right" aria-label="Move right">▶</button><button type="button" data-k="fire" class="fire">FIRE</button>';
    stage.append(box, pad);
    const view = GH.engine.createCanvas(scope, box, { width: W, height: H }, () => draw());
    const g = view.g;
    const stars = Array.from({ length: 60 }, () => ({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 2), v: rand(8, 30) }));

    const s = {
      score: 0, lives: 3, hp: 100, wave: 0, time: 0, over: false,
      ship: { x: W / 2, y: SHIP_Y, w: 36, h: 24 }, invulnerable: 0, cooldown: 0,
      shots: [], bombs: [], aliens: [], dir: 1, drop: 0, enemyTimer: 1.5, ufo: null, ufoTimer: rand(9, 16), banner: 0, shake: 0, flash: 0
    };

    function nextWave() {
      s.wave++;
      if (s.wave > 1) { s.hp = 100; GH.audio.sfx('level'); }
      const rows = Math.min(3 + Math.floor(s.wave / 2), 6), cols = 8;
      const top = Math.min(70 + (s.wave - 1) * 10, 130);
      s.aliens = [];
      for (let r = 0; r < rows; r++) {
        const type = r === 0 ? 'tank' : r < Math.ceil(rows / 2) ? 'fighter' : 'scout';
        for (let c = 0; c < cols; c++)
          s.aliens.push({ type, x: 48 + c * 40, y: top + r * 32, w: 28, h: 20, hp: TYPES[type].hp, hurt: 0 });
      }
      s.total = s.aliens.length;
      s.dir = 1; s.drop = 0; s.bombs = []; s.shots = []; s.banner = 1.8;
      hud();
    }

    function hud() { ctx.setHud([['Score', s.score], ['Wave', s.wave], ['Health', s.hp + '%'], ['Lives', s.lives]]); }

    function end(title) {
      if (s.over) return;
      s.over = true; hud(); draw();
      ctx.gameOver({ score: s.score, note: `Wave ${s.wave}, ${ctx.options.difficulty}`, title, lines: [`You reached wave ${s.wave}.`] });
    }

    function damage() {
      if (s.invulnerable > 0 || s.over) return;
      s.hp = Math.max(0, s.hp - level.damage);
      /* 34 x 3 on easy: treat the last sliver as empty. */
      if (s.hp < 5) s.hp = 0;
      s.invulnerable = 1.1; s.shake = 0.35; s.flash = 0.2;
      fx.burst(s.ship.x, s.ship.y, '#4fd8ff', 26, 190);
      GH.audio.sfx('hurt'); vibrate(80);
      if (s.hp === 0) {
        s.lives--;
        GH.audio.sfx('explode');
        fx.burst(s.ship.x, s.ship.y, '#ffffff', 50, 260);
        if (s.lives <= 0) return end('Your fleet is lost');
        s.hp = 100; s.invulnerable = 2; s.bombs = [];
      }
      hud();
    }

    function shoot() {
      if (s.cooldown > 0 || s.shots.length >= 4) return;
      s.cooldown = 0.28;
      s.shots.push({ x: s.ship.x, y: s.ship.y - 20, w: 4, h: 14 });
      GH.audio.sfx('shoot');
    }

    function update(dt) {
      if (s.over) return;
      s.time += dt;
      for (const st of stars) { st.y += st.v * dt; if (st.y > H) { st.y = 0; st.x = rand(0, W); } }
      s.invulnerable = Math.max(0, s.invulnerable - dt);
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.shake = Math.max(0, s.shake - dt);
      s.flash = Math.max(0, s.flash - dt);
      s.banner = Math.max(0, s.banner - dt);

      const dir = (keys.has('ArrowRight') || keys.has('KeyD') || held.right ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') || held.left ? 1 : 0);
      s.ship.x += dir * 300 * dt;
      if (drag !== null) s.ship.x += clamp(drag.target - s.ship.x, -520 * dt, 520 * dt);
      s.ship.x = clamp(s.ship.x, 22, W - 22);
      if (auto || held.fire || keys.has('Space') || drag !== null) shoot();

      for (const b of s.shots) b.y -= 520 * dt;
      for (const b of s.bombs) { b.y += b.v * dt; b.x += (b.vx || 0) * dt; }

      /* Formation: faster with every wave and as the ranks thin out. */
      const thinned = 1 - s.aliens.length / s.total;
      const speed = (22 + (s.wave - 1) * 6 + thinned * thinned * 95) * level.speed;
      if (s.banner < 1) {
        let edge = false;
        for (const a of s.aliens) {
          a.x += s.dir * speed * dt;
          a.hurt = Math.max(0, a.hurt - dt);
          if ((s.dir > 0 && a.x > W - 20) || (s.dir < 0 && a.x < 20)) edge = true;
        }
        if (edge) {
          const over = s.dir > 0 ? Math.max(...s.aliens.map(a => a.x)) - (W - 20) : Math.min(...s.aliens.map(a => a.x)) - 20;
          for (const a of s.aliens) { a.x -= over; a.y += 14; }
          s.dir *= -1;
        }
        s.enemyTimer -= dt;
        if (s.enemyTimer <= 0 && s.aliens.length) {
          /* Only the lowest alien of a column can fire. */
          const front = new Map();
          for (const a of s.aliens) { const k = Math.round(a.x / 10); if (!front.has(k) || front.get(k).y < a.y) front.set(k, a); }
          const list = [...front.values()], a = list[Math.floor(Math.random() * list.length)];
          const aim = a.type === 'tank' ? clamp((s.ship.x - a.x) * 0.25, -50, 50) : 0;
          s.bombs.push({ x: a.x, y: a.y + 14, w: 6, h: 12, v: 150 + s.wave * 12, vx: aim, color: TYPES[a.type].color });
          s.enemyTimer = rand(0.55, 1.35) / (level.fire * (1 + (s.wave - 1) * 0.12));
        }
      }

      s.ufoTimer -= dt;
      if (!s.ufo && s.ufoTimer <= 0) {
        const d = Math.random() < 0.5 ? 1 : -1;
        s.ufo = { x: d > 0 ? -30 : W + 30, y: 36, w: 44, h: 18, v: 85 * d };
      }
      if (s.ufo) {
        s.ufo.x += s.ufo.v * dt;
        if (s.ufo.x < -40 || s.ufo.x > W + 40) { s.ufo = null; s.ufoTimer = rand(12, 22); }
      }

      for (const shot of s.shots) {
        if (s.ufo && overlap(shot, s.ufo)) {
          shot.dead = true; s.score += 100;
          fx.burst(s.ufo.x, s.ufo.y, '#ff4d6d', 34, 220);
          s.ufo = null; s.ufoTimer = rand(12, 22); GH.audio.sfx('combo'); hud();
          continue;
        }
        const a = s.aliens.find(al => al.hp > 0 && overlap(shot, al));
        if (!a) continue;
        shot.dead = true; a.hp--; a.hurt = 0.12;
        if (a.hp <= 0) {
          s.score += TYPES[a.type].points;
          fx.burst(a.x, a.y, TYPES[a.type].color, 16, 170);
          GH.audio.sfx('explode'); hud();
        } else { fx.burst(shot.x, shot.y, '#fff', 6, 90); GH.audio.sfx('hit'); }
      }
      s.aliens = s.aliens.filter(a => a.hp > 0);
      s.shots = s.shots.filter(b => !b.dead && b.y > -20);
      for (const b of s.bombs) if (overlap(b, s.ship)) { b.dead = true; damage(); }
      s.bombs = s.bombs.filter(b => !b.dead && b.y < H + 20);
      fx.update(dt);
      if (s.over) return;
      if (s.aliens.some(a => a.y + a.h / 2 >= SHIP_Y - 16)) { s.lives = 0; end('The invaders landed'); return; }
      if (!s.aliens.length) nextWave();
    }

    function drawAlien(a) {
      const t = TYPES[a.type], wob = Math.sin(s.time * 6 + a.x * 0.1) > 0 ? 1 : -1;
      g.save(); g.translate(a.x, a.y);
      g.fillStyle = a.hurt > 0 ? '#fff' : t.color; g.strokeStyle = g.fillStyle; g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath();
      if (a.type === 'tank') {
        g.moveTo(-14, -4); g.lineTo(-7, -10); g.lineTo(7, -10); g.lineTo(14, -4); g.lineTo(14, 5); g.lineTo(-14, 5); g.closePath(); g.fill();
        g.fillRect(-12 + wob * 2, 5, 6, 5); g.fillRect(6 - wob * 2, 5, 6, 5);
      } else if (a.type === 'fighter') {
        g.moveTo(0, -10); g.lineTo(9, 0); g.lineTo(15, -5 + wob * 3); g.lineTo(11, 9); g.lineTo(0, 5); g.lineTo(-11, 9); g.lineTo(-15, -5 + wob * 3); g.lineTo(-9, 0); g.closePath(); g.fill();
      } else {
        g.ellipse(0, -1, 11, 8, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(-6, 5); g.lineTo(-9 - wob * 2, 10); g.moveTo(6, 5); g.lineTo(9 + wob * 2, 10); g.stroke();
      }
      g.fillStyle = '#12081f'; g.fillRect(-6, -4, 4, 4); g.fillRect(2, -4, 4, 4);
      if (a.type === 'tank' && a.hp === 1) { g.strokeStyle = '#12081f'; g.beginPath(); g.moveTo(-2, -10); g.lineTo(3, -5); g.lineTo(-1, 5); g.stroke(); }
      g.restore();
    }

    function draw() {
      if (!g || !s) return;
      g.save();
      g.fillStyle = '#080a1c'; g.fillRect(0, 0, W, H);
      if (s.shake > 0 && GH.storage.settings.effects) g.translate(rand(-5, 5) * s.shake * 2, rand(-5, 5) * s.shake * 2);
      g.fillStyle = '#ffffff80';
      for (const st of stars) g.fillRect(st.x, st.y, st.s, st.s);
      s.aliens.forEach(drawAlien);
      if (s.ufo) {
        const u = s.ufo; g.fillStyle = '#ff4d6d';
        g.beginPath(); g.ellipse(u.x, u.y + 2, 22, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffd0d8'; g.beginPath(); g.arc(u.x, u.y - 2, 9, Math.PI, 0); g.fill();
      }
      g.fillStyle = '#ffe15e'; for (const b of s.shots) g.fillRect(b.x - 2, b.y - 7, 4, 14);
      for (const b of s.bombs) { g.fillStyle = b.color; g.beginPath(); g.ellipse(b.x, b.y, 3.5, 7, 0, 0, Math.PI * 2); g.fill(); }
      if (!s.over && (s.invulnerable === 0 || Math.floor(s.time * 12) % 2 === 0)) {
        const { x, y } = s.ship;
        g.fillStyle = '#ff9f1c'; g.beginPath(); g.moveTo(x - 6, y + 10); g.lineTo(x, y + 20 + rand(0, 6)); g.lineTo(x + 6, y + 10); g.fill();
        g.fillStyle = '#4fd8ff'; g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x + 7, y - 2); g.lineTo(x + 19, y + 11); g.lineTo(x + 5, y + 8); g.lineTo(x, y + 13); g.lineTo(x - 5, y + 8); g.lineTo(x - 19, y + 11); g.lineTo(x - 7, y - 2); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - 2, 4, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#ffffff22'; g.fillRect(20, H - 12, W - 40, 5);
      g.fillStyle = s.hp > 50 ? '#5dffb0' : '#ff5d73'; g.fillRect(20, H - 12, (W - 40) * s.hp / 100, 5);
      fx.draw(g);
      if (s.banner > 0) {
        g.globalAlpha = Math.min(1, s.banner); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '900 38px system-ui, sans-serif';
        g.fillText(`WAVE ${s.wave}`, W / 2, H * 0.66); g.globalAlpha = 1;
      }
      if (s.flash > 0) { g.fillStyle = `rgba(255,60,90,${s.flash})`; g.fillRect(-10, -10, W + 20, H + 20); }
      g.restore();
    }

    const CONTROL = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'];
    scope.on(window, 'keydown', e => { if (!scope.paused && CONTROL.includes(e.code)) { keys.add(e.code); e.preventDefault(); } });
    scope.on(window, 'keyup', e => keys.delete(e.code));
    for (const btn of pad.children) {
      const k = btn.dataset.k;
      const set = on => { held[k] = on; btn.classList.toggle('held', on); };
      scope.on(btn, 'pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (x) {} set(true); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) scope.on(btn, t, () => set(false));
      scope.on(btn, 'contextmenu', e => e.preventDefault());
    }
    /* Drag anywhere on the field to steer (and fire). */
    scope.on(box, 'pointerdown', e => { if (scope.paused) return; try { box.setPointerCapture(e.pointerId); } catch (x) {} drag = { id: e.pointerId, target: view.point(e).x }; });
    scope.on(box, 'pointermove', e => { if (drag && drag.id === e.pointerId) drag.target = view.point(e).x; });
    for (const t of ['pointerup', 'pointercancel']) scope.on(box, t, e => { if (drag && drag.id === e.pointerId) drag = null; });

    nextWave();
    scope.loop(dt => { update(dt); draw(); });

    return {
      state: s,
      pause() { keys.clear(); drag = null; held.left = held.right = held.fire = false; for (const b of pad.children) b.classList.remove('held'); },
      result: () => ({ score: s.score, note: `Wave ${s.wave}, ${ctx.options.difficulty}` })
    };
  }

  GH.games.register({
    id: 'space-invaders', name: 'Space Invaders', accent: '#a98bff', music: 'invaders', bestLabel: 'High score',
    description: 'Hold the line against descending alien waves and hunt the bonus saucer.',
    howTo: 'Drag the field or use the buttons. Arrows or A/D move, Space fires.',
    controls: [['← → / A D', 'Move the ship'], ['Space', 'Fire'], ['Mouse / touch', 'Drag to steer and fire'], ['P / Esc', 'Pause'], ['Points', 'Scout 10, Fighter 20, Tank 30 (2 hits), Saucer 100']],
    options: [
      { key: 'difficulty', label: 'Difficulty', default: 'normal', choices: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
      { key: 'autofire', label: 'Auto-fire', default: 'off', choices: [['off', 'Off'], ['on', 'On']] }
    ],
    create
  });
})(window.GH);
