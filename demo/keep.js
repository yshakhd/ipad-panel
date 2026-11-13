/*
 * Remembers the demo's settings in this browser, shared by the meadow and the city: the
 * place, °F or °C, which scene was open last, the city's room, and your photos. Nothing
 * leaves the device. Settings live in localStorage; photos (shrunk to 1600 px) live in
 * IndexedDB, which has room for them. A link's own settings (?place=...) still win.
 *
 *   Keep.get(key)  Keep.set(key, value or null)
 *   Keep.savePhotos(fileList, function (urls) {})  Keep.loadPhotos(function (urls) {})  Keep.clearPhotos()
 */
var Keep = (function () {
  'use strict';
  var P = 'panel.';
  function get(k) { try { var v = localStorage.getItem(P + k); return v === null ? null : JSON.parse(v); } catch (e) { return null; } }
  function set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(P + k); else localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} }

  // ask the browser to keep this site's storage rather than clear it when space runs low
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  function db(then) {
    if (!window.indexedDB) return then(null);
    try {
      var req = indexedDB.open('panel', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
      req.onsuccess = function () { then(req.result); };
      req.onerror = function () { then(null); };
    } catch (e) { then(null); }
  }
  function shrink(file, done) {   // a phone photo to a JPEG no bigger than 1600 px, as a data URL
    var src = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(src);
      done(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = function () { URL.revokeObjectURL(src); done(null); };
    img.src = src;
  }
  function savePhotos(files, done) {
    var list = [], i = 0, n = Math.min(files.length, 30);
    (function next() {
      if (i >= n) {
        db(function (d) {
          if (d) { try { var tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').put(list, 'list'); } catch (e) {} }
          done(list);
        });
        return;
      }
      shrink(files[i++], function (url) { if (url) list.push(url); next(); });
    })();
  }
  function loadPhotos(done) {
    db(function (d) {
      if (!d) return done([]);
      try {
        var r = d.transaction('photos', 'readonly').objectStore('photos').get('list');
        r.onsuccess = function () { done(r.result || []); };
        r.onerror = function () { done([]); };
      } catch (e) { done([]); }
    });
  }
  function clearPhotos() {
    db(function (d) { if (d) { try { d.transaction('photos', 'readwrite').objectStore('photos').delete('list'); } catch (e) {} } });
  }
  /* Updates. A Home Screen app hardly ever reloads (and has no reload button), so a fix could take
   * days to arrive. When the app comes back to the front, and every 15 minutes, ask the server
   * whether this page or its scripts changed (their ETags); if so, reload. The reload waits 11
   * minutes after a change is first seen, because the browser may keep its copies for 10. */
  var stampAt = null, changedAt = 0, busy = false;
  function stamp(done) {
    var urls = [location.href.split('#')[0].split('?')[0]], s = document.getElementsByTagName('script'), got = [], n, i;
    for (i = 0; i < s.length; i++) if (s[i].src && s[i].src.indexOf(location.protocol + '//' + location.host) === 0) urls.push(s[i].src);
    n = urls.length;
    for (i = 0; i < urls.length; i++) (function (k) {
      var x = new XMLHttpRequest();
      x.open('HEAD', urls[k] + (urls[k].indexOf('?') < 0 ? '?' : '&') + 'fresh=' + Date.now(), true);
      x.onload = function () { got[k] = x.status === 200 ? (x.getResponseHeader('ETag') || x.getResponseHeader('Last-Modified') || '') : '?'; if (--n === 0) done(got.join('|')); };
      x.onerror = function () { got[k] = '?'; if (--n === 0) done(null); };
      x.send();
    })(i);
  }
  function checkUpdate() {
    if (busy || location.protocol.indexOf('http') !== 0 || document.hidden) return;
    if (changedAt && Date.now() - changedAt > 11 * 60000) { if (!/\bpanel\b/.test(document.body.className)) location.reload(); return; }   // not while the settings are open
    busy = true;
    stamp(function (st) {
      busy = false;
      if (!st || st.indexOf('?') >= 0) return;   // offline, or a file missing: try later
      if (stampAt === null) stampAt = st;
      else if (st !== stampAt && !changedAt) changedAt = Date.now();
    });
  }
  setTimeout(checkUpdate, 5000);
  setInterval(checkUpdate, 15 * 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(checkUpdate, 1500); }, false);
  window.addEventListener('pageshow', function () { setTimeout(checkUpdate, 1500); }, false);

  // The panel's Reload button: fetch fresh copies of this page and its scripts first (a plain
  // reload may reuse copies up to 10 minutes old), then reload. Settings and photos stay.
  function freshReload() {
    var urls = [location.href.split('#')[0]], s = document.getElementsByTagName('script'), n, i, done = false;
    for (i = 0; i < s.length; i++) if (s[i].src && s[i].src.indexOf(location.protocol + '//' + location.host) === 0) urls.push(s[i].src);
    function go() { if (!done) { done = true; location.reload(); } }
    if (!window.fetch) return go();
    n = urls.length;
    for (i = 0; i < urls.length; i++) fetch(urls[i], { cache: 'reload' }).then(function () { if (--n === 0) go(); }, function () { if (--n === 0) go(); });
    setTimeout(go, 4000);   // don't wait forever on a slow connection
  }

  return { get: get, set: set, savePhotos: savePhotos, loadPhotos: loadPhotos, clearPhotos: clearPhotos, freshReload: freshReload };
})();
