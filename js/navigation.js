/* Hash routing (#/ and #/game/<id>) works on GitHub Pages without server rules. */
(function (GH) {
  'use strict';
  function parse(hash) {
    const m = /^#\/game\/([a-z0-9-]+)$/.exec(hash || '');
    return m && GH.games.get(m[1]) ? { view: 'game', id: m[1] } : { view: 'home' };
  }
  GH.navigation = {
    parse,
    start(onRoute) {
      window.addEventListener('hashchange', () => onRoute(parse(location.hash)));
      onRoute(parse(location.hash));
    },
    home() { if (location.hash === '#/' || location.hash === '') return; location.hash = '#/'; }
  };
})(window.GH = window.GH || {});
