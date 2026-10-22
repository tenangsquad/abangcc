/* ==========================================================================
   4b2. ORIENTATION — "please play in landscape" + "how to hide the browser toolbar"
   --------------------------------------------------------------------------
   • Any touch device held upright gets the #rotateHint card (CSS shows it) and the shift is paused until it is turned.
   • While the card is up it lists the steps to hide the browser toolbar, written for the browser in use
     (iPhone Safari → "AA" menu, Android Chrome → tap for fullscreen, anything else → generic).
   • Sideways with the toolbar still showing, a slim dismissible #toolbarTip repeats the steps once.
   • Android Chrome is also asked for fullscreen + landscape lock on the first tap (iOS cannot lock orientation).
   Nothing here runs on a PC (no touch screen). ?orient=touch forces it on for testing.
   ========================================================================== */
(function (ns) {
  'use strict';

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const forced = /[?&]orient=touch\b/.test(location.search);

  const touch = forced || (() => {
    try {
      return matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      return false;
    }
  })();
  if (!touch) return (ns.Orient = { touch: false });
  root.dataset.touch = '1'; // css/phone.css shows the rotate card for [data-touch] in portrait

  /* ---------- which browser? ---------- */
  const ua = navigator.userAgent || '';
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const safari = ios && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  const kind = safari ? 'ios-safari' : ios ? 'ios-other' : android ? 'android' : 'other';

  const STEPS = {
    'ios-safari': [
      ['Ketik butang “AA” (atau ⋯) di bar alamat', 'Tap the “AA” (or ⋯) button in the address bar'],
      ['Pilih “Hide Toolbar”', 'Choose “Hide Toolbar”'],
      ['Lagi senang: Kongsi ⬆ → “Add to Home Screen”, buka dari ikon', 'Easier: Share ⬆ → “Add to Home Screen”, then open from the icon'],
    ],
    'ios-other': [
      ['Leret ke atas pada skrin untuk sembunyikan bar', 'Swipe up on the screen to hide the bar'],
      ['Atau: Kongsi ⬆ → “Add to Home Screen”, buka dari ikon', 'Or: Share ⬆ → “Add to Home Screen”, then open from the icon'],
    ],
    android: [
      ['Ketik skrin sekali — permainan akan skrin penuh', 'Tap the screen once — the game goes fullscreen'],
      ['Tak jadi? Menu ⋮ → “Add to Home screen” / “Install app”', 'Not working? Menu ⋮ → “Add to Home screen” / “Install app”'],
    ],
    other: [
      ['Leret ke atas untuk sembunyikan bar alamat', 'Swipe up to hide the address bar'],
      ['Atau guna pilihan “Fullscreen” / “Skrin penuh” dalam menu pelayar', 'Or use “Fullscreen” in the browser menu'],
    ],
  };

  /** Already fullscreen / installed to the home screen → there is no toolbar to hide. */
  function chromeless() {
    try {
      return !!(document.fullscreenElement || navigator.standalone || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches);
    } catch (e) {
      return false;
    }
  }
  const upright = () => matchMedia('(orientation: portrait)').matches;
  /** Sideways, the visible height is clearly less than the short side of the screen → toolbar/address bar is showing. */
  function toolbarShowing() {
    if (upright() || chromeless()) return false;
    const short = Math.min(screen.width, screen.height);
    return short > 0 && innerHeight < short - 24;
  }

  /* ---------- the steps on the rotate card ---------- */
  const list = $('rhSteps');
  const tipEl = $('toolbarTip');
  const text = $('ttText');
  const steps = STEPS[kind];
  if (list) {
    list.innerHTML = steps.map(([ms, en]) => `<li><span>${ms}</span><small>${en}</small></li>`).join('');
    list.hidden = chromeless();
  }

  /* ---------- the slim tip shown once while playing sideways ---------- */
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem('abangcc2007_tbtip') === '1';
  } catch (e) {
    /* blocked storage — it may show again after a reload, which is fine */
  }
  if (text) text.innerHTML = steps.slice(0, kind === 'ios-safari' ? 2 : 1).map(([ms]) => ms).join(' → ');
  function sync() {
    if (list) list.hidden = chromeless();
    if (!tipEl) return;
    const show = !dismissed && !ns.Loader?.active && toolbarShowing();
    if (tipEl.hidden === show) tipEl.hidden = !show;
  }
  $('ttClose')?.addEventListener('click', () => {
    dismissed = true;
    try {
      sessionStorage.setItem('abangcc2007_tbtip', '1');
    } catch (e) {
      /* ignore */
    }
    sync();
  });
  for (const [target, ev] of [[window, 'resize'], [window, 'orientationchange'], [document, 'fullscreenchange']]) target.addEventListener(ev, sync);
  setInterval(sync, 1500); // also catches the loader going away and iOS toolbars that change height without a resize event
  sync();

  /* ---------- Android Chrome: fullscreen + landscape lock on the first tap (needs a user gesture) ---------- */
  if (android) {
    const lock = () => {
      document.removeEventListener('pointerup', lock);
      try {
        const full = !document.fullscreenElement && root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : null;
        Promise.resolve(full).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      } catch (e) {
        /* not supported — the rotate card covers it */
      }
    };
    document.addEventListener('pointerup', lock);
  }

  /* ---------- held upright: pause the shift (the card covers the screen) ---------- */
  matchMedia('(orientation: portrait)').addEventListener?.('change', (e) => {
    const UI = ns.UI;
    if (!e.matches || !UI?.s || UI.s.phase !== 'active') return;
    UI.togglePause();
  });

  ns.Orient = { touch: true, kind, sync };
})((window.ABCC = window.ABCC || {}));
