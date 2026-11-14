/*
 * Shared by the three iPad scenes. ES5 for iOS 9.
 *
 * Swipe sideways to change scene: photos, meadow, city, round and round. Swipe left for the
 * next scene, right for the one before. The page slides out the way you swiped, and the next
 * one slides in from the other side once it has drawn (the direction is handed over in
 * sessionStorage, since each scene is its own page).
 *
 *   Swipe.attach('meadow', function () { return true; })   // may we leave now? (no console open...)
 *   Swipe.ready()     the page has drawn: slide it in (and note the time for the server log)
 *   Swipe.lazyWx(el, unitFn)   load the weather console (wx.js, 56 KB) after the scene is up,
 *                              not before it; a tap on the temperature before then loads it at once
 *   Swipe.mark(name)  a point in the load timing the server log gets
 */
var Swipe = (function () {
  'use strict';
  var ORDER = ['photos', 'meadow', 'city'];
  var URL = { photos: '/', meadow: '/meadow.html', city: '/city.html' };
  var EASE = 'cubic-bezier(0.25, 0.8, 0.3, 1)';
  var root = document.documentElement, body = document.body;

  function css(el, tf, op, tr) {
    var s = el.style;
    s.webkitTransition = s.transition = tr ? '-webkit-transform ' + tr + ', transform ' + tr + ', opacity ' + tr : 'none';
    s.webkitTransform = s.transform = tf; s.opacity = op;
  }

  /* ---------- arriving: start off to the side, slide in when the page says it has drawn ---------- */
  var from = null, shown = false;
  try {
    var h = JSON.parse(sessionStorage.getItem('swipe') || 'null');
    sessionStorage.removeItem('swipe');
    if (h && Date.now() - h.at < 8000) from = h.dir;   // only straight after a swipe
  } catch (e) {}
  if (from) { root.style.background = '#000'; css(body, 'translate3d(' + (from === 'right' ? 100 : -100) + '%,0,0)', '1'); }
  function ready() {
    if (shown) return;
    shown = true; mark('ready');
    if (!from) return;
    var raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function (f) { setTimeout(f, 16); };
    raf(function () { raf(function () {   // two frames: let the first picture reach the screen before moving it
      css(body, 'translate3d(0,0,0)', '1', '0.45s ' + EASE);
      setTimeout(function () { css(body, '', ''); }, 520);   // drop the transform: it costs memory on a 1 GB-less iPad
    }); });
  }
  setTimeout(ready, 2500);   // never stay off screen if a page forgets to say so

  /* ---------- leaving ---------- */
  function attach(here, ok) {
    var x0 = null, y0 = 0, t0 = 0, gone = false;
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, false);
    document.addEventListener('touchend', function (e) {
      if (x0 === null || gone) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      var w = root.clientWidth || window.innerWidth;
      // a deliberate sideways flick: a fifth of the screen, mostly level, under a second
      if (Math.abs(dx) < w * 0.2 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - t0 > 1000) return;
      if (window.WX_OPEN || (ok && !ok())) return;
      var left = dx < 0, i = ORDER.indexOf(here), next = ORDER[(i + (left ? 1 : ORDER.length - 1)) % ORDER.length];
      gone = true;
      try { localStorage.setItem('scene', next); sessionStorage.setItem('swipe', JSON.stringify({ dir: left ? 'right' : 'left', at: Date.now() })); } catch (err) {}
      root.style.background = '#000';
      css(body, 'translate3d(' + (left ? -100 : 100) + '%,0,0)', '1', '0.3s cubic-bezier(0.5, 0, 0.75, 0)');
      setTimeout(function () { location.href = URL[next]; }, 120);   // start loading the next page while this one slides
    }, false);
    // coming back with the Back gesture shows the page from the cache: put it back in place
    window.addEventListener('pageshow', function (e) { if (e.persisted) { gone = false; css(body, '', ''); } }, false);
  }

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
    var here = location.pathname.split('/').pop() || 'photos';
    try { var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog', true);
      x.send('timing ' + here + (from ? ' (swiped in)' : '') + ': ' + (p ? 'html ' + (p.responseEnd - T0) + ', ' : '') + marks.join(', ')); } catch (e) {}
  }, 12000);
  mark('scripts');

  return { attach: attach, ready: ready, lazyWx: lazyWx, mark: mark };
})();
