/* Connect Four on a 7x6 board. Row 0 is the top. 1 = you (yellow), 2 = opponent (red). */
(function (GH) {
  'use strict';
  const C = 7, R = 6, ORDER = [3, 2, 4, 1, 5, 0, 6];
  const dropRow = (b, c) => { for (let r = R - 1; r >= 0; r--) if (!b[r * C + c]) return r; return -1; };
  const WINDOWS = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++)
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + 3 * dr, ec = c + 3 * dc;
      if (er < R && ec >= 0 && ec < C) WINDOWS.push([0, 1, 2, 3].map(i => (r + i * dr) * C + c + i * dc));
    }
  const winLine = b => WINDOWS.find(w => b[w[0]] && w.every(i => b[i] === b[w[0]])) || null;
  function score(b, p) {
    let s = 0;
    for (const w of WINDOWS) {
      let mine = 0, theirs = 0;
      for (const i of w) { if (b[i] === p) mine++; else if (b[i]) theirs++; }
      if (!theirs) s += [0, 1, 6, 40, 0][mine]; else if (!mine) s -= [0, 1, 6, 50, 0][theirs];
    }
    for (let r = 0; r < R; r++) if (b[r * C + 3]) s += b[r * C + 3] === p ? 4 : -4;
    return s;
  }
  function search(b, p, depth, alpha, beta) {
    let best = -Infinity, any = false;
    for (const c of ORDER) {
      const r = dropRow(b, c); if (r < 0) continue;
      any = true; b[r * C + c] = p;
      const v = winLine(b) ? 100000 + depth : depth <= 1 ? score(b, p) : -search(b, 3 - p, depth - 1, -beta, -alpha);
      b[r * C + c] = 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return any ? best : 0;
  }
  function chooseMove(board, p, level) {
    const b = board.slice(), free = ORDER.filter(c => dropRow(b, c) >= 0);
    const pick = l => l[Math.floor(Math.random() * l.length)];
    for (const q of [p, 3 - p]) {
      const c = free.find(col => { const i = dropRow(b, col) * C + col; b[i] = q; const w = winLine(b); b[i] = 0; return w; });
      if (c !== undefined && (level !== 'easy' || q === p || Math.random() < 0.6)) return c;
    }
    if (level === 'easy') return pick(free);
    const depth = level === 'hard' ? 7 : 3;
    const rated = free.map(c => { const i = dropRow(b, c) * C + c; b[i] = p; const v = -search(b, 3 - p, depth - 1, -Infinity, Infinity); b[i] = 0; return [c, v]; });
    const top = Math.max(...rated.map(x => x[1]));
    return pick(rated.filter(x => x[1] === top).map(x => x[0]));
  }

  function create(ctx) {
    const { scope, stage } = ctx;
    const two = ctx.options.mode === 'two', level = ctx.options.difficulty;
    const names = two ? { 1: 'שחקן צהוב', 2: 'שחקן אדום' } : { 1: 'אתם', 2: 'המחשב' };
    stage.innerHTML = `<div class="c4"><div class="c4-side top" data-p="2"><i></i><span></span></div><div class="c4-mid"><div class="c4-board" dir="ltr">${Array.from({ length: C }, (_, c) => `<button type="button" class="c4-col" aria-label="עמודה ${c + 1}">${'<b></b>'.repeat(R)}</button>`).join('')}</div></div><div class="c4-side bottom" data-p="1"><i></i><span></span><button type="button" class="btn" data-a="new">משחק חדש</button></div></div>`;
    const cols = [...stage.querySelectorAll('.c4-col')], sides = [...stage.querySelectorAll('.c4-side')];
    const wins = { 1: 0, 2: 0 };
    let streak = 0;
    const s = { board: [], turn: 1, over: false, busy: false, round: 0, timers: [] };
    const later = (ms, fn) => s.timers.push(scope.wait(ms, fn));
    const hud = () => ctx.setHud(two ? [['צהוב', wins[1]], ['אדום', wins[2]]] : [['ניצחונות', wins[1]], ['הפסדים', wins[2]], ['רצף', streak]]);

    function sidesUpdate(message) {
      for (const el of sides) {
        const p = Number(el.dataset.p), active = (!s.over || !!winLine(s.board)) && s.turn === p;
        el.classList.toggle('done', s.over);
        el.classList.toggle('active', active);
        el.querySelector('span').textContent = message && p === 1 ? message : active && !s.over ? (two ? `התור של ${names[p]}` : p === 1 ? 'התור שלכם' : 'המחשב חושב…') : names[p];
      }
    }
    const board = stage.querySelector('.c4-board'), mid = stage.querySelector('.c4-mid');
    const clearWin = () => { board.classList.remove('won'); stage.querySelectorAll('.c4-line, .c4-confetti').forEach(x => x.remove()); };

    /* A light beam through the four winning discs, plus confetti when a person wins. */
    function celebrate(line, party) {
      board.classList.add('won');
      const box = board.getBoundingClientRect();
      const centre = i => { const r = cols[i % C].children[Math.floor(i / C)].getBoundingClientRect(); return [r.x + r.width / 2 - box.x, r.y + r.height / 2 - box.y]; };
      const [x1, y1] = centre(line[0]), [x2, y2] = centre(line[3]);
      board.insertAdjacentHTML('beforeend', `<svg class="c4-line" viewBox="0 0 ${box.width} ${box.height}" aria-hidden="true"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" pathLength="1"/></svg>`);
      if (!party || !GH.storage.settings.effects) return;
      const colors = ['#ffd21f', '#ff3b55', '#2f7dff', '#3fffd0', '#fff'];
      for (let i = 0; i < 70; i++) {
        const bit = document.createElement('em');
        bit.className = 'c4-confetti';
        bit.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * 0.7}s;animation-duration:${1.4 + Math.random() * 1.4}s;--drift:${Math.random() * 120 - 60}px`;
        mid.append(bit);
      }
    }

    function newRound() {
      clearWin();
      s.timers.forEach(t => scope.cancel(t)); s.timers = [];
      s.board = Array(C * R).fill(0); s.over = false; s.busy = false;
      s.turn = s.round++ % 2 ? 2 : 1;
      cols.forEach(col => [...col.children].forEach(x => (x.className = '')));
      sidesUpdate(); hud(); think();
    }
    function think() { if (!two && s.turn === 2 && !s.over) later(650, () => drop(chooseMove(s.board, 2, level))); }
    function drop(c) {
      const r = s.over || s.busy ? -1 : dropRow(s.board, c);
      if (r < 0) return;
      s.board[r * C + c] = s.turn;
      const disc = cols[c].children[r];
      disc.style.setProperty('--fall', r + 1);
      disc.className = `p${s.turn} fall`;
      s.busy = true; GH.audio.sfx('place');
      later(380, () => { s.busy = false; settle(); });
    }
    function settle() {
      const line = winLine(s.board), full = s.board.every(Boolean);
      if (!line && !full) { s.turn = 3 - s.turn; sidesUpdate(); think(); return; }
      s.over = true;
      if (line) {
        line.forEach(i => cols[i % C].children[Math.floor(i / C)].classList.add('win'));
        wins[s.turn]++;
        celebrate(line, two || s.turn === 1);
        streak = s.turn === 1 ? streak + 1 : 0;
      }
      const text = !line ? 'תיקו' : two ? `${names[s.turn]} ניצח!` : s.turn === 1 ? 'ניצחתם!' : 'המחשב ניצח';
      GH.audio.sfx(!line ? 'draw' : two || s.turn === 1 ? 'win' : 'lose');
      if (!two) { GH.storage.updateBest('connect-four', streak); GH.storage.addHistory('connect-four', streak, text); ctx.refreshSide(); }
      sidesUpdate(text); hud();
    }
    const mine = () => two || s.turn === 1;
    cols.forEach((col, c) => scope.on(col, 'click', () => { if (!scope.paused && mine()) drop(c); }));
    scope.on(stage.querySelector('[data-a=new]'), 'click', newRound);
    scope.on(window, 'keydown', e => { const m = /^(?:Digit|Numpad)([1-7])$/.exec(e.code); if (m && !scope.paused && mine()) drop(m[1] - 1); });
    newRound();
    return { state: s, drop };
  }

  GH.games.register({
    id: 'connect-four', name: 'ארבע בשורה', accent: '#4a8dff', music: null, bestLabel: 'רצף ניצחונות שיא',
    description: 'הפילו דיסקיות והשלימו ארבע ברצף לפני המחשב או חבר.',
    howTo: 'הקישו על עמודה כדי להפיל דיסקית. ארבע ברצף לכל כיוון מנצחות.',
    controls: [['לחיצה / הקשה', 'הפלת דיסקית'], ['1–7', 'בחירת עמודה'], ['P / Esc', 'השהיה']],
    options: [
      { key: 'mode', label: 'יריב', default: 'cpu', choices: [['cpu', 'מחשב'], ['two', 'שני שחקנים']] },
      { key: 'difficulty', label: 'רמת המחשב', default: 'medium', choices: [['easy', 'קל'], ['medium', 'בינוני'], ['hard', 'קשה']] }
    ],
    logic: { chooseMove, winLine },
    create
  });
})(window.GH);
