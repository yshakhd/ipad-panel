/*
 * Shared by the three iPad scenes. ES5 for iOS 9.
 *
 * Swipe sideways to change scene: photos, meadow, city, round and round. Drag left for the
 * next scene, right for the one before. A picture of that scene follows your finger in
 * over this one; let go past a quarter of the screen (or flick) and it finishes sliding in,
 * otherwise it slides back. Each scene is its own page, so the picture is a snapshot each
 * scene keeps of itself (in localStorage, refreshed every few minutes). The page that loads
 * shows the same snapshot at once, then fades it into the live scene when it has drawn: no
 * black gap, no jump. While you drag, the scene's animation pauses (window.SWIPING) so the
 * old iPad has its whole CPU for the slide, and the page can't bounce up and down.
 *
 *   Swipe.attach('meadow', function () { return true; })   // may we leave now? (no console open...)
 *   Swipe.ready()     the page has drawn: reveal it (and note the time for the server log)
 *   Swipe.lazyWx(el, unitFn)   load the weather console (wx.js) after the scene is up;
 *                              a tap on the temperature before then loads it at once
 *   Swipe.mark(name)  a point in the load timing the server log gets
 */
var Swipe = (function () {
  'use strict';
  var ORDER = ['photos', 'meadow', 'city'];
  var URL = { photos: '/', meadow: '/meadow.html', city: '/city.html' };
  var BG = { photos: '#0b1220', meadow: '#0c1a14', city: '#05060a' };
  var root = document.documentElement, body = document.body;
  var path = location.pathname.split('/').pop();
  var HERE = path === 'meadow.html' ? 'meadow' : path === 'city.html' ? 'city' : 'photos';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function vw() { return root.clientWidth || window.innerWidth; }
  function vh() { return root.clientHeight || window.innerHeight; }
  function sheet(scene) {   // a full-screen picture of a scene, over everything
    var d = document.createElement('div'), snap = get('snap.' + scene), s = d.style;
    s.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:100000;background-color:' + BG[scene] +
      ';background-size:100% 100%;background-repeat:no-repeat;pointer-events:none';
    if (snap) s.backgroundImage = 'url(' + snap + ')';
    return d;
  }
  function move(el, x, ms, ease) {
    var s = el.style;
    s.webkitTransition = s.transition = ms ? '-webkit-transform ' + ms + 'ms ' + ease + ', transform ' + ms + 'ms ' + ease : 'none';
    s.webkitTransform = s.transform = 'translate3d(' + Math.round(x) + 'px,0,0)';
  }

  /* ---------- arriving after a swipe: show the snapshot at once, fade to the live scene ---------- */
  var cover = null, shown = false, swipedIn = false;
  try {
    var h = JSON.parse(sessionStorage.getItem('swipe') || 'null');
    sessionStorage.removeItem('swipe');
    if (h && Date.now() - h.at < 8000) { cover = sheet(HERE); body.appendChild(cover); swipedIn = true; }
  } catch (e) {}
  function ready() {
    if (shown) return;
    shown = true; mark('ready');
    setTimeout(capture, 4000);
    if (!cover) return;
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (f) { setTimeout(f, 16); };
    raf(function () { raf(function () {   // two frames: let the live scene reach the screen under the snapshot
      var s = cover.style;
      s.webkitTransition = s.transition = 'opacity 0.35s ease-out';
      s.opacity = '0';
      setTimeout(function () { if (cover.parentNode) cover.parentNode.removeChild(cover); cover = null; }, 450);
    }); });
  }
  setTimeout(ready, 2500);   // never stay covered if a page forgets to say so

  /* ---------- leaving: the next scene follows your finger ---------- */
  // touchmove has to be able to cancel the page's bounce: newer browsers make page-wide touch
  // listeners passive unless told otherwise (iOS 9 reads the object as plain 'true')
  var ACTIVE = false;
  try { window.addEventListener('x', null, Object.defineProperty({}, 'passive', { get: function () { ACTIVE = { passive: false }; return false; } })); } catch (e) {}
  function attach(here, ok) {
    var t = null, peek = null, peekFor = null, gone = false;
    function next(left) { var i = ORDER.indexOf(here); return ORDER[(i + (left ? 1 : ORDER.length - 1)) % ORDER.length]; }
    function stop() { window.SWIPING = false; t = null; }
    document.addEventListener('touchstart', function (e) {
      if (gone || e.touches.length !== 1 || window.WX_OPEN || (ok && !ok())) { t = null; return; }
      var p = e.touches[0];
      t = { x0: p.clientX, y0: p.clientY, x: p.clientX, lat: Date.now(), px: p.clientX, pat: Date.now(), lock: null };   // px/pat: a point ~50 ms back, for the flick speed
    }, false);
    document.addEventListener('touchmove', function (e) {
      if (!t) return;
      e.preventDefault();   // a scene never scrolls: no rubber-band bounce while you swipe
      var p = e.touches[0], dx = p.clientX - t.x0, dy = p.clientY - t.y0;
      if (!t.lock) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        t.lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (t.lock === 'h') window.SWIPING = true;
      }
      if (t.lock !== 'h') return;
      var now = Date.now();
      if (now - t.pat > 50) { t.px = t.x; t.pat = t.lat; }
      t.x = p.clientX; t.lat = now;
      var left = dx < 0, want = next(left), w = vw();
      if (peekFor !== want) {   // first move, or the drag turned round
        if (peek && peek.parentNode) peek.parentNode.removeChild(peek);
        peek = sheet(want); peekFor = want;
        peek.style.boxShadow = '0 0 40px rgba(0,0,0,0.55)';
        body.appendChild(peek);
      }
      move(peek, left ? Math.max(0, w + dx) : Math.min(0, -w + dx), 0);
    }, ACTIVE);
    function end(e) {
      if (!t) return;
      var drag = t.lock === 'h' && peek, w = vw();
      if (!drag) { stop(); return; }
      var dx = t.x - t.x0, left = dx < 0, v = Date.now() - t.lat > 100 ? 0 : (t.x - t.px) / Math.max(16, t.lat - t.pat);   // px per ms, just before letting go
      var go = e.type === 'touchend' && (Math.abs(dx) > w * 0.25 || (Math.abs(v) > 0.4 && (v < 0) === left && Math.abs(dx) > 30));
      var el = peek, rest = left ? Math.max(0, w + dx) : Math.max(0, w - dx);
      if (go) {
        gone = true; t = null;
        var target = peekFor;
        try { localStorage.setItem('scene', target); sessionStorage.setItem('swipe', JSON.stringify({ at: Date.now() })); } catch (err) {}
        var ms = Math.max(120, Math.min(300, rest / w * 360));
        move(el, 0, ms, 'cubic-bezier(0.2, 0.7, 0.3, 1)');
        setTimeout(function () { location.href = URL[target]; }, ms);   // the snapshot now covers the screen until the next page has it up
      } else {
        move(el, left ? w : -w, 220, 'ease-in');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
        peek = null; peekFor = null; stop();
      }
    }
    document.addEventListener('touchend', end, false);
    document.addEventListener('touchcancel', end, false);
    // coming back with the Back gesture shows this page from the cache: take the snapshot away
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      gone = false; window.SWIPING = false;
      if (peek && peek.parentNode) peek.parentNode.removeChild(peek);
      peek = null; peekFor = null;
    }, false);
  }

  /* ---------- the snapshot this scene keeps of itself ----------
   * Every canvas and image on screen, drawn where it sits, at half size, clipped by the boxes
   * that clip it on the page and faded as it's faded. Words aren't drawn: they fade in with
   * the live scene. Photos (divs with a background) hand over their image as el._img. */
  function capture() {
    if (document.hidden || window.WX_OPEN || window.SWIPING || cover) return;
    var W = vw(), H = vh(), k = 0.5, c = document.createElement('canvas'), g;
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    g = c.getContext('2d');
    g.fillStyle = BG[HERE]; g.fillRect(0, 0, c.width, c.height);
    var els = body.querySelectorAll('canvas, img, .slide'), i, el, r, a, clip, n, cs, src, q;
    for (i = 0; i < els.length; i++) {
      el = els[i]; r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
      src = el.nodeName === 'CANVAS' || el.nodeName === 'IMG' ? el : el._img;
      if (!src || (src.nodeName === 'IMG' && !src.complete)) continue;
      a = 1; clip = [0, 0, W, H];
      for (n = el; n && n !== body && a > 0.02; n = n.parentNode) {
        cs = window.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') { a = 0; break; }
        a *= parseFloat(cs.opacity);
        if (n !== el && cs.overflow === 'hidden') {
          q = n.getBoundingClientRect();
          clip = [Math.max(clip[0], q.left), Math.max(clip[1], q.top), Math.min(clip[2], q.right), Math.min(clip[3], q.bottom)];
        }
      }
      if (a < 0.02 || clip[2] <= clip[0] || clip[3] <= clip[1]) continue;
      g.save();
      g.beginPath(); g.rect(clip[0] * k, clip[1] * k, (clip[2] - clip[0]) * k, (clip[3] - clip[1]) * k); g.clip();
      g.globalAlpha = Math.min(1, a);
      try {
        if (src === el) g.drawImage(src, r.left * k, r.top * k, r.width * k, r.height * k);
        else {   // background-size: cover
          var s = Math.max(r.width / src.width, r.height / src.height), dw = src.width * s, dh = src.height * s;
          g.drawImage(src, (r.left + (r.width - dw) / 2) * k, (r.top + (r.height - dh) / 2) * k, dw * k, dh * k);
        }
      } catch (err) {}
      g.restore();
    }
    try { localStorage.setItem('snap.' + HERE, c.toDataURL('image/jpeg', 0.6)); } catch (err) {}
  }
  setInterval(capture, 3 * 60000);   // the light, weather and photo change: keep it current

  /* ---------- the weather console, a little later ---------- */
  function lazyWx(el, unitFn) {
    if (!el) return;
    var link = document.querySelector('link[rel="x-later"]'), src = link ? link.getAttribute('href') : 'wx.js', state = 0, openIt = false;
    function load() {
      if (state) return;
      state = 1;
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { state = 2; Wx.attach(el, unitFn); if (openIt) Wx.open(); };
      s.onerror = function () { state = 0; };
      body.appendChild(s);
    }
    el.className += ' tap';
    el.addEventListener('click', function (e) {   // Wx.attach adds its own handler once loaded
      if (state === 2) return;
      e.stopPropagation(); openIt = true; load();
    }, false);
    window.addEventListener('load', function () { setTimeout(load, 5000); }, false);
  }

  /* ---------- load timing for the server log ---------- */
  var p = window.performance && performance.timing, T0 = p ? p.navigationStart : Date.now(), marks = [];
  function mark(n) { marks.push(n + ' ' + (Date.now() - T0)); }
  document.addEventListener('DOMContentLoaded', function () { mark('dom'); }, false);
  window.addEventListener('load', function () { mark('load'); }, false);
  setTimeout(function () {
    try { var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog', true);
      x.send('timing ' + HERE + (swipedIn ? ' (swiped in)' : '') + ': ' + (p ? 'html ' + (p.responseEnd - T0) + ', ' : '') + marks.join(', ')); } catch (e) {}
  }, 12000);
  mark('scripts');

  return { attach: attach, ready: ready, lazyWx: lazyWx, mark: mark, capture: capture };
})();
