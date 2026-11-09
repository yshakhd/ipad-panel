/*
 * "The city": a corner apartment high above Manhattan, drawn in code. One wide apartment,
 * two views, and the camera pans between them:
 *   - the bedroom, by the east window: he sleeps from sleep_hour to wake_hour (default
 *     1 am to 8 am) and the real sunrise comes up over the East River;
 *   - the desk, by the west window: he writes code and edits your photos while the real
 *     sunset drops behind the Hudson.
 * Same rules as the meadow for the 2012 iPad (ES5, iOS 9): every big layer is drawn once;
 * frames only move pre-drawn pieces with CSS transforms, type a few characters of code and
 * wipe the photo edit along. Needs sky.js loaded first.
 * Preview: /city.html?view=bed&time=6:40&wx=rain&wind=30&days=3&phase=golden
 */
(function () {
  var W = 1024, H = 768, STANDALONE = !!window.CITY_STANDALONE;
  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function param(n) { var m = new RegExp('[?&]' + n + '=([^&#]*)').exec(location.search); return m ? decodeURIComponent(m[1]) : null; }
  function seeded(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b), out = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(x[i] + (y[i] - x[i]) * t); out += (v < 16 ? '0' : '') + v.toString(16); }
    return out;
  }
  function rgba(h, a) { var x = hex(h); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  function ellipse(g, x, y, rx, ry) { g.save(); g.translate(x, y); g.scale(rx, ry); g.beginPath(); g.arc(0, 0, 1, 0, 6.2832); g.restore(); }
  function rrect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function tr(el, t) { el.style.webkitTransform = t; el.style.transform = t; }
  function setXY(el, x, y) { tr(el, 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'); }
  function place(box, el, x, y) { el.style.position = 'absolute'; el.style.left = x + 'px'; el.style.top = y + 'px'; box.appendChild(el); return el; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- palettes ---------------- */
  var SKY = {
    day: { top: '#3f78bd', mid: '#8fbde3', low: '#dbe8ee', cloud: '#ffffff', cloudLo: '#c4d4e6' },
    golden: { top: '#2c3672', mid: '#b2678a', low: '#f8b066', cloud: '#f6c3b4', cloudLo: '#ff9e6e' },
    dawn: { top: '#2f4380', mid: '#cf8a9c', low: '#ffd59c', cloud: '#fbd4cf', cloudLo: '#ffb98a' },
    night: { top: '#050a1d', mid: '#111a3f', low: '#3b2c58', cloud: '#2c3156', cloudLo: '#4a3c64' } };
  var CITY = {   // building colours, far rows to near
    day: { far: '#a9b9c8', mid: '#7d8ea3', near: '#4a5869', roof: '#c3ccd6', glass: '#cfe2f2' },
    golden: { far: '#a97f93', mid: '#5c4766', near: '#2a2238', roof: '#a3788a', glass: '#ffc38e' },
    night: { far: '#2c2b55', mid: '#1b1d3b', near: '#0e1024', roof: '#2a2c4c', glass: '#2a3358' } };
  var ROOM = {
    day: { wall: '#ddd8d0', wallLo: '#c4bdb3', frame: '#262a32', desk: '#8c6849', deskHi: '#a5815f', deskEdge: '#5b4231', floor: '#a08369', dark: '#3a332d',
      hood: '#34465f', hoodHi: '#4b6080', hair: '#221d22', skin: '#e2b591', chair: '#23252b', duvet: '#45558a', duvetHi: '#6676a8', sheet: '#eef0f2', wood: '#7a5a3f', rim: null },
    golden: { wall: '#d5a58a', wallLo: '#a8775f', frame: '#2a1f24', desk: '#83553a', deskHi: '#c08354', deskEdge: '#4f3122', floor: '#8c6047', dark: '#2e211d',
      hood: '#2c3550', hoodHi: '#3e4864', hair: '#1c1619', skin: '#d79b78', chair: '#1f1a1e', duvet: '#4b4a7c', duvetHi: '#c88a78', sheet: '#f3d8c4', wood: '#6e4a33', rim: '#ffab66' },
    night: { wall: '#1c2236', wallLo: '#141a2b', frame: '#0a0c14', desk: '#2a2630', deskHi: '#3a3442', deskEdge: '#17151c', floor: '#181a26', dark: '#0c0d14',
      hood: '#1d2638', hoodHi: '#283350', hair: '#0f0d12', skin: '#7d6a73', chair: '#0e0f14', duvet: '#232c4e', duvetHi: '#34406a', sheet: '#5f6886', wood: '#2a2329', rim: '#6fd0ff' } };
  var OVERCAST = { clear: 0, partly: 0.08, cloudy: 0.55, fog: 0.62, drizzle: 0.55, rain: 0.65, heavy: 0.78, snow: 0.5, blizzard: 0.72, storm: 0.85 };
  var GREY = { day: '#a7b0bb', golden: '#9e8f98', night: '#262c40' };
  var KIND = { 0: 'clear', 1: 'clear', 2: 'partly', 3: 'cloudy', 45: 'fog', 48: 'fog',
    51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
    61: 'rain', 80: 'rain', 63: 'rain', 81: 'rain', 66: 'rain', 65: 'heavy', 82: 'heavy', 67: 'heavy',
    71: 'snow', 73: 'snow', 77: 'snow', 85: 'snow', 75: 'blizzard', 86: 'blizzard', 95: 'storm', 96: 'storm', 99: 'storm' };
  function greyed(o, grey, t) { var p = {}, k; for (k in o) p[k] = o[k] && o[k].charAt && o[k].charAt(0) === '#' ? mix(o[k], grey, t) : o[k]; return p; }

  /* ---------------- state ---------------- */
  var kind = param('wx') || '', phase = param('phase') || '', windKmh = param('wind') ? +param('wind') : null;
  var forced = { wx: !!param('wx'), phase: !!param('phase'), wind: param('wind') !== null, view: param('view') };
  var windDir = 270, lat = 40.75, lon = -73.98, timeShift = 0, utcOff = null, dayShift = +param('days') || 0;
  var sleepH = 1, wakeH = 8, view = forced.view || 'desk', built = '', builtAt = 0, oc = 0, sky, city, room;
  var timeOverride = (function () { var m = /^(\d+):(\d+)$/.exec(param('time') || ''); return m ? +m[1] + m[2] / 60 : null; })();

  /* ---------------- layout ---------------- */
  // Window openings in each view (local coordinates), the direction each one faces, and the
  // horizon height inside it. We live high up, so most rooftops sit below the horizon.
  var V = {
    bed: { x: 250, y: 40, w: 720, h: 392, face: 90, hz: 0.6 },
    desk: { x: 60, y: 36, w: 904, h: 464, face: 270, hz: 0.6 } };
  var PXD = 9;   // pixels per degree of sky
  var stage = $('stage'), world = $('world');
  function fitStage() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    var top = STANDALONE && window.innerHeight > window.innerWidth ? 0 : (window.innerHeight - H * s) / 2;
    tr(stage, 'translate(' + ((window.innerWidth - W * s) / 2) + 'px,' + top + 'px) scale(' + s + ')');
  }
  window.addEventListener('resize', fitStage, false);
  fitStage();

  ['bed', 'desk'].forEach(function (name) {
    var v = V[name], box = $(name).getElementsByTagName('div')[0];   // the half's scene layer
    v.box = box; v.hy = Math.round(v.h * v.hz);
    var view_ = document.createElement('div');
    view_.style.cssText = 'position:absolute;overflow:hidden;left:' + v.x + 'px;top:' + v.y + 'px;width:' + v.w + 'px;height:' + v.h + 'px';
    box.appendChild(view_); v.win = view_;
    v.sky = place(view_, mk(v.w, v.h), 0, 0);
    v.moon = place(view_, mk(120, 120), 0, 0);
    v.sun = place(view_, mk(240, 240), 0, 0);
    [v.sun, v.moon].forEach(function (c) {   // they glide to each new place rather than jump
      c.style.webkitTransition = '-webkit-transform 0.5s ease-out'; c.style.transition = 'transform 0.5s ease-out';
    });
    v.clouds = place(view_, document.createElement('div'), 0, 0);
    v.fw = place(view_, document.createElement('div'), 0, 0);   // fireworks, out over the river behind the towers
    v.city = place(view_, mk(v.w, v.h), 0, 0);
    v.lights = place(view_, mk(v.w, v.h), 0, 0);
    v.haze = place(view_, document.createElement('div'), 0, 0);   // smoke or smog when the air is bad
    v.haze.style.cssText += ';width:' + v.w + 'px;height:' + v.h + 'px;opacity:0;pointer-events:none';
    v.fx = place(view_, document.createElement('div'), 0, 0);   // steam, flag, beacons
    v.glass = place(view_, mk(v.w / 2, v.h / 2), 0, 0);
    v.glass.style.width = v.w + 'px'; v.glass.style.height = v.h + 'px';
    v.gctx = v.glass.getContext('2d');
    tr(v.glass, 'translate3d(0,0,0)');   // canvases that change often get their own GPU layer
    v.flash = place(view_, document.createElement('div'), 0, 0);
    v.flash.style.cssText += ';width:' + v.w + 'px;height:' + v.h + 'px;background:#eef2ff;opacity:0';
    v.room = place(box, mk(W, H), 0, 0);
  });

  /* ---------------- sky ---------------- */
  function face(az, f) { return ((az - f + 540) % 360) - 180; }   // degrees right of where the window faces
  function skyXY(v, p) { return [v.w / 2 + face(p.az, v.face) * PXD, v.hy - p.el * PXD, p.el]; }
  function now() { return Date.now() + timeShift; }
  function drawSky(v) {
    var g = v.sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, v.hy + 30), R = seeded(5), i;
    gr.addColorStop(0, sky.top); gr.addColorStop(0.62, sky.mid); gr.addColorStop(1, sky.low);
    g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h);
    if (phase === 'night' && oc < 0.6) {   // only the brightest stars get through the city glow
      g.fillStyle = '#ffffff';
      for (i = 0; i < 40; i++) { g.globalAlpha = 0.25 + R() * 0.5; g.beginPath(); g.arc(R() * v.w, R() * v.hy * 0.7, 0.5 + R() * 0.8, 0, 6.2832); g.fill(); }
      g.globalAlpha = 1;
    }
  }
  function buildSun(v) {
    var c = v.sun, g = c.getContext('2d'), r = 120, gr;
    g.clearRect(0, 0, 240, 240);
    if (phase === 'night') { c.style.display = 'none'; return; }
    var gc = phase === 'golden' ? '255,190,120' : '255,240,190';   // a warm glow, so the sun reads against a pale sky
    gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + gc + ',' + (0.95 - oc * 0.7) + ')'); gr.addColorStop(0.16, 'rgba(' + gc + ',' + (0.5 - oc * 0.3) + ')'); gr.addColorStop(0.45, 'rgba(' + gc + ',' + (0.14 - oc * 0.08) + ')'); gr.addColorStop(1, 'rgba(' + gc + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 240, 240);
    if (oc < 0.5) { g.fillStyle = phase === 'golden' ? '#ffe0a6' : '#fff4cf'; g.beginPath(); g.arc(r, r, 15, 0, 6.2832); g.fill(); g.fillStyle = 'rgba(255,255,250,0.9)'; g.beginPath(); g.arc(r, r, 10, 0, 6.2832); g.fill(); }
  }
  function placeSky(v) {
    var ms = now(), s = skyXY(v, Sky.sun(ms, lat, lon)), m = Sky.moon(ms, lat, lon), mxy = skyXY(v, m);
    if (phase !== 'night') { v.sun.style.display = s[2] < -3 ? 'none' : 'block'; setXY(v.sun, s[0] - 120, s[1] - 120); }
    var night = phase === 'night', c = v.moon, g = c.getContext('2d'), r = 13, k = 1 - 2 * m.lit;
    if (m.el < -3 || m.lit < 0.03 || oc > (night ? 0.6 : 0.45)) { c.style.display = 'none'; return; }
    c.style.display = 'block'; g.clearRect(0, 0, 120, 120);
    if (night) {
      var gr = g.createRadialGradient(60, 60, 0, 60, 60, 60);
      gr.addColorStop(0, 'rgba(240,235,215,' + (0.1 + 0.2 * m.lit) + ')'); gr.addColorStop(1, 'rgba(240,235,215,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 120, 120);
    }
    g.save(); g.translate(60, 60); g.rotate(Math.atan2(s[1] - mxy[1], s[0] - mxy[0]));
    g.beginPath(); g.moveTo(0, -r); var i, a;
    for (i = 0; i <= 24; i++) { a = -Math.PI / 2 + Math.PI * i / 24; g.lineTo(r * Math.cos(a), r * Math.sin(a)); }
    for (i = 0; i <= 24; i++) { a = Math.PI / 2 - Math.PI * i / 24; g.lineTo(r * k * Math.cos(a), r * Math.sin(a)); }
    g.closePath(); g.fillStyle = night ? '#f3eed8' : 'rgba(255,255,255,0.6)'; g.fill(); g.restore();
    setXY(c, mxy[0] - 60, mxy[1] - 60);
  }
  setInterval(function () { if (built) { placeSky(V.bed); placeSky(V.desk); } }, 30000);

  var clouds = [];
  function buildClouds(v) {
    v.clouds.innerHTML = '';
    var n = kind === 'clear' ? 0 : oc > 0.5 ? 5 : 3, i;
    for (i = 0; i < n; i++) {   // long, flat city clouds, lit from below at sunrise and sunset
      var cw = rnd(160, 300), ch = rnd(26, 44), c = mk(cw, ch + 10), g = c.getContext('2d');
      g.fillStyle = sky.cloud;
      for (var j = 0; j < 11; j++) { var px = cw * (0.1 + 0.8 * j / 10), pr = ch * (0.32 + 0.4 * Math.sin(Math.PI * j / 10)) * rnd(0.8, 1.15); ellipse(g, px, ch * 0.66 - pr * 0.25, pr * 1.9, pr); g.fill(); }
      c.style.opacity = phase === 'night' ? 0.7 : 0.9;
      g.globalCompositeOperation = 'source-atop';
      var gr = g.createLinearGradient(0, 0, 0, ch + 10); gr.addColorStop(0.45, rgba(sky.cloudLo, 0)); gr.addColorStop(1, rgba(sky.cloudLo, 0.9));
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch + 10);
      place(v.clouds, c, 0, 0);
      clouds.push({ v: v, el: c, x: rnd(-cw, v.w), y: rnd(10, v.hy - 80), w: cw, s: rnd(0.6, 1.3) });
    }
  }

  /* ---------------- the skyline ----------------
   * Rows of buildings from the far shore to the street below, then a tall tower framing each
   * side. Hints of Manhattan rather than copies: art-deco setbacks and crowns, a needle-thin
   * supertall, and wooden water towers on the lower roofs. */
  function tower(v, g, o) {   // o: x, top, w, bottom, col, s (scale), tall, crown
    var x = o.x, t = o.top, w = o.w, b = o.bottom, s = o.s, R = o.R, col = o.col;
    var steps = o.tall && w > 18 && R() < 0.55;
    var body = [[x, t, w]];
    // setbacks come from the seeded random too, so every device draws the same skyline
    if (steps) { var t1 = t + (b - t) * (0.18 + R() * 0.14), t2 = t1 + (b - t1) * (0.15 + R() * 0.15); body = [[x + w * 0.24, t, w * 0.52], [x + w * 0.1, t1, w * 0.8], [x, t2, w]]; }
    g.fillStyle = col;
    for (var i = 0; i < body.length; i++) { g.fillRect(body[i][0], body[i][1], body[i][2], b - body[i][1]); o.rects.push(body[i][0], body[i][1], body[i][2], o.row); }
    var top0 = body[0], cx = top0[0] + top0[2] / 2;
    if (o.crown === 'spire') { g.beginPath(); g.moveTo(top0[0] + top0[2] * 0.2, t); g.lineTo(cx, t - top0[2] * 1.6); g.lineTo(top0[0] + top0[2] * 0.8, t); g.fill(); g.fillRect(cx - 0.6, t - top0[2] * 2.6, 1.2, top0[2]); }
    if (o.crown === 'deco') {   // stacked arches narrowing to a needle
      for (i = 0; i < 4; i++) { var cw = top0[2] * (1 - i * 0.22); g.beginPath(); g.moveTo(cx - cw / 2, t - i * cw * 0.32); g.quadraticCurveTo(cx, t - i * cw * 0.32 - cw * 0.55, cx + cw / 2, t - i * cw * 0.32); g.fill(); }
      g.fillRect(cx - 0.7, t - top0[2] * 1.9, 1.4, top0[2] * 0.8);
    }
    if (o.crown === 'antenna') g.fillRect(cx - 0.8, t - 22 * s, 1.6, 22 * s);
    // the shaded side
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + w * 0.7, body[body.length - 1][1], w * 0.3, b - body[body.length - 1][1]);
    if (t > v.hy) { g.fillStyle = rgba(city.roof, 0.7); g.fillRect(x, t, w, Math.max(1.5, 2.5 * s)); }   // we look down onto lower roofs
    // window grid: faint in daylight; the lit ones go on their own layer
    var cw2 = 1.6 + s * 2.4, chh = 2 + s * 2.6, gx = cw2 + 1.5 + s * 1.6, gy = chh + 2 + s * 1.8;
    g.fillStyle = phase === 'night' ? 'rgba(0,0,0,0.25)' : rgba(city.glass, phase === 'golden' ? 0.16 : 0.22);
    for (i = 0; i < body.length; i++) {
      var bx = body[i][0], bw = body[i][2], by0 = body[i][1] + 3 * s, by1 = i + 1 < body.length ? body[i + 1][1] : Math.min(b, v.h);
      for (var yy = by0; yy < by1 - chh; yy += gy) for (var xx = bx + 2; xx < bx + bw - cw2 - 1; xx += gx) {
        g.fillRect(xx, yy, cw2, chh);
        if ((o.cells.n[o.row] = (o.cells.n[o.row] || 0) + 1) < 3000) o.cells.push(xx, yy, cw2, chh, o.row);   // a budget per row, so the far rows can't use it all up
      }
    }
    // rim light on the sunward edge when the towers are backlit
    if (city.rim && o.rim && o.tall) { var rg = g.createLinearGradient(0, t, 0, v.hy + 40); rg.addColorStop(0, rgba(city.rim, 0.5)); rg.addColorStop(1, rgba(city.rim, 0)); g.fillStyle = rg; g.fillRect(o.rim > 0 ? x + w - 1.2 : x, t, 1.2, v.hy + 40 - t); }
    if (!o.tall && t > v.hy && w > 12 && R() < 0.32) {   // a wooden water tower on the roof
      var wx = x + w * (0.2 + R() * 0.4), ww = 5 + s * 4, wh = 6 + s * 4.5;
      g.fillStyle = mix(col, '#6b4a32', phase === 'night' ? 0.15 : 0.45);
      g.fillRect(wx, t - wh - 3 * s, ww, wh);
      g.beginPath(); g.moveTo(wx - 1, t - wh - 3 * s); g.lineTo(wx + ww / 2, t - wh - 3 * s - ww * 0.55); g.lineTo(wx + ww + 1, t - wh - 3 * s); g.fill();
      g.fillRect(wx + 1, t - 3 * s, 1, 3 * s); g.fillRect(wx + ww - 2, t - 3 * s, 1, 3 * s);
      if (o.steam.length < 3 && R() < 0.5) o.steam.push([wx + ww + 4, t - 4]);
    }
    if (o.tall && t < v.hy - 40) o.tops.push([cx, o.crown === 'antenna' ? t - 22 * s : o.crown ? t - top0[2] * 1.9 : t]);
  }
  function buildCity(v, name) {
    var g = v.city.getContext('2d'), R = seeded(name === 'desk' ? 13 : 23), w = v.w, h = v.h, hy = v.hy, i, x;
    g.clearRect(0, 0, w, h);
    var sunX = skyXY(v, Sky.sun(now(), lat, lon))[0];
    city.rim = phase === 'golden' && oc < 0.5 ? (phase === 'golden' ? '#ffb070' : null) : null;
    // far shore: the Palisades cliffs to the west, Queens and a bridge to the east
    g.fillStyle = mix(city.far, sky.low, 0.35);
    g.beginPath(); g.moveTo(0, hy + 4);
    for (x = 0; x <= w; x += 6) g.lineTo(x, hy - (name === 'desk' ? 7 + 3 * Math.sin(x / 90) : 3 + (R() < 0.15 ? R() * 16 : R() * 4)));
    g.lineTo(w, hy + 6); g.lineTo(0, hy + 6); g.fill();
    if (name === 'bed') {   // a suspension bridge across the river
      var bx0 = w * 0.62, bx1 = w * 1.05; g.strokeStyle = mix(city.far, sky.low, 0.2); g.lineWidth = 1;
      g.fillRect(bx0 + 20, hy - 26, 3, 30); g.fillRect(bx1 - 70, hy - 26, 3, 30);
      g.beginPath(); g.moveTo(bx0 - 30, hy); g.quadraticCurveTo(bx0 + 21, hy - 26, bx0 + 21, hy - 26); g.quadraticCurveTo((bx0 + bx1 - 50) / 2, hy - 2, bx1 - 69, hy - 26); g.stroke();
      g.fillRect(bx0 - 30, hy - 1, bx1 - bx0 + 30, 2);
    }
    // the river
    var gr = g.createLinearGradient(0, hy + 4, 0, hy + 16);
    gr.addColorStop(0, mix(sky.low, city.far, 0.3)); gr.addColorStop(1, mix(sky.mid, city.mid, 0.4));
    g.fillStyle = gr; g.fillRect(0, hy + 4, w, 14);
    if (phase !== 'night' && oc < 0.5 && sunX > 0 && sunX < w) {   // the sun's glitter on the water
      g.fillStyle = phase === 'golden' ? 'rgba(255,200,130,0.55)' : 'rgba(255,255,240,0.4)';
      for (i = 0; i < 14; i++) g.fillRect(sunX - 18 + R() * 36 - i, hy + 5 + i * 0.9, 6 + R() * 18, 1);
    }
    var cells = [], tops = [], steam = [], rects = [], rows = [[hy + 14, 0.55, 0.12], [hy + 30, 0.8, 0.14], [hy + 58, 1.1, 0.16], [hy + 98, 1.45, 0.14]];
    cells.n = [];
    for (var r = 0; r < rows.length; r++) {
      var col = r < 2 ? mix(city.far, city.mid, r * 0.6) : mix(city.mid, city.near, (r - 2) * 0.6), s = rows[r][1];
      x = -10 - R() * 20;
      while (x < w + 10) {
        var bw = (12 + R() * 26) * s, ctr = Math.abs(x + bw / 2 - w / 2) / (w / 2), top = rows[r][0] + R() * 14 * s, tall = false, crown = null;
        if (R() < rows[r][2] * (0.35 + 1.4 * ctr * ctr)) {   // a tower above our floor, mostly off to the sides
          tall = true; top = hy - (20 + R() * 150) * (0.4 + ctr) * (0.6 + r * 0.25);
          var cr = R(); crown = cr < 0.12 ? 'deco' : cr < 0.3 ? 'spire' : cr < 0.55 ? 'antenna' : null;
          if (R() < 0.15) { bw *= 0.45; top -= 40; }   // a needle-thin supertall
        }
        tower(v, g, { x: x, top: top, w: bw, bottom: h + 5, col: col, s: s, tall: tall, crown: crown, R: R, cells: cells, tops: tops, steam: steam, rects: rects, row: r,
          rim: city.rim ? (x + bw / 2 < sunX ? 1 : -1) : 0 });
        x += bw + (R() < 0.25 ? R() * 5 * s : -1);
      }
      // haze between rows: farther rows sink into the sky
      gr = g.createLinearGradient(0, hy - 120, 0, rows[r][0] + 40);
      var hz = (0.18 + oc * 0.3 + (kind === 'fog' ? 0.35 : 0)) * (1 - r * 0.2);
      gr.addColorStop(0, rgba(sky.low, 0)); gr.addColorStop(1, rgba(sky.low, hz));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    if (name === 'desk' || name === 'bed') roofGarden(v, g, R);
    gr = g.createLinearGradient(0, hy + 60, 0, h);   // the street canyon falls into shadow
    gr.addColorStop(0, rgba(city.near, 0)); gr.addColorStop(1, rgba(city.near, phase === 'night' ? 0.55 : 0.35));
    g.fillStyle = gr; g.fillRect(0, hy + 60, w, h - hy - 60);
    // the two towers right outside, framing the view
    var near = name === 'desk' ? [[-40, 34, 130, 'deco'], [w - 120, 96, 150, null]] : [[-30, 70, 120, 'antenna'], [w - 96, 20, 120, 'spire']];
    for (i = 0; i < near.length; i++)
      tower(v, g, { x: near[i][0], top: near[i][1], w: near[i][2], bottom: h + 5, col: city.near, s: 1.9, tall: true, crown: near[i][3], R: R, cells: cells, tops: tops, steam: steam, rects: rects, row: 4,
        rim: city.rim ? (near[i][0] + near[i][2] / 2 < sunX ? 1 : -1) : 0 });
    if (kind === 'fog') { gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgba(sky.low, 0.75)); gr.addColorStop(0.6, rgba(sky.low, 0.45)); gr.addColorStop(1, rgba(sky.low, 0.2)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (kind === 'snow' || kind === 'blizzard') { g.fillStyle = 'rgba(240,244,250,0.18)'; g.fillRect(0, hy, w, h - hy); }
    v.cells = cells; v.tops = tops; v.steamAt = steam;
    // for each row, the skyline of everything in front of it: a window lower than that is hidden
    var prof = [], r2, j, k;
    for (r2 = 0; r2 < 5; r2++) { prof[r2] = []; for (j = 0; j <= w; j++) prof[r2][j] = 1e9; }
    for (k = 0; k < rects.length; k += 4) {
      var x0 = Math.max(0, Math.ceil(rects[k])), x1 = Math.min(w, Math.floor(rects[k] + rects[k + 2])), top_ = rects[k + 1], rr = rects[k + 3];
      for (r2 = 0; r2 < rr; r2++) for (j = x0; j <= x1; j++) if (top_ < prof[r2][j]) prof[r2][j] = top_;
    }
    v.prof = prof;
  }
  function roofGarden(v, g, R) {   // a terrace garden down below that keeps the seasons
    var S = Sky.season(now(), lat, param('season')), x0 = v.w * 0.28, y0 = v.hy + 70, i;
    g.fillStyle = mix(city.mid, '#6a6e64', 0.3); g.fillRect(x0 - 6, y0, 76, 3);
    for (i = 0; i < 4; i++) {
      var tx = x0 + i * 19, r = (5 + R() * 2) * (0.35 + 0.65 * S.cover);
      g.fillStyle = mix(city.near, '#3a2a20', 0.3); g.fillRect(tx - 0.8, y0 - 8, 1.6, 8);
      if (S.cover > 0.05) {
        var leaf = mix(mix('#4f7f3a', '#d0782e', S.turn), city.mid, phase === 'night' ? 0.7 : phase === 'golden' ? 0.3 : 0.15);
        g.fillStyle = leaf; g.beginPath(); g.arc(tx, y0 - 10, r, 0, 6.2832); g.fill();
      }
      if (S.bloom > 0.1) { g.fillStyle = phase === 'night' ? '#8d8fa8' : '#f7c9d6'; for (var j = 0; j < 6; j++) { g.beginPath(); g.arc(tx + (R() * 2 - 1) * r * 0.8, y0 - 10 + (R() * 2 - 1) * r * 0.8, 1.1, 0, 6.2832); g.fill(); } }
    }
  }
  function litFraction() {   // more windows lit in the evening, few in the small hours
    var h = localHour();
    if (h >= 17 && h < 23) return 0.42; if (h >= 23 || h < 1) return 0.3; if (h < 5) return 0.13; if (h < 8) return 0.22; return 0.2;
  }
  function buildLights(v) {
    var g = v.lights.getContext('2d'), c = v.cells, R = seeded(41), f = litFraction(), i;
    g.clearRect(0, 0, v.w, v.h);
    var cols = ['#ffd99a', '#ffe7c0', '#ffc976', '#cfe6ff'];
    var P = v.prof;
    function lit(near) {
      for (i = 0; i < c.length; i += 5) {
        if ((c[i + 4] === 4) !== near) continue;
        if (R() > f * (near ? 1.15 : 1)) continue;
      var row = c[i + 4], bot = c[i + 1] + c[i + 3], xl = Math.max(0, Math.floor(c[i])), xr = Math.min(v.w, Math.ceil(c[i] + c[i + 2]));
        if (row < 4 && (P[row][xl] < bot || P[row][xr] < bot)) continue;   // behind a nearer building
        g.fillStyle = cols[Math.floor(R() * 4)]; g.globalAlpha = c[i + 4] < 2 ? 0.75 : 0.95;
        g.fillRect(c[i], c[i + 1], c[i + 2], c[i + 3]);
        if (near) {   // close enough to see into: a dimmer lower half, sometimes a blind half down
          g.globalAlpha = 0.25; g.fillStyle = '#7a5a3a'; g.fillRect(c[i], c[i + 1] + c[i + 3] * 0.62, c[i + 2], c[i + 3] * 0.38);
          if (R() < 0.3) { g.globalAlpha = 0.55; g.fillStyle = '#c8a878'; g.fillRect(c[i], c[i + 1], c[i + 2], c[i + 3] * (0.25 + R() * 0.35)); }
        }
      }
      g.globalAlpha = 1;
    }
    lit(false);
    g.globalCompositeOperation = 'destination-out';   // fewer lights down in the canyon
    var fade = g.createLinearGradient(0, v.hy + 60, 0, v.h); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = fade; g.fillRect(0, v.hy + 60, v.w, v.h - v.hy - 60);
    g.globalCompositeOperation = 'source-over';
    lit(true);   // the towers right outside are drawn after the fade, so they keep their lights
    if (v === V.desk) {   // soften the lights behind the clock and the weather so the text stays easy to read
      g.globalCompositeOperation = 'destination-out';
      var spots = [[150, 80, 230], [790, 100, 210]];
      for (i = 0; i < spots.length; i++) {
        var sg = g.createRadialGradient(spots[i][0], spots[i][1], 0, spots[i][0], spots[i][1], spots[i][2]);
        sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(0.55, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(spots[i][0] - spots[i][2], spots[i][1] - spots[i][2], spots[i][2] * 2, spots[i][2] * 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    v.lights.style.opacity = phase === 'night' ? 1 : phase === 'golden' ? 0.28 : oc > 0.5 ? 0.25 : 0;
    v.lights.style.display = v.lights.style.opacity === '0' ? 'none' : 'block';
  }
  var fxList = [];
  function buildFx(v) {
    v.fx.innerHTML = '';
    var i, c, g;
    for (i = 0; i < v.tops.length && i < 5; i++) {   // red aircraft lights on the tallest tops
      c = mk(10, 10); g = c.getContext('2d');
      var gr = g.createRadialGradient(5, 5, 0, 5, 5, 5); gr.addColorStop(0, 'rgba(255,60,50,1)'); gr.addColorStop(0.4, 'rgba(255,60,50,0.6)'); gr.addColorStop(1, 'rgba(255,60,50,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 10, 10);
      place(v.fx, c, v.tops[i][0] - 5, v.tops[i][1] - 5);
      fxList.push({ v: v, el: c, kind: 'beacon', p: Math.random() * 2, on: null });
    }
    if (rainy()) return;
    for (i = 0; i < v.steamAt.length; i++) {   // steam from rooftop vents, leaning with the wind
      c = mk(30, 46); g = c.getContext('2d');
      for (var j = 0; j < 5; j++) { var gr2 = g.createRadialGradient(15, 40 - j * 8, 0, 15, 40 - j * 8, 6 + j * 2); gr2.addColorStop(0, 'rgba(255,255,255,' + (0.35 - j * 0.05) + ')'); gr2.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr2; g.fillRect(0, 0, 30, 46); }
      c.style.opacity = phase === 'night' ? 0.35 : 0.8;
      var o = c.style.webkitTransformOrigin = c.style.transformOrigin = '50% 100%';
      place(v.fx, c, v.steamAt[i][0] - 15, v.steamAt[i][1] - 46);
      fxList.push({ v: v, el: c, kind: 'steam', p: Math.random() * 6 });
    }
  }

  /* ---------------- rooms ---------------- */
  function wallAndWindow(g, v, name) {
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, room.wall); gr.addColorStop(1, room.wallLo);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.clearRect(v.x, v.y, v.w, v.h);
    g.fillStyle = room.frame;
    g.fillRect(v.x - 10, v.y - 10, v.w + 20, 10); g.fillRect(v.x - 10, v.y + v.h, v.w + 20, 8);
    g.fillRect(v.x - 10, v.y, 10, v.h); g.fillRect(v.x + v.w, v.y, 10, v.h);
    var mull = name === 'desk' ? [1 / 3, 2 / 3] : [0.5];
    for (var i = 0; i < mull.length; i++) g.fillRect(v.x + v.w * mull[i] - 3, v.y, 6, v.h);
    g.fillRect(v.x, v.y + v.h * 0.16, v.w, 4);   // transom
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(v.x - 10, v.y - 10, v.w + 20, 1.5);
  }
  function light(g, cx, cy, r, col, a) { var gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); }

  var D = { code: { x: 446, y: 266, w: 280, h: 164 }, photo: { x: 748, y: 272, w: 236, h: 158 }, clock: { x: 134, y: 436, w: 122, h: 48 } };
  function drawDeskRoom() {
    var v = V.desk, g = v.room.getContext('2d'), night = phase === 'night', gold = phase === 'golden', i;
    g.clearRect(0, 0, W, H);
    wallAndWindow(g, v, 'desk');
    stringLights(g, v);
    // floor and the dark under the desk
    var fg_ = g.createLinearGradient(0, 560, 0, H); fg_.addColorStop(0, room.dark); fg_.addColorStop(0.45, mix(room.dark, room.floor, 0.55)); fg_.addColorStop(1, room.floor);
    g.fillStyle = fg_; g.fillRect(0, 560, W, H - 560);
    g.strokeStyle = rgba(room.dark, 0.25); g.lineWidth = 1; g.beginPath();
    for (i = 0; i < 6; i++) { var py = 640 + i * i * 4.5; g.moveTo(0, py); g.lineTo(W, py); } g.stroke();   // floorboards
    var rug = night ? '#3a2430' : '#9a4a3c';   // a rug under the chair
    g.fillStyle = rug; ellipse(g, 380, 716, 300, 44); g.fill();
    g.strokeStyle = mix(rug, '#f0d9b5', 0.35); g.lineWidth = 2; ellipse(g, 380, 716, 270, 36); g.stroke(); ellipse(g, 380, 716, 240, 29); g.stroke();
    g.fillStyle = rgba(room.dark, 0.35); ellipse(g, 372, 730, 120, 18); g.fill();   // the chair's shadow
    // desk: walnut top seen from just above, black steel legs
    g.fillStyle = room.dark; g.fillRect(30, 560, 12, 122); g.fillRect(W - 46, 560, 12, 122);   // the desk stands just beyond his feet
    g.fillStyle = rgba(room.dark, 0.35); ellipse(g, 36, 683, 14, 3); g.fill(); ellipse(g, W - 40, 683, 14, 3); g.fill();
    var gr = g.createLinearGradient(0, 498, 0, 548); gr.addColorStop(0, room.desk); gr.addColorStop(1, room.deskHi);
    g.fillStyle = gr; g.fillRect(0, 498, W, 50);
    g.strokeStyle = rgba(room.deskEdge, 0.35); g.lineWidth = 1; g.beginPath();
    var R = seeded(9);
    for (i = 0; i < 14; i++) { var gy = 502 + R() * 42, gx = R() * W; g.moveTo(gx, gy); g.bezierCurveTo(gx + 80, gy - 2, gx + 160, gy + 2, gx + 260, gy); }
    g.stroke();
    g.fillStyle = room.deskEdge; g.fillRect(0, 548, W, 14);
    if (gold && oc < 0.5) {   // low sun across the desk, striped by the window frame
      g.fillStyle = 'rgba(255,170,90,0.28)'; g.fillRect(0, 498, W, 50);
      g.fillStyle = 'rgba(40,20,20,0.25)'; for (i = 1; i < 3; i++) g.fillRect(v.x + v.w * i / 3 - 18, 498, 30, 50);
    }
    // main monitor and its light bar
    rrect(g, D.code.x - 7, D.code.y - 7, D.code.w + 14, D.code.h + 14, 5); g.fillStyle = '#101216'; g.fill();
    g.fillStyle = '#16181d'; g.fillRect(D.code.x + D.code.w / 2 - 6, D.code.y + D.code.h + 7, 12, 498 - D.code.y - D.code.h - 4);
    g.fillStyle = '#16181d'; ellipse(g, D.code.x + D.code.w / 2, 503, 46, 5); g.fill();
    g.fillStyle = '#222630'; g.fillRect(D.code.x + 70, D.code.y - 13, D.code.w - 140, 5);
    // second monitor's stand (the screen itself is a tilted element)
    g.fillStyle = '#16181d'; g.fillRect(852, 428, 11, 72); ellipse(g, 858, 503, 40, 5); g.fill();
    deskThings(g, R);
    // keyboard, mouse, mug, plant
    rrect(g, 396, 512, 170, 18, 4); g.fillStyle = '#1b1d23'; g.fill();
    g.fillStyle = night ? 'rgba(120,200,255,0.35)' : 'rgba(255,255,255,0.12)'; for (i = 0; i < 12; i++) g.fillRect(402 + i * 13.5, 515, 10, 3);
    g.fillStyle = '#1b1d23'; ellipse(g, 606, 524, 9, 6); g.fill();
    g.fillStyle = night ? '#4b5f6a' : '#e9eef0'; rrect(g, 690, 494, 24, 30, 3); g.fill();
    g.strokeStyle = night ? '#4b5f6a' : '#e9eef0'; g.lineWidth = 4; g.beginPath(); g.arc(716, 508, 7, -1.3, 1.3); g.stroke();
    g.fillStyle = '#2f9e8f'; g.fillRect(690, 500, 24, 4);
    g.fillStyle = night ? '#2a2420' : '#c9c2b8'; rrect(g, 970, 466, 40, 34, 4); g.fill();
    var leaf = night ? '#16301f' : gold ? '#4a6a2e' : '#3f7a3a';
    for (i = 0; i < 16; i++) {
      var a = -2.6 + i * 0.32 + R() * 0.2, lr = 18 + R() * 26;
      g.fillStyle = mix(leaf, '#000000', R() * 0.3);
      g.save(); g.translate(990 + Math.cos(a) * lr, 470 + Math.sin(a) * lr * 0.9 + (a > -1.5 ? 20 : 0)); g.rotate(a); ellipse(g, 0, 0, 9, 5); g.fill(); g.restore();
    }
    decorate(g, 'desk');
    // light: the sunset coming in, or the room by screen light at night
    if (gold) { g.fillStyle = 'rgba(255,140,80,0.08)'; g.fillRect(0, 0, W, H); }
    if (night) {
      light(g, D.code.x + D.code.w / 2, D.code.y + 80, 330, '#4aa8ff', 0.22);
      light(g, D.code.x + D.code.w / 2, 506, 200, '#ffd7a0', 0.25);
      light(g, 290, 512, 150, '#ffcf8a', 0.38);   // the desk lamp's pool
      light(g, 278, 372, 26, '#fff0c8', 0.9);
      light(g, D.clock.x + D.clock.w / 2, D.clock.y + 24, 90, '#ff8a3d', 0.16);
      light(g, 860, 360, 200, '#8fd0ff', 0.12);
    }
  }
  /* string lights along the top of the window: warm when the light goes */
  function stringLights(g, v) {
    var on = phase !== 'day' || oc > 0.5, n = Math.floor(v.w / 32), i, pts = [];
    g.strokeStyle = rgba(room.dark, 0.7); g.lineWidth = 1; g.beginPath();
    for (i = 0; i <= n; i++) {
      var f = i / n, x = v.x + 8 + f * (v.w - 16), y = v.y + 4 + Math.abs(Math.sin(f * Math.PI * 3)) * 15;
      pts.push([x, y]); if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    var COLS = holiday() === 'winter' ? ['#ff5a5a', '#ffd84a', '#6ad1ff', '#8dff8a', '#ff7ad9'] : null;   // coloured for the holidays
    for (i = 1; i < pts.length - 1; i++) {
      var bc = COLS ? COLS[i % COLS.length] : '#ffc96e';
      if (on) light(g, pts[i][0], pts[i][1] + 5, 15, bc, phase === 'night' ? 0.6 : 0.4);
      g.fillStyle = COLS ? (on ? mix(bc, '#ffffff', 0.45) : mix(bc, '#ffffff', 0.25)) : on ? '#fff1c8' : 'rgba(255,244,214,0.7)'; ellipse(g, pts[i][0], pts[i][1] + 5, 2.4, 3.4); g.fill();
    }
  }
  function leafCol() { return phase === 'night' ? '#173322' : phase === 'golden' ? '#56702f' : '#3f7a3a'; }
  function vine(g, x, y, len, sway, R) {   // a trailing pothos stem
    var i, n = Math.floor(len / 11);
    g.strokeStyle = mix(leafCol(), '#000000', 0.2); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y);
    for (i = 1; i <= n; i++) g.lineTo(x + Math.sin(i * 0.5) * sway, y + i * 11);
    g.stroke();
    for (i = 1; i <= n; i++) {
      var lx = x + Math.sin(i * 0.5) * sway, ly = y + i * 11, side = i % 2 ? 1 : -1;
      g.fillStyle = mix(leafCol(), i % 3 ? '#000000' : '#d8e8a0', 0.15 + R() * 0.15);
      g.save(); g.translate(lx + side * 5, ly); g.rotate(side * 0.7 + 1.57); ellipse(g, 0, 0, 7 - i * 0.25, 4.5 - i * 0.12); g.fill(); g.restore();
    }
  }
  function cat(g, hx, hy) {   // curled up asleep, head tucked by the tail
    var c = phase === 'night' ? '#3a3d4a' : '#7b7f8b', d = mix(c, '#000000', 0.25);
    g.fillStyle = c; ellipse(g, hx + 26, hy + 4, 30, 15); g.fill(); g.beginPath(); g.arc(hx, hy, 11, 0, 6.2832); g.fill();
    g.beginPath(); g.moveTo(hx - 8, hy - 8); g.lineTo(hx - 6, hy - 18); g.lineTo(hx, hy - 10); g.moveTo(hx + 2, hy - 10); g.lineTo(hx + 8, hy - 19); g.lineTo(hx + 10, hy - 8); g.fill();
    g.fillStyle = d; g.fillRect(hx + 14, hy - 8, 2, 7); g.fillRect(hx + 22, hy - 10, 2, 8); g.fillRect(hx + 30, hy - 9, 2, 7);   // tabby stripes
    g.strokeStyle = c; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(hx + 54, hy + 8); g.quadraticCurveTo(hx + 50, hy + 22, hx + 18, hy + 18); g.stroke();
    g.strokeStyle = d; g.lineWidth = 1.2; g.beginPath(); g.arc(hx - 4, hy + 1, 2.5, 0.3, 2.8); g.stroke();
  }
  function deskThings(g, R) {
    var night = phase === 'night', i;
    // books, with the clock on top
    g.fillStyle = night ? '#1f2a44' : '#2f4a73'; g.fillRect(124, 484, 142, 8);
    g.fillStyle = night ? '#4a3b22' : '#d0a24a'; g.fillRect(130, 492, 132, 8);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(130, 487, 120, 1); g.fillRect(136, 495, 110, 1);
    rrect(g, D.clock.x, D.clock.y, D.clock.w, D.clock.h, 6); g.fillStyle = night ? '#241d1a' : '#5b4231'; g.fill();
    rrect(g, D.clock.x + 6, D.clock.y + 6, D.clock.w - 12, D.clock.h - 12, 3); g.fillStyle = '#0b0807'; g.fill();
    // an anglepoise lamp leaning over the desk
    var lc = night ? '#2a2d36' : '#d9573e';
    g.fillStyle = lc; ellipse(g, 286, 500, 18, 4.5); g.fill();
    g.strokeStyle = lc; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(286, 498); g.lineTo(262, 404); g.lineTo(292, 352); g.stroke();
    g.fillStyle = lc; g.beginPath(); g.arc(262, 404, 4, 0, 6.2832); g.fill();
    g.save(); g.translate(292, 352); g.rotate(0.45);
    g.beginPath(); g.moveTo(-6, -4); g.lineTo(6, -4); g.lineTo(16, 20); g.lineTo(-16, 20); g.closePath(); g.fill(); g.restore();
    // a rubber duck on the monitor, and sticky notes on its edge
    var dx = D.code.x + D.code.w - 40, dy = D.code.y - 8;
    g.fillStyle = '#ffd23f'; ellipse(g, dx, dy, 9, 6); g.fill(); g.beginPath(); g.arc(dx + 6, dy - 7, 5, 0, 6.2832); g.fill();
    g.fillStyle = '#ff8c2e'; g.beginPath(); g.moveTo(dx + 10, dy - 7); g.lineTo(dx + 15, dy - 5); g.lineTo(dx + 10, dy - 4); g.fill();
    g.fillStyle = '#1b1b1b'; g.fillRect(dx + 7, dy - 9, 1.5, 1.5);
    var notes = [['#ffe36e', 0.06, 300], ['#ff9fb4', -0.08, 322], ['#9fe0ff', 0.04, 346]];
    for (i = 0; i < notes.length; i++) {
      g.save(); g.translate(D.code.x + D.code.w + 12, notes[i][2]); g.rotate(notes[i][1]);
      g.fillStyle = night ? mix(notes[i][0], '#1a1c2c', 0.55) : notes[i][0]; g.fillRect(-8, -8, 17, 17);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-5, -3, 11, 1); g.fillRect(-5, 1, 8, 1); g.restore();
    }
    // a plant hanging from the ceiling in front of the glass
    g.strokeStyle = rgba(room.dark, 0.55); g.lineWidth = 1; g.beginPath();
    var px = 548, py = 84;
    g.moveTo(px, 0); g.lineTo(px - 16, py); g.moveTo(px, 0); g.lineTo(px + 16, py); g.moveTo(px, 0); g.lineTo(px, py - 2); g.stroke();
    g.fillStyle = night ? '#4a2c22' : '#c46a45'; g.beginPath(); g.moveTo(px - 22, py); g.lineTo(px + 22, py); g.quadraticCurveTo(px + 20, py + 26, px, py + 28); g.quadraticCurveTo(px - 20, py + 26, px - 22, py); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(px - 20, py + 2, 40, 2);
    var vines = [[-16, 96, 6], [-8, 124, -5], [4, 60, 4], [14, 104, 7], [20, 44, -3]];
    for (i = 0; i < vines.length; i++) vine(g, px + vines[i][0], py + 6, vines[i][1], vines[i][2], R);
    g.fillStyle = leafCol(); for (i = 0; i < 7; i++) { g.save(); g.translate(px - 18 + i * 6, py - 4 - (i % 3) * 4); g.rotate(-0.9 + i * 0.3); ellipse(g, 0, 0, 9, 5); g.fill(); g.restore(); }
  }

  function stack(g) {   // books on the windowsill and a little plant
    var x = V.bed.x + V.bed.w - 120, y = V.bed.y + V.bed.h + 8, cols = ['#7a4a6a', '#2f6a73', '#c9a24a', '#a8473c'];
    for (var i = 0; i < 4; i++) { g.fillStyle = phase === 'night' ? mix(cols[i], '#10142a', 0.6) : cols[i]; g.fillRect(x + i * 9, y - 26 - (i % 2) * 4, 8, 26 + (i % 2) * 4); }
    g.fillStyle = phase === 'night' ? '#3a2a24' : '#d9cfc2'; g.fillRect(x + 54, y - 14, 18, 14);
    g.fillStyle = leafCol(); for (i = 0; i < 6; i++) { g.save(); g.translate(x + 63, y - 14); g.rotate(-1.1 + i * 0.45); ellipse(g, 0, -9, 3, 9); g.fill(); g.restore(); }
  }
  function drawBedRoom() {
    var v = V.bed, g = v.room.getContext('2d'), night = phase === 'night', i;
    g.clearRect(0, 0, W, H);
    wallAndWindow(g, v, 'bed');
    stringLights(g, v);
    g.fillStyle = mix(room.wall, '#ffffff', night ? 0.05 : 0.35); g.fillRect(v.x - 16, v.y + v.h + 8, v.w + 32, 10);   // sill
    g.fillStyle = room.floor; g.fillRect(0, 640, W, H - 640);
    g.fillStyle = rgba(mix(room.duvet, room.floor, 0.5), 0.6); ellipse(g, 600, 712, 380, 40); g.fill();
    g.fillStyle = mix(room.wallLo, '#000000', 0.2); g.fillRect(W - 22, 0, 22, H);   // the wall between the rooms
    // a print on the wall
    g.fillStyle = room.frame; g.fillRect(64, 236, 124, 160);
    var gr = g.createLinearGradient(0, 244, 0, 388); gr.addColorStop(0, night ? '#2a3150' : '#e7b48f'); gr.addColorStop(1, night ? '#151a30' : '#5f6f95');
    g.fillStyle = gr; g.fillRect(71, 243, 110, 146);
    g.fillStyle = night ? '#f3e7c8' : '#fff4d8'; g.beginPath(); g.arc(150, 278, 9, 0, 6.2832); g.fill();
    g.fillStyle = night ? '#0e1122' : '#2f3550'; for (i = 0; i < 8; i++) { var bh = 18 + ((i * 37) % 54); g.fillRect(74 + i * 13.5, 389 - bh, 11, bh); }
    g.fillStyle = night ? '#4a3a32' : '#c9a27e';   // slippers by the bed
    ellipse(g, 300, 672, 22, 8); g.fill(); ellipse(g, 342, 684, 22, 8); g.fill();
    g.fillStyle = rgba(room.dark, 0.2); ellipse(g, 292, 670, 10, 4); g.fill(); ellipse(g, 334, 682, 10, 4); g.fill();
    stack(g);
    decorate(g, 'bed');
    // nightstand and clock
    g.fillStyle = room.wood; g.fillRect(30, 504, 172, 14); g.fillStyle = mix(room.wood, '#000000', 0.2); g.fillRect(38, 518, 156, 132);
    g.fillStyle = mix(room.wood, '#ffffff', 0.12); g.fillRect(48, 560, 136, 2); g.fillRect(104, 536, 24, 4);
    rrect(g, 42, 418, 150, 86, 8); g.fillStyle = '#121418'; g.fill();
    rrect(g, 48, 424, 138, 74, 4); g.fillStyle = '#050608'; g.fill();
    g.fillStyle = '#16181c'; g.fillRect(74, 506, 44, 4);   // phone
    // bed: headboard, frame, mattress, pillow
    rrect(g, 210, 392, 40, 250, 12); g.fillStyle = mix(room.duvet, '#7d7468', 0.6); g.fill();
    g.fillStyle = room.wood; g.fillRect(222, 600, W - 250, 34); g.fillRect(232, 634, 10, 16); g.fillRect(W - 50, 634, 10, 16);
    g.fillStyle = room.sheet; g.fillRect(246, 548, W - 276, 54);
    g.fillStyle = mix(room.sheet, '#ffffff', 0.4); ellipse(g, 318, 532, 74, 22); g.fill();
    g.fillStyle = rgba(room.dark, 0.18); ellipse(g, 318, 546, 70, 8); g.fill();
    // him, asleep on his side of the pillow: hair, ear, a closed eye
    g.fillStyle = room.skin; ellipse(g, 322, 512, 25, 22); g.fill();
    g.fillStyle = room.hair; g.beginPath(); g.arc(314, 506, 25, Math.PI * 0.75, Math.PI * 2.05); g.quadraticCurveTo(352, 520, 340, 500); g.fill();
    for (i = 0; i < 5; i++) { g.beginPath(); g.arc(292 + i * 9, 492 + (i % 2) * 3, 7, 0, 6.2832); g.fill(); }
    g.strokeStyle = rgba(room.dark, 0.7); g.lineWidth = 1.4; g.beginPath(); g.arc(314, 514, 3.5, 0.3, 2.8); g.moveTo(337.5, 515); g.arc(334, 514, 3.5, 0.3, 2.8); g.stroke();   // eyes shut
    if (phase !== 'night') { g.fillStyle = 'rgba(230,120,110,0.25)'; ellipse(g, 309, 523, 4, 2.5); g.fill(); ellipse(g, 340, 523, 4, 2.5); g.fill(); }
    // light from the window across the bed
    g.save(); g.beginPath(); g.moveTo(v.x, v.y + v.h + 18); g.lineTo(v.x + v.w, v.y + v.h + 18); g.lineTo(W - 10, 640); g.lineTo(v.x, 640); g.closePath();
    g.fillStyle = night ? 'rgba(120,140,220,0.10)' : phase === 'golden' ? 'rgba(255,170,100,0.22)' : 'rgba(255,255,255,0.12)'; g.fill(); g.restore();
    if (night) light(g, 117, 460, 140, '#ffb36b', 0.14);
    sleepingDog(g);

  }

  /* he sits with his back to us, headphones on, like the painter */
  var guy = {}, duvet = null, steamEls = [];
  function sprite(box, x, y, w, h, draw) { var c = mk(w, h), g = c.getContext('2d'); g.translate(-x, -y); draw(g); return place(box, c, x, y); }
  function buildPeople() {
    var bd = V.desk.box, bb = V.bed.box, rim = room.rim, night = phase === 'night';
    steamEls.forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); }); steamEls = [];
    [guy.body, guy.head, guy.chair, duvet, guy.empty, guy.bedEmpty, guy.deskCat, guy.legs, ARM.L.c, ARM.R.c].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e); });
    var awake = view === 'desk';
    if (awake) {
      bd.appendChild(catEl);   // on the desk: in front of the room, behind his arms
      var dc = document.getElementById('dclock');   // the clock's glowing digits go under the cat when it walks past
      if (dc) { dc.style.position = 'absolute'; bd.insertBefore(dc, catEl); }
      guy.body = sprite(bd, 270, 400, 200, 200, function (g) {
        g.fillStyle = room.hood; g.beginPath();
        g.moveTo(286, 600); g.quadraticCurveTo(278, 470, 300, 446); g.quadraticCurveTo(372, 418, 444, 446); g.quadraticCurveTo(466, 470, 458, 600); g.closePath(); g.fill();
        g.fillStyle = room.hoodHi; ellipse(g, 372, 438, 40, 13); g.fill();   // the hood, down
        g.strokeStyle = rgba(room.dark, 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(372, 452); g.lineTo(372, 560); g.stroke();
        if (rim) { g.strokeStyle = rgba(rim, night ? 0.45 : 0.6); g.lineWidth = 2.5; g.beginPath(); g.moveTo(444, 446); g.quadraticCurveTo(466, 470, 458, 560); g.stroke(); }
      });
      guy.head = sprite(bd, 320, 340, 104, 104, function (g) {
        g.fillStyle = room.skin; ellipse(g, 340, 402, 6, 9); g.fill(); ellipse(g, 404, 402, 6, 9); g.fill();   // ears
        g.fillStyle = room.hair; g.beginPath(); g.arc(372, 396, 31, 0, 6.2832); g.fill();
        for (var i = 0; i < 7; i++) { g.beginPath(); g.arc(348 + i * 8, 372 + Math.abs(i - 3) * 2, 8, 0, 6.2832); g.fill(); }
        g.fillStyle = room.hair; g.fillRect(358, 420, 28, 14);
        // headphones: band over the crown, cups over the ears
        g.strokeStyle = '#2a2d35'; g.lineWidth = 6; g.beginPath(); g.arc(372, 398, 36, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        g.fillStyle = '#2a2d35'; rrect(g, 330, 388, 14, 28, 6); g.fill(); rrect(g, 400, 388, 14, 28, 6); g.fill();
        g.fillStyle = '#ff7a59'; g.fillRect(333, 400, 2, 6); g.fillRect(409, 400, 2, 6);
        if (rim) { g.strokeStyle = rgba(rim, night ? 0.5 : 0.7); g.lineWidth = 2; g.beginPath(); g.arc(372, 396, 31, -1.4, 0.4); g.stroke(); }
      });
      guy.head.style.webkitTransformOrigin = guy.head.style.transformOrigin = '52px 90px';
      guy.legs = sprite(bd, 290, 600, 170, 90, function (g) {   // jeans and sneakers under the seat
        var jean = night ? '#1c2438' : '#34476b', shoe = night ? '#8a8f9c' : '#f1f0ea';
        g.lineCap = 'round'; g.strokeStyle = jean; g.lineWidth = 22;
        g.beginPath(); g.moveTo(332, 618); g.lineTo(320, 662); g.moveTo(414, 618); g.lineTo(428, 662); g.stroke();
        g.strokeStyle = rgba(room.dark, 0.3); g.lineWidth = 2; g.beginPath(); g.moveTo(326, 630); g.lineTo(318, 660); g.moveTo(420, 630); g.lineTo(428, 660); g.stroke();
        g.fillStyle = shoe; ellipse(g, 318, 670, 17, 8); g.fill(); ellipse(g, 430, 670, 17, 8); g.fill();
        g.fillStyle = night ? '#2a2c34' : '#3a3d46'; g.fillRect(302, 674, 32, 3); g.fillRect(414, 674, 32, 3);
        g.fillStyle = '#ff7a59'; g.fillRect(310, 666, 8, 2); g.fillRect(422, 666, 8, 2);
      });
      guy.chair = sprite(bd, 260, 450, 230, 318, function (g) {
        g.fillStyle = room.chair; rrect(g, 290, 470, 164, 150, 26); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.beginPath();
        for (var i = 0; i < 14; i++) { g.moveTo(300 + i * 11, 478); g.lineTo(300 + i * 11, 612); } g.stroke();
        g.fillStyle = mix(room.chair, '#ffffff', 0.08); rrect(g, 296, 476, 152, 16, 8); g.fill();
        g.fillStyle = mix(room.chair, '#ffffff', 0.05); rrect(g, 280, 612, 184, 20, 8); g.fill();   // the seat
        g.fillStyle = room.chair; g.fillRect(366, 630, 12, 66);
        g.fillRect(300, 700, 144, 8); g.fillRect(368, 696, 8, 30);
        g.fillStyle = '#08090c'; ellipse(g, 302, 714, 7, 6); g.fill(); ellipse(g, 442, 714, 7, 6); g.fill(); ellipse(g, 372, 732, 7, 6); g.fill();
        if (rim) { g.strokeStyle = rgba(rim, 0.25); g.lineWidth = 2; g.beginPath(); g.moveTo(454, 496); g.lineTo(454, 600); g.stroke(); }
      });
      guy.bedEmpty = sprite(bb, 340, 470, 680, 180, function (g) { duvetShape(g, false); });
      guy.deskCat = null;
      bd.appendChild(dogEl);   // the dog runs in front of the chair
      armSetup(bd);   // his arms go over the dog: he reaches down to it
      bd.appendChild(ballEl);   // and the ball over his hand, when he holds it
      for (var k = 0; k < 2; k++) {   // steam off his coffee
        var st = mk(22, 40), sg = st.getContext('2d');
        for (var j = 0; j < 6; j++) { var gx = 11 + Math.sin(j * 1.1) * 4, gy = 36 - j * 6, rg = sg.createRadialGradient(gx, gy, 0, gx, gy, 5 + j); rg.addColorStop(0, 'rgba(255,255,255,' + (night ? 0.14 : 0.3) + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)'); sg.fillStyle = rg; sg.fillRect(0, 0, 22, 40); }
        steamEls.push(place(bd, st, 692, 452));
      }
    } else {
      if (catEl.parentNode) catEl.parentNode.removeChild(catEl);   // the cat is on the bed with him
      // asleep: the desk is empty and dark; the duvet breathes
      guy.empty = sprite(bd, 260, 450, 230, 318, function (g) {
        g.fillStyle = room.chair; rrect(g, 300, 470, 164, 150, 26); g.fill(); g.fillRect(376, 620, 12, 76); g.fillRect(310, 700, 144, 8);
      });
      duvet = sprite(bb, 340, 440, 680, 210, function (g) { duvetShape(g, true); });
      duvet.style.webkitTransformOrigin = duvet.style.transformOrigin = '50% 100%';
    }
  }
  function arm(g, sx, sy, ex, ey, hx, hy) {
    g.lineCap = 'round'; g.strokeStyle = room.hood; g.lineWidth = 24;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    g.lineWidth = 18; g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = room.skin; ellipse(g, hx + (hx > ex ? 6 : -2), hy - 2, 7, 5); g.fill();
  }
  function duvetShape(g, him) {
    g.fillStyle = room.duvet; g.beginPath();
    if (him) { g.moveTo(344, 640); g.lineTo(350, 520); g.quadraticCurveTo(370, 496, 420, 500); g.quadraticCurveTo(520, 494, 600, 486); g.quadraticCurveTo(680, 482, 730, 500); g.quadraticCurveTo(800, 512, 860, 500); g.quadraticCurveTo(930, 494, 960, 520); }
    else { g.moveTo(344, 640); g.lineTo(350, 540); g.quadraticCurveTo(600, 528, 960, 536); }
    g.quadraticCurveTo(1000, 560, 996, 628); g.lineTo(344, 628); g.closePath(); g.fill();
    g.strokeStyle = rgba(room.duvetHi, 0.55); g.lineWidth = 2; g.beginPath();
    g.moveTo(420, 560); g.quadraticCurveTo(520, 548, 600, 560); g.moveTo(640, 590); g.quadraticCurveTo(760, 570, 880, 586); g.stroke();
    g.fillStyle = room.sheet; g.beginPath();   // the sheet folded over the top of the duvet
    if (him) { g.moveTo(350, 520); g.quadraticCurveTo(370, 496, 420, 500); g.lineTo(424, 512); g.quadraticCurveTo(378, 510, 356, 534); }
    else { g.moveTo(350, 540); g.quadraticCurveTo(380, 536, 420, 535); g.lineTo(420, 548); g.quadraticCurveTo(380, 549, 352, 554); }
    g.closePath(); g.fill();
    if (!him) return;
    g.fillStyle = mix(room.skin, room.duvet, 0.1); g.lineCap = 'round'; g.strokeStyle = room.skin; g.lineWidth = 11;   // an arm over the covers
    g.beginPath(); g.moveTo(386, 512); g.quadraticCurveTo(430, 524, 470, 520); g.stroke();
    g.fillStyle = '#6f7480'; ellipse(g, 384, 512, 12, 9); g.fill();
    cat(g, 866, 484);   // the cat, curled up by his feet
    g.fillStyle = room.hood; g.beginPath();   // his hoodie, thrown over the end of the bed
    g.moveTo(958, 532); g.quadraticCurveTo(984, 520, 1000, 540); g.lineTo(1002, 610); g.quadraticCurveTo(990, 620, 980, 606); g.quadraticCurveTo(966, 570, 958, 532); g.fill();
    g.strokeStyle = rgba(room.hoodHi, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(968, 540); g.quadraticCurveTo(986, 560, 990, 600); g.stroke();
  }

  /* ---------------- the animals ----------------
   * The dog and the cat are drawn from simple skeletons: a spine from shoulder to hip, legs
   * solved from where each paw should be (so a planted paw stays put while the body moves
   * over it), a head, ears and a tail. Every pose is drawn once into a grid of frames; at run
   * time a frame is picked by sliding the grid inside a small window, and the animal is moved,
   * scaled and flipped with a transform. Walk cycles advance with the ground covered, so paws
   * don't skate; turns go through a frame facing us instead of flipping in place.
   * Preview with ?dog=visit (or fetch, walk, tail) and ?cat=1. */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function ik(ax, ay, bx, by, l1, l2, bend) {   // the knee, given the hip, the foot and the two bone lengths
    var dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    if (d >= l1 + l2) return [ax + dx / d * l1, ay + dy / d * l1];
    var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return [ax + dx * a / d + dy / d * h * bend, ay + dy * a / d - dx / d * h * bend];
  }
  function foot(p, duty, stride, lift) {   // a paw over one stride: planted and sliding back, then lifted forward
    p = ((p % 1) + 1) % 1;
    if (p < duty) return [stride * (0.5 - p / duty), 0, 0];
    var s = (p - duty) / (1 - duty), e = s * s * (3 - 2 * s), l = Math.sin(Math.PI * s);
    return [stride * (-0.5 + e), -lift * l, l];
  }
  function limb(g, pts, ws, col) {   // a leg as a chain of round-capped strokes, thick to thin
    g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    for (var i = 0; i < pts.length - 1; i++) { g.lineWidth = ws[i]; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  }
  function blend(a, b, t) {   // in-between two poses (numbers and arrays of numbers)
    var o = {}, k;
    for (k in a) {
      if (typeof a[k] === 'number' && typeof b[k] === 'number') o[k] = lerp(a[k], b[k], t);
      else if (a[k] && a[k].length && b[k] && b[k].length) o[k] = a[k].map(function (v, i) { return v && v.length ? v.map(function (u, j) { return lerp(u, b[k][i][j], t); }) : lerp(v, b[k][i], t); });
      else o[k] = t < 0.5 ? a[k] : b[k];
    }
    return o;
  }
  function copy(p, o) { var r = {}, k; for (k in p) r[k] = p[k]; for (k in o) r[k] = o[k]; return r; }
  function bakeGrid(frames, cols, w, h, s, shadow) {   // draw every pose into one canvas, cell by cell
    var c = mk(cols * w * s, Math.ceil(frames.length / cols) * h * s), g = c.getContext('2d');
    for (var i = 0; i < frames.length; i++) {
      g.save(); g.translate((i % cols) * w * s, Math.floor(i / cols) * h * s); g.beginPath(); g.rect(0, 0, w * s, h * s); g.clip(); g.scale(s, s);
      shadow(g, frames[i]); frames[i].draw(g, frames[i]);
      g.restore();
    }
    return c;
  }

  /* ---------------- the dog: a golden retriever ---------------- */
  var DS = 1.6, FW = 170, FH = 120, DCOLS = 7, DGY = 108, DOGP = param('dog');
  var dogEl = document.createElement('div'), dogSheet = null, ballEl = mk(22, 22), DOG = {};
  dogEl.style.cssText = 'position:absolute;left:0;top:0;width:' + Math.round(FW * DS) + 'px;height:' + Math.round(FH * DS) + 'px;overflow:hidden;display:none;' +
    '-webkit-transform-origin:' + 85 * DS + 'px ' + DGY * DS + 'px;transform-origin:' + 85 * DS + 'px ' + DGY * DS + 'px';
  ballEl.style.cssText = 'position:absolute;left:0;top:0;display:none';
  (function () { var g = ballEl.getContext('2d'); g.fillStyle = '#d4e157'; g.beginPath(); g.arc(11, 11, 9, 0, 6.2832); g.fill(); g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(12.5, 12.5, 7.5, 0, 6.2832); g.fill(); g.fillStyle = '#d4e157'; g.beginPath(); g.arc(10.5, 10.5, 7.5, 0, 6.2832); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.4; g.beginPath(); g.arc(5, 11, 8, -1, 1); g.stroke(); })();
  function dogCols() {
    var n = phase === 'night', gd = phase === 'golden';
    return { coat: n ? '#6e5842' : gd ? '#db9550' : '#d9a35a', shade: n ? '#4c3c2d' : gd ? '#a86a3a' : '#b07a3e', light: n ? '#8b7359' : gd ? '#f5c98a' : '#f2d49e',
      ear: n ? '#574332' : gd ? '#b9763f' : '#bf8646', dark: '#21160e', tongue: n ? '#8a4a55' : '#e8788a', mouth: n ? '#2a1414' : '#5c2b2b' };
  }
  function dogStand() {   // standing square, facing right; paws are [x, y, lift] for near front, far front, near hind, far hind
    return { sx: 108, sy: 59, hx: 60, hy: 57, paws: [[112, DGY, 0], [104, DGY, 0], [62, DGY, 0], [54, DGY, 0]],
      hx2: 134, hy2: 27, ha: 0, mouth: 0.35, tongue: 1, shut: 0, ear: 0, tail: 0.3, wag: 0, ball: 0, sit: 0 };
  }
  function dogEar(g, w, l) { g.beginPath(); g.moveTo(-w * 0.45, 0); g.bezierCurveTo(-w * 0.9, l * 0.5, -w * 0.3, l, w * 0.15, l * 0.95); g.bezierCurveTo(w * 0.7, l * 0.8, w * 0.8, l * 0.3, w * 0.5, 0); g.closePath(); g.fill(); }
  function dogHead(g, p, C) {   // side view, facing right, around the skull's centre
    var m = p.mouth;
    g.save(); g.translate(p.hx2, p.hy2); g.rotate(p.ha);
    g.fillStyle = C.shade; g.save(); g.translate(-5, -9); g.rotate(0.3 + p.ear * 0.8); dogEar(g, 9, 17); g.restore();   // far ear
    if (m > 0.05) {   // the open mouth behind the jaw
      g.fillStyle = C.mouth; g.beginPath(); g.moveTo(8, 6); g.lineTo(25, 5); g.lineTo(23, 8 + m * 9); g.lineTo(8, 10 + m * 4); g.closePath(); g.fill();
    }
    g.fillStyle = C.coat; g.beginPath(); g.arc(0, 0, 13.5, 0, 6.2832); g.fill();
    g.beginPath(); g.moveTo(4, -9); g.quadraticCurveTo(10, -8, 14, -4.5); g.lineTo(26, -2.5); g.quadraticCurveTo(30.5, -1.5, 30, 3); g.quadraticCurveTo(29.5, 6.5, 25, 6.5); g.lineTo(6, 9); g.closePath(); g.fill();   // muzzle
    g.save(); g.translate(7, 7); g.rotate(m * 0.42);   // the lower jaw drops as it pants
    if (p.tongue && m > 0.2) { g.fillStyle = C.tongue; g.beginPath(); g.moveTo(5, 0); g.quadraticCurveTo(15, 1, 16, 5 + m * 6); g.quadraticCurveTo(14, 10 + m * 6, 10, 7 + m * 4); g.quadraticCurveTo(8, 3, 5, 3); g.fill(); }
    g.fillStyle = mix(C.coat, C.shade, 0.25); g.beginPath(); g.moveTo(-2, 0); g.lineTo(17, -0.5); g.quadraticCurveTo(19, 1.5, 17, 3.5); g.lineTo(-1, 5); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = rgba(C.light, 0.55); ellipse(g, 1, -8, 8, 4); g.fill(); ellipse(g, 19, -2.5, 7, 1.6); g.fill();
    g.fillStyle = C.dark; ellipse(g, 28.5, 0, 3.4, 2.9); g.fill();   // nose
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(28, -1.2, 0.9, 0, 6.2832); g.fill();
    if (p.shut > 0.5) { g.strokeStyle = C.dark; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.arc(6, -4.5, 2.6, 0.2, 2.9); g.stroke(); }
    else { g.fillStyle = C.dark; ellipse(g, 6.5, -4, 2.3, 2.5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(7.2, -4.8, 0.7, 0, 6.2832); g.fill(); }
    g.strokeStyle = rgba(C.shade, 0.7); g.lineWidth = 1.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(3, -8.5); g.quadraticCurveTo(7, -10, 10, -8); g.stroke();   // brow
    if (p.ball) { g.fillStyle = '#d4e157'; g.beginPath(); g.arc(22, 9, 6.2, 0, 6.2832); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.beginPath(); g.arc(19, 9, 5, -1, 1); g.stroke(); }
    g.fillStyle = C.ear; g.save(); g.translate(-3, -9); g.rotate(0.12 + p.ear); dogEar(g, 11, 20); g.restore();   // near ear, soft and floppy
    g.fillStyle = rgba(C.light, 0.25); g.save(); g.translate(-3, -9); g.rotate(0.12 + p.ear); ellipse(g, 0, 7, 3, 6); g.fill(); g.restore();
    g.restore();
  }
  function dogTail(g, x, y, up, wag, C) {   // a long feathered tail; a wag swings it towards us and away, so it shortens
    var n = 9, seg = 5.4 * (1 - 0.32 * Math.abs(wag)), a = Math.PI + up + wag * 0.25, pts = [[x, y]], i;
    for (i = 0; i < n; i++) { a += 0.07; x += Math.cos(a) * seg; y += Math.sin(a) * seg; if (y > DGY - 2) y = DGY - 2; pts.push([x, y]); }
    g.lineCap = 'round';
    for (i = 0; i < n; i++) { g.strokeStyle = rgba(C.light, 0.75); g.lineWidth = 7 - i * 0.45; g.beginPath(); g.moveTo(pts[i][0], pts[i][1] + 3); g.lineTo(pts[i + 1][0], pts[i + 1][1] + 3.5); g.stroke(); }   // the feathering underneath
    for (i = 0; i < n; i++) { g.strokeStyle = C.coat; g.lineWidth = 8 - i * 0.6; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  }
  function dogLegF(p, k, s) {   // front leg: shoulder, elbow (behind), wrist, paw
    var w = p.paws[k], l = w[2], r = [p.sx + 1, p.sy + 3];
    var wr = [w[0] - lerp(1.5, -6, l), w[1] - 3 - lerp(6, 2, l)], el = ik(r[0], r[1], wr[0], wr[1], 19.5 * s, 19.5 * s, -1);
    return [r, el, wr, [w[0] + 2.5, w[1] - 2.8]];
  }
  function dogLegH(p, k) {   // hind leg: hip, stifle (forward), hock (behind the paw), paw
    var w = p.paws[k], l = w[2], r = [p.hx + 2, p.hy + 3], sit = p.sit;
    var hk = [w[0] - lerp(lerp(6, 17, sit), -4, l), w[1] - lerp(lerp(17, 4, sit), 11, l)], st = ik(r[0], r[1], hk[0], hk[1], 20, 20.5, 1);
    return [r, st, hk, [w[0] + 2.5, w[1] - 2.8]];
  }
  function paw(g, q, col) { g.fillStyle = col; ellipse(g, q[0] + 0.5, q[1] - 0.3, 6, 3.3); g.fill(); }
  // Body shapes are drawn from points fixed to the shoulder (S) or the hip (H), turned with the
  // spine, so the body keeps its depth when it tips up to sit or down to stretch.
  function spine(p, rest) { var a = Math.atan2(p.sy - p.hy, p.sx - p.hx) - rest; return [Math.cos(a), Math.sin(a)]; }
  function bp(p, cs, atS, ox, oy) { var x = atS ? p.sx : p.hx, y = atS ? p.sy : p.hy; return [x + ox * cs[0] - oy * cs[1], y + ox * cs[1] + oy * cs[0]]; }
  function shape(g, p, cs, pts) {   // pts: a start point, then bezier triples; each point is [atS, ox, oy]
    var q = bp(p, cs, pts[0][0], pts[0][1], pts[0][2]), i, a, b, c;
    g.beginPath(); g.moveTo(q[0], q[1]);
    for (i = 1; i + 2 < pts.length + 1; i += 3) { a = bp(p, cs, pts[i][0], pts[i][1], pts[i][2]); b = bp(p, cs, pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]); c = bp(p, cs, pts[i + 2][0], pts[i + 2][1], pts[i + 2][2]); g.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]); }
    g.closePath();
  }
  var DOGBODY = [[1, 12, -9], [1, 21, 3], [1, 15, 19], [1, 2, 21], [1, -14, 23], [0, 24, 15], [0, 11, 10], [0, 3, 16], [0, -14, 15], [0, -16, 2],
    [0, -18, -12], [0, -10, -19], [0, 2, -19], [0, 22, -20], [1, -22, -22], [1, -6, -21], [1, 2, -21], [1, 8, -17], [1, 12, -9]];
  var DOGFRINGE = [[1, 2, 21], [1, -14, 27], [0, 16, 14], [0, 16, 14], [1, -10, 20], [1, 2, 17], [1, 2, 17]];
  var DOGSHEEN = [[0, 2, -17], [0, 22, -18], [1, -22, -20], [1, -6, -19], [1, -22, -16], [0, 22, -14], [0, 2, -15]];
  function drawDogSide(g, p) {
    var C = dogCols(), sx = p.sx, sy = p.sy, hx = p.hx, hy = p.hy, L;
    L = dogLegF(p, 1, 1); limb(g, L, [10, 7.5, 6.5], C.shade); paw(g, L[3], C.shade);   // far legs first, in shadow
    L = dogLegH(p, 3); limb(g, L, [12, 8, 6.5], C.shade); paw(g, L[3], C.shade);
    dogTail(g, hx - 13, hy - 12, p.tail, p.wag, C);
    // neck, from the withers and the chest up to the back of the head
    var ca = Math.cos(p.ha), sa = Math.sin(p.ha), ax = p.hx2 + (-5 * ca + 11 * sa), ay = p.hy2 + (-5 * sa - 11 * ca), bx = p.hx2 + (5 * ca - 9 * sa), by = p.hy2 + (5 * sa + 9 * ca);
    var cs = spine(p, 0.042), n1 = bp(p, cs, 1, -12, -18), n2 = bp(p, cs, 1, 18, -4), n3 = bp(p, cs, 1, 13, 8);
    g.fillStyle = C.coat; g.beginPath(); g.moveTo(n1[0], n1[1]); g.quadraticCurveTo(ax - 10, ay + 2, ax, ay); g.lineTo(bx, by); g.quadraticCurveTo(n2[0], n2[1], n3[0], n3[1]); g.closePath(); g.fill();
    // body: chest, belly with its fringe, the back of the thigh, rump and the line of the back
    shape(g, p, cs, DOGBODY); g.fill();
    g.fillStyle = rgba(C.light, 0.6); shape(g, p, cs, DOGFRINGE); g.fill();
    var ch = bp(p, cs, 1, 9, 6); g.fillStyle = rgba(C.light, 0.8); g.save(); g.translate(ch[0], ch[1]); g.rotate(Math.atan2(cs[1], cs[0])); ellipse(g, 0, 0, 7, 12); g.fill(); g.restore();   // the pale chest
    g.fillStyle = rgba(C.light, 0.35); shape(g, p, cs, DOGSHEEN); g.fill();
    // near legs: the thigh is a big soft muscle along its bone, which becomes the haunch when sitting
    L = dogLegH(p, 2);
    var tx = (L[0][0] + L[1][0]) / 2, ty = (L[0][1] + L[1][1]) / 2, ta = Math.atan2(L[1][1] - L[0][1], L[1][0] - L[0][0]);
    g.fillStyle = C.coat; g.save(); g.translate(tx, ty); g.rotate(ta); ellipse(g, 0, 0, 17, 11.5); g.fill(); g.restore();
    limb(g, L.slice(1), [8.5, 7], C.coat); paw(g, L[3], C.coat);
    g.strokeStyle = rgba(C.light, 0.3); g.lineWidth = 3; g.beginPath(); g.moveTo(L[1][0] - 3, L[1][1] + 2); g.lineTo(L[2][0] - 2, L[2][1] - 3); g.stroke();   // feathering behind the leg
    g.strokeStyle = rgba(C.shade, 0.3); g.lineWidth = 1.2; g.beginPath(); g.arc(tx, ty, 10, ta + 2.3, ta + 3.4); g.stroke();
    L = dogLegF(p, 0, 1); limb(g, L, [11, 8, 7], C.coat); paw(g, L[3], C.coat);
    g.strokeStyle = rgba(C.light, 0.3); g.lineWidth = 3; g.beginPath(); g.moveTo(L[1][0] - 3, L[1][1] + 1); g.lineTo(L[2][0] - 2.5, L[2][1] - 4); g.stroke();
    dogHead(g, p, C);
  }
  function drawDogFront(g, p) {   // facing us, half way through a turn
    var C = dogCols();
    g.fillStyle = C.shade; ellipse(g, 85, 64, 23, 19); g.fill();
    limb(g, [[72, 78], [71, 105]], [9], C.shade); limb(g, [[98, 78], [99, 105]], [9], C.shade);
    g.strokeStyle = C.coat; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(100, 56); g.quadraticCurveTo(116 + p.wag * 6, 46, 118 + p.wag * 10, 32); g.stroke();
    g.fillStyle = C.coat; ellipse(g, 85, 64, 19, 21); g.fill();
    g.fillStyle = C.light; ellipse(g, 85, 70, 12, 16); g.fill();
    limb(g, [[77, 74], [77, 103]], [10], C.coat); limb(g, [[93, 74], [93, 103]], [10], C.coat);
    g.fillStyle = C.coat; ellipse(g, 77, 105, 6.5, 3.6); g.fill(); ellipse(g, 93, 105, 6.5, 3.6); g.fill();
    g.strokeStyle = rgba(C.shade, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(75, 103); g.lineTo(75, 107); g.moveTo(79, 103); g.lineTo(79, 107); g.moveTo(91, 103); g.lineTo(91, 107); g.moveTo(95, 103); g.lineTo(95, 107); g.stroke();
    g.fillStyle = C.coat; ellipse(g, 85, 36, 15, 13.5); g.fill();
    g.fillStyle = C.ear; g.save(); g.translate(72, 30); g.rotate(0.35); dogEar(g, 10, 19); g.restore(); g.save(); g.translate(98, 30); g.scale(-1, 1); g.rotate(0.35); dogEar(g, 10, 19); g.restore();
    g.fillStyle = mix(C.coat, C.light, 0.35); ellipse(g, 85, 46, 9, 7.5); g.fill();
    if (p.tongue) { g.fillStyle = C.tongue; ellipse(g, 85, 54, 3.4, 4.5); g.fill(); }
    g.fillStyle = C.dark; ellipse(g, 85, 43, 4.2, 3.2); g.fill();
    g.strokeStyle = C.dark; g.lineWidth = 1; g.beginPath(); g.moveTo(85, 46); g.lineTo(85, 49); g.quadraticCurveTo(82, 51, 80, 49); g.moveTo(85, 49); g.quadraticCurveTo(88, 51, 90, 49); g.stroke();
    g.fillStyle = C.dark; g.beginPath(); g.arc(79, 34, 2.3, 0, 6.2832); g.arc(91, 34, 2.3, 0, 6.2832); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(79.7, 33.3, 0.7, 0, 6.2832); g.arc(91.7, 33.3, 0.7, 0, 6.2832); g.fill();
    g.fillStyle = rgba(C.light, 0.5); ellipse(g, 85, 28, 7, 3); g.fill();
  }
  function drawDogBack(g, p) {   // from behind, during a spin
    var C = dogCols();
    g.fillStyle = C.shade; ellipse(g, 85, 56, 17, 15); g.fill();
    g.fillStyle = C.ear; ellipse(g, 71, 44, 5, 10); g.fill(); ellipse(g, 99, 44, 5, 10); g.fill();
    g.fillStyle = C.coat; ellipse(g, 85, 40, 13, 11); g.fill();
    limb(g, [[76, 70], [75, 104]], [11, 9], C.coat); limb(g, [[94, 70], [95, 104]], [11, 9], C.coat);
    g.fillStyle = C.coat; ellipse(g, 85, 68, 21, 19); g.fill(); ellipse(g, 75, 104, 6, 3.4); g.fill(); ellipse(g, 95, 104, 6, 3.4); g.fill();
    g.fillStyle = rgba(C.light, 0.7); ellipse(g, 78, 84, 5, 12); g.fill(); ellipse(g, 92, 84, 5, 12); g.fill();
    g.strokeStyle = C.coat; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(85, 56); g.quadraticCurveTo(85 + p.wag * 10, 36, 85 + p.wag * 16, 24); g.stroke();
    g.strokeStyle = rgba(C.light, 0.7); g.lineWidth = 3; g.beginPath(); g.moveTo(88, 56); g.quadraticCurveTo(89 + p.wag * 10, 38, 89 + p.wag * 16, 27); g.stroke();
  }
  function sleepingDog(g) {   // curled up on its bed by ours
    var C = dogCols();
    g.save(); g.translate(-200, 0);
    g.fillStyle = phase === 'night' ? '#2c3a44' : '#5f8a8b'; ellipse(g, 820, 704, 78, 20); g.fill();
    g.fillStyle = mix(phase === 'night' ? '#2c3a44' : '#5f8a8b', '#ffffff', 0.15); ellipse(g, 820, 698, 66, 14); g.fill();
    g.fillStyle = C.coat; ellipse(g, 826, 684, 52, 19); g.fill();
    g.strokeStyle = C.coat; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(874, 690); g.quadraticCurveTo(862, 708, 800, 702); g.stroke();
    g.fillStyle = rgba(C.light, 0.5); ellipse(g, 830, 672, 36, 6); g.fill();
    g.fillStyle = C.coat; g.beginPath(); g.arc(784, 690, 14, 0, 6.2832); g.fill(); ellipse(g, 772, 698, 11, 7); g.fill();
    g.fillStyle = C.ear; ellipse(g, 792, 690, 7, 12); g.fill();
    g.fillStyle = C.dark; ellipse(g, 762, 697, 3, 2.5); g.fill();
    g.strokeStyle = C.dark; g.lineWidth = 1.2; g.beginPath(); g.arc(780, 688, 3, 0.3, 2.8); g.stroke();
    g.restore();
  }
  function buildDog() {
    var F = [], i, p, B = dogStand();
    function add(name, list) { DOG[name] = []; for (var j = 0; j < list.length; j++) { DOG[name].push(F.length); F.push(list[j]); } }
    function side(q) { q.draw = drawDogSide; return q; }
    function gait(n, offs, duty, stride, lifts, bob, o) {   // one full stride, n frames
      var out = [];
      for (var j = 0; j < n; j++) {
        var ph = j / n, q = copy(B, o), pw = [], k;
        for (k = 0; k < 4; k++) { var f = foot(ph + offs[k], duty, stride, lifts[k]); pw.push([B.paws[k][0] + f[0], DGY + f[1], f[2]]); }
        q.paws = pw;
        var b = Math.cos(ph * 4 * Math.PI) * bob;
        q.sy += b; q.hy += Math.cos(ph * 4 * Math.PI + 0.9) * bob; q.hy2 += Math.cos(ph * 4 * Math.PI - 0.7) * bob * 1.2;
        q.ear = (o.ear || 0) + Math.sin(ph * 4 * Math.PI - 1.2) * (o.flop || 0.08);
        q.wag = Math.sin(ph * 2 * Math.PI) * (o.wagA || 0.8);
        if (o.gallop) {   // the back flexes: gathered when the hind legs reach under, stretched out at full reach
          var hf = (pw[2][0] - B.paws[2][0] + pw[3][0] - B.paws[3][0]) / 2, ff = (pw[0][0] - B.paws[0][0] + pw[1][0] - B.paws[1][0]) / 2;
          q.hx += hf * 0.3; q.sx += ff * 0.2;
          q.sy += -3 * Math.sin(2 * Math.PI * (ph - 0.3)); q.hy += -3.5 * Math.sin(2 * Math.PI * (ph - 0.05)); q.hy2 = q.sy - 26 + 2 * Math.sin(2 * Math.PI * (ph - 0.4)); q.hx2 = q.sx + 30;
        }
        out.push(side(q));
      }
      return out;
    }
    add('walk', gait(8, [0.25, 0.75, 0, 0.5], 0.62, 28, [8, 8, 7, 7], 0.9, { mouth: 0.3 }));
    add('trot', gait(8, [0.5, 0, 0, 0.5], 0.44, 40, [12, 12, 10, 10], 1.6, { mouth: 0.5, flop: 0.18, wagA: 0.9 }));
    add('balltrot', gait(8, [0.5, 0, 0, 0.5], 0.44, 40, [12, 12, 10, 10], 1.6, { mouth: 0.28, tongue: 0, ball: 1, flop: 0.18, wagA: 1 }));
    add('gallop', gait(8, [0.5, 0.6, 0, 0.1], 0.34, 72, [15, 15, 13, 13], 0, { gallop: 1, mouth: 0.55, ear: 0.45, flop: 0.22, tail: 0.05, wagA: 0.2, ha: 0.12 }));
    var idle = [];
    for (i = 0; i < 4; i++) { p = copy(B, {}); p.mouth = 0.45 + 0.1 * Math.sin(i * Math.PI / 2); p.sy += 0.6 * Math.sin(i * Math.PI / 2); p.wag = Math.sin(i * Math.PI / 2) * 0.6; idle.push(side(p)); }
    add('stand', idle);
    var sniff = [];
    for (i = 0; i < 4; i++) { p = copy(B, { hx2: 140 + (i % 2), hy2: 76 + (i === 2 ? -1 : 0), ha: 0.95, mouth: 0, ear: -0.2, tail: 0.2, wag: Math.sin(i * Math.PI / 2) * 0.5, sy: 64 }); sniff.push(side(p)); }
    add('sniff', sniff);
    var S = copy(B, { sx: 104, sy: 57, hx: 69, hy: 92, paws: [[110, DGY, 0], [103, DGY, 0], [84, DGY, 0], [77, DGY, 0]], hx2: 126, hy2: 22, tail: -0.9, sit: 1, mouth: 0.45 });
    var down = [];
    for (i = 0; i < 4; i++) { p = side(blend(B, S, ease(i / 3))); p.sit = ease(i / 3); down.push(p); }
    add('sitdown', down);
    var sit = [];
    for (i = 0; i < 4; i++) { p = copy(S, { wag: Math.sin(i * Math.PI / 2), mouth: 0.42 + 0.12 * Math.sin(i * Math.PI / 2) }); p.sy += 0.5 * Math.sin(i * Math.PI / 2); sit.push(side(p)); }
    add('sit', sit);
    var pet = [];
    for (i = 0; i < 4; i++) { p = copy(S, { hx2: 124 + Math.sin(i * Math.PI / 2), hy2: 18 - Math.abs(Math.sin(i * Math.PI / 2)), ha: -0.3, shut: 1, mouth: 0.55, ear: 0.35, wag: Math.sin(i * Math.PI / 2) * 1.1 }); pet.push(side(p)); }
    add('pet', pet);
    var sb = [];
    for (i = 0; i < 2; i++) sb.push(side(copy(S, { hx2: 127, hy2: 20 - i, ha: -0.18, mouth: 0.28, tongue: 0, ball: 1, ear: 0.1, wag: i ? 0.9 : -0.9 })));
    add('sitball', sb);
    p = copy(B, { draw: drawDogFront, wag: 0.6 }); add('front', [p]);
    p = copy(B, { draw: drawDogBack, wag: 0.5 }); add('back', [p]);
    var sheet = bakeGrid(F, DCOLS, FW, FH, DS, function (g, q) {
      var sitting = q.sit || 0, front = q.draw !== drawDogSide;
      g.fillStyle = 'rgba(20,12,8,0.24)'; ellipse(g, front ? 85 : lerp(84, 90, sitting), DGY + 0.5, front ? 26 : lerp(52, 40, sitting), 4.5); g.fill();
    });
    dogEl.innerHTML = ''; dogEl.appendChild(sheet); dogSheet = sheet; dog.f = -1;
  }

  /* The dog's day. It comes in now and then for one of: a visit (sits by the chair and gets
   * petted), fetch (chases a ball out of the room, brings it back, he throws it again), a
   * wander (stops to sniff the rug) or chasing its own tail. The floor between the chair and
   * the desk is taken by his legs, so it crosses in front of the chair, nearer to us. */
  var dog = { on: false, x: 0, y: 744, dir: 1, f: -1, sx: 1, steps: [], si: 0, ph: 0, v: 0, next: 0, pet: false, ball: null },
    ball = { on: false }, SITAT = [168, 700];
  function dogScale(y) { return 0.6 + (y + 20 - 560) * 0.0057; }   // nearer the camera = lower on the floor = bigger
  var GAIT = { walk: [80, 28, 'walk'], trot: [165, 40, 'trot'], balltrot: [150, 40, 'balltrot'], gallop: [390, 112, 'gallop'] };
  function startEpisode(k, t) {
    var L = -150, Rt = W + 150, left = Math.random() < 0.5, lane = rnd(740, 750), st;
    dog.ball = null;
    if (k === 'visit') {
      dog.x = left ? L : Rt; dog.y = left ? 702 : lane;
      st = left ? [{ go: SITAT, g: 'walk' }] : [{ go: [150, lane], g: 'walk' }, { go: SITAT, g: 'walk' }];
      st = st.concat([{ face: 1 }, { clip: 'stand', d: 0.5 }, { clip: 'sitdown', fps: 8 }, { clip: 'sit', fps: 7, d: 1 }, { clip: 'pet', fps: 9, d: 13, pet: 1 },
        { clip: 'sit', fps: 7, d: 1.2 }, { clip: 'sitdown', fps: 8, rev: 1 }, { clip: 'stand', fps: 4, d: 0.6 }, { go: [L, 704], g: 'walk' }]);
    } else if (k === 'fetch') {
      dog.x = L - 60; dog.y = lane;
      ball = { on: true, x: -30, y: lane - 60, vx: 680, vy: 0, a: 0, floor: lane + 4 }; ballEl.style.display = 'block';
      st = [{ wait: 0.6 }, { go: [Rt + 60, lane], g: 'gallop' }, { wait: 2.6 }, { at: [Rt, lane] },
        { go: [150, lane], g: 'balltrot' }, { go: SITAT, g: 'balltrot' }, { face: 1 }, { clip: 'sitdown', fps: 9 }, { clip: 'sitball', fps: 4, d: 3.15, give: 1 },
        { clip: 'sit', fps: 7, d: 0.3, watch: 1 }, { clip: 'sitdown', fps: 14, rev: 1 }, { face: -1 }, { go: [L - 60, lane], g: 'gallop' }];
    } else if (k === 'tail') {
      dog.x = Rt; dog.y = 744;
      st = [{ go: [650, 744], g: 'trot' }, { clip: 'stand', d: 0.6 }, { spin: 3.6, cx: 640, cy: 744 }, { clip: 'stand', fps: 4, d: 1.4 }, { go: [Rt, 746], g: 'walk' }];
    } else {
      var from = left ? L : Rt, to = left ? Rt : L, mid = rnd(560, 760);
      dog.x = from; dog.y = lane;
      st = [{ go: [mid, lane], g: 'walk' }, { clip: 'sniff', fps: 5, d: rnd(2, 3.5) }, { clip: 'stand', fps: 4, d: rnd(1, 2) },
        { go: [Math.random() < 0.3 ? from : to, lane + rnd(-4, 4)], g: 'walk' }];
    }
    dog.steps = st; dog.si = 0; dog.on = true; dog.v = 0; dog.dir = dog.x < W / 2 ? 1 : -1; dogEl.style.display = 'block';
  }
  function endEpisode(t) {
    dog.on = false; dog.pet = false; dog.ball = null; dogEl.style.display = 'none';
    if (!ball.on) ballEl.style.display = 'none';
    dog.next = t + (DOGP ? 4 : rnd(50, 160));
  }
  function updateBall(dt) {   // a tennis ball bouncing across the floor
    if (!ball.on || ball.held) return;
    ball.vy += 1500 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.a += ball.vx * dt / 10;
    if (ball.y >= ball.floor) { ball.y = ball.floor; if (ball.vy > 90) { ball.vy = -ball.vy * 0.55; ball.vx *= 0.9; } else { ball.vy = 0; ball.vx *= 1 - 0.35 * dt; } }   // bounces, then rolls
    var s = dogScale(ball.floor) / 1.75;
    tr(ballEl, 'translate3d(' + (ball.x - 11).toFixed(1) + 'px,' + (ball.y - 22).toFixed(1) + 'px,0) rotate(' + ball.a.toFixed(2) + 'rad) scale(' + s.toFixed(2) + ')');
    if (ball.x > W + 40 || ball.x < -40) { ball.on = false; ballEl.style.display = 'none'; }
  }
  function updateDog(t, dt) {
    updateBall(dt);
    if (dog.door) { if (view === 'desk') doorEpisode(dog.door); dog.door = null; }
    if (!dog.on) {
      if (!dog.next) dog.next = t + (DOGP ? 2 : rnd(25, 90));
      if ((t > dog.next || dog.ask) && view === 'desk') {
        var r = Math.random(), k = dog.ask || (DOGP === 'chase' ? 'fetch' : DOGP) || (r < 0.42 ? 'visit' : r < 0.7 ? 'fetch' : r < 0.9 ? 'walk' : 'tail');
        dog.ask = null;
        startEpisode(k, t);
      }
      return;
    }
    var s = dog.steps[dog.si], f = DOG.stand[0], sxs = 1, hop = 0;
    if (!s || view !== 'desk') { endEpisode(t); return; }
    if (s.st == null) s.st = t;
    var el = t - s.st;
    dog.pet = false;
    if (s.go) {
      var tx = s.go[0], ty = s.go[1], dx = tx - dog.x, dy = ty - dog.y, d = Math.sqrt(dx * dx + dy * dy), G = GAIT[s.g];
      if (Math.abs(dx) > 3 && (dx > 0 ? 1 : -1) !== dog.dir) { dog.steps.splice(dog.si, 0, { face: dx > 0 ? 1 : -1 }); dog.v = 0; return; }
      var nx = dog.steps[dog.si + 1], keep = nx && nx.go && nx.g === s.g && (nx.go[0] - tx) * dog.dir > 0;   // keep going into the next leg
      var acc = s.g === 'gallop' ? 900 : 260, vmax = G[0];
      dog.v = Math.min(vmax, dog.v + acc * dt, keep ? 1e9 : Math.max(20, Math.sqrt(2 * acc * d)));
      var mv = dog.v * dt;
      if (d <= mv + 0.5) { dog.x = tx; dog.y = ty; dog.si++; if (!keep) dog.v = 0; }
      else { dog.x += dx / d * mv; dog.y += dy / d * mv; }
      dog.ph += mv / (G[1] * dogScale(dog.y));
      var fr = DOG[G[2]]; f = fr[Math.floor(((dog.ph % 1) + 1) % 1 * fr.length) % fr.length];
      if (s.hide && el < s.hide) f = -1;
    } else if (s.face) {   // turn round through a frame facing us
      if (s.face === dog.dir) { dog.si++; f = DOG.stand[0]; }
      else {
        var T = 0.42;
        if (el < T * 0.3) { f = DOG.stand[0]; sxs = 1 - 0.3 * el / (T * 0.3); }
        else if (el < T * 0.7) { f = DOG.front[0]; }
        else { dog.dir = s.face; f = DOG.stand[0]; sxs = 0.7 + 0.3 * (el - T * 0.7) / (T * 0.3); }
        if (el >= T) { dog.dir = s.face; dog.si++; sxs = 1; }
      }
    } else if (s.spin) {   // chasing its own tail: round in a tight circle, seen from the side, the front and behind
      var a = el * 6.2, sn = Math.sin(a), cs = Math.cos(a);
      dog.x = s.cx + cs * 30; dog.y = s.cy + sn * 7;
      dog.ph += dt * 2.6;
      if (Math.abs(cs) < 0.72) { dog.dir = sn > 0 ? -1 : 1; f = DOG.gallop[Math.floor(dog.ph * 8) % 8]; }
      else f = cs > 0 ? DOG.front[0] : DOG.back[0];
      if (el > s.spin && Math.abs(cs) < 0.3) { dog.si++; dog.y = s.cy; }
    } else if (s.bark) {   // at the door: a bark every 0.7 s, the front end lifting with each one
      var bp_ = (el % 0.7) / 0.7, up = bp_ < 0.3 ? Math.sin(bp_ / 0.3 * Math.PI) : 0;
      f = DOG.stand[0]; hop = up * 5;
      var hd = dogHeadAt();
      woofEl.style.opacity = up > 0.2 && el < s.bark - 0.3 ? 1 : 0;
      tr(woofEl, 'translate3d(' + (hd[0] + 6).toFixed(0) + 'px,' + (hd[1] - 34 - bp_ * 8).toFixed(0) + 'px,0)');
      if (el > s.bark) { dog.si++; woofEl.style.opacity = 0; }
    } else if (s.wait) { f = -1; if (el > s.wait) dog.si++; }
    else if (s.at) { dog.x = s.at[0]; dog.y = s.at[1]; dog.dir = -1; dog.si++; f = -1; }
    else {   // a clip: played once (forwards or back), or looped for d seconds
      var c = DOG[s.clip], n = c.length, fps = s.fps || 5;
      if (s.d) { f = c[Math.floor(el * fps) % n]; if (el > s.d) dog.si++; }
      else { var i = Math.min(n - 1, Math.floor(el * fps)); f = c[s.rev ? n - 1 - i : i]; if (el > n / fps) dog.si++; }
      dog.pet = !!(s.pet && el > 0.4 && el < s.d - 0.6);
      if (s.give) { dog.ball = el < 1.8 ? 'offer' : 'given'; dog.giveEl = el; }
      else if (s.watch) dog.ball = 'thrown';
      if (s.give && dog.ball === 'given') f = DOG.sit[Math.floor(el * 7) % 4];
      if (s.clip === 'sitdown' && s.rev && dog.steps[dog.si - 1] && dog.steps[dog.si - 1].watch) dog.ball = 'thrown';
    }
    var sc = dogScale(dog.y);
    if (f < 0) { dogEl.style.visibility = 'hidden'; return; }
    dogEl.style.visibility = 'visible';
    if (f !== dog.f) { tr(dogSheet, 'translate3d(' + (-(f % DCOLS) * FW * DS) + 'px,' + (-Math.floor(f / DCOLS) * FH * DS) + 'px,0)'); dog.f = f; }
    var k2 = sc / DS;
    tr(dogEl, 'translate3d(' + (dog.x - 85 * DS).toFixed(1) + 'px,' + (dog.y - hop - DGY * DS).toFixed(1) + 'px,0) scale(' + (k2 * dog.dir * sxs).toFixed(3) + ',' + k2.toFixed(3) + ')');
  }
  function dogMouth() {   // where the ball sits in its mouth, on screen, when it offers it up
    var sc = dogScale(SITAT[1]);
    return [dog.x + (127 + 22 * Math.cos(-0.18) - 9 * Math.sin(-0.18) - 85) * sc * dog.dir, dog.y + (20 + 22 * Math.sin(-0.18) + 9 * Math.cos(-0.18) - DGY) * sc];
  }
  function dogHeadAt() {   // the top of its head, where his hand goes
    var sc = dogScale(dog.y);
    return [dog.x + (124 - 85) * sc * dog.dir, dog.y + (8 - DGY) * sc];
  }

  /* ---------------- the cat: a grey tabby ---------------- */
  var CTW = 110, CTH = 90, CCOLS = 8, CGY = 84, CATP = param('cat'), CAT = {};
  var catEl = document.createElement('div'), catSheet = null;
  catEl.style.cssText = 'position:absolute;left:0;top:0;width:' + CTW + 'px;height:' + CTH + 'px;overflow:hidden;-webkit-transform-origin:55px 84px;transform-origin:55px 84px';
  function catCols() {
    var c = phase === 'night' ? '#3d404d' : phase === 'golden' ? '#8a7f80' : '#7d818c';
    return { c: c, d: mix(c, '#000000', 0.3), s: mix(c, '#000000', 0.42), l: mix(c, '#ffffff', 0.32), eye: phase === 'night' ? '#a8cf8a' : '#c9d66a', pink: phase === 'night' ? '#8a6470' : '#e3a0a6', mouth: '#5a2a33' };
  }
  function catStandPose() {
    return { sx: 73, sy: 57, hx: 41, hy: 55, arch: 0, paws: [[76, CGY, 0], [70, CGY, 0], [43, CGY, 0], [37, CGY, 0]], hx2: 87, hy2: 41, ha: 0,
      shut: 0, mouth: 0, tongue: 0, ta: -2.05, tk: 0.075, tt: 0.45, tfront: 0, raise: null, over: 0 };
  }
  function catHead(g, p, C) {   // side view, facing right
    g.save(); g.translate(p.hx2, p.hy2); g.rotate(p.ha);
    g.fillStyle = C.d; g.beginPath(); g.moveTo(-1, -6); g.lineTo(2, -15); g.lineTo(6, -6); g.fill();   // far ear
    g.fillStyle = C.c; ellipse(g, 0, 0, 9.5, 8.6); g.fill();
    ellipse(g, 6.5, 2.8, 5.2, 4.2); g.fill();   // cheek and muzzle
    g.beginPath(); g.moveTo(-7, -4); g.lineTo(-5, -16.5); g.lineTo(2, -7); g.fill();   // near ear
    g.fillStyle = C.pink; g.beginPath(); g.moveTo(-5, -6); g.lineTo(-4.4, -13.5); g.lineTo(0, -7); g.fill();
    g.fillStyle = C.d; g.fillRect(-3, -8.5, 1.4, 4); g.fillRect(0, -8.8, 1.4, 3.6);   // tabby marks on the brow
    g.fillStyle = C.l; ellipse(g, 7.5, 5.2, 4, 2.4); g.fill();   // pale chin
    if (p.mouth > 0.05) {   // a yawn
      g.fillStyle = C.mouth; ellipse(g, 8.5, 5.5, 3.6, 1 + p.mouth * 4); g.fill();
      g.fillStyle = C.pink; ellipse(g, 8, 6.5 + p.mouth * 2.5, 2.4, 1.2 + p.mouth * 1.2); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(10, 3, 0.9, 1.6); g.fillRect(10, 6 + p.mouth * 3.5, 0.9, 1.4);
    }
    if (p.tongue) { g.fillStyle = C.pink; ellipse(g, 11.5, 5.5, 2.2, 1.5); g.fill(); }
    g.fillStyle = C.pink; g.beginPath(); g.moveTo(10.2, 0.6); g.lineTo(12.6, 0.8); g.lineTo(11.2, 2.4); g.fill();   // nose
    if (p.shut) { g.strokeStyle = C.s; g.lineWidth = 1.1; g.lineCap = 'round'; g.beginPath(); g.moveTo(2.2, -1.4); g.quadraticCurveTo(4.4, 0.2, 6.6, -1.6); g.stroke(); }
    else { g.fillStyle = C.eye; ellipse(g, 4.6, -1.6, 2.3, 2.2); g.fill(); g.fillStyle = '#121212'; ellipse(g, 5.1, -1.6, 0.7, 1.9); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(9, 3.5); g.lineTo(17, 1.5); g.moveTo(9, 4.2); g.lineTo(17, 4.6); g.stroke();   // whiskers
    g.restore();
  }
  function catTail(g, x, y, a, k, tip, C) {   // ringed, round-capped; it lies along the desk rather than through it
    var n = 11, seg = 3.5, pts = [[x, y]], i;
    for (i = 0; i < n; i++) { a += i >= n - 3 ? tip : k; x += Math.cos(a) * seg; y += Math.sin(a) * seg; if (y > CGY - 2) { y = CGY - 2; if (a > 0.3 && a < 2.9) { a = 0.12; k = 0; } } pts.push([x, y]); }   // reaching the desk, it runs along it
    g.lineCap = 'round';
    for (i = 0; i < n; i++) { g.strokeStyle = i % 3 === 2 || i === n - 1 ? C.d : C.c; g.lineWidth = 5 - i * 0.17; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  }
  function catLegF(p, k) {
    var w = p.paws[k], l = w[2], r = [p.sx, p.sy + 2];
    var wr = [w[0] - lerp(1, -4, l), w[1] - lerp(4, 2, l)], el = ik(r[0], r[1], wr[0], wr[1], 11.5, 11.5, -1);
    return [r, el, wr, [w[0] + 1.6, w[1] - 1.8]];
  }
  function catLegH(p, k) {
    var w = p.paws[k], l = w[2], sit = p.sit || 0, r = [p.hx + 1, p.hy + 2];
    var hk = [w[0] - lerp(lerp(4, 12, sit), -3, l), w[1] - lerp(lerp(9, 2.5, sit), 6, l)], st = ik(r[0], r[1], hk[0], hk[1], 10.5, 11, 1);
    return [r, st, hk, [w[0] + 1.6, w[1] - 1.8]];
  }
  function catPaw(g, q, col) { g.fillStyle = col; ellipse(g, q[0], q[1], 3.4, 2); g.fill(); }
  function catBodyPath(g, p) {
    var ar = p.arch, big = p.sit || 0;
    shape(g, p, spine(p, 0.062), [[1, 7, -8], [1, 11, 0], [1, 9, 9], [1, 1, 10], [1, -10, 12], [0, 15, 14], [0, 6, 9], [0, 0, 12 + big * 2], [0, -11 - big * 2, 9 + big * 3],
      [0, -11 - big * 2, 1], [0, -11, -7], [0, -5, -11], [0, 2, -11], [0, 14, -11 - ar], [1, -14, -12 - ar], [1, -3, -12], [1, 2, -12], [1, 5, -11], [1, 7, -8]]);
  }
  function drawCatSide(g, p) {
    var C = catCols(), L, i;
    L = catLegF(p, 1); limb(g, L, [5, 4, 3.6], C.d); catPaw(g, L[3], C.d);
    L = catLegH(p, 3); limb(g, L, [6, 4.4, 3.6], C.d); catPaw(g, L[3], C.d);
    if (!p.tfront) catTail(g, p.hx - 9, p.hy - 5, p.ta, p.tk, p.tt, C);
    var ca = Math.cos(p.ha), sa = Math.sin(p.ha), ax = p.hx2 - 4 * ca + 7 * sa, ay = p.hy2 - 4 * sa - 7 * ca, bx = p.hx2 + 3 * ca - 6 * sa, by = p.hy2 + 3 * sa + 6 * ca;
    var cs = spine(p, 0.062), n1 = bp(p, cs, 1, -6, -11), n2 = bp(p, cs, 1, 10, -2), n3 = bp(p, cs, 1, 8, 4);
    g.fillStyle = C.c; g.beginPath(); g.moveTo(n1[0], n1[1]); g.quadraticCurveTo(ax - 5, ay + 2, ax, ay); g.lineTo(bx, by); g.quadraticCurveTo(n2[0], n2[1], n3[0], n3[1]); g.closePath(); g.fill();   // neck
    catBodyPath(g, p); g.fill();
    g.save(); catBodyPath(g, p); g.clip();   // tabby stripes, following the back
    g.strokeStyle = C.d; g.lineWidth = 2.2; g.lineCap = 'round';
    for (i = 0; i < 5; i++) { var f = (i + 0.7) / 5.4, q0 = bp(p, cs, 0, f * 30, -13 - p.arch * Math.sin(f * Math.PI)), q1 = bp(p, cs, 0, f * 30 + 3, -7), q2 = bp(p, cs, 0, f * 30 - 1, -2); g.beginPath(); g.moveTo(q0[0], q0[1]); g.quadraticCurveTo(q1[0], q1[1], q2[0], q2[1]); g.stroke(); }
    var bl = bp(p, cs, 0, 18, 10); g.fillStyle = rgba(C.l, 0.7); g.save(); g.translate(bl[0], bl[1]); g.rotate(Math.atan2(cs[1], cs[0])); ellipse(g, 0, 0, 14, 2.6); g.fill(); g.restore();
    g.restore();
    var cc = bp(p, cs, 1, 5, 2); g.fillStyle = C.l; g.save(); g.translate(cc[0], cc[1]); g.rotate(Math.atan2(cs[1], cs[0])); ellipse(g, 0, 0, 4, 6.5); g.fill(); g.restore();   // pale chest
    L = catLegH(p, 2);
    var tx = (L[0][0] + L[1][0]) / 2, ty = (L[0][1] + L[1][1]) / 2, ta = Math.atan2(L[1][1] - L[0][1], L[1][0] - L[0][0]);
    g.fillStyle = C.c; g.save(); g.translate(tx, ty); g.rotate(ta); ellipse(g, 0, 0, 10 + 3 * (p.sit || 0), 7 + 3 * (p.sit || 0)); g.fill(); g.restore();
    limb(g, L.slice(1), [4.6, 3.8], C.c); catPaw(g, L[3], C.c);
    g.strokeStyle = C.d; g.lineWidth = 1.5; g.beginPath(); g.moveTo(tx - 3, ty - 5); g.quadraticCurveTo(tx + 1, ty, tx - 2, ty + 4); g.stroke();
    if (p.tfront) catTail(g, p.hx - 9, p.hy + 4, p.ta, p.tk, p.tt, C);
    if (!p.over) { L = catLegF(p, 0); limb(g, L, [5.2, 4.2, 3.8], C.c); catPaw(g, L[3], C.c); }
    catHead(g, p, C);
    if (p.over) { L = catLegF(p, 0); limb(g, L, [5.2, 4.2, 3.8], C.c); catPaw(g, L[3], C.l); }   // a paw up over its face, washing
  }
  function drawCatCurl(g, p) {   // curled up asleep, or with its head up, just woken
    var C = catCols(), u = p.up;
    g.fillStyle = C.c; ellipse(g, 50, 74, 25, 11); g.fill();
    g.save(); ellipse(g, 50, 74, 25, 11); g.clip(); g.strokeStyle = C.d; g.lineWidth = 2.2; g.lineCap = 'round';
    for (var i = 0; i < 4; i++) { g.beginPath(); g.moveTo(36 + i * 8, 62); g.quadraticCurveTo(40 + i * 8, 68, 37 + i * 8, 74); g.stroke(); }
    g.restore();
    catTail(g, 27, 78, 1.3, -0.24, -0.1, C);   // the tail wrapped round the front
    g.fillStyle = C.l; ellipse(g, 66, 82, 4, 1.8); g.fill();
    if (u > 0.2) { g.fillStyle = C.c; g.beginPath(); g.moveTo(58, 66); g.quadraticCurveTo(lerp(66, 68, u), lerp(68, 58, u), lerp(70, 72, u), lerp(70, 58, u)); g.lineTo(lerp(74, 78, u), lerp(78, 68, u)); g.lineTo(70, 82); g.closePath(); g.fill(); }
    catHead(g, { hx2: lerp(70, 74, u), hy2: lerp(73, 60, u), ha: lerp(0.5, 0, u), shut: p.shut, mouth: p.mouth || 0, tongue: 0 }, C);
  }
  function drawCatFront(g, p) {   // facing us, half way through a turn
    var C = catCols();
    g.fillStyle = C.d; ellipse(g, 55, 66, 13, 12); g.fill();
    g.strokeStyle = C.c; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(63, 62); g.quadraticCurveTo(76, 52, 72, 34); g.quadraticCurveTo(70, 28, 75, 27); g.stroke();
    g.fillStyle = C.c; ellipse(g, 55, 66, 10.5, 13); g.fill();
    g.fillStyle = C.l; ellipse(g, 55, 69, 6, 9); g.fill();
    limb(g, [[50.5, 70], [50.5, 82]], [5], C.c); limb(g, [[59.5, 70], [59.5, 82]], [5], C.c);
    g.fillStyle = C.l; ellipse(g, 50.5, 83, 3.2, 1.8); g.fill(); ellipse(g, 59.5, 83, 3.2, 1.8); g.fill();
    g.fillStyle = C.c; ellipse(g, 55, 45, 10.5, 9.5); g.fill();
    g.beginPath(); g.moveTo(45.5, 41); g.lineTo(46.5, 30); g.lineTo(52, 37); g.moveTo(58, 37); g.lineTo(63.5, 30); g.lineTo(64.5, 41); g.fill();
    g.fillStyle = C.pink; g.beginPath(); g.moveTo(47.5, 39); g.lineTo(48, 33); g.lineTo(51, 37); g.moveTo(59, 37); g.lineTo(62, 33); g.lineTo(62.5, 39); g.fill();
    g.fillStyle = C.d; g.fillRect(53.2, 36.5, 1.4, 4); g.fillRect(55.8, 36.5, 1.4, 4);
    g.fillStyle = C.l; ellipse(g, 55, 50, 5.5, 3.6); g.fill();
    g.fillStyle = C.eye; ellipse(g, 50.8, 44.5, 2.3, 2.1); g.fill(); ellipse(g, 59.2, 44.5, 2.3, 2.1); g.fill();
    g.fillStyle = '#121212'; ellipse(g, 50.8, 44.5, 0.7, 1.8); g.fill(); ellipse(g, 59.2, 44.5, 0.7, 1.8); g.fill();
    g.fillStyle = C.pink; g.beginPath(); g.moveTo(53.6, 48); g.lineTo(56.4, 48); g.lineTo(55, 49.6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(51, 50); g.lineTo(42, 48.5); g.moveTo(51, 51); g.lineTo(42, 52); g.moveTo(59, 50); g.lineTo(68, 48.5); g.moveTo(59, 51); g.lineTo(68, 52); g.stroke();
  }
  function buildCat() {
    var F = [], i, p, B = catStandPose();
    function add(name, list) { CAT[name] = []; for (var j = 0; j < list.length; j++) { CAT[name].push(F.length); F.push(list[j]); } }
    function side(q) { q.draw = drawCatSide; return q; }
    function curl(u, shut, mouth) { return { draw: drawCatCurl, up: u, shut: shut, mouth: mouth || 0 }; }
    add('sleep', [curl(0, 1)]);
    add('wake', [curl(0.45, 1), curl(1, 0), curl(1, 1), curl(1, 1, 0.8)]);   // head up, eyes open, a blink, a small yawn
    // lying with its legs folded under (a loaf) → front legs up → back legs up → standing
    var LOAF = copy(B, { sx: 72, sy: 69, hx: 40, hy: 73, paws: [[82, CGY, 0], [77, CGY, 0], [52, CGY, 0], [47, CGY, 0]], hx2: 86, hy2: 55, sit: 0.9, ta: 2.9, tk: -0.26, tt: -0.05, tfront: 1 });
    var FRONTUP = copy(B, { sx: 73, sy: 58, hx: 41, hy: 72, paws: [[77, CGY, 0], [71, CGY, 0], [52, CGY, 0], [47, CGY, 0]], hx2: 87, hy2: 42, sit: 0.85, ta: 2.9, tk: -0.2, tt: 0, tfront: 1 });
    add('rise', [side(LOAF), side(FRONTUP), side(blend(FRONTUP, B, 0.55)), side(copy(B, {}))]);
    // the stretch: front end down and forward, rump up, a big yawn
    var ST = copy(B, { sx: 80, sy: 71, hx: 40, hy: 52, paws: [[99, CGY, 0], [94, CGY, 0], [43, CGY, 0], [37, CGY, 0]], hx2: 96, hy2: 64, ha: -0.15, ta: -2.3, tk: 0.06, tt: 0.3, arch: -3 });
    add('stretch', [side(blend(B, ST, 0.35)), side(blend(B, ST, 0.75)), side(copy(ST, { mouth: 0.6, shut: 1 })), side(copy(ST, { mouth: 1, shut: 1, ha: -0.25 }))]);
    var WK = [];
    for (i = 0; i < 8; i++) {
      var ph = i / 8, pw = [], offs = [0.25, 0.75, 0, 0.5];
      for (var k = 0; k < 4; k++) { var f = foot(ph + offs[k], 0.6, 17, k < 2 ? 5 : 4.5); pw.push([B.paws[k][0] + f[0], CGY + f[1], f[2]]); }
      p = copy(B, { paws: pw }); var b = Math.cos(ph * 4 * Math.PI) * 0.6;
      p.sy += b; p.hy += Math.cos(ph * 4 * Math.PI + 1) * 0.6; p.hy2 += b * 0.8; p.ta += Math.sin(ph * 2 * Math.PI) * 0.12; p.tt = 0.45 + Math.sin(ph * 2 * Math.PI + 1) * 0.15;
      WK.push(side(p));
    }
    add('walk', WK);
    var SIT = copy(B, { sx: 71, sy: 51, hx: 46, hy: 74, paws: [[75, CGY, 0], [69, CGY, 0], [57, CGY, 0], [52, CGY, 0]], hx2: 84, hy2: 33, sit: 1, ta: 3.05, tk: -0.3, tt: -0.05, tfront: 1 });
    var sd = [];
    for (i = 1; i <= 3; i++) { p = blend(B, SIT, ease(i / 3)); p.tfront = i > 1 ? 1 : 0; if (!p.tfront) { p.ta = -2.05; p.tk = 0.075; p.tt = 0.45; } sd.push(side(p)); }
    add('sitdown', [side(copy(B, {}))].concat(sd));
    add('sit', [side(copy(SIT, {})), side(copy(SIT, { shut: 1 })), side(copy(SIT, { tt: 0.25 }))]);   // still, a slow blink, a twitch of the tail tip
    // washing: a paw up, licked a few times, then wiped over the face
    var g0 = copy(SIT, { paws: [[83, 58, 1], [69, CGY, 0], [57, CGY, 0], [52, CGY, 0]], hx2: 85, hy2: 36, ha: 0.25 });
    add('groom', [side(copy(SIT, { paws: [[79, 70, 0.8], [69, CGY, 0], [57, CGY, 0], [52, CGY, 0]] })), side(g0), side(copy(g0, { tongue: 1, shut: 1, ha: 0.32, hy2: 37 })),
      side(copy(g0, { tongue: 1, shut: 1, ha: 0.18, hy2: 35 })), side(copy(SIT, { paws: [[90, 38, 1], [69, CGY, 0], [57, CGY, 0], [52, CGY, 0]], hx2: 84, hy2: 36, ha: 0.45, shut: 1, over: 1 })),
      side(copy(SIT, { paws: [[86, 30, 1], [69, CGY, 0], [57, CGY, 0], [52, CGY, 0]], hx2: 84, hy2: 36, ha: 0.55, shut: 1, over: 1 }))]);
    // petted: the back rises into his hand, head pushed up, eyes shut, tail straight up and quivering
    var PET = copy(B, { arch: 5, sy: 55, hy: 53, hx2: 88, hy2: 37, ha: -0.35, shut: 1, ta: -1.75, tk: 0.02, tt: 0.3 });
    add('pet', [side(copy(PET, {})), side(copy(PET, { hy2: 35, ha: -0.45, tt: 0.45, arch: 6 })), side(copy(PET, { hy2: 36, ha: -0.4, tt: 0.15 }))]);
    add('front', [{ draw: drawCatFront }]);
    // kneading before it settles: treading the desk, one front paw then the other
    var KN = copy(B, { sx: 72, sy: 61, hx: 41, hy: 64, sit: 0.4, hx2: 85, hy2: 46, shut: 1 });
    add('knead', [side(copy(KN, { paws: [[79, 79, 0.6], [70, CGY, 0], [45, CGY, 0], [39, CGY, 0]] })), side(copy(KN, { paws: [[76, CGY, 0], [73, 79, 0.6], [45, CGY, 0], [39, CGY, 0]] }))]);
    catSheet = bakeGrid(F, CCOLS, CTW, CTH, 1, function (g, q) {
      g.fillStyle = 'rgba(20,12,8,0.18)'; ellipse(g, q.draw === drawCatFront ? 55 : 56, CGY + 0.5, q.draw === drawCatFront ? 15 : 28, 2.8); g.fill();
    });
    catEl.innerHTML = ''; catEl.appendChild(catSheet); kitty.f = -1;
  }
  var HOME = [64, 510];
  var kitty = { x: HOME[0], y: HOME[1], dir: 1, f: -1, steps: null, si: 0, ph: 0, v: 0, next: 0, pet: false, keys: false, keyAt: 0 };
  function catEpisode() {
    var st = [{ clip: 'wake', seq: [0, 1, 1, 1, 1, 2, 1, 1, 3, 3, 1, 1], fps: 4 },   // head up, look about, blink, a little yawn
      { clip: 'rise', fps: 5 }, { clip: 'rise', seq: [3], fps: 2 },
      { clip: 'stretch', seq: [0, 1, 2, 3, 3, 3, 3, 3, 2, 1, 0], fps: 5 },
      { clip: 'sitdown', fps: 7 }, { clip: 'sit', seq: [0], fps: 2 },
      { clip: 'groom', seq: [0, 1, 2, 3, 2, 3, 2, 3, 2, 3, 1, 4, 5, 4, 5, 4, 1, 2, 3, 2, 3, 0], fps: 5 },
      { clip: 'sit', seq: [0, 0, 1, 0], fps: 3 }, { clip: 'sitdown', fps: 7, rev: 1 },
      { go: [548, 528] },
      { clip: 'pet', seq: [0, 1, 2, 1, 0, 1, 2, 1], fps: 3, d: 8, pet: 1 },
      { go: [640, 524] }, { clip: 'sitdown', fps: 7 },
      { clip: 'groom', seq: [0, 1, 2, 3, 2, 3, 1, 4, 5, 4, 1, 0], fps: 5 },
      { clip: 'sit', seq: [0, 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 2], fps: 2 },
      { clip: 'sitdown', fps: 7, rev: 1 },
      { go: [420, 508] }, { go: [HOME[0] - 6, HOME[1]] },   // home behind the keyboard this time
      { face: 1 }, { clip: 'knead', seq: [0, 1, 0, 1, 0, 1, 0, 1], fps: 4 },
      { clip: 'rise', fps: 5, rev: 1 }, { clip: 'wake', seq: [1, 1, 2, 1, 0], fps: 3 }, { clip: 'sleep', seq: [0], fps: 1 }];
    return st;
  }
  function updateCat(t, dt) {
    var f = CAT.sleep[0], k = kitty, sxs = 1;
    if (view !== 'desk') { k.steps = null; k.x = HOME[0]; k.y = HOME[1]; k.dir = 1; k.pet = false; k.keys = false; }
    else if (!k.steps) {
      if (!k.next) k.next = t + (CATP ? 2 : rnd(60, 180));
      if (t > k.next || k.ask) { k.steps = catEpisode(); k.si = 0; k.ask = false; }
    }
    k.pet = false; k.keys = false; k.walking = false;
    if (k.steps) {
      var s = k.steps[k.si];
      if (!s) { k.steps = null; k.next = t + (CATP ? 5 : rnd(150, 330)); k.dir = 1; k.x = HOME[0]; k.y = HOME[1]; }
      else {
        if (s.st == null) s.st = t;
        var el = t - s.st;
        if (s.go) {
          var dx = s.go[0] - k.x, dy = s.go[1] - k.y, d = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dx) > 2 && (dx > 0 ? 1 : -1) !== k.dir) { k.steps.splice(k.si, 0, { face: dx > 0 ? 1 : -1 }); k.v = 0; f = CAT.walk[0]; }
          else {
            var nx = k.steps[k.si + 1], keep = nx && nx.go && (nx.go[0] - s.go[0]) * k.dir > 0;
            k.v = Math.min(44, k.v + 90 * dt, keep ? 1e9 : Math.max(10, Math.sqrt(2 * 90 * d)));
            var mv = k.v * dt;
            if (d <= mv + 0.3) { k.x = s.go[0]; k.y = s.go[1]; k.si++; if (!keep) k.v = 0; } else { k.x += dx / d * mv; k.y += dy / d * mv; }
            k.walking = true; k.ph += mv / 17; f = CAT.walk[Math.floor(((k.ph % 1) + 1) % 1 * 8) % 8];
            k.keys = k.y > 518 && k.x > 470 && k.x < 600;   // paws on the keyboard
          }
        } else if (s.face) {
          if (s.face === k.dir) k.si++;
          var T = 0.4;
          if (el < T * 0.3) { f = CAT.walk[1]; sxs = 1 - 0.3 * el / (T * 0.3); }
          else if (el < T * 0.7) f = CAT.front[0];
          else { k.dir = s.face; f = CAT.walk[1]; sxs = 0.7 + 0.3 * (el - T * 0.7) / (T * 0.3); }
          if (el >= T) { k.dir = s.face; k.si++; sxs = 1; }
        } else {
          var c = CAT[s.clip], seq = s.seq || c.map(function (v, i) { return i; }), n = seq.length, fps = s.fps || 5, i;
          if (s.d) { i = seq[Math.floor(el * fps) % n]; if (el > s.d) k.si++; }
          else { i = Math.min(n - 1, Math.floor(el * fps)); i = seq[s.rev ? n - 1 - i : i]; if (el > n / fps) k.si++; }
          f = c[i];
          k.pet = !!(s.pet && el > 0.6 && el < s.d - 0.6);
        }
      }
    }
    if (f !== k.f) { tr(catSheet, 'translate3d(' + (-(f % CCOLS) * CTW) + 'px,' + (-Math.floor(f / CCOLS) * CTH) + 'px,0)'); k.f = f; }
    var breathe = f === CAT.sleep[0] ? 1 + 0.035 * (0.5 + 0.5 * Math.sin(t * 1.5)) : 1;
    tr(catEl, 'translate3d(' + (k.x - 55).toFixed(1) + 'px,' + (k.y - 84).toFixed(1) + 'px,0) scale(' + (k.dir * sxs).toFixed(3) + ',' + breathe.toFixed(3) + ')');
  }
  function catBack() { return [kitty.x + (lerp(41, 73, 0.75) - 55) * kitty.dir, kitty.y - 84 + 40]; }   // the middle of its back, for his hand
  function catKey() {   // the cat's paws on the keyboard type into his code
    var x = GUT + (code.ci + code.extra) * CW;
    if (!code.lines.length || x > D.code.w - CW) return;
    cursor(false);
    cg.fillStyle = COL.txt; cg.fillText('asdfghjkl;'.charAt(Math.floor(Math.random() * 10)), x, rowY(code.row) + 9);
    code.extra++; cursor(true);
  }

  /* ---------------- his arms ----------------
   * Each arm is drawn from shoulder to hand, the elbow solved like the animals' knees, and
   * whatever falls behind his back or the chair is cut away. At rest the hands are on the
   * keyboard; they reach down to pet the dog, take its ball and throw it, stroke the cat, and
   * lift out of the way when the cat walks across the keys. */
  var ARM = {
    L: { sh: [300, 452], rest: [304, 520], el0: [262, 528], box: [170, 420, 190, 220], bend: -1 },
    R: { sh: [444, 452], rest: [506, 518], el0: [482, 530], box: [400, 420, 230, 150], bend: -1 } };
  function armSetup(bd) {
    ['L', 'R'].forEach(function (n) {
      var A = ARM[n], b = A.box;
      if (A.c && A.c.parentNode) A.c.parentNode.removeChild(A.c);
      A.c = mk(b[2], b[3]); A.g = A.c.getContext('2d'); place(bd, A.c, b[0], b[1]);
      A.l1 = Math.sqrt(Math.pow(A.el0[0] - A.sh[0], 2) + Math.pow(A.el0[1] - A.sh[1], 2));
      A.l2 = Math.sqrt(Math.pow(A.rest[0] - A.el0[0], 2) + Math.pow(A.rest[1] - A.el0[1], 2));
      A.w = 0; A.hand = A.rest.slice(); A.drawnAt = null; A.target = null; A.goal = 0;
      armDraw(A, true);
    });
  }
  function armDraw(A, force) {
    var key = A.hand[0].toFixed(1) + ',' + A.hand[1].toFixed(1);
    if (!force && key === A.drawnAt) return;
    A.drawnAt = key;
    var g = A.g, b = A.box, w = A.w, el;
    if (w < 0.001) el = A.el0;
    else { var dd = Math.sqrt(Math.pow(A.hand[0] - A.sh[0], 2) + Math.pow(A.hand[1] - A.sh[1], 2)); el = ik(A.sh[0], A.sh[1], A.hand[0], A.hand[1], lerp(A.l1, Math.max(40, dd * 0.57), w), lerp(A.l2, Math.max(34, dd * 0.5), w), A.bend); }   // reaching, the arm is nearly straight
    g.clearRect(0, 0, b[2], b[3]); g.save(); g.translate(-b[0], -b[1]);
    arm(g, A.sh[0], A.sh[1], el[0], el[1], A.hand[0], A.hand[1]);
    g.globalCompositeOperation = 'destination-out';   // what's behind his back and the chair stays hidden
    g.beginPath(); g.moveTo(286, 600); g.quadraticCurveTo(278, 470, 300, 446); g.quadraticCurveTo(372, 418, 444, 446); g.quadraticCurveTo(466, 470, 458, 600); g.closePath(); g.fill();
    rrect(g, 290, 470, 164, 150, 26); g.fill();
    g.restore(); g.globalCompositeOperation = 'source-over';
  }
  function armTick(A, goal, target, dt, dur, follow) {   // ease the hand towards a target (or back to the keys) over dur seconds, then draw
    A.w = Math.max(0, Math.min(1, A.w + (goal ? 1 : -1) * dt / (dur || 0.7)));
    if (target) {
      if (!A.tg) A.tg = target.slice();
      else { var r = Math.min(1, dt * (follow || 8)); A.tg[0] += (target[0] - A.tg[0]) * r; A.tg[1] += (target[1] - A.tg[1]) * r; }
    }
    var e = ease(A.w), tg = A.tg || A.rest;
    A.hand = [lerp(A.rest[0], tg[0], e), lerp(A.rest[1], tg[1], e) - Math.sin(e * Math.PI) * 12];   // the hand arcs up on its way
    if (A.w === 0) A.tg = null;
    armDraw(A, false);
  }
  // What his hands are doing this frame; returns where his head should turn (null: his own business).
  function handsTick(t, dt) {
    if (!ARM.L.c) return null;
    var L = ARM.L, R = ARM.R, look = null, lt = null, rt = null, lg = 0, rg = 0, ld = 0.7, lf = 8;
    var catComing = kitty.walking && kitty.y > 518 && kitty.x > 400 && kitty.x < 610;
    if (catComing) {   // hands up off the keys while the cat walks over them
      lg = rg = 1; lt = [292, 500]; rt = [486, 492]; look = 5;
    }
    if (kitty.pet) {   // stroking the cat, head to tail
      var cb = catBack(), u = 0.5 - 0.5 * Math.cos(t * 2.4);
      rg = 1; rt = [cb[0] + 16 - u * 34, cb[1] - 3 + Math.sin(u * Math.PI) * -2]; look = 8;
    }
    if (dog.pet) {   // stroking the dog's head and down its neck
      var hd = dogHeadAt(), v = 0.5 - 0.5 * Math.cos(t * 2.8);
      lg = 1; lt = [hd[0] + 4 - v * 18, hd[1] + 4 + v * 6]; look = -9;
    }
    if (dog.ball === 'offer' || dog.ball === 'given') {   // take the ball from its mouth, show it, throw it
      var ge = dog.giveEl, m = dogMouth();
      look = -8; lg = ge > 0.25 ? 1 : 0;
      if (ge < 1.8) lt = [m[0] + 6, m[1] - 2];
      else if (ge < 2.75) { lt = [268, 494]; lf = 5; }   // up, showing it off
      else { lt = [214, 548]; lf = 30; look = -12; }   // and away
      if (ge > 1.8 && !L.holding && !L.thrown) { L.holding = true; ballEl.style.display = 'block'; }
      if (L.holding && ge > 2.92) {   // let go
        L.holding = false; L.thrown = true;
        ball = { on: true, x: L.hand[0] - 8, y: L.hand[1] + 2, vx: -600, vy: -260, a: 0, floor: 742 };
      }
    } else if (dog.ball === 'thrown') { look = -12; }
    else { L.thrown = false; L.holding = false; }
    armTick(L, lg, lt, dt, lg && dog.ball ? 0.9 : ld, lf);
    armTick(R, rg, rt, dt, catComing ? 0.35 : 0.8, 8);
    if (L.holding) { var s = dogScale(SITAT[1]) / 1.75; tr(ballEl, 'translate3d(' + (L.hand[0] - 17).toFixed(1) + 'px,' + (L.hand[1] - 3).toFixed(1) + 'px,0) scale(' + s.toFixed(2) + ')'); }
    if (L.w > 0 || R.w > 0) code.next = Math.max(code.next, t + 0.4);   // no typing with a hand away from the keys
    return look;
  }


  /* ---------------- the code on his screen ----------------
   * He types this very file, with editor colours, at a believable pace. Only the new
   * characters are drawn, so it costs almost nothing. */
  var cs = place(V.desk.box, mk(D.code.w, D.code.h), D.code.x, D.code.y), cg = cs.getContext('2d');
  tr(cs, 'translate3d(0,0,0)');
  var FONT = '10px Menlo, "DejaVu Sans Mono", monospace', LH = 12, TOP = 20, GUT = 26, ROWS = 10, CW = 6;
  var KW = /^(var|function|return|if|else|for|while|new|this|true|false|null|typeof|in|do|break|continue|try|catch|switch|case)$/;
  var COL = { kw: '#c792ea', str: '#c3e88d', com: '#62738f', num: '#f78c6c', fn: '#82aaff', txt: '#cdd6e4', pun: '#89ddff' };
  function colours(line) {
    var out = [], i = 0, m, rest, c, n, k;
    while (i < line.length) {
      rest = line.slice(i); n = 1; c = COL.txt;
      if (/^(\/\/|\/\*)/.test(rest) || (rest.charAt(0) === '*' && /^\s*$/.test(line.slice(0, i)))) { c = COL.com; n = rest.length; }
      else if ((m = /^(['"])(?:\\.|(?!\1).)*\1?/.exec(rest))) { c = COL.str; n = m[0].length; }
      else if ((m = /^\d+(\.\d+)?/.exec(rest))) { c = COL.num; n = m[0].length; }
      else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) { n = m[0].length; c = KW.test(m[0]) ? COL.kw : line.charAt(i + n) === '(' ? COL.fn : COL.txt; }
      else if (/^[{}()\[\];,.=+\-*\/<>!&|?:]/.test(rest)) c = COL.pun;
      for (k = 0; k < n; k++) out.push(c);
      i += n;
    }
    return out;
  }
  var code = { lines: [], li: 0, ci: 0, row: 0, cols: null, next: 0, think: 0, lastKey: 0, cur: false, extra: 0 };
  function codeChrome() {
    cg.fillStyle = '#0d1320'; cg.fillRect(0, 0, D.code.w, D.code.h);
    cg.fillStyle = '#0a0f19'; cg.fillRect(0, 0, D.code.w, 14); cg.fillStyle = '#16203a'; cg.fillRect(0, 0, 58, 14);
    cg.font = '9px Menlo, "DejaVu Sans Mono", monospace'; cg.fillStyle = '#cdd6e4'; cg.fillText('city.js', 10, 10); cg.fillStyle = '#62738f'; cg.fillText('sky.js', 70, 10);
    cg.fillStyle = '#16203a'; cg.fillRect(0, D.code.h - 11, D.code.w, 11);
    cg.fillStyle = '#7f8fb0'; cg.fillText('main  ES5  UTF-8', 8, D.code.h - 3);
    cg.font = FONT; CW = cg.measureText('M').width || 6;
  }
  function rowY(r) { return TOP + r * LH; }
  function gutter(r, n) { cg.fillStyle = '#0d1320'; cg.fillRect(0, rowY(r) - 1, GUT - 4, LH); cg.fillStyle = '#3b4a66'; cg.font = '9px Menlo, "DejaVu Sans Mono", monospace'; var s = String(n); cg.fillText(s, GUT - 6 - s.length * 5.4, rowY(r) + 9); cg.font = FONT; }
  function cursor(on) {
    var x = GUT + (code.ci + code.extra) * CW, y = rowY(code.row);
    if (code.row < 0 || x > D.code.w - CW) return;
    cg.fillStyle = on ? '#89ddff' : '#0d1320'; cg.fillRect(x, y, on ? 1.5 : CW, LH - 2);
    code.cur = on;
  }
  function typeChar() {
    var line = code.lines[code.li], x = GUT + (code.ci + code.extra) * CW;
    cursor(false);
    if (x < D.code.w - CW) { cg.fillStyle = code.cols[code.ci]; cg.fillText(line.charAt(code.ci), x, rowY(code.row) + 9); }
    code.ci++;
  }
  function newRow() {
    cursor(false);
    code.li = (code.li + 1) % code.lines.length; code.ci = 0; code.extra = 0; code.cols = colours(code.lines[code.li]);
    code.row++;
    if (code.row >= ROWS) {   // scroll the editor up a line
      code.row = ROWS - 1;
      cg.drawImage(cs, 0, rowY(1) - 1, D.code.w, LH * (ROWS - 1), 0, rowY(0) - 1, D.code.w, LH * (ROWS - 1));
      cg.fillStyle = '#0d1320'; cg.fillRect(0, rowY(code.row) - 1, D.code.w, D.code.h - 11 - rowY(code.row) + 1);
      cg.fillRect(0, 14, D.code.w, rowY(0) - 15);   // glyph edges that bled past the rows
    }
    gutter(code.row, code.li + 1);
    var lead = /^\s*/.exec(code.lines[code.li])[0].length;   // the editor indents for him
    code.ci = lead;
  }
  function startCode(text) {
    code.lines = text.split('\n'); code.li = Math.floor(Math.random() * (code.lines.length - 40));
    codeChrome();
    code.row = -1; code.li--;
    for (var r = 0; r < ROWS - 3; r++) { newRow(); while (code.ci < code.lines[code.li].length) typeChar(); }
    newRow();
  }
  function codeTick(t) {
    if (!code.lines.length) return;
    if (code.extra > 0 && !kitty.keys && t >= code.next) {   // the cat has gone: delete what it typed
      cursor(false); code.extra--;
      cg.fillStyle = '#0d1320'; cg.fillRect(GUT + (code.ci + code.extra) * CW, rowY(code.row), CW, LH - 2);
      cursor(true); code.lastKey = t; code.next = t + (code.extra ? 0.06 : 0.6); return;
    }
    if (t < code.next) { if (t > code.lastKey + 0.5) { var on = Math.floor(t * 2) % 2 === 0; if (on !== code.cur) cursor(on); } return; }
    var line = code.lines[code.li];
    if (code.ci < line.length) {
      var burst = 1 + Math.floor(Math.random() * 2);
      while (burst-- && code.ci < line.length) typeChar();
      if (GUT + (code.ci + code.extra) * CW > D.code.w - CW) code.ci = line.length;   // the rest of a long line is off screen
      cursor(true); code.lastKey = t; code.next = t + rnd(0.04, 0.14);
    } else {
      newRow(); cursor(true); code.lastKey = t;
      code.think = Math.random() < 0.08 ? t + rnd(2.5, 6) : 0;
      code.next = code.think || t + (line.replace(/\s/g, '') ? rnd(0.15, 0.7) : 0.08);
    }
  }
  (function () {   // fetch this file's own source to type
    var src = 'city.js', s = document.getElementsByTagName('script');
    for (var i = 0; i < s.length; i++) if (/city\.js/.test(s[i].src)) src = s[i].src;
    var x = new XMLHttpRequest(); x.open('GET', src, true);
    x.onload = function () { if (x.responseText) startCode(x.responseText); };
    x.send();
  })();

  /* ---------------- your photos, being edited on the second screen ---------------- */
  var pbox = document.createElement('div'), PW = D.photo.w - 12, PHh = D.photo.h - 12;
  pbox.style.cssText = 'position:absolute;left:' + D.photo.x + 'px;top:' + D.photo.y + 'px;width:' + D.photo.w + 'px;height:' + D.photo.h + 'px;background:#101216;border-radius:5px;' +
    '-webkit-transform-origin:0 50%;transform-origin:0 50%;-webkit-transform:perspective(900px) rotateY(-24deg);transform:perspective(900px) rotateY(-24deg)';
  V.desk.box.appendChild(pbox);
  var ps = place(pbox, mk(PW, PHh), 6, 6), pg = ps.getContext('2d');
  var IMX = 16, IMY = 12, IMW = PW - 16 - 46, IMH = PHh - 24;
  var ed = { raw: null, fin: null, t0: 0, dur: 28, x: 0, done: true, knobs: [] }, current = null, list = [], li = 0, paintSecs = 120, cycle = null;
  function cover(img, w, h) {
    var c = mk(w, h), g = c.getContext('2d'), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.max(w / iw, h / ih);
    g.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s); return c;
  }
  function photoChrome() {
    pg.fillStyle = '#1b1d22'; pg.fillRect(0, 0, PW, PHh);
    pg.fillStyle = '#25282f'; pg.fillRect(0, 0, 10, PHh); pg.fillRect(PW - 40, 0, 40, PHh);
    for (var i = 0; i < 5; i++) { pg.fillStyle = i === 1 ? '#4aa8ff' : '#4a4f5a'; pg.fillRect(3, 14 + i * 14, 4, 4); }
  }
  function knobs(p) {
    pg.fillStyle = '#25282f'; pg.fillRect(PW - 40, 0, 40, PHh);
    var labels = ['#ffcf6b', '#7fd0ff', '#ff8fa3', '#b5f07a', '#d0d4dc'];
    for (var i = 0; i < 5; i++) {
      var y = 16 + i * 24, k = clamp(p * 5 - i, 0, 1), kx = PW - 34 + 28 * (0.5 + (i % 2 ? -0.3 : 0.35) * k);
      pg.fillStyle = '#3a3e48'; pg.fillRect(PW - 34, y, 28, 2);
      pg.fillStyle = labels[i]; pg.fillRect(PW - 34, y - 6, 6, 2);
      pg.fillStyle = '#e8ebf0'; pg.beginPath(); pg.arc(kx, y + 1, 3, 0, 6.2832); pg.fill();
    }
  }
  function startEdit(img) {
    var fin = cover(img, IMW, IMH), raw = mk(IMW, IMH), rg = raw.getContext('2d');
    rg.drawImage(fin, 0, 0);
    try {   // the "raw file": flat, grey and a little dark
      var d = rg.getImageData(0, 0, IMW, IMH), a = d.data;
      for (var i = 0; i < a.length; i += 4) {
        var y = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
        for (var k = 0; k < 3; k++) a[i + k] = 120 + ((a[i + k] * 0.35 + y * 0.65) - 128) * 0.62;
      }
      rg.putImageData(d, 0, 0);
    } catch (e) { rg.fillStyle = 'rgba(110,110,110,0.55)'; rg.fillRect(0, 0, IMW, IMH); }
    ed.fin = fin; ed.raw = raw; ed.x = 0; ed.t0 = -1; ed.done = false;
    photoChrome(); pg.drawImage(raw, IMX, IMY); knobs(0);
  }
  function editTick(t) {
    if (ed.done || !ed.fin) return;
    if (ed.t0 < 0) ed.t0 = t + 2;
    var p = clamp((t - ed.t0) / ed.dur, 0, 1), x = Math.floor(p * IMW);
    if (x > ed.x || p >= 1) {
      var x0 = Math.max(0, ed.x - 2);
      pg.drawImage(ed.fin, x0, 0, Math.max(1, x - x0 + 1), IMH, IMX + x0, IMY, Math.max(1, x - x0 + 1), IMH);
      if (p < 1) { pg.fillStyle = 'rgba(255,255,255,0.9)'; pg.fillRect(IMX + x, IMY, 1, IMH); }
      ed.x = x; knobs(p);
    }
    if (p >= 1) { pg.drawImage(ed.fin, IMX, IMY); ed.done = true; }
  }
  function nextPhoto() {
    clearTimeout(cycle);
    if (!list.length) {   // no photos yet: he edits a shot of the view
      var c = mk(IMW, IMH); c.getContext('2d').drawImage(V.desk.sky, 200, 120, 500, 300, 0, 0, IMW, IMH); c.getContext('2d').drawImage(V.desk.city, 200, 120, 500, 300, 0, 0, IMW, IMH);
      current = null; startEdit(c); cycle = setTimeout(nextPhoto, paintSecs * 1000); return;
    }
    if (li >= list.length) { li = 0; shuffle(list); }
    var id = list[li++], src = /^(\/|https?:|data:|blob:)/.test(id) ? id : '/photo/' + id + '.jpg', img = new Image();
    img.onload = function () { current = src; startEdit(img); cycle = setTimeout(nextPhoto, paintSecs * 1000); };
    img.onerror = function () { cycle = setTimeout(nextPhoto, 3000); };
    img.src = src;
  }
  function loadList() {
    if (STANDALONE) { waitBuilt(); return; }
    var x = new XMLHttpRequest(); x.open('GET', '/api/photos?t=' + Date.now(), true);
    x.onload = function () { try { var r = JSON.parse(x.responseText); list = shuffle(r.photos || []); paintSecs = r.painting_seconds || 120; } catch (e) {} waitBuilt(); };
    x.onerror = waitBuilt; x.send();
  }
  function waitBuilt() { if (built) nextPhoto(); else setTimeout(waitBuilt, 300); }

  /* ---------------- rain on the glass, snow, lightning ---------------- */
  var drops = [], beads = [], flakes = [], wxOn = false, flash = 0, nextFlash = 0;
  function rainy() { return kind === 'drizzle' || kind === 'rain' || kind === 'heavy' || kind === 'storm'; }
  function buildWx() {
    drops = []; beads = []; flakes = []; var i, v = V[view], n;
    V.bed.gctx.clearRect(0, 0, V.bed.w, V.bed.h); V.desk.gctx.clearRect(0, 0, V.desk.w, V.desk.h);
    if (rainy()) {
      n = kind === 'drizzle' ? 50 : kind === 'heavy' || kind === 'storm' ? 150 : 90;
      for (i = 0; i < n; i++) drops.push({ x: rnd(0, v.w), y: rnd(-v.h, v.h), l: rnd(10, 22), s: rnd(9, 16) });
      for (i = 0; i < (kind === 'drizzle' ? 18 : 34); i++) beads.push({ x: rnd(0, v.w), y: rnd(0, v.h), r: rnd(1.4, 3.4), s: 0, p: rnd(0, 6) });
    }
    if (kind === 'snow' || kind === 'blizzard') for (i = 0; i < (kind === 'blizzard' ? 160 : 80); i++) flakes.push({ x: rnd(0, v.w), y: rnd(-v.h, v.h), r: rnd(0.8, 2.6), s: rnd(0.5, 1.4), p: rnd(0, 6) });
    wxOn = drops.length || flakes.length || kind === 'storm';
  }
  function drawWx(t, dt) {
    if (!wxOn) return;
    var v = V[view], g = v.gctx, i, lat_ = sideWind() * Math.min(1, windNow() / 40);
    g.setTransform(0.5, 0, 0, 0.5, 0, 0); g.clearRect(0, 0, v.w, v.h);
    if (drops.length) {   // rain falling outside
      g.strokeStyle = phase === 'night' ? 'rgba(170,190,230,0.3)' : 'rgba(225,235,250,0.45)'; g.lineWidth = 1.2; g.beginPath();
      for (i = 0; i < drops.length; i++) {
        var d = drops[i]; d.y += d.s; d.x += lat_ * 4;
        if (d.y > v.h) { d.y = rnd(-40, 0); d.x = rnd(-30, v.w + 30); }
        g.moveTo(d.x, d.y); g.lineTo(d.x - lat_ * 6, d.y - d.l);
      }
      g.stroke();
      // drops on the glass, gathering, then running down in fits and starts
      g.fillStyle = 'rgba(220,232,255,0.35)'; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
      for (i = 0; i < beads.length; i++) {
        var b = beads[i]; b.p += dt;
        if (b.s <= 0 && Math.random() < dt * 0.15) b.s = rnd(40, 110);
        if (b.s > 0) { b.y += b.s * dt; b.x += Math.sin(b.p * 3) * 0.3; b.s *= 0.995; if (Math.random() < dt * 0.6) b.s = 0; }
        if (b.y > v.h + 6) { b.y = rnd(-10, v.h * 0.6); b.x = rnd(0, v.w); b.s = 0; }
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.2832); g.fill();
        if (b.s > 0) { g.beginPath(); g.moveTo(b.x, b.y - b.r); g.lineTo(b.x, b.y - b.r - 18); g.stroke(); }
      }
    }
    if (flakes.length) {
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath();
      for (i = 0; i < flakes.length; i++) {
        var f = flakes[i]; f.y += f.s; f.p += 0.02; f.x += Math.sin(f.p) * 0.6 + lat_ * 1.5;
        if (f.y > v.h) { f.y = rnd(-20, 0); f.x = rnd(0, v.w); }
        g.moveTo(f.x + f.r, f.y); g.arc(f.x, f.y, f.r, 0, 6.2832);
      }
      g.fill();
    }
    if (kind === 'storm') {
      if (t > nextFlash) { flash = 1; nextFlash = t + rnd(7, 18); }
      if (flash > 0.02) { v.flash.style.opacity = (flash * 0.6).toFixed(2); flash *= 0.86; } else if (flash) { flash = 0; v.flash.style.opacity = 0; }
    }
  }

  /* ---------------- time, view and rebuild ---------------- */
  function localHour() {
    var d = new Date(now() + (utcOff === null ? -new Date().getTimezoneOffset() * 60000 : utcOff * 1000));
    return d.getUTCHours() + d.getUTCMinutes() / 60;
  }
  /* ---------------- holidays ----------------
   * A carved pumpkin on the desk and the windowsill in the second half of October; coloured
   * string lights and a little tree from December to Twelfth Night; fireworks over the river
   * on the Fourth of July and at New Year. Preview with ?holiday=halloween|winter|fireworks. */
  function holiday() {
    var p = param('holiday');
    if (p) return p;
    var d = new Date(now() + (utcOff == null ? -new Date().getTimezoneOffset() * 60 : utcOff) * 1000), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (m === 10 && day >= 17) return 'halloween';
    if (m === 12 || (m === 1 && day <= 6)) return 'winter';
    return '';
  }
  function fireworksNow() {
    if (param('holiday') === 'fireworks') return true;
    var d = new Date(now() + (utcOff == null ? -new Date().getTimezoneOffset() * 60 : utcOff) * 1000), m = d.getUTCMonth() + 1, day = d.getUTCDate(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    return (m === 7 && day === 4 && h >= 21.2 && h < 22.6) || (m === 12 && day === 31 && h >= 23.95) || (m === 1 && day === 1 && h < 0.5);
  }
  function pumpkin(g, x, y, s) {   // sitting on (x, y); carved face lit from inside when the light goes
    var lit = phase !== 'day' || oc > 0.6, i;
    g.save(); g.translate(x, y); g.scale(s, s);
    if (lit) light(g, 0, -12, 46, '#ff9a3c', 0.35);
    var body = phase === 'night' ? '#a4501c' : '#e07a22', rib = phase === 'night' ? '#7a3812' : '#b85a14';
    g.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(g, 0, 0, 22, 3.5); g.fill();
    for (i = -2; i <= 2; i++) { g.fillStyle = Math.abs(i) === 2 ? rib : body; ellipse(g, i * 6.5, -12, 9 + (2 - Math.abs(i)) * 1.2, 12.5); g.fill(); }
    g.strokeStyle = rib; g.lineWidth = 1; for (i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 4.5, -23); g.quadraticCurveTo(i * 7, -12, i * 4.5, -1); g.stroke(); }
    g.fillStyle = '#4c6a2a'; g.beginPath(); g.moveTo(-1.5, -23); g.quadraticCurveTo(0, -30, 4, -31); g.lineTo(4, -28); g.quadraticCurveTo(2, -27, 1.5, -23); g.fill();
    g.fillStyle = lit ? '#ffd36a' : '#3a1a08';
    g.beginPath(); g.moveTo(-9, -16); g.lineTo(-3, -16); g.lineTo(-6, -21); g.closePath(); g.moveTo(9, -16); g.lineTo(3, -16); g.lineTo(6, -21); g.closePath(); g.fill();   // eyes
    g.beginPath(); g.moveTo(-11, -10); g.quadraticCurveTo(0, -1, 11, -10); g.lineTo(7, -9); g.lineTo(5, -6); g.lineTo(2, -8); g.lineTo(-1, -5); g.lineTo(-4, -8); g.lineTo(-7, -6); g.closePath(); g.fill();   // grin
    g.restore();
  }
  function littleTree(g, x, y, s) {   // a tabletop tree with a few lights
    var night = phase === 'night', i;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = night ? '#5a3f2a' : '#b5651d'; g.fillRect(-7, -8, 14, 8); g.fillStyle = 'rgba(0,0,0,0.25)'; ellipse(g, 0, 0, 14, 2.5); g.fill();
    var green = night ? '#173a2a' : '#2f6b42';
    for (i = 0; i < 3; i++) {   // three tiers, widest at the bottom
      var base = -8 - i * 13, half = 20 - i * 5;
      g.fillStyle = mix(green, '#ffffff', i * 0.05); g.beginPath(); g.moveTo(0, base - 26); g.lineTo(half, base); g.quadraticCurveTo(0, base + 3, -half, base); g.closePath(); g.fill();
    }
    g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(0, -60, 3.2, 0, 6.2832); g.fill();
    var bulbs = [[-11, -11, '#ff5a5a'], [9, -13, '#6ad1ff'], [-5, -24, '#ffd84a'], [7, -27, '#ff7ad9'], [-3, -38, '#8dff8a'], [14, -9, '#ffd84a'], [3, -45, '#6ad1ff']];
    for (i = 0; i < bulbs.length; i++) {
      if (night || oc > 0.5) light(g, bulbs[i][0], bulbs[i][1], 7, bulbs[i][2], 0.55);
      g.fillStyle = bulbs[i][2]; g.beginPath(); g.arc(bulbs[i][0], bulbs[i][1], 1.8, 0, 6.2832); g.fill();
    }
    g.restore();
  }
  function decorate(g, name) {
    var h = holiday();
    if (h === 'halloween') { if (name === 'desk') pumpkin(g, 780, 512, 1); else pumpkin(g, 812, 440, 0.8); }
    if (h === 'winter') { if (name === 'desk') littleTree(g, 780, 514, 1); else littleTree(g, 812, 441, 0.75); }
  }
  function asleep() { var h = localHour(); return sleepH < wakeH ? h >= sleepH && h < wakeH : h >= sleepH || h < wakeH; }
  function windNow() { return windKmh == null ? 8 : windKmh; }
  function sideWind() {   // which way the wind pushes things across this window: +1 right, -1 left
    var toward = (windDir + 180) % 360, s = Math.sin(face(toward, V[view].face) * Math.PI / 180);
    return (s >= 0 ? 1 : -1) * (0.35 + 0.65 * Math.abs(s));
  }
  var lastW = null;
  function rebuild() {
    var o = OVERCAST[kind] || 0, gr = GREY[phase];
    oc = o;
    var skyName = phase === 'golden' && localHour() < 12 ? 'dawn' : phase;
    sky = greyed(SKY[skyName], gr, o * 0.85); city = greyed(CITY[phase], gr, o * 0.5); room = greyed(ROOM[phase], gr, o * 0.2);
    room.rim = ROOM[phase].rim && (phase === 'night' || o < 0.5) ? ROOM[phase].rim : null;
    clouds = []; fxList = [];
    ['bed', 'desk'].forEach(function (n) { var v = V[n]; drawSky(v); buildSun(v); buildCity(v, n); buildLights(v); buildClouds(v); buildFx(v); placeSky(v); });
    drawDeskRoom(); drawBedRoom(); buildDog(); buildCat(); buildPeople(); buildWx(); paintHaze();
    if (noteEl.style.opacity === '1' && lastNote) paintNote(lastNote);
    builtAt = Date.now();
  }
  function setView(v, animate) {
    if (v === view && built) return;
    view = v;
    world.style.webkitTransition = world.style.transition = animate ? '-webkit-transform 7s ease-in-out, transform 7s ease-in-out' : 'none';
    tr(world, 'translate3d(' + (v === 'bed' ? 0 : -W) + 'px,0,0)');
  }
  function minutesOf(iso) { var p = iso.split('T')[1].split(':'); return +p[0] * 60 + +p[1]; }
  function setWeather(w) {
    if (!w || w.error) { if (!built) { kind = kind || 'clear'; phase = phase || 'day'; setView(view, false); rebuild(); built = 'none'; } return; }
    lastW = w;
    if (w.lat != null) { lat = w.lat; lon = w.lon; }
    utcOff = w.utc_offset == null ? null : w.utc_offset;
    if (timeOverride !== null) {
      var off = (utcOff || 0) * 1000, loc = new Date(Date.now() + off);
      timeShift = Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate()) + timeOverride * 3600000 - off - Date.now();
    } else timeShift = 0;
    timeShift += dayShift * 86400000;
    var k = forced.wx ? kind : (KIND[w.code] || 'cloudy'), ph = phase;
    if (!forced.phase) {
      ph = w.is_day ? 'day' : 'night';
      if (w.sunrise && w.sunset) {
        var nowM = localHour() * 60, rise = minutesOf(w.sunrise), set = minutesOf(w.sunset);
        ph = Math.abs(nowM - rise) < 45 || Math.abs(nowM - set) < 45 ? 'golden' : nowM > rise && nowM < set ? 'day' : 'night';
      }
      if (dayShift) {   // another day of the year: today's sunrise and sunset don't apply, so go by the sun itself
        var el = Sky.sun(now(), lat, lon).el;
        ph = el > 8 ? 'day' : el > -5 ? 'golden' : 'night';
      }
    }
    if (!forced.wind) windKmh = w.wind;
    windDir = w.wind_dir == null ? 270 : w.wind_dir;
    var v = forced.view || (asleep() ? 'bed' : 'desk');
    var key = k + '/' + ph + '/' + v + '/' + Math.floor(litFraction() * 100) + '/' + holiday();
    var changed = v !== view;
    if (key !== built || Date.now() - builtAt > 5 * 60 * 1000) {
      kind = k; phase = ph;
      setView(v, !!built && changed); built = key; rebuild();
    } else { placeSky(V.bed); placeSky(V.desk); }   // the same sky, but the sun and moon move with the clock
  }

  /* ---------------- bad air: a haze over the skyline ----------------
   * The US air quality index from the server. Above 50 a pale haze; over 150 the orange-brown
   * of wildfire smoke, as in June 2023. Preview with ?aqi=180. */
  var aqi = param('aqi') ? +param('aqi') : 0;
  function paintHaze() {
    var a = aqi <= 50 ? 0 : aqi <= 100 ? 0.16 : aqi <= 150 ? 0.32 : aqi <= 200 ? 0.5 : 0.62;
    var col = aqi > 150 ? (phase === 'night' ? '92,58,38' : '222,128,52') : aqi > 100 ? (phase === 'night' ? '78,66,60' : '214,178,128') : (phase === 'night' ? '64,62,70' : '208,200,184');
    ['bed', 'desk'].forEach(function (n) {
      var h = V[n].haze;
      h.style.background = '-webkit-linear-gradient(top, rgba(' + col + ',' + (a * 0.55).toFixed(2) + '), rgba(' + col + ',' + a.toFixed(2) + ') 70%, rgba(' + col + ',' + (a * 0.8).toFixed(2) + '))';
      h.style.background = 'linear-gradient(to bottom, rgba(' + col + ',' + (a * 0.55).toFixed(2) + '), rgba(' + col + ',' + a.toFixed(2) + ') 70%, rgba(' + col + ',' + (a * 0.8).toFixed(2) + '))';
      h.style.opacity = a ? 1 : 0;
    });
  }

  /* ---------------- fireworks ----------------
   * Bursts drawn once as sprites, then grown and faded with CSS transforms. */
  var BOOM = { list: [], next: 0, sheets: null };
  function burstSprite(col) {
    var c = mk(160, 160), g = c.getContext('2d'), R = Math.random, i, n = 46;
    g.globalCompositeOperation = 'lighter';
    var gl = g.createRadialGradient(80, 80, 0, 80, 80, 80); gl.addColorStop(0, rgba(col, 0.35)); gl.addColorStop(1, rgba(col, 0));
    g.fillStyle = gl; g.fillRect(0, 0, 160, 160);
    for (i = 0; i < n; i++) {
      var a = i / n * 6.2832 + R() * 0.1, r = 52 + R() * 22, x = 80 + Math.cos(a) * r, y = 80 + Math.sin(a) * r + r * 0.12;
      var gr = g.createLinearGradient(80 + Math.cos(a) * r * 0.45, 80 + Math.sin(a) * r * 0.45, x, y);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, 0.9));
      g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(80 + Math.cos(a) * r * 0.45, 80 + Math.sin(a) * r * 0.45); g.lineTo(x, y); g.stroke();
      g.fillStyle = mix(col, '#ffffff', 0.6); g.beginPath(); g.arc(x, y, 1.8, 0, 6.2832); g.fill();
    }
    return c;
  }
  function fireworks(t, dt) {
    var v = V[view], on = fireworksNow() && (phase !== 'day'), i;
    if (!on && !BOOM.list.length) return;
    if (!BOOM.sheets) { BOOM.sheets = ['#ff5a5a', '#ffd84a', '#6ad1ff', '#ff7ad9', '#8dff8a', '#ffffff'].map(burstSprite); }
    if (on && t > BOOM.next) {
      BOOM.next = t + rnd(0.35, 1.3);
      var el = mk(160, 160);
      el.getContext('2d').drawImage(BOOM.sheets[Math.floor(Math.random() * BOOM.sheets.length)], 0, 0);
      el.style.position = 'absolute'; el.style.left = '0px'; el.style.top = '0px';
      v.fw.appendChild(el);
      BOOM.list.push({ el: el, v: v, t0: t, x: rnd(v.w * 0.08, v.w * 0.92), y: rnd(v.h * 0.12, v.hy - 30), s: rnd(0.5, 1.05), life: rnd(1.6, 2.3) });
    }
    for (i = BOOM.list.length - 1; i >= 0; i--) {
      var b = BOOM.list[i], k = (t - b.t0) / b.life;
      if (k >= 1 || b.v !== v) { b.el.parentNode && b.el.parentNode.removeChild(b.el); BOOM.list.splice(i, 1); continue; }
      var grow = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3), sc = b.s * (0.15 + 0.85 * grow);
      b.el.style.opacity = (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55).toFixed(2);
      tr(b.el, 'translate3d(' + (b.x - 80).toFixed(1) + 'px,' + (b.y - 80 + k * k * 26).toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')');
    }
  }

  /* ---------------- the doorbell, and messages ----------------
   * The doorbell sends the dog galloping to the door (off to the right) to bark, and he looks
   * round; a door opening gets a trot and a wagging tail. A new message is stuck on his
   * monitor as a note, and he glances at it. */
  var woofEl = document.createElement('div');
  woofEl.style.cssText = 'position:absolute;left:0;top:0;font:italic 600 22px Newsreader,Georgia,serif;color:#fbf3e6;text-shadow:0 1px 3px rgba(0,0,0,0.6);opacity:0;pointer-events:none;-webkit-transition:opacity 0.25s;transition:opacity 0.25s';
  woofEl.textContent = 'Woof!';
  $('desk').appendChild(woofEl);
  var doorLook = 0, noteLook = 0;
  function doorEpisode(kind) {
    var wasOn = dog.on, lane = 744;
    dog.ball = null; ball.on = false; ballEl.style.display = 'none'; dog.pet = false;
    if (!wasOn || dog.x < -40 || dog.x > W + 40) { dog.x = -150; dog.y = lane; dog.dir = 1; }
    var g = kind === 'doorbell' ? 'gallop' : 'trot';
    dog.steps = [{ go: [Math.max(dog.x, 400), lane], g: g }, { go: [800, lane], g: g }, { face: 1 },
      kind === 'doorbell' ? { bark: 3.6 } : { clip: 'stand', fps: 4, d: 2.4, wag: 1 },
      { clip: 'stand', fps: 4, d: 0.5 }, { go: [W + 150, lane], g: 'trot' }];
    dog.si = 0; dog.on = true; dog.v = wasOn ? dog.v : 0; dogEl.style.display = 'block';
    doorLook = 6.5;
  }
  var noteEl = mk(74, 74);
  noteEl.style.cssText = 'position:absolute;left:702px;top:356px;opacity:0;-webkit-transition:opacity 0.3s,-webkit-transform 0.35s;transition:opacity 0.3s,transform 0.35s';
  V.desk.box.appendChild(noteEl);
  function paintNote(text) {
    var g = noteEl.getContext('2d'), words = text.split(/\s+/), lines = [], cur = '', i;
    g.clearRect(0, 0, 74, 74);
    g.save(); g.translate(37, 37); g.rotate(-0.07);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-28, -27, 58, 58);
    g.fillStyle = phase === 'night' ? '#c9b85a' : '#ffe36e'; g.fillRect(-30, -30, 58, 58);
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(-30, -30, 58, 9);
    g.fillStyle = '#2b2a33'; g.font = 'italic 600 11px Newsreader, Georgia, serif';
    for (i = 0; i < words.length && lines.length < 4; i++) {
      var t2 = cur ? cur + ' ' + words[i] : words[i];
      if (g.measureText(t2).width > 50 && cur) { lines.push(cur); cur = words[i]; } else cur = t2;
    }
    if (cur && lines.length < 4) lines.push(cur);
    if (i < words.length || (lines.length === 4 && cur !== lines[3])) lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, '') + '…';
    for (i = 0; i < lines.length; i++) g.fillText(lines[i], -25, -10 + i * 12);
    g.restore();
  }
  var lastNote = '';
  function note(text, isNew) {
    lastNote = text;
    if (!text) { noteEl.style.opacity = 0; return; }
    paintNote(text);
    if (isNew && view === 'desk') {   // slapped on: from a little bigger, settling onto the screen
      noteEl.style.webkitTransition = noteEl.style.transition = 'none';
      tr(noteEl, 'scale(1.35) rotate(6deg)'); noteEl.style.opacity = 0;
      noteEl.offsetWidth;
      noteEl.style.webkitTransition = 'opacity 0.3s, -webkit-transform 0.35s'; noteEl.style.transition = 'opacity 0.3s, transform 0.35s';
      noteLook = 3.5;
    }
    tr(noteEl, 'scale(1) rotate(0deg)'); noteEl.style.opacity = 1;
  }

  /* ---------------- taps on the iPad ----------------
   * Tap the sleeping cat to wake it; tap the floor to call the dog (fetch and a visit, in turn). */
  var callNext = 'fetch';
  function tapAt(x, y) {
    if (view !== 'desk') return false;
    if (!kitty.steps && Math.abs(x - kitty.x) < 50 && y > kitty.y - 50 && y < kitty.y + 12) { kitty.ask = true; return true; }
    if (!dog.on && y > 560 && !(x > 250 && x < 470 && y < 700)) { dog.ask = callNext; callNext = callNext === 'fetch' ? 'visit' : 'fetch'; return true; }
    return false;
  }

  /* ---------------- main loop ---------------- */
  var nextFrame = param('timer') ? function (f) { setTimeout(function () { f(Date.now()); }, 33); } : function (f) { requestAnimationFrame(f); };
  var last = 0, acc = 0, dimmed = false, drawn = 0, fpsAt = 0, headA = 0, headY = 0, jitterAt = 0;
  function frame(nowMs) {
    nextFrame(frame);
    if (!last) { last = nowMs; return; }
    var dt = (nowMs - last) / 1000; last = nowMs;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    if (acc < (dimmed ? 1 / 12 : 0.029)) return;
    dt = acc; acc = 0;
    if (!built) return;
    var t = nowMs / 1000, w = windNow(), side = sideWind(), i;
    drawn++;
    if (!fpsAt) fpsAt = nowMs;
    else if (fpsAt > 0 && nowMs - fpsAt > 60000 && !STANDALONE) {
      try { var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog', true); x.send('status: city running at ' + (drawn / ((nowMs - fpsAt) / 1000)).toFixed(1) + ' fps, ' + view + ' view'); } catch (e) {}
      fpsAt = -1;
    }
    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i]; if (c.v !== V[view]) continue;
      c.x += side * (2 + w * 0.4) * c.s * dt;
      if (c.x > c.v.w + 20) c.x = -c.w; if (c.x < -c.w - 20) c.x = c.v.w;
      setXY(c.el, c.x, c.y);
    }
    var night = phase !== 'day' || oc > 0.5;
    for (i = 0; i < fxList.length; i++) {
      var f = fxList[i]; if (f.v !== V[view]) continue;
      if (f.kind === 'beacon') { var on = night && (t + f.p) % 2 < 0.35; if (on !== f.on) { f.on = on; f.el.style.opacity = on ? 1 : 0; } }
      else { f.p += dt * (0.6 + w * 0.02); tr(f.el, 'skewX(' + (-side * Math.min(0.9, 0.15 + w * 0.02) + Math.sin(f.p) * 0.06).toFixed(3) + 'rad) scaleY(' + (0.85 + 0.15 * Math.sin(f.p * 0.7)).toFixed(3) + ')'); }
    }
    if (view === 'desk') {
      codeTick(t); editTick(t);
      // he looks at whichever screen is busy, leans back to think, and his hands type
      updateDog(t, dt); updateCat(t, dt);
      if (kitty.keys && t > kitty.keyAt) { catKey(); kitty.keyAt = t + rnd(0.1, 0.25); code.next = Math.max(code.next, t + 1.5); }
      var look = handsTick(t, dt);
      if (doorLook > 0) { doorLook -= dt; look = 13; }   // round towards the door
      else if (noteLook > 0) { noteLook -= dt; look = 6; }   // a glance at the new note
      var aim = look !== null ? look : !ed.done && ed.t0 > 0 && t > ed.t0 - 1 ? 7 : code.think && t < code.think ? -3 : 0, ay = look !== null && look < 0 ? 3 : code.think && t < code.think ? -3 : 0;
      headA += (aim - headA) * Math.min(1, dt * 2); headY += (ay - headY) * Math.min(1, dt * 2);
      if (guy.head) tr(guy.head, 'translate3d(' + (headA * 0.5).toFixed(2) + 'px,' + headY.toFixed(2) + 'px,0) rotate(' + headA.toFixed(2) + 'deg)');
      if (ARM.R.c && t > jitterAt) {   // his hands move a little as he types
        var typing = t - code.lastKey < 0.2;
        ['L', 'R'].forEach(function (n) { var A = ARM[n], j = typing && A.w === 0; tr(A.c, 'translate3d(' + (j ? rnd(-1, 1) : 0).toFixed(1) + 'px,' + (j ? rnd(-1.2, 0.6) : 0).toFixed(1) + 'px,0)'); });
        jitterAt = t + 0.08;
      }
      for (i = 0; i < steamEls.length; i++) {
        var sp = (t / 3.2 + i * 0.5) % 1;
        steamEls[i].style.opacity = (Math.sin(sp * Math.PI) * 0.9).toFixed(2);
        tr(steamEls[i], 'translate3d(' + (Math.sin(t + i) * 2).toFixed(1) + 'px,' + (-sp * 22).toFixed(1) + 'px,0)');
      }
    } else if (duvet) {
      tr(duvet, 'scaleY(' + (1 + 0.022 * (0.5 + 0.5 * Math.sin(t * 6.2832 / 4.6))).toFixed(4) + ')');   // slow breathing
    }
    fireworks(t, dt);
    drawWx(t, dt);
  }

  window.City = {
    setWeather: setWeather,
    view: function () { return view; },
    phase: function () { return phase || 'day'; },
    wind: function () { return windNow(); },
    dim: function (on) { dimmed = on; },
    photo: function () { return current; },
    snapshot: function () { return ed.fin ? ed.fin.toDataURL('image/jpeg', 0.9) : ''; },
    // the hours he sleeps (local time); outside them he's at the desk
    setHours: function (s, w) { if (s === sleepH && w === wakeH) return; sleepH = s; wakeH = w; if (lastW) setWeather(lastW); },
    setTime: function (h) { timeOverride = h; if (lastW) setWeather(lastW); },
    now: function () { return now(); },   // the moment the scene shows (shifted by ?time= and ?days=)
    setPhotos: function (urls, secs) { list = urls.slice(); li = 0; if (secs) paintSecs = secs; if (built) nextPhoto(); },
    // for the browser demo: pick the room, move through the year, send for the animals
    showView: function (v) { forced.view = v || null; if (lastW) setWeather(lastW); },
    setDays: function (n) { dayShift = n; if (lastW) setWeather(lastW); },
    callDog: function (k) { dog.ask = k || 'visit'; },
    wakeCat: function () { kitty.ask = true; },
    busy: function () { return { dog: dog.on, cat: !!kitty.steps }; },
    setAir: function (n) { if (param('aqi')) return; n = +n || 0; if (n !== aqi) { aqi = n; if (built) paintHaze(); } },
    door: function (kind) { dog.door = kind || 'doorbell'; },   // the doorbell rang, or a door opened
    note: note,                                                  // the message as a note on his monitor
    tap: tapAt                                                   // a tap at stage coordinates; true if it did something

  };
  if (forced.view) setView(forced.view, false);
  loadList();
  nextFrame(frame);
})();
