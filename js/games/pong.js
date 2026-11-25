/* Pong, solo paddle: keep the ball from falling past the bottom edge. */
(function (GH) {
  'use strict';
  const W = 400, H = 600, R = 8, PADDLE_Y = 556, PADDLE_H = 14, MAX_ANGLE = Math.PI / 3;
  const LEVELS = {
    easy:   { speed: 250, step: 7,  max: 470, width: 110, mult: 1 },
    medium: { speed: 310, step: 11, max: 600, width: 86,  mult: 2 },
    hard:   { speed: 380, step: 16, max: 740, width: 64,  mult: 3 }
  };

  /* Power-up bubbles. time = how long the effect lasts (seconds); weight = how often it appears. */
  const POWERS = {
    multi:  { icon: '●●●', name: 'שלושה כדורים', color: '#ffffff', weight: 3 },
    slow:   { icon: '🐢', name: 'הילוך איטי', color: '#6ab7ff', weight: 2, time: 7 },
    turbo:  { icon: '⚡', name: 'טורבו, נקודות כפולות', color: '#ff9f1c', weight: 2, time: 7 },
    wide:   { icon: '↔', name: 'מחבט ענק', color: '#3fffd0', weight: 3, time: 9 },
    double: { icon: '×2', name: 'ניקוד כפול', color: '#ffe15e', weight: 2, time: 10 },
    shield: { icon: '🛡', name: 'מגן תחתון', color: '#b58cff', weight: 2 },
    life:   { icon: '♥', name: 'חיים נוספים', color: '#ff5d8f', weight: 1 },
    gift:   { icon: '★', name: 'מתנה: נקודות', color: '#7dff6a', weight: 2 }
  };
  const MAX_BALLS = 5, MAX_LIVES = 5, BUBBLE_R = 28, BUBBLE_TAP = 38, BUBBLE_LIFE = 2.2, MAX_BUBBLES = 3, FIRST_BUBBLE = 2;
  const bubbleGap = () => 1.2 + Math.random() * 1.6;

  /* hit: -1 (left tip) .. 1 (right tip). The further from the centre, the flatter the bounce. */
  function bounceVelocity(hit, speed) {
    const a = Math.max(-1, Math.min(1, hit)) * MAX_ANGLE;
    return { vx: Math.sin(a) * speed, vy: -Math.cos(a) * speed };
  }

  function create(ctx) {
    const { scope, stage } = ctx;
    const { clamp, rand, vibrate } = GH.engine;
    const level = LEVELS[ctx.options.difficulty];
    const fx = GH.engine.particles();
    const keys = new Set();
    const box = document.createElement('div');
    box.className = 'canvas-box';
    stage.append(box);
    const view = GH.engine.createCanvas(scope, box, { width: W, height: H }, () => draw());
    const g = view.g;
    const bonuses = ctx.options.bonus === 'on';
    const s = {
      score: 0, lives: 3, hits: 0, over: false, serve: 1.2, glow: 0, time: 0,
      paddle: { x: W / 2, w: level.width }, balls: [], speed: level.speed,
      bubbles: [], nextBubble: FIRST_BUBBLE, effects: {}, shield: false, texts: []
    };
    /* Pointers that pressed a bubble: they must not drag the paddle along. */
    const tapping = new Set();

    const factor = () => (s.effects.slow ? 0.65 : 1) * (s.effects.turbo ? 1.35 : 1);
    const multiplier = () => (s.effects.double ? 2 : 1) * (s.effects.turbo ? 2 : 1);
    const hud = () => ctx.setHud([['ניקוד', s.score], ['פגיעות', s.hits], ['מהירות', (s.speed * factor() / level.speed).toFixed(1) + '×'], ['חיים', '●'.repeat(s.lives) || '0']]);
    const note = () => `${s.hits} פגיעות, ${{ easy: 'קל', medium: 'בינוני', hard: 'קשה' }[ctx.options.difficulty]}`;
    const say = (x, y, text, color) => s.texts.push({ x: clamp(x, 110, W - 110), y, text, color, age: 0 });

    function sizePaddle() {
      s.paddle.w = level.width * (s.effects.wide ? 1.6 : 1);
      s.paddle.x = clamp(s.paddle.x, s.paddle.w / 2, W - s.paddle.w / 2);
    }

    function resetBall() {
      s.balls = [{ x: s.paddle.x, y: PADDLE_Y - R - 1, vx: 0, vy: 0, trail: [] }];
      s.serve = 1.2;
    }
    function launch() {
      s.serve = 0;
      const v = bounceVelocity(rand(0.2, 0.6) * (Math.random() < 0.5 ? -1 : 1), s.speed);
      Object.assign(s.balls[0], v);
    }

    function spawnBubble(kind) {
      if (!kind) {
        /* Skip bonuses that would do nothing right now. */
        const useful = Object.keys(POWERS).filter(k => !(k === 'life' && s.lives >= MAX_LIVES) && !(k === 'shield' && s.shield) && !(k === 'multi' && s.balls.length >= MAX_BALLS));
        let roll = Math.random() * useful.reduce((n, k) => n + POWERS[k].weight, 0);
        kind = useful.find(k => (roll -= POWERS[k].weight) < 0) || useful[0];
      }
      let x, y, tries = 0;
      do { x = rand(50, W - 50); y = rand(90, 400); } while (++tries < 12 && s.bubbles.some(b => Math.hypot(b.x - x, b.y - y) < 90));
      s.bubbles.push({ kind, x, y, age: 0 });
      GH.audio.sfx('place');
    }

    function collect(bubble) {
      s.bubbles = s.bubbles.filter(b => b !== bubble);
      const kind = bubble.kind, power = POWERS[kind];
      let label = power.name;
      if (power.time) {
        s.effects[kind] = power.time;
        if (kind === 'slow') delete s.effects.turbo;
        if (kind === 'turbo') delete s.effects.slow;
      }
      if (kind === 'wide') sizePaddle();
      if (kind === 'shield') s.shield = true;
      if (kind === 'life') s.lives = Math.min(MAX_LIVES, s.lives + 1);
      if (kind === 'gift') { const points = 10 * level.mult; s.score += points; label = `מתנה: ${points} נקודות`; }
      if (kind === 'multi') {
        const from = s.balls[0];
        for (const side of [-0.7, 0.7]) {
          if (s.balls.length >= MAX_BALLS) break;
          /* New balls always start upward so there is time to react. */
          s.balls.push(Object.assign({ x: from.x, y: Math.min(from.y, PADDLE_Y - 60), trail: [] }, bounceVelocity(side, s.speed)));
        }
      }
      fx.burst(bubble.x, bubble.y, power.color, 28, 220);
      say(bubble.x, bubble.y, label, power.color);
      GH.audio.sfx('combo'); vibrate(30);
      hud();
    }

    function updateBonuses(dt) {
      let changed = false;
      for (const k of Object.keys(s.effects)) {
        s.effects[k] -= dt;
        if (s.effects[k] <= 0) { delete s.effects[k]; changed = true; if (k === 'wide') sizePaddle(); }
      }
      if (changed) hud();
      for (const b of s.bubbles) b.age += dt;
      s.bubbles = s.bubbles.filter(b => b.age < BUBBLE_LIFE);
      if (!bonuses) return;
      s.nextBubble -= dt;
      if (s.nextBubble <= 0 && s.bubbles.length < MAX_BUBBLES) { spawnBubble(); s.nextBubble = bubbleGap(); }
    }

    function step(ball, dt) {
      const p = s.paddle, prevY = ball.y;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < R) { ball.x = 2 * R - ball.x; ball.vx = Math.abs(ball.vx); wall(R, ball.y); }
      if (ball.x > W - R) { ball.x = 2 * (W - R) - ball.x; ball.vx = -Math.abs(ball.vx); wall(W - R, ball.y); }
      if (ball.y < R) { ball.y = 2 * R - ball.y; ball.vy = Math.abs(ball.vy); wall(ball.x, R); }
      /* Paddle: test the crossing of its top face so a fast ball cannot tunnel through. */
      const face = PADDLE_Y - R;
      if (ball.vy > 0 && prevY <= face && ball.y >= face && Math.abs(ball.x - p.x) <= p.w / 2 + R) {
        s.hits++;
        s.score += level.mult * multiplier();
        s.speed = Math.min(level.max, level.speed + s.hits * level.step);
        const v = bounceVelocity((ball.x - p.x) / (p.w / 2), s.speed);
        ball.vx = v.vx; ball.vy = v.vy; ball.y = face;
        s.glow = 0.25;
        fx.burst(ball.x, PADDLE_Y, '#3fffd0', 14, 160, 200);
        GH.audio.sfx('paddle'); vibrate(15);
        if (s.hits % 10 === 0) GH.audio.sfx('level');
        hud();
      }
      if (s.shield && ball.vy > 0 && ball.y > H - 14) {
        s.shield = false;
        ball.y = H - 14; ball.vy = -Math.abs(ball.vy);
        say(ball.x, H - 70, 'המגן הציל אתכם!', POWERS.shield.color);
        fx.burst(ball.x, H - 8, POWERS.shield.color, 26, 220);
        GH.audio.sfx('level');
      }
      if (ball.y > H + R) { ball.lost = true; fx.burst(ball.x, H - 4, '#ff5d73', 30, 230); }
    }
    function wall(x, y) { fx.burst(x, y, '#ffffff', 6, 90); GH.audio.sfx('bounce'); }

    function loseLife() {
      s.lives--;
      GH.audio.sfx('hurt'); vibrate(90);
      s.effects = {}; s.bubbles = []; s.shield = false; sizePaddle();
      if (s.lives <= 0) {
        s.over = true; hud(); draw();
        ctx.gameOver({ score: s.score, note: note(), lines: [`פגיעות במחבט: ${s.hits}`] });
      } else {
        /* Ease off a little after a miss. */
        s.speed = Math.max(level.speed, s.speed - 5 * level.step);
        resetBall(); s.nextBubble = Math.max(s.nextBubble, 1); hud();
      }
    }

    function update(dt) {
      if (s.over) return;
      s.time += dt;
      const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      s.paddle.x = clamp(s.paddle.x + dir * 480 * dt, s.paddle.w / 2, W - s.paddle.w / 2);
      s.glow = Math.max(0, s.glow - dt);
      fx.update(dt);
      for (const t of s.texts) { t.age += dt; t.y -= 30 * dt; }
      s.texts = s.texts.filter(t => t.age < 1.3);
      if (s.serve > 0) {
        s.balls[0].x = s.paddle.x;
        s.serve -= dt;
        if (s.serve <= 0) launch();
        return;
      }
      updateBonuses(dt);
      const move = dt * factor();
      for (const ball of s.balls) {
        const n = Math.ceil(Math.hypot(ball.vx, ball.vy) * move / (R * 0.8)) || 1;
        for (let i = 0; i < n && !ball.lost; i++) step(ball, move / n);
        ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 12) ball.trail.shift();
      }
      s.balls = s.balls.filter(b => !b.lost);
      if (!s.balls.length) loseLife();
    }

    function drawBubble(b) {
      const power = POWERS[b.kind], left = 1 - b.age / BUBBLE_LIFE;
      const pop = Math.min(1, b.age * 6) * (1 + Math.sin(s.time * 9) * 0.06);
      g.save(); g.translate(b.x, b.y); g.scale(pop, pop);
      g.shadowColor = power.color; g.shadowBlur = 18;
      g.fillStyle = '#10222e'; g.beginPath(); g.arc(0, 0, BUBBLE_R, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      /* The ring is the time left to catch it. */
      g.strokeStyle = power.color; g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, BUBBLE_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); g.stroke();
      g.fillStyle = power.color; g.direction = 'ltr'; g.textBaseline = 'middle';
      g.font = `900 ${b.kind === 'multi' ? 14 : 24}px system-ui, sans-serif`; g.fillText(power.icon, 0, 2);
      g.direction = 'rtl'; g.fillStyle = '#fff'; g.font = '700 13px system-ui, sans-serif';
      g.fillText(power.name.split(/[,:]/)[0], 0, BUBBLE_R + 14);
      g.textBaseline = 'alphabetic';
      g.restore();
    }

    function draw() {
      if (!g || !s) return;
      g.fillStyle = '#071820'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#ffffff18'; g.lineWidth = 3; g.setLineDash([10, 12]);
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
      g.textAlign = 'center'; g.direction = 'ltr';
      g.fillStyle = '#ffffff10'; g.font = '900 150px system-ui, sans-serif'; g.fillText(String(s.score), W / 2, H / 2 - 40);
      for (const ball of s.balls) {
        if (GH.storage.settings.effects) ball.trail.forEach((t, i) => {
          g.fillStyle = s.effects.turbo ? `rgba(255,159,28,${i / 24})` : `rgba(63,255,208,${i / 30})`;
          g.beginPath(); g.arc(t.x, t.y, R * (i + 3) / 15, 0, Math.PI * 2); g.fill();
        });
        if (!s.over) { g.fillStyle = '#fff'; g.beginPath(); g.arc(ball.x, ball.y, R, 0, Math.PI * 2); g.fill(); }
      }
      if (s.shield) { g.fillStyle = POWERS.shield.color; g.globalAlpha = 0.65 + Math.sin(s.time * 6) * 0.25; g.fillRect(6, H - 8, W - 12, 5); g.globalAlpha = 1; }
      const p = s.paddle;
      g.shadowColor = '#3fffd0'; g.shadowBlur = 8 + s.glow * 90; g.fillStyle = '#3fffd0';
      g.beginPath();
      if (g.roundRect) g.roundRect(p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H, 7); else g.rect(p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H);
      g.fill(); g.shadowBlur = 0;
      fx.draw(g);
      s.bubbles.forEach(drawBubble);
      /* Active effects and their remaining seconds. */
      g.direction = 'rtl'; g.font = '700 15px system-ui, sans-serif';
      Object.entries(s.effects).forEach(([k, left], i) => {
        g.fillStyle = POWERS[k].color; g.fillText(`${POWERS[k].name.split(',')[0]} · ${Math.ceil(left)}`, W / 2, 28 + i * 20);
      });
      g.font = '900 22px system-ui, sans-serif';
      for (const t of s.texts) { g.globalAlpha = Math.max(0, 1 - t.age / 1.3); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y); }
      g.globalAlpha = 1;
      if (s.serve > 0 && !s.over) { g.fillStyle = '#fff'; g.font = '700 20px system-ui, sans-serif'; g.fillText('היכונו · הקישו או לחצו רווח', W / 2, H * 0.68); }
    }

    const steer = e => { if (!scope.paused && !tapping.has(e.pointerId)) s.paddle.x = clamp(view.point(e).x, s.paddle.w / 2, W - s.paddle.w / 2); };
    scope.on(stage, 'pointermove', steer);
    scope.on(stage, 'pointerdown', e => {
      if (scope.paused || s.over) return;
      const at = view.point(e);
      const bubble = s.bubbles.find(b => Math.hypot(b.x - at.x, b.y - at.y) <= BUBBLE_TAP);
      if (bubble) { e.preventDefault(); tapping.add(e.pointerId); collect(bubble); return; }
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      steer(e); if (s.serve > 0 && s.serve < 0.9) launch();
    });
    for (const type of ['pointerup', 'pointercancel']) scope.on(window, type, e => tapping.delete(e.pointerId));
    scope.on(window, 'keydown', e => {
      if (scope.paused) return;
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
      if (e.code === 'Space') { e.preventDefault(); if (s.serve > 0) launch(); }
    });
    scope.on(window, 'keyup', e => keys.delete(e.code));

    resetBall(); hud();
    scope.loop(dt => { update(dt); draw(); });

    return { state: s, spawnBubble, pause() { keys.clear(); tapping.clear(); }, result: () => ({ score: s.score, note: note() }) };
  }

  GH.games.register({
    id: 'pong', name: 'פונג', accent: '#3fffd0', music: 'pong', bestLabel: 'שיא',
    description: 'החזירו את הכדור, תפסו בועות בונוס ושרדו כשהקצב מאיץ.',
    howTo: 'גררו או הזיזו את העכבר כדי להזיז את המחבט. אפשר גם בחצים או ב-A/D. לחצו מהר על בועות בונוס לפני שייעלמו.',
    controls: [['עכבר / מגע', 'הזזה או גרירה של המחבט'], ['← → / A D', 'הזזת המחבט'], ['רווח / הקשה', 'הגשה מיידית'], ['בועות בונוס', 'לחיצה עליהן מפעילה כוח: כדורים נוספים, איטי, טורבו, מחבט ענק, ניקוד כפול, מגן, חיים או מתנה'], ['P / Esc', 'השהיה'], ['נקודות', 'לכל פגיעה: קל 1, בינוני 2, קשה 3']],
    options: [{ key: 'difficulty', label: 'רמת קושי', default: 'medium', choices: [['easy', 'קל'], ['medium', 'בינוני'], ['hard', 'קשה']] },
      { key: 'bonus', label: 'בועות בונוס', default: 'on', choices: [['on', 'פעיל'], ['off', 'כבוי']] }],
    bounceVelocity,
    create
  });
})(window.GH);
