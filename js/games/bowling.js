/* Ten-pin bowling: physics on the real lane (metres), drawn in perspective. */
(function (GH) {
  'use strict';
  const HALF = 0.53, HEAD = 18.3, END = 19.7, BALL_R = 0.109, PIN_R = 0.06;
  const SPOTS = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) SPOTS.push([(i - row / 2) * 0.305, HEAD + row * 0.264]);

  /* Frames from the list of pins per roll, with strike and spare bonuses. */
  function frames(rolls) {
    const out = []; let i = 0, total = 0;
    for (let f = 0; f < 10 && i < rolls.length; f++) {
      const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
      let marks, value = null, used;
      if (f === 9) {
        used = rolls.length - i;
        marks = rolls.slice(i).map((v, k, l) => v === 10 ? 'X' : k && l[k - 1] !== 10 && l[k - 1] + v === 10 ? '/' : v || '-');
        const done = used === 3 || (used === 2 && a + b < 10);
        if (done) value = a + b + (c || 0);
      } else if (a === 10) { used = 1; marks = ['X']; if (c !== undefined) value = 10 + b + c; }
      else {
        used = 2; marks = [a || '-'];
        if (b !== undefined) { marks.push(a + b === 10 ? '/' : b || '-'); if (a + b < 10) value = a + b; else if (c !== undefined) value = 10 + c; }
      }
      if (value !== null) total += value;
      out.push({ marks, total: value === null ? null : total });
      i += used;
    }
    return { frames: out, total };
  }
  /* What happens after a roll: has the player's turn ended, and do the pins need resetting? */
  function turnState(rolls) {
    let i = 0;
    for (let f = 0; f < 9; f++) {
      if (i >= rolls.length) return { frame: f, ended: false };
      const size = rolls[i] === 10 ? 1 : 2;
      if (i + size >= rolls.length) { const ended = i + size === rolls.length; return { frame: f, ended, reset: ended }; }
      i += size;
    }
    const t = rolls.slice(i), n = t.length;
    const over = n === 3 || (n === 2 && t[0] + t[1] < 10);
    const reset = (n === 1 && t[0] === 10) || (n === 2 && (t[1] === 10 || (t[0] < 10 && t[0] + t[1] === 10)));
    return { frame: 9, ended: over, reset: over || reset, over };
  }

  function create(ctx) {
    const { scope, stage } = ctx;
    const { clamp, rand, vibrate } = GH.engine;
    const vsBot = ctx.options.mode === 'bot', level = ctx.options.difficulty;
    const box = document.createElement('div'); box.className = 'canvas-box'; stage.append(box);
    const view = GH.engine.createCanvas(scope, box, { width: 400, height: 600 }, () => draw());
    const g = view.g;
    const s = { rolls: [[], []], player: 0, phase: 'aim', ball: null, pins: [], cam: 0, time: 0, message: '', wait: 0, before: 10, over: false };
    let swipe = null, aimX = 0;

    const rack = () => { s.pins = SPOTS.map(([x, z]) => ({ x, z, vx: 0, vz: 0, down: false, fall: 0, dir: 0 })); };
    const standing = () => s.pins.filter(p => !p.down).length;
    const total = p => frames(s.rolls[p]).total;
    const note = () => vsBot ? `מול המחשב (${total(1)})` : 'משחק יחיד';
    function hud() {
      const t = turnState(s.rolls[s.player]);
      const frame = Math.min(10, t.ended && !t.over ? t.frame + 2 : t.frame + 1);
      ctx.setHud(vsBot ? [['אתם', total(0)], ['מחשב', total(1)], ['סיבוב', frame]] : [['ניקוד', total(0)], ['סיבוב', frame], ['פינים', standing()]]);
    }
    function ready() {
      s.phase = 'aim'; s.cam = 0; aimX = 0; s.ball = { x: 0, z: 0.3, vx: 0, vz: 0, hook: 0, roll: 0, gutter: false };
      if (s.player === 1) { s.phase = 'bot'; s.wait = 1.1; }
      hud();
    }
    function throwBall(x, speed, slope, hook) {
      if (s.phase !== 'aim' && s.phase !== 'bot') return;
      s.before = standing();
      s.ball = { x: clamp(x, -0.45, 0.45), z: 0.3, vz: speed, vx: slope * speed, hook, roll: 0, gutter: false };
      s.phase = 'roll'; s.wait = 0; s.message = '';
      GH.audio.sfx('bounce');
    }
    function botThrow() {
      const err = { easy: 0.2, medium: 0.09, hard: 0.035 }[level];
      const left = s.pins.filter(p => !p.down);
      /* Full rack: aim at the pocket beside the head pin; otherwise at the front remaining pin. */
      const target = left.length === 10 ? 0.075 : left.reduce((a, p) => a + p.x, 0) / left.length * 0.5 + left[0].x * 0.5;
      const start = rand(-0.15, 0.15), speed = rand(7.8, 8.8);
      throwBall(start, speed, (target + rand(-err, err) * 1.6 - start) / HEAD, 0);
    }

    /* Elastic collision between two discs of mass ma and mb. */
    function collide(a, b, ra, rb, ma, mb) {
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.001, gap = ra + rb - d;
      if (gap <= 0) return 0;
      const nx = dx / d, nz = dz / d;
      a.x -= nx * gap * mb / (ma + mb); a.z -= nz * gap * mb / (ma + mb);
      b.x += nx * gap * ma / (ma + mb); b.z += nz * gap * ma / (ma + mb);
      const v = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (v <= 0) return 0;
      const j = 1.65 * v / (1 / ma + 1 / mb);
      a.vx -= j * nx / ma; a.vz -= j * nz / ma; b.vx += j * nx / mb; b.vz += j * nz / mb;
      return v;
    }
    const knock = p => { if (!p.down && Math.hypot(p.vx, p.vz) > 0.3) { p.down = true; p.dir = Math.atan2(p.vx, p.vz); } };

    function physics(dt) {
      const b = s.ball;
      if (b.z < END + 0.4) {
        if (!b.gutter && Math.abs(b.x) > HALF) { b.gutter = true; b.x = Math.sign(b.x) * (HALF + 0.12); b.vx = 0; s.message = 'לתעלה!'; GH.audio.sfx('buzz'); }
        if (!b.gutter && b.z > 9) b.vx += b.hook * dt;
        b.x += b.vx * dt; b.z += b.vz * dt; b.roll += b.vz * dt / BALL_R;
      }
      let hit = 0;
      for (const p of s.pins) {
        if (!b.gutter && b.z < END) { const v = collide(b, p, BALL_R, p.down ? 0.08 : PIN_R, 6.5, 1.5); hit = Math.max(hit, v); knock(p); }
        p.x += p.vx * dt; p.z += p.vz * dt;
        const drag = Math.exp(-(p.down ? 3.5 : 9) * dt); p.vx *= drag; p.vz *= drag;
        if (p.down) p.fall = Math.min(1, p.fall + dt * 5);
        /* Side walls throw pins back across the deck. */
        if (Math.abs(p.x) > HALF + 0.12) { p.x = Math.sign(p.x) * (HALF + 0.12); p.vx *= -0.6; }
        p.z = Math.min(p.z, END + 0.25);
      }
      for (let i = 0; i < s.pins.length; i++) for (let j = i + 1; j < s.pins.length; j++) {
        const a = s.pins[i], c = s.pins[j];
        const v = collide(a, c, a.down ? 0.08 : PIN_R, c.down ? 0.08 : PIN_R, 1.5, 1.5);
        if (v) { knock(a); knock(c); hit = Math.max(hit, v * 0.6); }
      }
      if (hit > 0.8) { GH.audio.sfx(hit > 3 ? 'explode' : 'hit'); vibrate(25); }
    }

    function finishRoll() {
      const fallen = s.before - standing(), mine = s.rolls[s.player];
      mine.push(fallen);
      const t = turnState(mine);
      const strike = fallen === 10, spare = !strike && s.before < 10 && standing() === 0;
      s.message = strike ? 'סטרייק! 🎳' : spare ? 'ספייר!' : fallen ? `${fallen} פינים` : s.ball.gutter ? 'לתעלה!' : 'החטאה';
      if (strike || spare) GH.audio.sfx('win');
      s.phase = 'show'; s.wait = 1.7; s.next = t; hud();
    }
    function advance() {
      const t = s.next;
      if (t.reset) rack(); else s.pins = s.pins.filter(p => !p.down);
      if (t.ended) {
        const done = s.player === (vsBot ? 1 : 0) && t.over;
        if (done) {
          s.over = true; s.phase = 'done';
          const me = total(0), bot = total(1);
          ctx.gameOver({ score: me, note: note(), title: vsBot ? (me > bot ? 'ניצחתם!' : me < bot ? 'המחשב ניצח' : 'תיקו') : 'המשחק נגמר', lines: vsBot ? [`המחשב: ${bot}`] : [] });
          return;
        }
        if (vsBot) s.player = 1 - s.player;
        rack();
      }
      s.message = ''; ready();
    }

    function update(dt) {
      if (s.over) return;
      s.time += dt;
      if (s.phase === 'bot') { s.wait -= dt; if (s.wait <= 0) botThrow(); }
      else if (s.phase === 'aim') s.ball.x = aimX;
      else if (s.phase === 'roll') {
        for (let i = 0; i < 6; i++) physics(dt / 6);
        s.wait += dt;
        s.cam += (clamp(s.ball.z - 4, 0, 12.5) - s.cam) * Math.min(1, dt * 6);
        const quiet = s.pins.every(p => Math.hypot(p.vx, p.vz) < 0.15);
        if ((s.ball.z >= END && quiet && s.wait > 1) || s.wait > 7) finishRoll();
      } else if (s.phase === 'show') { s.wait -= dt; if (s.wait <= 0) advance(); }
    }

    const scale = z => 1700 / (Math.max(z - s.cam, -2) + 6);
    const screen = (x, z) => { const k = scale(z); return { x: 200 + x * k, y: 125 + 1.55 * k, k }; };
    function quad(x1, x2, z1, z2, color) {
      const a = screen(x1, z1), b = screen(x2, z1), c = screen(x2, z2), d = screen(x1, z2);
      g.fillStyle = color; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.fill();
    }
    function drawPin(p) {
      const at = screen(p.x, p.z), k = at.k;
      g.save(); g.translate(at.x, at.y);
      g.fillStyle = '#0005'; g.beginPath(); g.ellipse(0, 0, k * 0.075, k * 0.025, 0, 0, 7); g.fill();
      if (p.down) g.rotate((Math.sin(p.dir) >= 0 ? 1 : -1) * p.fall * 1.45);
      g.scale(k * 0.38, k * 0.38);
      const shade = g.createLinearGradient(-0.17, 0, 0.17, 0); shade.addColorStop(0, '#c9c9d4'); shade.addColorStop(0.35, '#fff'); shade.addColorStop(1, '#9c9cb0');
      g.fillStyle = shade; g.beginPath(); g.moveTo(-0.08, 0); g.bezierCurveTo(-0.24, -0.28, -0.17, -0.45, -0.07, -0.64); g.bezierCurveTo(-0.04, -0.74, -0.14, -0.82, -0.11, -0.9); g.bezierCurveTo(-0.08, -1.03, 0.08, -1.03, 0.11, -0.9); g.bezierCurveTo(0.14, -0.82, 0.04, -0.74, 0.07, -0.64); g.bezierCurveTo(0.17, -0.45, 0.24, -0.28, 0.08, 0); g.fill();
      g.fillStyle = '#d7192d'; g.fillRect(-0.075, -0.73, 0.15, 0.035); g.fillRect(-0.068, -0.66, 0.136, 0.035);
      g.restore();
    }
    function drawBall() {
      const b = s.ball, at = screen(b.x, b.z), r = BALL_R * at.k;
      if (b.z > END || b.z - s.cam < -1) return;
      g.fillStyle = '#0006'; g.beginPath(); g.ellipse(at.x, at.y, r, r * 0.35, 0, 0, 7); g.fill();
      const grad = g.createRadialGradient(at.x - r * 0.4, at.y - r * 1.4, r * 0.1, at.x, at.y - r, r);
      grad.addColorStop(0, s.player ? '#ff9a9a' : '#8fc4ff'); grad.addColorStop(0.5, s.player ? '#c3182a' : '#1d5fd6'); grad.addColorStop(1, '#070a1a');
      g.fillStyle = grad; g.beginPath(); g.arc(at.x, at.y - r, r, 0, 7); g.fill();
      g.fillStyle = '#05070f';
      for (const [dx, off] of [[-0.22, 0], [0.16, 0.2], [0.05, 0.75]]) {
        const a = b.roll + off;
        if (Math.cos(a) > 0) { g.beginPath(); g.ellipse(at.x + dx * r, at.y - r - Math.sin(a) * r * 0.75, r * 0.1, r * 0.1 * Math.cos(a), 0, 0, 7); g.fill(); }
      }
    }
    function drawCard() {
      const p = s.player, f = frames(s.rolls[p]).frames;
      g.direction = 'ltr'; g.textAlign = 'center';
      for (let i = 0; i < 10; i++) {
        const x = 2 + i * 39.6;
        g.fillStyle = i === turnState(s.rolls[p]).frame ? '#33417e' : '#141935'; g.fillRect(x, 3, 38, 44);
        if (!f[i]) { g.fillStyle = '#fff6'; g.font = '11px system-ui'; g.fillText(i + 1, x + 19, 29); continue; }
        g.fillStyle = '#ffe15e'; g.font = '700 12px system-ui'; g.fillText(f[i].marks.join(' '), x + 19, 18);
        g.fillStyle = '#fff'; g.font = '800 14px system-ui'; g.fillText(f[i].total === null ? '' : f[i].total, x + 19, 39);
      }
    }
    function draw() {
      if (!g || !s || !s.ball) return;
      g.fillStyle = '#0a0b1c'; g.fillRect(0, 0, 400, 600);
      const far = END + 0.3, near = s.cam - 1.5;
      quad(-HALF - 0.24, HALF + 0.24, near, far, '#1b1f2e');
      quad(-HALF, HALF, near, far, '#d9a55b');
      for (let i = 0; i < 9; i++) quad(-HALF + i * HALF * 2 / 9, -HALF + (i + 0.5) * HALF * 2 / 9, near, far, '#c9924a');
      quad(-HALF, HALF, HEAD - 0.5, far, '#f0d9a8');
      if (s.cam < 4) for (let i = -2; i <= 2; i++) quad(i * 0.18 - 0.025, i * 0.18 + 0.025, 4.6 - Math.abs(i) * 0.35, 5.2 - Math.abs(i) * 0.35, '#7a3b16');
      const back = screen(0, far);
      g.fillStyle = '#05060d'; g.fillRect(back.x - back.k * 0.8, back.y - back.k * 0.9, back.k * 1.6, back.k * 0.35);
      const things = s.pins.map(p => ({ z: p.z, draw: () => drawPin(p) }));
      things.push({ z: s.ball.z, draw: drawBall });
      things.sort((a, b) => b.z - a.z).forEach(t => t.draw());
      drawCard();
      g.direction = 'rtl'; g.textAlign = 'center';
      /* Top view of the standing pins. */
      for (const p of s.pins) if (!p.down) { g.fillStyle = '#fff'; g.beginPath(); g.arc(362 + p.x * 55, 106 - (p.z - HEAD) * 50, 4.5, 0, 7); g.fill(); }
      g.fillStyle = s.player ? '#ff8a8a' : '#8fc4ff'; g.font = '800 17px system-ui';
      if (vsBot) g.fillText(s.player ? 'תור המחשב' : 'התור שלכם', 62, 75);
      if (s.message) { g.font = '900 38px system-ui'; g.lineWidth = 6; g.strokeStyle = '#000b'; g.strokeText(s.message, 200, 300); g.fillStyle = '#ffe15e'; g.fillText(s.message, 200, 300); }
      if (s.phase === 'aim') { g.fillStyle = '#fff'; g.font = '700 15px system-ui'; g.strokeStyle = '#000a'; g.lineWidth = 4; const t = 'גררו לצדדים למיקום · החליקו למעלה לזריקה'; g.strokeText(t, 200, 590); g.fillText(t, 200, 590); }
      if (swipe && swipe.path.length > 1) { g.strokeStyle = '#fff9'; g.lineWidth = 3; g.beginPath(); swipe.path.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p.x, p.y)); g.stroke(); }
    }

    const toLane = x => clamp((x - 200) / screen(0, 0.3).k, -0.45, 0.45);
    scope.on(box, 'pointerdown', e => {
      if (scope.paused || s.phase !== 'aim') return;
      try { box.setPointerCapture(e.pointerId); } catch (x) {}
      const p = view.point(e); aimX = toLane(p.x);
      swipe = { id: e.pointerId, path: [{ x: p.x, y: p.y, t: e.timeStamp }] };
    });
    scope.on(box, 'pointermove', e => {
      if (!swipe || swipe.id !== e.pointerId || s.phase !== 'aim') return;
      const p = view.point(e), first = swipe.path[0];
      /* Sideways movement positions the ball; once the finger moves up it becomes a throw. */
      if (first.y - p.y < 18) { aimX = toLane(p.x); swipe.path = [{ x: p.x, y: p.y, t: e.timeStamp }]; }
      else swipe.path.push({ x: p.x, y: p.y, t: e.timeStamp });
    });
    scope.on(box, 'pointerup', e => {
      if (!swipe || swipe.id !== e.pointerId) return;
      const path = swipe.path; swipe = null;
      const a = path[0], b = path[path.length - 1], up = a.y - b.y;
      if (s.phase !== 'aim' || up < 50) return;
      const speed = clamp(5 + up / Math.max(60, b.t - a.t) * 3.2, 5.5, 11);
      /* A bent swipe adds spin: the ball curves back the opposite way to the bulge. */
      const mid = path[Math.floor(path.length / 2)], t = (a.y - mid.y) / up;
      const bulge = mid.x - (a.x + (b.x - a.x) * t);
      throwBall(aimX, speed, clamp((b.x - a.x) / up * 0.06, -0.07, 0.07), clamp(-bulge * 0.02, -0.6, 0.6));
    });
    scope.on(box, 'pointercancel', () => (swipe = null));
    scope.on(window, 'keydown', e => {
      if (scope.paused || s.phase !== 'aim') return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); aimX = clamp(aimX + (e.code === 'ArrowLeft' ? -0.03 : 0.03), -0.45, 0.45); }
      if (e.code === 'Space') { e.preventDefault(); throwBall(aimX, 8.5, rand(-0.002, 0.002), 0); }
    });

    rack(); ready();
    scope.loop(dt => { update(dt); draw(); });
    return { state: s, throwBall, pause() { swipe = null; }, result: () => ({ score: total(0), note: note() }) };
  }

  GH.games.register({
    id: 'bowling', name: 'באולינג', accent: '#ffb23e', music: null, bestLabel: 'שיא',
    description: 'עשרה פינים, עשרה סיבובים. כוונו, החליקו וסובבו את הכדור לסטרייק.',
    howTo: 'גררו לצדדים כדי למקם את הכדור, והחליקו למעלה לזריקה. החלקה מהירה = כדור חזק. החלקה מעוקלת = סיבוב.',
    controls: [['החלקה למעלה', 'זריקה; הכיוון קובע את הכוונון'], ['גרירה לצדדים', 'מיקום הכדור'], ['← → / רווח', 'מיקום וזריקה'], ['ניקוד', 'לפי חוקי הבאולינג: סטרייק וספייר מזכים בבונוס']],
    options: [
      { key: 'mode', label: 'מצב', default: 'solo', choices: [['solo', 'לבד'], ['bot', 'נגד המחשב']] },
      { key: 'difficulty', label: 'רמת המחשב', default: 'medium', choices: [['easy', 'קל'], ['medium', 'בינוני'], ['hard', 'קשה']] }
    ],
    logic: { frames, turnState },
    create
  });
})(window.GH);
