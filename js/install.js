/* "Install app" button and the service worker that makes the site installable and playable offline. */
(function (GH) {
  'use strict';
  const button = document.getElementById('btn-install');
  const dialog = document.getElementById('install-help');
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let prompt = null;

  function steps() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios) return ['פתחו את הקישור בדפדפן Safari.', 'לחצו על כפתור השיתוף.', 'בחרו "הוספה למסך הבית" ואשרו.'];
    if (/Android/.test(navigator.userAgent)) return ['אם הקישור נפתח מתוך אפליקציה אחרת, בחרו בתפריט ⋮ את "פתיחה ב-Chrome".', 'ב-Chrome פתחו את התפריט ⋮.', 'בחרו "התקנת האפליקציה" או "הוספה למסך הבית".'];
    return ['פתחו את האתר ב-Chrome או ב-Edge.', 'לחצו על סמל ההתקנה בשורת הכתובת, או פתחו את תפריט הדפדפן.', 'בחרו "התקנה".'];
  }

  button.hidden = standalone();
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; button.hidden = false; });
  window.addEventListener('appinstalled', () => { prompt = null; button.hidden = true; GH.app.toast('האפליקציה הותקנה'); });
  button.addEventListener('click', async () => {
    if (prompt) {
      const event = prompt; prompt = null;
      event.prompt();
      await event.userChoice;
      return;
    }
    const list = document.getElementById('install-steps');
    list.textContent = '';
    for (const text of steps()) list.appendChild(document.createElement('li')).textContent = text;
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
  });
  document.getElementById('btn-close-install').addEventListener('click', () => (dialog.close ? dialog.close() : dialog.removeAttribute('open')));

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol))
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
})(window.GH);
