/* End-to-end tests. Run: node tests/e2e.js   (needs Playwright + Chromium) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
/* Served from a sub-folder, like GitHub Pages project sites. */
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (!p.startsWith('/gaming-hub/')) { res.writeHead(404); return res.end(); }
  p = p.slice('/gaming-hub/'.length) || 'index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'text/plain' }); res.end(data);
  });
});

let passed = 0, failed = 0;
const check = (name, ok, extra) => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`); };
const IDS = ['space-invaders', 'pong', 'tic-tac-toe', 'simon-says', 'fruit-ninja'];

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/gaming-hub/`;
  const browser = await chromium.launch();
  const errors = [];
  async function open(opts) {
    const context = await browser.newContext(opts);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await page.goto(base);
    return page;
  }
  const state = page => page.evaluate(() => GH.app.current && GH.app.current.state);
  const activity = page => page.evaluate(() => GH.engine.activity());
  const S = (page, expr) => page.evaluate(`(() => { const i = GH.app.current.instance, s = i.state; return ${expr}; })()`);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function start(page, id, opts = {}) {
    await page.evaluate(h => { location.hash = h; }, '#/');
    await page.evaluate(h => { location.hash = h; }, `#/game/${id}`);
    await page.waitForSelector('#btn-start');
    for (const [k, v] of Object.entries(opts)) await page.click(`#overlay label:has(input[name="${k}"][value="${v}"])`);
    await page.click('#btn-start');
  }

  for (const [label, opts] of [['desktop', { viewport: { width: 1366, height: 800 } }], ['mobile', { ...devices['Pixel 7'] }], ['small phone', { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }]]) {
    console.log(`\n== ${label} ==`);
    const page = await open(opts);
    check('home shows five cards', await page.locator('.card').count() === 5);
    check('all card images load', await page.$$eval('.card img', a => a.every(i => i.complete && i.naturalWidth > 0)));
    check('home has no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const id of IDS) {
      await page.click(`.card[data-game="${id}"] .btn`);
      await page.waitForSelector('#btn-start');
      await page.click('#btn-start');
      await sleep(500);
      const fit = await page.evaluate(() => {
        const wrap = document.querySelector('.stage-wrap').getBoundingClientRect();
        const bad = [...document.querySelectorAll('.stage canvas, .stage button, .stage fieldset')].filter(e => { const r = e.getBoundingClientRect(); return r.width < 10 || r.left < wrap.left - 1 || r.right > wrap.right + 1 || r.top < wrap.top - 1 || r.bottom > wrap.bottom + 1; }).map(e => e.className || e.tagName);
        return { bad, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      });
      check(`${id}: starts, fits screen, no scroll`, await state(page) === 'playing' && !fit.bad.length && fit.sw <= fit.w && fit.sh <= fit.h, fit);
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${label.replace(' ', '-')}-${id}.png` });
      await page.click('#btn-home');
      await page.waitForSelector('#home:not([hidden])');
      const a = await activity(page);
      check(`${id}: leaving releases everything`, a.scopes === 0 && a.listeners === 0 && a.timers === 0 && a.frames === 0 && await page.locator('#stage > *').count() === 0, a);
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${label.replace(' ', '-')}-home.png`, fullPage: true });
    await page.context().close();
  }

  console.log('\n== hebrew ==');
  const he = await open({ viewport: { width: 1200, height: 800 } });
  check('page is Hebrew and right-to-left', await he.evaluate(() => document.documentElement.lang === 'he' && getComputedStyle(document.body).direction === 'rtl'));
  /* Visible text on every screen: only key names may stay in Latin letters. */
  const latin = () => he.evaluate(() => (document.body.innerText.match(/[A-Za-z]{2,}/g) || []).filter(w => !['Esc', 'Enter', 'JavaScript', 'Chrome', 'Edge', 'Safari'].includes(w)));
  const found = [...await latin()];
  await he.click('#btn-settings'); found.push(...await latin()); await he.click('#btn-close-settings');
  for (const id of IDS) {
    await start(he, id); found.push(...await latin());
    await he.evaluate(() => GH.app.current.state === 'playing' && document.querySelector('#btn-pause').click()); found.push(...await latin());
    await he.click('#btn-menu'); found.push(...await latin());
  }
  check('no English text left on screen', found.length === 0, [...new Set(found)]);
  const overs = [];
  for (const id of ['space-invaders', 'pong', 'simon-says', 'fruit-ninja']) {
    await start(he, id);
    if (id === 'space-invaders') await S(he, '(s.aliens[0].y = 560, s.banner = 0, 1)');
    if (id === 'pong') await S(he, '(s.lives = 1, s.serve = 0, s.balls = [{x: 20, y: 590, vx: 0, vy: 500, trail: []}], s.paddle.x = 300, 1)');
    if (id === 'fruit-ninja') await S(he, '(s.left = 0.05, 1)');
    if (id === 'simon-says') { await he.waitForFunction(() => GH.app.current.instance.state.accepting); await he.keyboard.press('Digit' + ((await S(he, '(s.sequence[0] + 1) % 4')) + 1)); }
    await he.waitForSelector('#final-score'); overs.push(...await latin());
  }
  check('game-over screens are in Hebrew', overs.length === 0, [...new Set(overs)]);
  await start(he, 'tic-tac-toe', { mode: 'two' });
  for (const n of [2, 0, 4, 1, 6]) await he.locator('.cell').nth(n).click();
  const line = await he.evaluate(() => { const l = document.querySelector('.win-line line'), b = document.querySelector('.ttt-board').getBoundingClientRect(); const c = [...document.querySelectorAll('.cell.winning')].map(e => { const r = e.getBoundingClientRect(); return (r.x + r.width / 2 - b.x) / b.width * 300; }); return { x1: +l.getAttribute('x1'), x2: +l.getAttribute('x2'), cells: c }; });
  check('winning line lies on the winning cells', Math.abs(line.x1 - line.cells[0]) < 15 && Math.abs(line.x2 - line.cells[2]) < 15, line);
  await he.click('[data-a=new]');
  const xs = await he.$$eval('.cell', c => c.map(e => e.getBoundingClientRect().x));
  check('board keeps left-to-right cell order', xs[0] < xs[1] && xs[1] < xs[2]);
  await start(he, 'space-invaders');
  const bx = await he.$$eval('.pad button', c => c.map(e => e.getBoundingClientRect().x));
  check('left arrow stays on the left', bx[0] < bx[1] && bx[1] < bx[2]);
  await start(he, 'simon-says');
  const px = await he.$$eval('.simon-pad', c => c.map(e => e.getBoundingClientRect().x));
  check('Simon pads match the key layout', px[0] < px[1]);
  await he.context().close();

  console.log('\n== shell ==');
  const page = await open({ viewport: { width: 1200, height: 800 } });
  await start(page, 'pong');
  await sleep(1600);
  await page.keyboard.press('KeyP');
  const before = await S(page, 'JSON.stringify(s.balls)'); await sleep(400);
  check('pause freezes the game', await state(page) === 'paused' && before === await S(page, 'JSON.stringify(s.balls)'));
  check('pause leaves no running frames', (await activity(page)).frames === 0);
  await page.click('#btn-resume'); await sleep(300);
  check('resume continues', await state(page) === 'playing' && before !== await S(page, 'JSON.stringify(s.balls)'));
  await page.click('#btn-settings');
  check('settings pauses the game', await state(page) === 'paused');
  await page.click('#btn-close-settings'); await sleep(100);
  check('closing settings resumes', await state(page) === 'playing');
  await page.click('#btn-pause'); await page.click('#btn-restart'); await sleep(200);
  check('restart leaves exactly one scope and one loop', (a => a.scopes === 1 && a.frames <= 1)(await activity(page)));
  for (let i = 0; i < 10; i++) for (const id of IDS) await start(page, id);
  check('50 quick switches leave one scope', (await activity(page)).scopes === 1, await activity(page));
  await page.evaluate(() => history.back()); await sleep(200);
  check('browser back button works', (await activity(page)).scopes === 0);
  await page.click('#btn-home').catch(() => {});
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('#home:not([hidden])');
  await page.click('#btn-mute');
  check('mute stops music', await page.evaluate(() => GH.storage.settings.muted && !GH.audio.musicRunning));
  await page.reload();
  check('mute persists after reload', await page.getAttribute('#btn-mute', 'aria-pressed') === 'true');
  await page.click('#btn-mute');
  check('unmute restarts music', await page.evaluate(() => GH.audio.musicRunning));
  await page.click('#btn-settings');
  await page.uncheck('[data-setting=music]');
  check('music toggle works', await page.evaluate(() => !GH.audio.musicRunning));
  await page.check('[data-setting=music]');
  await page.locator('[data-setting=sfxVolume]').fill('0.25');
  check('volume slider saved', await page.evaluate(() => GH.storage.settings.sfxVolume === 0.25));
  await page.click('#btn-close-settings');
  await page.click('#btn-fullscreen'); await sleep(400);
  check('fullscreen enters', await page.evaluate(() => !!document.fullscreenElement || document.body.classList.contains('immersive')));
  await page.click('#btn-fullscreen'); await sleep(400);
  check('fullscreen exits', await page.evaluate(() => !document.fullscreenElement && !document.body.classList.contains('immersive')));
  await start(page, 'pong', { difficulty: 'hard' });
  await page.evaluate(() => { location.hash = '#/'; });
  await start(page, 'pong');
  check('difficulty choice remembered', await page.evaluate(() => GH.storage.getPrefs('pong').difficulty === 'hard' && GH.app.current.instance.state.paddle.w === 64));
  await page.evaluate(() => { location.hash = '#/game/nope'; }); await sleep(150);
  check('unknown route falls back home', await page.isVisible('#home'));

  console.log('\n== space invaders ==');
  await start(page, 'space-invaders', { difficulty: 'normal' });
  const x0 = await S(page, 's.ship.x');
  await page.keyboard.down('ArrowLeft'); await sleep(300); await page.keyboard.up('ArrowLeft');
  check('keyboard moves ship', await S(page, 's.ship.x') < x0 - 30);
  await page.keyboard.down('Space'); await sleep(100); check('space fires', await S(page, 's.shots.length') > 0); await page.keyboard.up('Space');
  const box = await page.locator('.game-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.9); await page.mouse.down(); await sleep(700); await page.mouse.up();
  check('drag steers ship', Math.abs(await S(page, 's.ship.x') - 320) < 8, await S(page, 's.ship.x'));
  const x1 = await S(page, 's.ship.x'); const lb = await page.locator('.pad [data-k=left]').boundingBox();
  await page.mouse.move(lb.x + 10, lb.y + 10); await page.mouse.down(); await sleep(250); await page.mouse.up();
  const x2 = await S(page, 's.ship.x'); await sleep(200);
  check('on-screen button moves and releases', x2 < x1 - 30 && x2 === await S(page, 's.ship.x'));
  await S(page, '(s.shots = [{x: s.aliens[s.aliens.length-1].x, y: s.aliens[s.aliens.length-1].y + 8, w: 4, h: 14}], s.score = 0)'); await sleep(120);
  check('projectile kills alien and scores', await S(page, 's.score') >= 10);
  await S(page, '(s.aliens = [], 1)'); await sleep(150);
  check('clearing the field starts wave 2', await S(page, 's.wave === 2 && s.aliens.length > 0'));
  await S(page, '(s.invulnerable = 0, s.bombs = [{x: s.ship.x, y: s.ship.y, w: 6, h: 12, v: 0}], 1)'); await sleep(100);
  check('bomb damages health', await S(page, 's.hp === 50'));
  await S(page, '(s.score = 777, s.lives = 1, s.hp = 50, s.invulnerable = 0, s.bombs = [{x: s.ship.x, y: s.ship.y, w: 6, h: 12, v: 0}], 1)'); await sleep(250);
  check('game over shown', await state(page) === 'over' && await page.textContent('#final-score') === '777');
  await page.click('#btn-again'); await sleep(150);
  check('play again resets', await S(page, 's.score === 0 && s.lives === 3 && s.wave === 1'));
  await S(page, '(s.aliens[0].y = 560, s.banner = 0, 1)'); await sleep(150);
  check('invaders landing ends game', await state(page) === 'over');

  console.log('\n== pong ==');
  check('bounce angle follows hit point', await page.evaluate(() => { const f = GH.games.get('pong').bounceVelocity; return f(-1, 100).vx < -80 && f(1, 100).vx > 80 && f(0, 100).vx === 0 && f(0.5, 100).vy < 0; }));
  await start(page, 'pong', { difficulty: 'medium' });
  const pb = await page.locator('.game-canvas').boundingBox();
  await page.mouse.move(pb.x + pb.width * 0.25, pb.y + pb.height * 0.9);
  check('mouse moves paddle', Math.abs(await S(page, 's.paddle.x') - 100) < 4);
  await S(page, '(s.serve = 0, s.paddle.x = 200, s.balls = [{x: 220, y: 530, vx: 0, vy: 400, trail: []}], 1)'); await sleep(200);
  check('paddle returns ball, scores, speeds up', await S(page, 's.hits === 1 && s.score === 2 && s.balls[0].vy < 0 && s.balls[0].vx > 0 && s.speed > 310'));
  await S(page, '(s.balls = [{x: 12, y: 300, vx: -300, vy: -50, trail: []}], 1)'); await sleep(100);
  check('side wall bounce', await S(page, 's.balls[0].vx > 0'));
  await S(page, '(s.balls = [{x: 20, y: 590, vx: 0, vy: 500, trail: []}], s.paddle.x = 300, 1)'); await sleep(200);
  check('miss costs a life', await S(page, 's.lives === 2'));
  await S(page, '(s.lives = 1, s.serve = 0, s.score = 41, s.balls = [{x: 20, y: 590, vx: 0, vy: 500, trail: []}], 1)'); await sleep(200);
  check('pong game over', await state(page) === 'over');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.reload();
  check('high score persists', await page.textContent('.card[data-game=pong] .card-best strong') === '41');
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('gaming-hub:v1')); d.scores.pong.history.push({ score: 1, note: '3 hits, medium', at: 0 }); localStorage.setItem('gaming-hub:v1', JSON.stringify(d)); });
  await page.reload();
  check('old English notes removed, score kept', await page.evaluate(() => GH.storage.history('pong').every(h => !/[A-Za-z]/.test(h.note)) && GH.storage.best('pong') === 41));
  await start(page, 'pong'); await S(page, '(s.score = 55, 1)');
  await page.evaluate(() => { location.hash = '#/'; }); await sleep(150);
  check('score kept when leaving mid-game', await page.textContent('.card[data-game=pong] .card-best strong') === '55');

  console.log('\n== pong bonuses ==');
  await start(page, 'pong', { difficulty: 'medium', bonus: 'on' });
  const cv = await page.locator('.game-canvas').boundingBox();
  const at = (x, y) => [cv.x + cv.width * x / 400, cv.y + cv.height * y / 600];
  const hold = '(s.serve = 0, s.nextBubble = 99, s.bubbles = [], s.balls = [{x: 200, y: 200, vx: 0, vy: 0, trail: []}], 1)';
  async function grab(kind) {
    await S(page, `(i.spawnBubble('${kind}'), Object.assign(s.bubbles[s.bubbles.length - 1], {x: 300, y: 300}), 1)`);
    await page.mouse.click(...at(300, 300));
  }
  await S(page, hold); await grab('multi');
  check('multi-ball adds two balls', await S(page, 's.balls.length === 3 && s.bubbles.length === 0'));
  await S(page, '(s.balls[0].y = 700, s.balls[0].vy = 10, 1)'); await sleep(100);
  check('losing a spare ball costs no life', await S(page, 's.balls.length === 2 && s.lives === 3'));
  await S(page, hold); await grab('wide');
  check('wide paddle', await S(page, 's.paddle.w > 130'));
  await S(page, '(s.effects.wide = 0.05, 1)'); await sleep(200);
  check('effect expires', await S(page, 's.paddle.w === 86 && !s.effects.wide'));
  await grab('slow'); await grab('turbo');
  check('turbo replaces slow', await S(page, '!!s.effects.turbo && !s.effects.slow'));
  await grab('double'); await grab('life');
  check('extra life', await S(page, 's.lives === 4'));
  await S(page, '(s.score = 0, s.paddle.x = 200, s.balls = [{x: 200, y: 530, vx: 0, vy: 400, trail: []}], 1)'); await sleep(150);
  check('turbo and double multiply points', await S(page, 's.score === 8'), await S(page, 's.score'));
  await S(page, hold); await grab('gift');
  check('gift gives points', await S(page, 's.score === 28'));
  await grab('shield'); await S(page, '(s.paddle.x = 60, s.balls = [{x: 350, y: 575, vx: 0, vy: 300, trail: []}], 1)'); await sleep(150);
  check('shield saves the ball once', await S(page, '!s.shield && s.lives === 4 && s.balls[0].vy < 0'));
  await S(page, '(i.spawnBubble(), s.bubbles[0].age = 3.45, 1)'); await sleep(150);
  check('uncaught bubble disappears', await S(page, 's.bubbles.length === 0'));
  await S(page, '(s.nextBubble = 0.01, 1)'); await sleep(150);
  check('bubbles appear on their own', await S(page, 's.bubbles.length === 1'));
  await page.keyboard.press('KeyP'); const age = await S(page, 's.bubbles[0].age'); await sleep(300);
  check('pause freezes bubbles', age === await S(page, 's.bubbles[0].age'));
  await start(page, 'pong', { bonus: 'off' }); await S(page, '(s.serve = 0, s.nextBubble = 0, 1)'); await sleep(200);
  check('bonuses can be switched off', await S(page, 's.bubbles.length === 0'));

  console.log('\n== tic-tac-toe ==');
  const logic = await page.evaluate(() => {
    const { winner, chooseMove } = GH.games.get('tic-tac-toe').logic;
    let games = 0, losses = 0;
    /* Exhaustively play every human line against Hard, both starting orders, every tied best move. */
    const real = Math.random;
    for (const r of [0, 0.34, 0.67, 0.999]) {
      Math.random = () => r;
      const play = (b, turn) => {
        const w = winner(b); if (w) { games++; if (w.mark === 'X') losses++; return; }
        if (turn === 'O') { const n = b.slice(); n[chooseMove(n, 'O', 'hard')] = 'O'; play(n, 'X'); }
        else b.forEach((v, i) => { if (!v) { const n = b.slice(); n[i] = 'X'; play(n, 'O'); } });
      };
      play(Array(9).fill(''), 'X'); play(Array(9).fill(''), 'O');
    }
    Math.random = real;
    const m = (s, d) => chooseMove(s.split('').map(c => c === '.' ? '' : c), 'O', d);
    return { games, losses, wins: m('XX.OO....', 'medium'), blocks: m('XX..O....', 'medium'), easy: new Set(Array.from({ length: 200 }, () => m('X........', 'easy'))).size };
  });
  check(`hard never loses (${logic.games} games)`, logic.losses === 0, logic);
  check('medium takes a win', logic.wins === 5, logic);
  check('medium blocks', logic.blocks === 2, logic);
  check('easy is random', logic.easy === 8, logic);
  await start(page, 'tic-tac-toe', { mode: 'two', first: 'x' });
  for (const n of [0, 3, 1, 4]) await page.locator('.cell').nth(n).click();
  await page.locator('.cell').nth(0).click({ force: true });
  check('occupied cell ignored', await S(page, "s.board[0] === 'X' && s.turn === 'X'"));
  await page.locator('.cell').nth(2).click();
  check('win detected and highlighted', await S(page, 's.over') && await page.locator('.cell.winning').count() === 3 && await page.locator('.win-line').count() === 1);
  await page.click('[data-a=new]');
  check('new game clears board', await S(page, "s.board.every(v => !v)") && await page.locator('.win-line').count() === 0);
  for (const n of [0, 1, 2, 4, 3, 5, 7, 6, 8]) await page.locator('.cell').nth(n).click();
  check('draw detected', (await page.textContent('.ttt-status')).includes('תיקו'));
  await page.click('[data-a=reset]'); await page.click('[data-a=reset]');
  check('reset stats', await page.evaluate(() => GH.storage.getStats('tic-tac-toe', {}).two.w === 0));
  await start(page, 'tic-tac-toe', { mode: 'cpu', difficulty: 'hard', first: 'o' });
  await sleep(800);
  check('computer can start', await S(page, "s.board.filter(v => v === 'O').length === 1 && s.turn === 'X'"));
  await page.keyboard.press('KeyP'); await page.keyboard.press('KeyP');
  const free = await S(page, 's.board.indexOf("")');
  await page.locator('.cell').nth(free).click();
  await page.keyboard.press('KeyP'); await sleep(800);
  check('computer waits while paused', await S(page, "s.board.filter(v => v === 'O').length === 1"));
  await page.keyboard.press('KeyP'); await sleep(800);
  check('computer moves after resume', await S(page, "s.board.filter(v => v === 'O').length === 2"));
  await start(page, 'tic-tac-toe', { difficulty: 'easy', first: 'x' });
  await S(page, "(s.board = ['X','X','','O','O','','','',''], 1)");
  await page.keyboard.press('Digit9');
  check('number key wins; streak is best score', await page.evaluate(() => GH.storage.best('tic-tac-toe') === 1 && GH.storage.getStats('tic-tac-toe', {}).easy.w === 1));

  console.log('\n== simon says ==');
  const ready = () => page.waitForFunction(() => GH.app.current.instance.state.accepting, null, { timeout: 15000 });
  await start(page, 'simon-says', { mode: 'classic', speed: 'fast' });
  for (let round = 1; round <= 3; round++) {
    await ready();
    const seq = await S(page, 's.sequence.slice()');
    check(`round ${round} has ${round} colour(s)`, seq.length === round);
    for (const c of seq) await page.locator('.simon-pad').nth(c).click();
  }
  await ready();
  await page.keyboard.press('Digit' + ((await S(page, '(s.sequence[0] + 1) % 4')) + 1));
  await page.waitForSelector('#final-score');
  check('wrong colour ends with score 3, new best', await page.textContent('#final-score') === '3' && await page.locator('.new-best').count() === 1);
  await start(page, 'simon-says', { mode: 'practice' });
  await ready();
  await page.keyboard.press('Digit' + ((await S(page, '(s.sequence[0] + 1) % 4')) + 1));
  await ready();
  check('practice replays after mistake', await state(page) === 'playing' && await S(page, 's.sequence.length === 1'));
  await page.click('[data-a=replay]');
  check('replay button replays', await S(page, '!s.accepting'));
  await page.click('.simon-tools label:has(input[value=slow])');
  check('speed adjustable in game', await page.evaluate(() => GH.storage.getPrefs('simon-says').speed === 'slow'));
  check('speed increases with rounds', await page.evaluate(() => { const f = GH.games.get('simon-says').logic.stepTime; return f('normal', 10) < f('normal', 1) && f('fast', 1) < f('slow', 1); }));

  console.log('\n== fruit ninja ==');
  check('segment intersection', await page.evaluate(() => { const f = GH.games.get('fruit-ninja').logic.segmentHitsCircle; return f(0, 0, 100, 0, 50, 10, 12) && !f(0, 0, 100, 0, 50, 20, 12) && !f(0, 0, 10, 0, 50, 0, 12) && f(50, 0, 50, 0, 50, 5, 12); }));
  await start(page, 'fruit-ninja', { time: '60', bombs: 'off' });
  await S(page, '(s.spawnIn = 99, s.items = [], 1)'); await sleep(500);
  const fb = await page.locator('.game-canvas').boundingBox();
  await S(page, '(s.score = 0, i.launch(0), i.launch(1), i.launch(2), s.items.forEach((o, n) => Object.assign(o, {x: i.view.width * (0.3 + n * 0.2), y: 300, vx: 0, vy: -20})), 1)');
  await page.mouse.move(fb.x + fb.width * 0.1, fb.y + fb.height * 0.5); await page.mouse.down();
  await page.mouse.move(fb.x + fb.width * 0.9, fb.y + fb.height * 0.5, { steps: 6 }); await page.mouse.up();
  check('one swipe slices three + combo', await S(page, 's.score === 6 && s.halves.length === 6'), await S(page, '[s.score, s.halves.length]'));
  await S(page, '(i.launch(0), Object.assign(s.items[0], {x: 100, y: 660, vy: 50, vx: 0}), 1)'); await sleep(150);
  check('missed fruit costs a life', await S(page, 's.lives === 2'));
  await sleep(2600);
  await S(page, '(s.spawnIn = 0, 1)'); await sleep(900);
  check('fruit spawns and stays within sides', await S(page, 's.items.length > 0 && s.items.every(o => o.x > 0 && o.x < i.view.width)'));
  await S(page, '(s.left = 0.05, 1)'); await sleep(250);
  check('countdown ends the round', await state(page) === 'over');
  await start(page, 'fruit-ninja', { bombs: 'on' });
  await S(page, '(s.spawnIn = 99, s.lives = 1, s.items = [{bomb: true, type: null, r: 28, x: i.view.width / 2, y: 300, vx: 0, vy: -20, angle: 0, spin: 0}], 1)');
  const fb2 = await page.locator('.game-canvas').boundingBox();
  await page.mouse.move(fb2.x + fb2.width * 0.2, fb2.y + fb2.height * 0.5); await page.mouse.down(); await page.mouse.move(fb2.x + fb2.width * 0.8, fb2.y + fb2.height * 0.5, { steps: 5 }); await page.mouse.up();
  await sleep(100);
  check('bomb costs a life and can end game', await state(page) === 'over');

  console.log('\n== touch (real touch events) ==');
  const phone = await open({ ...devices['Pixel 7'] });
  const cdp = await phone.context().newCDPSession(phone);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  async function swipe(x1, y1, x2, y2) { await touch('touchStart', x1, y1); for (let k = 1; k <= 8; k++) { await touch('touchMove', x1 + (x2 - x1) * k / 8, y1 + (y2 - y1) * k / 8); await sleep(16); } await touch('touchEnd'); }
  await start(phone, 'pong');
  let r = await phone.locator('.game-canvas').boundingBox();
  await swipe(r.x + r.width * 0.5, r.y + r.height * 0.9, r.x + r.width * 0.8, r.y + r.height * 0.9);
  check('touch drags paddle', await S(phone, 's.paddle.x > 290'), await S(phone, 's.paddle.x'));
  await start(phone, 'pong', { bonus: 'on' });
  await S(phone, "(s.serve = 0, s.nextBubble = 99, s.balls = [{x: 200, y: 200, vx: 0, vy: 0, trail: []}], s.paddle.x = 100, i.spawnBubble('life'), Object.assign(s.bubbles[0], {x: 320, y: 300}), 1)");
  r = await phone.locator('.game-canvas').boundingBox();
  await swipe(r.x + r.width * 0.8, r.y + r.height * 0.5, r.x + r.width * 0.9, r.y + r.height * 0.5);
  check('finger tap catches bubble without moving paddle', await S(phone, 's.lives === 4 && s.paddle.x === 100'), await S(phone, '[s.lives, s.paddle.x]'));
  await start(phone, 'space-invaders');
  r = await phone.locator('.pad [data-k=left]').boundingBox();
  const sx = await S(phone, 's.ship.x'); await touch('touchStart', r.x + 20, r.y + 20); await sleep(300); await touch('touchEnd');
  check('touch button moves ship', await S(phone, 's.ship.x') < sx - 30);
  await start(phone, 'fruit-ninja', { bombs: 'off' });
  await S(phone, '(s.spawnIn = 99, i.launch(0), Object.assign(s.items[0], {x: i.view.width / 2, y: 300, vx: 0, vy: -20}), 1)');
  r = await phone.locator('.game-canvas').boundingBox();
  await swipe(r.x + r.width * 0.1, r.y + r.height * 0.5, r.x + r.width * 0.9, r.y + r.height * 0.5);
  check('finger swipe slices', await S(phone, 's.score === 1'), await S(phone, 's.score'));
  await start(phone, 'tic-tac-toe', { mode: 'two' });
  await phone.locator('.cell').nth(4).tap();
  await sleep(100);
  check('tap places mark', await S(phone, "s.board[4] === 'X'"), await S(phone, '[s.board, s.turn, GH.app.current.state, GH.app.current.def.id, i.state === s]'));
  await start(phone, 'simon-says');
  await phone.waitForFunction(() => GH.app.current.instance.state.accepting);
  await phone.locator('.simon-pad').nth(await S(phone, 's.sequence[0]')).tap();
  check('tap answers Simon once', await S(phone, 's.score === 1'));
  await phone.evaluate(() => { location.hash = '#/'; });

  console.log('\n== install, offline, link preview ==');
  const app = await open({ ...devices['Pixel 7'] });
  await app.evaluate(() => navigator.serviceWorker.ready);
  await app.reload(); await app.waitForFunction(() => !!navigator.serviceWorker.controller);
  const dev = await app.context().newCDPSession(app);
  const manifest = await dev.send('Page.getAppManifest');
  check('manifest loads without errors', manifest.errors.length === 0 && manifest.url.endsWith('manifest.webmanifest'), manifest.errors);
  const install = (await dev.send('Page.getInstallabilityErrors')).installabilityErrors.filter(e => e.errorId !== 'in-incognito');
  check('browser reports the app as installable', install.length === 0, install);
  check('icons and share image exist', await app.evaluate(async () => (await Promise.all([...JSON.parse(await (await fetch('manifest.webmanifest')).text()).icons.map(i => i.src), 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png', 'assets/icons/share.png'].map(u => fetch(u)))).every(r => r.ok)));
  await app.click('#btn-install');
  const installOpen = await app.evaluate(() => document.getElementById('install-help').open || document.querySelectorAll('#install-steps li').length === 0);
  check('install button gives instructions or a prompt', installOpen);
  await app.evaluate(() => document.getElementById('install-help').close());
  await app.context().setOffline(true); await app.reload();
  check('works offline', await app.locator('.card').count() === 5 && await app.$$eval('.card img', a => a.every(i => i.complete && i.naturalWidth > 0)));
  await start(app, 'pong');
  check('game starts offline', await state(app) === 'playing');
  await app.context().setOffline(false); await app.context().close();

  await page.evaluate(() => { location.hash = '#/'; });
  await page.click('#btn-settings'); await page.click('#btn-reset'); await page.click('#btn-reset');
  check('erase data works', await page.evaluate(() => GH.storage.best('pong') === 0));
  const blocked = await browser.newContext(); await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  const bp = await blocked.newPage(); bp.on('pageerror', e => errors.push(e.message)); await bp.goto(base);
  check('works with storage blocked', await bp.locator('.card').count() === 5);

  check('no JavaScript or network errors', errors.length === 0, [...new Set(errors)]);
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
