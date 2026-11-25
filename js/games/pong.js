/* Pong, solo paddle: keep the ball from falling past the bottom edge. */
(function (GH) {
  'use strict';
  const W = 400, H = 600, R = 8, PADDLE_Y = 556, PADDLE_H = 14, MAX_ANGLE = Math.PI / 3;
  const LEVELS = {
    easy:   { speed: 250, step: 7,  max: 470, width: 110, mult: 1 },
    medium: { speed: 310, step: 11, max: 600, width: 86,  mult: 2 },
    hard:   { speed: 380, step: 16, max: 740, width: 64,  mult: 3 }
  };

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
    const s = {
      score: 0, lives: 3, hits: 0, over: false, serve: 1.2, trail: [], glow: 0,
      paddle: { x: W / 2, w: level.width }, ball: { x: W / 2, y: 200, vx: 0, vy: 0 }, speed: level.speed
    };

    const hud = () => ctx.setHud([['Score', s.score], ['Hits', s.hits], ['Speed', (s.speed / level.speed).toFixed(1) + '×'], ['Lives', '●'.repeat(s.lives) || '0']]);

    function resetBall() {
      s.ball = { x: s.paddle.x, y: PADDLE_Y - R - 1, vx: 0, vy: 0 };
      s.trail = []; s.serve = 1.2;
    }
    function launch() {
      s.serve = 0;
      const v = bounceVelocity(rand(0.2, 0.6) * (Math.random() < 0.5 ? -1 : 1), s.speed);
      s.ball.vx = v.vx; s.ball.vy = v.vy;
    }

    function step(dt) {
      const b = s.ball, p = s.paddle, prevY = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < R) { b.x = 2 * R - b.x; b.vx = Math.abs(b.vx); wall(R, b.y); }
      if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -Math.abs(b.vx); wall(W - R, b.y); }
      if (b.y < R) { b.y = 2 * R - b.y; b.vy = Math.abs(b.vy); wall(b.x, R); }
      /* Paddle: test the crossing of its top face so a fast ball cannot tunnel through. */
      const face = PADDLE_Y - R;
      if (b.vy > 0 && prevY <= face && b.y >= face && Math.abs(b.x - p.x) <= p.w / 2 + R) {
        s.hits++;
        s.score += level.mult;
        s.speed = Math.min(level.max, level.speed + s.hits * level.step);
        const v = bounceVelocity((b.x - p.x) / (p.w / 2), s.speed);
        b.vx = v.vx; b.vy = v.vy; b.y = face;
        s.glow = 0.25;
        fx.burst(b.x, PADDLE_Y, '#3fffd0', 14, 160, 200);
        GH.audio.sfx('paddle'); vibrate(15);
        if (s.hits % 10 === 0) GH.audio.sfx('level');
        hud();
      }
      if (b.y > H + R) {
        s.lives--;
        fx.burst(b.x, H - 4, '#ff5d73', 30, 230);
        GH.audio.sfx('hurt'); vibrate(90);
        hud();
        if (s.lives <= 0) {
          s.over = true; draw();
          ctx.gameOver({ score: s.score, note: `${s.hits} hits, ${ctx.options.difficulty}`, lines: [`${s.hits} paddle hits on ${ctx.options.difficulty}.`] });
        } else {
          /* Ease off a little after a miss. */
          s.speed = Math.max(level.speed, s.speed - 5 * level.step);
          resetBall(); hud();
        }
      }
    }
    function wall(x, y) { fx.burst(x, y, '#ffffff', 6, 90); GH.audio.sfx('bounce'); }

    function update(dt) {
      if (s.over) return;
      const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      s.paddle.x = clamp(s.paddle.x + dir * 480 * dt, s.paddle.w / 2, W - s.paddle.w / 2);
      s.glow = Math.max(0, s.glow - dt);
      fx.update(dt);
      if (s.serve > 0) {
        s.ball.x = s.paddle.x;
        s.serve -= dt;
        if (s.serve <= 0) launch();
        return;
      }
      const n = Math.ceil(Math.hypot(s.ball.vx, s.ball.vy) * dt / (R * 0.8)) || 1;
      for (let i = 0; i < n && !s.over && s.serve === 0; i++) step(dt / n);
      if (s.serve === 0) { s.trail.push({ x: s.ball.x, y: s.ball.y }); if (s.trail.length > 12) s.trail.shift(); }
    }

    function draw() {
      if (!g || !s) return;
      g.fillStyle = '#071820'; g.fillRect(0, 0, W, H);
      g.strokeStyle = '#ffffff18'; g.lineWidth = 3; g.setLineDash([10, 12]);
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffffff10'; g.textAlign = 'center'; g.font = '900 150px system-ui, sans-serif'; g.fillText(String(s.score), W / 2, H / 2 - 40);
      if (GH.storage.settings.effects) s.trail.forEach((t, i) => {
        g.fillStyle = `rgba(63,255,208,${i / 30})`; g.beginPath(); g.arc(t.x, t.y, R * (i + 3) / 15, 0, Math.PI * 2); g.fill();
      });
      if (!s.over) { g.fillStyle = '#fff'; g.beginPath(); g.arc(s.ball.x, s.ball.y, R, 0, Math.PI * 2); g.fill(); }
      const p = s.paddle;
      g.shadowColor = '#3fffd0'; g.shadowBlur = 8 + s.glow * 90; g.fillStyle = '#3fffd0';
      g.beginPath();
      if (g.roundRect) g.roundRect(p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H, 7); else g.rect(p.x - p.w / 2, PADDLE_Y, p.w, PADDLE_H);
      g.fill(); g.shadowBlur = 0;
      fx.draw(g);
      if (s.serve > 0 && !s.over) { g.fillStyle = '#fff'; g.font = '700 20px system-ui, sans-serif'; g.fillText('Get ready · tap or press Space', W / 2, H * 0.68); }
    }

    const steer = e => { if (!scope.paused) s.paddle.x = clamp(view.point(e).x, s.paddle.w / 2, W - s.paddle.w / 2); };
    scope.on(stage, 'pointermove', steer);
    scope.on(stage, 'pointerdown', e => { try { stage.setPointerCapture(e.pointerId); } catch (x) {} steer(e); if (s.serve > 0 && s.serve < 0.9) launch(); });
    scope.on(window, 'keydown', e => {
      if (scope.paused) return;
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { keys.add(e.code); e.preventDefault(); }
      if (e.code === 'Space') { e.preventDefault(); if (s.serve > 0) launch(); }
    });
    scope.on(window, 'keyup', e => keys.delete(e.code));

    resetBall(); hud();
    scope.loop(dt => { update(dt); draw(); });

    return { state: s, pause() { keys.clear(); }, result: () => ({ score: s.score, note: `${s.hits} hits, ${ctx.options.difficulty}` }) };
  }

  GH.games.register({
    id: 'pong', name: 'Pong', accent: '#3fffd0', music: 'pong', bestLabel: 'High score',
    description: 'Angle every return with your paddle while the ball keeps getting faster.',
    howTo: 'Drag or move the mouse to steer the paddle. Arrows or A/D also work.',
    controls: [['Mouse / touch', 'Move or drag the paddle'], ['← → / A D', 'Move the paddle'], ['Space / tap', 'Serve early'], ['P / Esc', 'Pause'], ['Points', 'Per hit: Easy 1, Medium 2, Hard 3']],
    options: [{ key: 'difficulty', label: 'Difficulty', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] }],
    bounceVelocity,
    create
  });
})(window.GH);
