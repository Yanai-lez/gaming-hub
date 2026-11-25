/* Simon Says. Timers come from the scope, so pausing freezes the sequence mid-flash. */
(function (GH) {
  'use strict';
  const PADS = [
    { name: 'Red', freq: 329.63, keys: ['Digit1', 'KeyQ'] },
    { name: 'Blue', freq: 261.63, keys: ['Digit2', 'KeyW'] },
    { name: 'Green', freq: 392.0, keys: ['Digit3', 'KeyA'] },
    { name: 'Yellow', freq: 523.25, keys: ['Digit4', 'KeyS'] }
  ];
  const SPEEDS = { slow: 720, normal: 500, fast: 320 };
  /* Each round plays a little faster, down to 55% of the chosen speed. */
  const stepTime = (speed, length) => SPEEDS[speed] * Math.max(0.55, 1 - 0.025 * (length - 1));

  function create(ctx) {
    const { scope, stage } = ctx;
    const practice = ctx.options.mode === 'practice';
    stage.innerHTML = `<div class="simon"><div class="simon-status" role="status"></div><div class="simon-board">${PADS.map((p, i) => `<button type="button" class="simon-pad" data-i="${i}" aria-label="${p.name}"></button>`).join('')}<div class="simon-core">0</div></div><div class="simon-tools"><fieldset class="segment"><legend>Speed</legend><div class="segment-row">${Object.keys(SPEEDS).map(k => `<label><input type="radio" name="simon-speed" value="${k}"${k === ctx.options.speed ? ' checked' : ''}><span>${k[0].toUpperCase() + k.slice(1)}</span></label>`).join('')}</div></fieldset>${practice ? '<button type="button" class="btn" data-a="replay">Replay sequence</button>' : ''}</div></div>`;
    const status = stage.querySelector('.simon-status');
    const core = stage.querySelector('.simon-core');
    const pads = [...stage.querySelectorAll('.simon-pad')];
    const replay = stage.querySelector('[data-a=replay]');
    const s = { sequence: [], index: 0, score: 0, accepting: false, over: false, timers: [] };

    const hud = () => ctx.setHud([['Round', s.sequence.length], ['Score', s.score], [practice ? 'Mode' : 'Best', practice ? 'Practice' : Math.max(GH.storage.best('simon-says'), s.score)]]);
    const later = (ms, fn) => s.timers.push(scope.wait(ms, fn));
    function stopTimers() { s.timers.forEach(t => scope.cancel(t)); s.timers = []; pads.forEach(p => p.classList.remove('lit')); }
    function setAccepting(v) { s.accepting = v; if (replay) replay.disabled = !v; }

    function flash(i, ms) {
      pads[i].classList.add('lit');
      GH.audio.tone(PADS[i].freq, ms / 1000);
      later(ms, () => pads[i].classList.remove('lit'));
    }

    function play() {
      stopTimers(); setAccepting(false); s.index = 0;
      status.textContent = 'Watch…';
      const t = stepTime(ctx.options.speed, s.sequence.length);
      s.sequence.forEach((c, i) => later(700 + i * t, () => flash(c, t * 0.66)));
      later(700 + s.sequence.length * t, () => { setAccepting(true); status.textContent = 'Your turn'; });
    }

    function nextRound() {
      s.sequence.push(Math.floor(Math.random() * 4));
      core.textContent = s.sequence.length;
      hud(); play();
    }

    function press(i) {
      if (!s.accepting || s.over || scope.paused) return;
      pads.forEach(p => p.classList.remove('lit'));
      flash(i, 240);
      if (s.sequence[s.index] !== i) {
        setAccepting(false);
        GH.audio.sfx('buzz'); GH.engine.vibrate(200);
        if (practice) {
          status.textContent = 'Not quite. Watch it again.';
          stopTimers(); later(900, play);
        } else {
          s.over = true; stopTimers();
          status.textContent = 'Wrong colour';
          pads[s.sequence[s.index]].classList.add('lit');
          later(900, () => ctx.gameOver({ score: s.score, note: `${ctx.options.speed} speed`, lines: [`The next colour was ${PADS[s.sequence[s.index]].name.toLowerCase()}.`] }));
        }
        return;
      }
      s.index++;
      if (s.index === s.sequence.length) {
        setAccepting(false);
        s.score = s.sequence.length;
        status.textContent = 'Correct!';
        hud();
        later(750, nextRound);
      }
    }

    pads.forEach((p, i) => {
      scope.on(p, 'pointerdown', e => { e.preventDefault(); press(i); });
      /* Keyboard activation (Enter / Space on a focused pad) arrives as a click with detail 0. */
      scope.on(p, 'click', e => { if (e.detail === 0) press(i); });
    });
    scope.on(window, 'keydown', e => {
      if (e.repeat) return;
      const i = PADS.findIndex(p => p.keys.includes(e.code));
      if (i >= 0) press(i);
    });
    scope.on(stage, 'change', e => { if (e.target.name === 'simon-speed') { ctx.setOption('speed', e.target.value); e.target.blur(); } });
    if (replay) scope.on(replay, 'click', () => { if (s.accepting) play(); });

    nextRound();
    return {
      state: s, press,
      /* Practice runs never reach the high-score table. */
      result: () => (practice || s.over && !s.score ? null : { score: s.score, note: `${ctx.options.speed} speed` })
    };
  }

  GH.games.register({
    id: 'simon-says', name: 'Simon Says', accent: '#ffd21f', music: null, bestLabel: 'High score',
    description: 'Watch the lights, hear the tones and repeat an ever-growing sequence.',
    howTo: 'Repeat the colours in order. Keys: 1 2 3 4, or Q W (top) and A S (bottom).',
    controls: [['Tap / click', 'Press a colour'], ['1 2 3 4', 'Red, Blue, Green, Yellow'], ['Q W A S', 'Same, laid out like the board'], ['P / Esc', 'Pause'], ['Practice', 'Mistakes replay the sequence; no high score']],
    options: [
      { key: 'mode', label: 'Mode', default: 'classic', choices: [['classic', 'Classic'], ['practice', 'Practice']] },
      { key: 'speed', label: 'Starting speed', default: 'normal', choices: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']] }
    ],
    logic: { stepTime },
    create
  });
})(window.GH);
