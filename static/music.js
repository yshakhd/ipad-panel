/*
 * Music: a Spotify remote that pops up over the scene. ES5 for iOS 9.
 *
 * The iPad can't play Spotify itself; the music plays on a Spotify Connect speaker (spotifyd on
 * the panel's computer by default) and this drives it through the server (/api/spotify/...).
 * Two looks, one player: 'phone' (the city's phones, the photo scene's button) and 'radio'
 * (the meadow's wireless in the grass): cream paper, serif, a tuning dial for the progress bar.
 *
 *   Music.attach(el, 'phone' | 'radio')   tap el to open
 *   Music.setState(s.music)               from /api/state: {playing, name, artist} or null
 *   Music.onChange(fn)                    fn(playing, info) whenever that changes, for glows
 * While open, window.WX_OPEN is set: the scene stops drawing and swipes are ignored.
 */
var Music = (function () {
  'use strict';
  var W = 1024, H = 768;
  var root = null, box = null, skin = 'phone', st = null, lib = null, tab = 'now', stack = [], pollT = null, tickT = null, idleT = null;
  var listeners = [], playing = false, info = null, busy = false, lastArt = '', volDrag = null;

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mmss(ms) { var s = Math.max(0, Math.round((ms || 0) / 1000)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function req(method, url, body, done) {
    var x = new XMLHttpRequest();
    x.open(method, url, true); x.timeout = 15000;
    x.onload = function () { var d = null; try { d = JSON.parse(x.responseText); } catch (e) {} done(d || { error: 'The server sent something odd.' }); };
    x.onerror = x.ontimeout = function () { done({ error: 'Couldn’t reach the panel server.' }); };
    x.send(body ? JSON.stringify(body) : null);
  }

  /* ---------------- look ---------------- */
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 6l8.5 6L6 18zM16 6h2v12h-2z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 6l-8.5 6L18 18zM6 6h2v12H6z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M14.8 4H20v5.2l-1.9-1.9-3.4 3.4-1.4-1.4 3.4-3.4zM4 18.6L18.6 4 20 5.4 5.4 20zM13.3 14.7l1.4-1.4 3.4 3.4 1.9-1.9V20h-5.2l1.9-1.9z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15.4 5.4L14 4l-8 8 8 8 1.4-1.4L8.8 12z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24"><path d="M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm5 3a2 2 0 100 4 2 2 0 000-4zm0 6a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/></svg>'
  };
  var CSS = [
    '#mz { position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 9000; background: rgba(0,0,0,0); -webkit-transition: background 0.3s; transition: background 0.3s; }',
    '#mz.on { background: rgba(0,0,0,0.55); }',
    '#mz-box { position: absolute; left: 0; top: 0; width: 1024px; height: 768px; -webkit-transform-origin: 0 0; transform-origin: 0 0; }',
    '#mz-dev { position: absolute; left: 332px; top: 24px; width: 360px; height: 720px; border-radius: 52px; background: #111216;',
    '  box-shadow: inset 0 0 0 2px #2a2c33, inset 0 0 0 5px #0a0a0c, 0 30px 80px rgba(0,0,0,0.6);',
    '  -webkit-transform: translate3d(0,800px,0); transform: translate3d(0,800px,0); -webkit-transition: -webkit-transform 0.42s cubic-bezier(0.2,0.8,0.25,1); transition: transform 0.42s cubic-bezier(0.2,0.8,0.25,1); }',
    '#mz.on #mz-dev { -webkit-transform: translate3d(0,0,0); transform: translate3d(0,0,0); }',
    '#mz-scr { position: absolute; left: 12px; top: 12px; right: 12px; bottom: 12px; border-radius: 40px; overflow: hidden; background: #1a1c22; color: #f4f1ea;',
    '  font-family: "Newsreader", Georgia, serif; -webkit-font-smoothing: antialiased; }',
    '#mz-tint { position: absolute; left: 0; top: 0; right: 0; height: 420px; opacity: 0.85; -webkit-transition: background-color 1s; transition: background-color 1s; }',
    '#mz-tint:after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 260px; background: -webkit-linear-gradient(top, rgba(26,28,34,0), #1a1c22); background: linear-gradient(rgba(26,28,34,0), #1a1c22); }',
    '#mz-top { position: absolute; left: 0; right: 0; top: 0; height: 40px; padding: 0 28px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center;',
    '  -webkit-justify-content: space-between; justify-content: space-between; font-size: 15px; font-weight: 500; z-index: 2; }',
    '#mz-top i { font-style: normal; opacity: 0.7; font-size: 13px; }',
    '#mz-body { position: absolute; left: 0; right: 0; top: 40px; bottom: 64px; overflow-y: auto; -webkit-overflow-scrolling: touch; z-index: 1; }',
    '#mz-tabs { position: absolute; left: 0; right: 0; bottom: 0; height: 64px; display: -webkit-flex; display: flex; background: rgba(12,13,16,0.92); z-index: 2; }',
    '#mz-tabs div { -webkit-flex: 1; flex: 1; text-align: center; padding-top: 12px; font-size: 15px; opacity: 0.55; }',
    '#mz-tabs div.on { opacity: 1; }',
    '#mz-tabs div.on:before { content: ""; display: block; width: 22px; height: 3px; border-radius: 2px; margin: -9px auto 6px; background: #1ed760; }',
    '#mz-home { position: absolute; left: 50%; bottom: 6px; width: 120px; height: 5px; margin-left: -60px; border-radius: 3px; background: rgba(255,255,255,0.55); z-index: 3; }',
    '#mz-close { position: absolute; left: 50%; bottom: -10px; width: 200px; height: 30px; margin-left: -100px; z-index: 4; }',
    /* now playing */
    '.mz-now { padding: 14px 26px 0; text-align: center; }',
    '.mz-art { width: 264px; height: 264px; margin: 6px auto 0; border-radius: 10px; background-color: #2a2d35; background-position: center; background-size: cover; background-repeat: no-repeat; box-shadow: 0 16px 40px rgba(0,0,0,0.45); }',
    '.mz-art.empty { background-image: none; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; font-size: 72px; color: rgba(255,255,255,0.25); }',
    '.mz-title { margin-top: 22px; font-size: 23px; font-weight: 500; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mz-artist { margin-top: 3px; font-size: 17px; font-style: italic; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mz-bar { position: relative; height: 26px; margin-top: 16px; }',
    '.mz-bar b { position: absolute; left: 0; right: 0; top: 11px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.22); }',
    '.mz-bar b i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 2px; background: #f4f1ea; }',
    '.mz-times { display: -webkit-flex; display: flex; -webkit-justify-content: space-between; justify-content: space-between; font-size: 13px; opacity: 0.65; margin-top: -2px; }',
    '.mz-ctl { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: space-between; justify-content: space-between; margin: 12px 4px 0; }',
    '.mz-ctl div { width: 44px; height: 44px; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; }',
    '.mz-ctl svg { width: 30px; height: 30px; fill: #f4f1ea; }',
    '.mz-ctl .mz-pp { width: 70px; height: 70px; border-radius: 35px; background: #f4f1ea; }',
    '.mz-ctl .mz-pp svg { width: 34px; height: 34px; fill: #15161a; }',
    '.mz-ctl .mz-sh svg { width: 22px; height: 22px; opacity: 0.45; } .mz-ctl .mz-sh.on svg { opacity: 1; fill: #1ed760; }',
    '.mz-vol { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; margin-top: 14px; font-size: 22px; }',
    '.mz-vol span { width: 30px; opacity: 0.7; }',
    '.mz-vol .mz-bar { -webkit-flex: 1; flex: 1; margin-top: 0; }',
    '.mz-devbtn { display: inline-block; margin-top: 14px; padding: 7px 16px; border-radius: 18px; background: rgba(255,255,255,0.1); font-size: 15px; color: #1ed760; }',
    '.mz-devbtn svg { width: 15px; height: 15px; fill: #1ed760; vertical-align: -2px; margin-right: 6px; }',
    '.mz-msg { padding: 60px 30px 0; text-align: center; font-size: 19px; line-height: 1.4; }',
    '.mz-msg small { display: block; margin-top: 12px; font-size: 15px; opacity: 0.7; font-style: italic; }',
    '.mz-msg code { font-family: Menlo, monospace; font-size: 12px; background: rgba(255,255,255,0.1); padding: 2px 4px; border-radius: 4px; word-break: break-all; }',
    '.mz-err { margin: 12px 20px 0; padding: 8px 12px; border-radius: 10px; background: rgba(255,90,70,0.18); color: #ffb2a6; font-size: 15px; text-align: left; }',
    '.mz-btn { display: inline-block; margin-top: 18px; padding: 10px 24px; border-radius: 22px; background: #1ed760; color: #0c0d10; font-weight: 500; font-size: 17px; }',
    /* lists */
    '.mz-h { padding: 18px 20px 6px; font-size: 21px; font-weight: 500; }',
    '.mz-row { display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; padding: 6px 20px; }',
    '.mz-row:active { background: rgba(255,255,255,0.08); }',
    '.mz-row.on .mz-rt { color: #1ed760; }',
    '.mz-th { width: 46px; height: 46px; border-radius: 5px; background-color: #2a2d35; background-position: center; background-size: cover; background-repeat: no-repeat; -webkit-flex: none; flex: none; margin-right: 12px; }',
    '.mz-rx { -webkit-flex: 1; flex: 1; min-width: 0; }',
    '.mz-rt { font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mz-rs { font-size: 14px; font-style: italic; opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mz-more { padding: 8px 20px; font-size: 15px; color: #1ed760; }',
    '.mz-back { padding: 10px 14px 0; font-size: 16px; } .mz-back svg { width: 22px; height: 22px; fill: currentColor; vertical-align: -6px; }',
    '.mz-plh { text-align: center; padding: 6px 24px 8px; }',
    '.mz-plh .mz-art { width: 180px; height: 180px; }',
    '.mz-plh .mz-title { margin-top: 14px; white-space: normal; }',
    '.mz-note { padding: 10px 26px; font-size: 15px; font-style: italic; opacity: 0.65; text-align: center; }',
    '.mz-search { padding: 14px 18px 4px; display: -webkit-flex; display: flex; }',
    '.mz-search input { -webkit-flex: 1; flex: 1; min-width: 0; font: 18px Georgia, serif; padding: 9px 12px; border: 0; border-radius: 10px; background: #f4f1ea; color: #15161a; -webkit-appearance: none; }',
    '.mz-search div { padding: 9px 0 0 12px; font-size: 17px; color: #1ed760; }',
    /* the radio: a meadow wireless, walnut and cream */
    '#mz.radio #mz-dev { left: 292px; top: 40px; width: 440px; height: 690px; border-radius: 34px;',
    '  background: -webkit-linear-gradient(left, #5a3420, #8a5634 18%, #7a4a2a 50%, #8f5a36 82%, #5a3420); background: linear-gradient(90deg, #5a3420, #8a5634 18%, #7a4a2a 50%, #8f5a36 82%, #5a3420);',
    '  box-shadow: inset 0 2px 0 rgba(255,220,170,0.35), inset 0 -3px 0 rgba(0,0,0,0.3), 0 30px 80px rgba(0,0,0,0.6); }',
    '#mz.radio #mz-dev:before { content: ""; position: absolute; left: 150px; top: -34px; width: 140px; height: 50px; border: 7px solid #3e2416; border-bottom: 0; border-radius: 30px 30px 0 0; }',
    '#mz.radio #mz-scr { left: 26px; top: 26px; right: 26px; bottom: 26px; border-radius: 14px; background: #efe3c4; color: #3b2417;',
    '  box-shadow: inset 0 0 0 3px #c8a76a, inset 0 0 30px rgba(120,80,30,0.25); }',
    '#mz.radio #mz-tint { display: none; }',
    '#mz.radio #mz-top { height: 54px; background-color: #d9c79c; background-image: -webkit-radial-gradient(center, circle, #6b4a2c 1.6px, rgba(0,0,0,0) 2.2px); background-image: radial-gradient(circle, #6b4a2c 1.6px, rgba(0,0,0,0) 2.2px); background-size: 9px 9px;',
    '  border-bottom: 3px solid #c8a76a; color: #3b2417; }',
    '#mz.radio #mz-top span, #mz.radio #mz-top i { background: #efe3c4; padding: 2px 10px; border-radius: 10px; opacity: 1; }',
    '#mz.radio #mz-body { top: 57px; }',
    '#mz.radio #mz-tabs { background: #e2d2a8; border-top: 3px solid #c8a76a; }',
    '#mz.radio #mz-tabs div.on:before { background: #b5542c; }',
    '#mz.radio #mz-home { background: rgba(59,36,23,0.35); }',
    '#mz.radio .mz-art { border-radius: 4px; box-shadow: 0 0 0 6px #fbf4e1, 0 10px 24px rgba(80,50,20,0.35); }',
    '#mz.radio .mz-bar b { top: 0; height: 26px; border-radius: 3px; background-color: #f8efd8; background-repeat: no-repeat; background-position: 0 14px; background-size: 100% 12px;',
    '  background-image: -webkit-repeating-linear-gradient(left, rgba(59,36,23,0.55) 0, rgba(59,36,23,0.55) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 12px);',
    '  background-image: repeating-linear-gradient(90deg, rgba(59,36,23,0.55) 0, rgba(59,36,23,0.55) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 12px); box-shadow: inset 0 0 0 1px #c8a76a; }',
    '#mz.radio .mz-bar b i { background: none; border-right: 2px solid #c0392b; border-radius: 0; }',
    '#mz.radio .mz-ctl svg { fill: #3b2417; }',
    '#mz.radio .mz-ctl .mz-pp { background: -webkit-radial-gradient(40% 35%, circle, #f0d69a, #b88a3e 70%, #8a6428); background: radial-gradient(circle at 40% 35%, #f0d69a, #b88a3e 70%, #8a6428); box-shadow: 0 3px 8px rgba(60,30,10,0.4); }',
    '#mz.radio .mz-ctl .mz-pp svg { fill: #3b2417; }',
    '#mz.radio .mz-ctl .mz-sh.on svg, #mz.radio .mz-devbtn svg { fill: #b5542c; }',
    '#mz.radio .mz-devbtn, #mz.radio .mz-more, #mz.radio .mz-search div, #mz.radio .mz-row.on .mz-rt { color: #b5542c; }',
    '#mz.radio .mz-devbtn { background: rgba(59,36,23,0.08); }',
    '#mz.radio .mz-btn { background: #b5542c; color: #fbf4e1; }',
    '#mz.radio .mz-th { background-color: #d9c79c; }',
    '#mz.radio .mz-row:active { background: rgba(59,36,23,0.08); }',
    '#mz.radio .mz-search input { background: #fbf4e1; color: #3b2417; box-shadow: inset 0 0 0 1px #c8a76a; }',
    '#mz.radio .mz-msg code { background: rgba(59,36,23,0.08); }',
    '#mz.radio .mz-err { background: rgba(181,84,44,0.15); color: #8a3218; }',
    '#mz.radio .mz-now { padding-top: 6px; } #mz.radio .mz-art { width: 196px; height: 196px; margin-top: 10px; } #mz.radio .mz-title { margin-top: 18px; }',
    '#mz.radio .mz-ctl { margin-top: 8px; } #mz.radio .mz-vol { margin-top: 8px; } #mz.radio .mz-devbtn { margin-top: 10px; }',
    '#mz svg { display: block; } #mz .mz-devbtn svg { display: inline-block; }'
  ].join('\n');

  /* ---------------- frame ---------------- */
  function build() {
    if (root) return;
    var s = document.createElement('style'); s.textContent = CSS; document.getElementsByTagName('head')[0].appendChild(s);
    root = document.createElement('div'); root.id = 'mz';
    root.innerHTML = '<div id="mz-box"><div id="mz-dev"><div id="mz-scr"><div id="mz-tint"></div>' +
      '<div id="mz-top"><span id="mz-clock"></span><i id="mz-brand">Spotify</i></div>' +
      '<div id="mz-body"></div>' +
      '<div id="mz-tabs"><div data-t="now">Playing</div><div data-t="lib">Library</div><div data-t="find">Search</div></div>' +
      '<div id="mz-home"></div><div id="mz-close"></div></div></div></div>';
    document.body.appendChild(root);
    box = $('mz-box');
    fit();
    window.addEventListener('resize', fit, false);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 300); }, false);
    root.addEventListener('click', function (e) {
      poke();
      var t = e.target;
      if (t === root || t === box) return close();   // outside the device
      while (t && t !== root && !t.getAttribute('data-a') && !t.getAttribute('data-t') && t.id !== 'mz-close') t = t.parentNode;
      if (!t || t === root) return;
      if (t.id === 'mz-close') return close();
      if (t.getAttribute('data-t')) { stack = []; show(t.getAttribute('data-t')); return; }
      act(t.getAttribute('data-a'), t);
    }, false);
    root.addEventListener('touchstart', poke, false);
    // drag on a bar: seek, or volume (sent when you let go)
    root.addEventListener('touchstart', function (e) { var b = bar(e.target); if (b) { volDrag = b; dragTo(e); } }, false);
    root.addEventListener('touchmove', function (e) { if (volDrag) { e.preventDefault(); dragTo(e); } }, false);
    root.addEventListener('touchend', function () { if (volDrag) { var b = volDrag; volDrag = null; commitBar(b); } }, false);
    root.addEventListener('keydown', function (e) { if (e.keyCode === 13 && e.target.id === 'mz-q') { e.preventDefault(); find(); } }, false);
  }
  function fit() {
    if (!box) return;
    var vw = document.documentElement.clientWidth || window.innerWidth, vh = document.documentElement.clientHeight || window.innerHeight;
    var k = Math.min(vw / W, vh / H), x = (vw - W * k) / 2, y = (vh - H * k) / 2;
    box.style.webkitTransform = box.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + k + ')';
  }
  function bar(t) { while (t && t !== root) { if (t.getAttribute && t.getAttribute('data-bar')) return t; t = t.parentNode; } return null; }
  function dragTo(e) {
    var b = volDrag, r = b.getBoundingClientRect(), p = e.touches ? e.touches[0] : e;
    var f = Math.max(0, Math.min(1, (p.clientX - r.left) / r.width));
    b.setAttribute('data-f', f);
    b.getElementsByTagName('i')[0].style.width = (f * 100) + '%';
  }
  function commitBar(b) {
    var f = +b.getAttribute('data-f');
    if (b.getAttribute('data-bar') === 'seek') { if (st && st.track) send({ action: 'seek', ms: Math.round(f * st.track.ms) }); }
    else send({ action: 'volume', pct: Math.round(f * 100) });
  }

  function open(which) {
    build();
    skin = which || 'phone';
    root.className = skin;
    $('mz-brand').textContent = skin === 'radio' ? 'The wireless · Spotify' : 'Spotify';
    window.WX_OPEN = true;
    root.style.display = 'block';
    void root.offsetWidth;
    root.className = skin + ' on';
    stack = []; show('now');
    refresh(); clearInterval(pollT); pollT = setInterval(refresh, 2500);
    clearInterval(tickT); tickT = setInterval(tick, 500);
    poke();
  }
  function close() {
    if (!root) return;
    root.className = skin;
    clearInterval(pollT); clearInterval(tickT); clearTimeout(idleT);
    var q = $('mz-q'); if (q) q.blur();
    setTimeout(function () { root.style.display = 'none'; window.WX_OPEN = false; }, 420);
  }
  function poke() { clearTimeout(idleT); idleT = setTimeout(close, 180000); }   // back to the scene after 3 idle minutes

  /* ---------------- data ---------------- */
  function refresh() {
    req('GET', '/api/spotify/state?t=' + Date.now(), null, function (d) {
      if (!root || root.style.display === 'none') return;
      if (d.error && d.status !== 'ready' && !d.status) { st = { status: 'ready', active: false, err: d.error }; }
      else st = d;
      st.got = Date.now();
      note(!!st.playing, st.track ? { name: st.track.name, artist: st.track.artist } : null);
      if (tab === 'now' && !stack.length) paintNow();
      else markRows();
    });
  }
  function send(cmd) {
    if (busy) return;
    busy = true; poke();
    req('POST', '/api/spotify/cmd', cmd, function (d) {
      busy = false;
      if (d.error) { flash(d.error); return; }
      st = d; st.got = Date.now();
      note(!!st.playing, st.track ? { name: st.track.name, artist: st.track.artist } : null);
      if (tab === 'now' && !stack.length) paintNow(); else markRows();
    });
  }
  function flash(msg) {
    var b = $('mz-body'), e = document.createElement('div');
    e.className = 'mz-err'; e.textContent = msg;
    b.insertBefore(e, b.firstChild); b.scrollTop = 0;
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 6000);
  }
  function tick() {
    var d = new Date(), h = d.getHours();
    $('mz-clock').textContent = (h % 12 || 12) + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    if (!st || !st.track || tab !== 'now' || stack.length || volDrag) return;
    var p = st.progress + (st.playing ? Date.now() - st.got : 0), b = $('mz-seek');
    if (p > st.track.ms + 1500 && st.playing) refresh();
    p = Math.min(p, st.track.ms);
    if (b) { b.style.width = (100 * p / st.track.ms) + '%'; $('mz-pos').textContent = mmss(p); }
  }

  /* ---------------- views ---------------- */
  function show(t) {
    tab = t;
    var tabs = $('mz-tabs').getElementsByTagName('div');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = tabs[i].getAttribute('data-t') === t ? 'on' : '';
    $('mz-body').scrollTop = 0;
    if (t === 'now') paintNow();
    else if (t === 'lib') paintLib();
    else paintFind();
  }
  function setup(status) {
    if (status === 'unconfigured') return '<div class="mz-msg">Spotify isn’t set up yet.<small>Add your Spotify app’s Client ID and Secret to <code>config.json</code> under <code>spotify</code> (the README has the steps).</small></div>';
    return '<div class="mz-msg">Almost there: connect your Spotify account.<small>On the panel’s computer, open<br><code>http://127.0.0.1:8765/api/spotify/login</code><br>and press Agree.</small></div>';
  }
  function tint(url) {   // the album cover's average colour behind the player
    if (!url || url === lastArt) return;
    lastArt = url;
    var img = new Image();
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 8;
        var g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
        var d = g.getImageData(0, 0, 8, 8).data, r = 0, gg = 0, b = 0, n = d.length / 4;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        $('mz-tint').style.backgroundColor = 'rgb(' + Math.round(r / n * 0.8) + ',' + Math.round(gg / n * 0.8) + ',' + Math.round(b / n * 0.8) + ')';
      } catch (e) {}
    };
    img.src = url;
  }
  function paintNow() {
    var b = $('mz-body');
    if (!st) { b.innerHTML = '<div class="mz-msg">Tuning in…</div>'; return; }
    if (st.status && st.status !== 'ready') { b.innerHTML = setup(st.status); return; }
    var t = st.track, err = st.err || st.error;
    if (!st.active || !t) {
      b.innerHTML = (err ? '<div class="mz-err">' + esc(err) + '</div>' : '') +
        '<div class="mz-now"><div class="mz-art empty">♪</div><div class="mz-title">Nothing playing</div>' +
        '<div class="mz-artist">Pick something from your Library, or carry on where you left off.</div>' +
        '<div class="mz-btn" data-a="play">Play</div></div>';
      $('mz-tint').style.backgroundColor = '';
      lastArt = '';
      return;
    }
    tint(t.art);
    var p = Math.min(st.progress + (st.playing ? Date.now() - st.got : 0), t.ms), dev = st.device || {}, vol = dev.volume;
    b.innerHTML = '<div class="mz-now">' +
      '<div class="mz-art" style="background-image:url(' + esc(t.art || '') + ')"></div>' +
      '<div class="mz-title">' + esc(t.name) + '</div><div class="mz-artist">' + esc(t.artist) + '</div>' +
      '<div class="mz-bar" data-bar="seek"><b><i id="mz-seek" style="width:' + (100 * p / t.ms) + '%"></i></b></div>' +
      '<div class="mz-times"><span id="mz-pos">' + mmss(p) + '</span><span>' + mmss(t.ms) + '</span></div>' +
      '<div class="mz-ctl"><div class="mz-sh' + (st.shuffle ? ' on' : '') + '" data-a="shuffle">' + ICON.shuffle + '</div>' +
      '<div data-a="prev">' + ICON.prev + '</div>' +
      '<div class="mz-pp" data-a="' + (st.playing ? 'pause' : 'play') + '">' + (st.playing ? ICON.pause : ICON.play) + '</div>' +
      '<div data-a="next">' + ICON.next + '</div><div></div></div>' +
      (vol != null && dev.can_volume !== false ? '<div class="mz-vol"><span>−</span><div class="mz-bar" data-bar="vol"><b><i style="width:' + vol + '%"></i></b></div><span style="text-align:right">+</span></div>' : '') +
      '<div class="mz-devbtn" data-a="devices">' + ICON.speaker + 'Playing on ' + esc(dev.name || 'a speaker') + '</div>' +
      '</div>';
  }
  function row(item, a, sub) {
    return '<div class="mz-row" data-a="' + a + '" data-uri="' + esc(item.uri || '') + '"' + (item.id ? ' data-id="' + esc(item.id) + '"' : '') + '>' +
      '<div class="mz-th"' + (item.thumb ? ' style="background-image:url(' + esc(item.thumb) + ')"' : '') + '></div>' +
      '<div class="mz-rx"><div class="mz-rt">' + esc(item.name) + '</div><div class="mz-rs">' + esc(sub) + '</div></div></div>';
  }
  function markRows() {   // the song that's playing, in green
    var cur = st && st.track ? st.track.uri : '', rows = $('mz-body').querySelectorAll('.mz-row');
    for (var i = 0; i < rows.length; i++) rows[i].className = 'mz-row' + (cur && rows[i].getAttribute('data-uri') === cur ? ' on' : '');
  }
  var lists = {};   // song lists by name, for "play this list starting here"
  function songs(name, list, max) {
    lists[name] = list;
    var h = '';
    for (var i = 0; i < list.length && i < (max || 100); i++) h += row(list[i], 'song:' + name, list[i].artist);
    return h;
  }
  function paintLib() {
    var b = $('mz-body');
    if (st && st.status && st.status !== 'ready') { b.innerHTML = setup(st.status); return; }
    if (!lib) {
      b.innerHTML = '<div class="mz-msg">Opening your library…</div>';
      req('GET', '/api/spotify/library', null, function (d) {
        if (d.status && d.status !== 'ready') { st = st || {}; st.status = d.status; if (tab === 'lib') paintLib(); return; }
        if (d.error) { if (tab === 'lib') b.innerHTML = '<div class="mz-err">' + esc(d.error) + '</div>'; return; }
        lib = d; lib.at = Date.now();
        if (tab === 'lib' && !stack.length) paintLib();
      });
      return;
    }
    if (Date.now() - lib.at > 300000) { lib = null; return paintLib(); }
    var h = '';
    if (lib.recent.length) h += '<div class="mz-h">Recently played</div>' + songs('recent', lib.recent, 6);
    if (lib.liked.length) h += '<div class="mz-h">Liked songs</div>' + songs('liked', lib.liked, 6) + (lib.liked.length > 6 ? '<div class="mz-more" data-a="all:liked">All ' + lib.liked.length + '</div>' : '');
    if (lib.playlists.length) {
      h += '<div class="mz-h">Your playlists</div>';
      for (var i = 0; i < lib.playlists.length; i++) h += row(lib.playlists[i], 'playlist', lib.playlists[i].by ? 'by ' + lib.playlists[i].by : 'Playlist');
    }
    b.innerHTML = h || '<div class="mz-msg">Your library is empty.</div>';
    markRows();
  }
  function paintAll(name, title) {
    stack.push(name);
    $('mz-body').innerHTML = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-h">' + esc(title) + '</div>' + songs(name, lists[name]);
    $('mz-body').scrollTop = 0; markRows();
  }
  function paintPlaylist(id) {
    stack.push('pl');
    var b = $('mz-body');
    b.innerHTML = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-msg">Opening…</div>';
    b.scrollTop = 0;
    req('GET', '/api/spotify/playlist/' + encodeURIComponent(id), null, function (d) {
      if (stack[stack.length - 1] !== 'pl') return;
      if (d.error) { b.innerHTML = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-err">' + esc(d.error) + '</div>'; return; }
      lists.pl = d.tracks; lists.plUri = d.uri;
      var h = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-plh">' +
        '<div class="mz-art"' + (d.art ? ' style="background-image:url(' + esc(d.art) + ')"' : '') + '></div>' +
        '<div class="mz-title">' + esc(d.name) + '</div><div class="mz-artist">' + (d.by ? 'by ' + esc(d.by) : '') + '</div>' +
        '<div class="mz-btn" data-a="ctx" data-uri="' + esc(d.uri) + '">Play</div></div>';
      if (d.tracks.length) for (var i = 0; i < d.tracks.length; i++) h += row(d.tracks[i], 'plsong', d.tracks[i].artist);
      else h += '<div class="mz-note">Spotify only shares the songs of playlists you made. Press Play to hear it.</div>';
      b.innerHTML = h; markRows();
    });
  }
  function paintFind() {
    var b = $('mz-body'), q = lists.q || '';
    if (st && st.status && st.status !== 'ready') { b.innerHTML = setup(st.status); return; }
    b.innerHTML = '<div class="mz-search"><input id="mz-q" type="search" placeholder="Songs, albums, playlists" autocorrect="off" autocapitalize="off" value="' + esc(q) + '"><div data-a="find">Search</div></div><div id="mz-res"></div>';
    if (lists.res) paintResults(lists.res);
  }
  function find() {
    var q = ($('mz-q').value || '').replace(/^\s+|\s+$/g, '');
    if (!q) return;
    lists.q = q; $('mz-q').blur();
    $('mz-res').innerHTML = '<div class="mz-note">Looking…</div>';
    req('GET', '/api/spotify/search?q=' + encodeURIComponent(q), null, function (d) {
      if (tab !== 'find') return;
      if (d.error) { $('mz-res').innerHTML = '<div class="mz-err">' + esc(d.error) + '</div>'; return; }
      lists.res = d; paintResults(d);
    });
  }
  function paintResults(d) {
    var h = '', i;
    if (d.tracks.length) h += '<div class="mz-h">Songs</div>' + songs('found', d.tracks);
    if (d.albums.length) { h += '<div class="mz-h">Albums</div>'; for (i = 0; i < d.albums.length; i++) h += row(d.albums[i], 'ctx', d.albums[i].by); }
    if (d.playlists.length) { h += '<div class="mz-h">Playlists</div>'; for (i = 0; i < d.playlists.length; i++) h += row(d.playlists[i], 'playlist', d.playlists[i].by ? 'by ' + d.playlists[i].by : 'Playlist'); }
    $('mz-res').innerHTML = h || '<div class="mz-note">Nothing found. Try other words.</div>';
    markRows();
  }
  function paintDevices() {
    stack.push('dev');
    var b = $('mz-body');
    b.innerHTML = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-h">Play on</div><div class="mz-msg">Looking for speakers…</div>';
    req('GET', '/api/spotify/devices', null, function (d) {
      if (stack[stack.length - 1] !== 'dev') return;
      var h = '<div class="mz-back" data-a="back">' + ICON.back + ' Back</div><div class="mz-h">Play on</div>';
      if (d.error) h += '<div class="mz-err">' + esc(d.error) + '</div>';
      var ds = d.devices || [];
      for (var i = 0; i < ds.length; i++)
        h += '<div class="mz-row' + (ds[i].active ? ' on' : '') + '" data-a="transfer" data-id="' + esc(ds[i].id) + '"><div class="mz-th" style="background:none">' + ICON.speaker.replace('<svg', '<svg style="width:30px;height:30px;margin:8px;fill:currentColor"') + '</div>' +
          '<div class="mz-rx"><div class="mz-rt">' + esc(ds[i].name) + '</div><div class="mz-rs">' + esc(ds[i].active ? 'Playing here now' : ds[i].type) + '</div></div></div>';
      if (!ds.length) h += '<div class="mz-note">No speakers are on. Open Spotify on a phone or computer.</div>';
      b.innerHTML = h;
    });
  }

  function act(a, el) {
    var uri = el.getAttribute('data-uri'), i, list;
    if (a === 'play' || a === 'pause' || a === 'next' || a === 'prev') return send({ action: a });
    if (a === 'shuffle') return send({ action: 'shuffle', on: !(st && st.shuffle) });
    if (a === 'devices') return paintDevices();
    if (a === 'transfer') { stack = []; show('now'); return send({ action: 'transfer', device: el.getAttribute('data-id') }); }
    if (a === 'back') { stack.pop(); stack = []; return show(tab); }
    if (a === 'find') return find();
    if (a === 'playlist') return paintPlaylist(el.getAttribute('data-id'));
    if (a === 'ctx') return send({ action: 'start', context: uri });
    if (a === 'plsong') return send({ action: 'start', context: lists.plUri, offset: uri });
    if (a.indexOf('all:') === 0) return paintAll(a.slice(4), 'Liked songs');
    if (a.indexOf('song:') === 0) {   // play this song, then the rest of its list
      list = lists[a.slice(5)] || []; var uris = [];
      for (i = 0; i < list.length; i++) uris.push(list[i].uri);
      return send({ action: 'start', uris: uris, offset: uri });
    }
  }

  /* ---------------- outside the player ---------------- */
  function note(p, i) {
    var changed = p !== playing || (i && info && i.name !== info.name) || (!i !== !info);
    playing = p; info = i;
    if (changed) for (var k = 0; k < listeners.length; k++) try { listeners[k](playing, info); } catch (e) {}
  }
  return {
    attach: function (el, which) {
      if (!el) return;
      el.addEventListener('click', function (e) { e.stopPropagation(); open(which); }, false);
    },
    open: open, close: close,
    setState: function (m) { if (!root || root.style.display === 'none') note(!!(m && m.playing), m && m.name ? { name: m.name, artist: m.artist } : null); },
    onChange: function (fn) { listeners.push(fn); fn(playing, info); }
  };
})();
