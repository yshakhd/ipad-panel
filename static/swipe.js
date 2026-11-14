/*
 * Swipe sideways to change scene: photos, meadow, city, round and round. Swipe left for the
 * next scene, right for the one before. The page slides off in the swipe's direction first,
 * so it's clear the swipe registered. ES5 for iOS 9.
 *
 *   Swipe.attach('meadow', function () { return true; })   // the second argument: may we leave now?
 */
var Swipe = (function () {
  'use strict';
  var ORDER = ['photos', 'meadow', 'city'];
  var URL = { photos: '/', meadow: '/meadow.html', city: '/city.html' };

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
      var w = document.documentElement.clientWidth || window.innerWidth;
      // a deliberate sideways flick: a fifth of the screen, mostly level, under a second
      if (Math.abs(dx) < w * 0.2 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - t0 > 1000) return;
      if (window.WX_OPEN || (ok && !ok())) return;
      var i = ORDER.indexOf(here), next = ORDER[(i + (dx < 0 ? 1 : ORDER.length - 1)) % ORDER.length];
      gone = true;
      try { localStorage.setItem('scene', next); } catch (err) {}
      document.documentElement.style.background = '#000';
      var b = document.body.style;
      b.webkitTransition = b.transition = 'opacity 0.25s ease-in, -webkit-transform 0.25s ease-in, transform 0.25s ease-in';
      b.opacity = '0';
      b.webkitTransform = b.transform = 'translate3d(' + (dx < 0 ? -80 : 80) + 'px,0,0)';
      setTimeout(function () { location.href = URL[next]; }, 230);
    }, false);
    // coming back with the Back gesture shows the page from the cache: undo the slide
    window.addEventListener('pageshow', function () {
      gone = false;
      var b = document.body.style;
      b.webkitTransition = b.transition = 'none'; b.opacity = ''; b.webkitTransform = b.transform = '';
    }, false);
  }
  return { attach: attach };
})();
