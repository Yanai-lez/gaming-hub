/* Tic-Tac-Toe: random, tactical and Minimax opponents, plus two players. */
(function (GH) {
  'use strict';
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const other = m => (m === 'X' ? 'O' : 'X');
  const empty = b => b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const winner = b => {
    for (const line of LINES) { const [a, c, d] = line; if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line }; }
    return b.every(Boolean) ? { mark: null, line: null } : null;
  };

  const memo = new Map();
  /* Value of the position for the player about to move; faster wins and slower losses score higher. */
  function minimax(b, mark) {
    const key = b.map(v => v || '-').join('') + mark;
    if (memo.has(key)) return memo.get(key);
    const w = winner(b);
    let value;
    if (w) value = w.mark ? -(1 + empty(b).length) : 0;
    else {
      value = -Infinity;
      for (const i of empty(b)) { b[i] = mark; value = Math.max(value, -minimax(b, other(mark))); b[i] = ''; }
    }
    memo.set(key, value);
    return value;
  }

  function chooseMove(board, mark, difficulty) {
    const b = board.slice(), free = empty(b);
    if (!free.length) return -1;
    if (difficulty === 'easy') return pick(free);
    if (difficulty === 'medium') {
      for (const m of [mark, other(mark)]) {
        const found = free.find(i => { const t = b.slice(); t[i] = m; const w = winner(t); return w && w.mark === m; });
        if (found !== undefined) return found;
      }
      return pick(free);
    }
    const scored = free.map(i => { b[i] = mark; const v = -minimax(b, other(mark)); b[i] = ''; return [i, v]; });
    const best = Math.max(...scored.map(x => x[1]));
    return pick(scored.filter(x => x[1] === best).map(x => x[0]));
  }

  const MARK = {
    X: '<svg viewBox="0 0 100 100" class="x"><path d="M22 22L78 78"/><path d="M78 22L22 78"/></svg>',
    O: '<svg viewBox="0 0 100 100" class="o"><circle cx="50" cy="50" r="30"/></svg>'
  };

  function create(ctx) {
    const { scope, stage } = ctx;
    const two = ctx.options.mode === 'two';
    const difficulty = ctx.options.difficulty;
    const statKey = two ? 'two' : difficulty;
    const blank = { w: 0, l: 0, d: 0, streak: 0 };
    let all = GH.storage.getStats('tic-tac-toe', {});
    const stats = () => Object.assign({}, blank, all[statKey]);

    stage.innerHTML = '<div class="ttt"><div class="ttt-status" role="status"></div><div class="ttt-board" role="grid" aria-label="Tic-Tac-Toe board"></div><div class="ttt-actions"><button type="button" class="btn btn-accent" data-a="new">New game</button><button type="button" class="btn" data-a="reset">Reset stats</button></div></div>';
    const status = stage.querySelector('.ttt-status');
    const boardEl = stage.querySelector('.ttt-board');
    const resetBtn = stage.querySelector('[data-a=reset]');
    const cells = Array.from({ length: 9 }, () => {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'cell';
      boardEl.append(c); return c;
    });
    const s = { board: [], turn: 'X', over: false, round: 0, pending: null, resetArmed: false };

    function hud() {
      const t = stats();
      if (two) ctx.setHud([['X wins', t.w], ['O wins', t.l], ['Draws', t.d]]);
      else ctx.setHud([['Wins', t.w], ['Losses', t.l], ['Draws', t.d], ['Streak', t.streak]]);
    }
    const computerTurn = () => !two && s.turn === 'O' && !s.over;

    function render() {
      cells.forEach((c, i) => {
        const v = s.board[i];
        if (c.dataset.mark !== v) { c.dataset.mark = v; c.innerHTML = v ? MARK[v] : ''; }
        c.setAttribute('aria-label', `Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}: ${v || 'empty'}`);
        c.setAttribute('aria-disabled', String(!!v || s.over || computerTurn()));
      });
    }

    function newRound() {
      scope.cancel(s.pending); s.pending = null;
      s.board = Array(9).fill(''); s.over = false;
      const first = ctx.options.first;
      /* The computer is O. In two-player mode X and O alternate when "Take turns" is chosen. */
      const oStarts = first === 'o' || (first === 'alternate' && s.round % 2 === 1);
      s.turn = oStarts ? 'O' : 'X';
      s.round++;
      cells.forEach(c => c.classList.remove('winning'));
      const old = boardEl.querySelector('.win-line'); if (old) old.remove();
      announce(); render(); hud(); think();
    }

    function announce() {
      status.textContent = two ? `${s.turn}'s turn` : s.turn === 'X' ? 'Your turn (X)' : 'Computer is thinking…';
    }

    function think() {
      if (computerTurn()) s.pending = scope.wait(520, () => { s.pending = null; place(chooseMove(s.board, 'O', difficulty)); });
    }

    function finish(w) {
      s.over = true;
      const t = stats();
      if (w.mark === 'X') { t.w++; t.streak++; } else if (w.mark === 'O') { t.l++; t.streak = 0; } else t.d++;
      all[statKey] = t; GH.storage.setStats('tic-tac-toe', all);
      status.textContent = !w.mark ? "It's a draw" : two ? `${w.mark} wins!` : w.mark === 'X' ? 'You win!' : 'Computer wins';
      if (w.line) {
        w.line.forEach(i => cells[i].classList.add('winning'));
        const at = i => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];
        const [x1, y1] = at(w.line[0]), [x2, y2] = at(w.line[2]);
        boardEl.insertAdjacentHTML('beforeend', `<svg class="win-line" viewBox="0 0 300 300" aria-hidden="true"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/></svg>`);
      }
      GH.audio.sfx(!w.mark ? 'draw' : two || w.mark === 'X' ? 'win' : 'lose');
      if (!two) {
        GH.storage.updateBest('tic-tac-toe', t.streak);
        GH.storage.addHistory('tic-tac-toe', t.streak, `${!w.mark ? 'Draw' : w.mark === 'X' ? 'Win' : 'Loss'}, ${difficulty}`);
      }
      ctx.refreshSide(); render(); hud();
    }

    function place(i) {
      if (s.over || i < 0 || s.board[i]) return false;
      s.board[i] = s.turn;
      GH.audio.sfx('place');
      const w = winner(s.board);
      if (w) { finish(w); return true; }
      s.turn = other(s.turn);
      announce(); render(); think();
      return true;
    }

    cells.forEach((c, i) => scope.on(c, 'click', () => { if (!scope.paused && !computerTurn()) place(i); }));
    scope.on(stage.querySelector('[data-a=new]'), 'click', () => { GH.audio.sfx('click'); newRound(); });
    scope.on(resetBtn, 'click', () => {
      if (!s.resetArmed) {
        s.resetArmed = true; resetBtn.textContent = 'Tap again to reset';
        scope.wait(3000, () => { s.resetArmed = false; resetBtn.textContent = 'Reset stats'; });
        return;
      }
      s.resetArmed = false; resetBtn.textContent = 'Reset stats';
      all[statKey] = Object.assign({}, blank); GH.storage.setStats('tic-tac-toe', all); hud();
    });
    /* Digits follow the number-pad layout (7 8 9 on top); arrows move focus. */
    scope.on(window, 'keydown', e => {
      if (scope.paused) return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && !computerTurn()) { const n = Number(m[1]) - 1; place((2 - Math.floor(n / 3)) * 3 + n % 3); return; }
      if (e.code === 'KeyN') return newRound();
      const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.code];
      if (move) {
        e.preventDefault();
        const at = cells.indexOf(document.activeElement);
        cells[at < 0 ? 4 : (at + move + 9) % 9].focus();
      }
    });

    newRound();
    return { state: s, place, newRound };
  }

  GH.games.register({
    id: 'tic-tac-toe', name: 'Tic-Tac-Toe', accent: '#ff8a5c', music: null, bestLabel: 'Best win streak',
    description: 'Outsmart three computer opponents, or challenge a friend on one screen.',
    howTo: 'Tap a square to place your mark. Number keys 1–9 follow the number pad.',
    controls: [['Click / tap', 'Place a mark'], ['1–9', 'Squares, number-pad layout'], ['Arrows + Enter', 'Move and select'], ['N', 'New game'], ['Streak', 'Wins in a row against the computer; draws keep it']],
    options: [
      { key: 'mode', label: 'Opponent', default: 'cpu', choices: [['cpu', 'Computer'], ['two', 'Two players']] },
      { key: 'difficulty', label: 'Computer level', default: 'medium', choices: [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']] },
      { key: 'first', label: 'Who starts', default: 'x', choices: [['x', 'X (you)'], ['o', 'O'], ['alternate', 'Take turns']] }
    ],
    logic: { winner, chooseMove },
    create
  });
})(window.GH);
