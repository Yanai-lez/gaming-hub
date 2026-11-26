# 🎮 Gaming Hub

Seven browser games in one site (Hebrew, right-to-left interface), written in plain HTML, CSS and JavaScript. No build step, no backend, no external files.

| Game | Highlights |
|---|---|
| 👾 Space Invaders | Three alien types and a bonus saucer, waves, health and lives, 3 difficulties, optional auto-fire |
| 🏓 Pong | Hit-position bounce angles, rising speed, 3 lives, 3 difficulties, power-up bubbles |
| ❌ Tic-Tac-Toe | Easy (random), Medium (win/block), Hard (Minimax), Challenge (Minimax plus traps), two players, stats |
| 🧠 Simon Says | Four tones, rising pace, speed setting, practice mode |
| 🔴 Connect Four | Computer (3 levels) or two players, falling discs, animated wins |
| 🎳 Bowling | Swipe to throw with spin, pin physics, ten-frame scoring, solo or vs computer |
| 🍉 Fruit Ninja | Swipe slicing by segment–circle intersection, combos, bombs, timer and lives |

Also: saved high scores and result history, sound effects and music (synthesised in the browser), global mute, fullscreen, pause, touch, mouse and keyboard controls, installable app (works offline) and a logo preview for shared links.

## Publish with GitHub Pages

1. Open the repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main**, folder **/ (root)**, and press **Save**.
4. After a minute or two the site is at `https://yanai-lez.github.io/gaming-hub/`.

## Run locally

Open `index.html` in a browser.

## Structure

```
index.html
css/        main, home and game styles
js/
  app.js          screens, settings, fullscreen
  navigation.js   hash routing
  storage.js      LocalStorage
  audio.js        Web Audio effects and music
  engine.js       scoped timers/listeners, canvas, particles
  games/          one independent file per game
assets/     SVG artwork and logo
tests/      end-to-end tests
```

Each game registers itself with `GH.games.register(...)`. Everything it creates (listeners, timers, animation frames) belongs to a scope that is disposed when you leave the game.

## Tests

With Node.js and [Playwright](https://playwright.dev/) installed:

```
node tests/e2e.js
```

## Notes

- After changing files, raise the `?v=` numbers in `index.html` and `VERSION` plus the file list in `sw.js`.

- Scores and settings are stored per browser and device.
- Browsers start audio only after the first tap or key press.
- iPhone Safari has no page fullscreen; the fullscreen button switches to a focus view there.
