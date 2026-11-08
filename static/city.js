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
    v.clouds = place(view_, document.createElement('div'), 0, 0);
    v.city = place(view_, mk(v.w, v.h), 0, 0);
    v.lights = place(view_, mk(v.w, v.h), 0, 0);
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
    var gc = phase === 'golden' ? '255,190,120' : '255,250,225';
    gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + gc + ',' + (0.8 - oc * 0.6) + ')'); gr.addColorStop(0.2, 'rgba(' + gc + ',' + (0.32 - oc * 0.2) + ')'); gr.addColorStop(1, 'rgba(' + gc + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 240, 240);
    if (oc < 0.5) { g.fillStyle = phase === 'golden' ? '#ffe0a6' : '#fffbea'; g.beginPath(); g.arc(r, r, 15, 0, 6.2832); g.fill(); }
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
    if (steps) { var t1 = t + (b - t) * rnd(0.18, 0.32), t2 = t1 + (b - t1) * rnd(0.15, 0.3); body = [[x + w * 0.24, t, w * 0.52], [x + w * 0.1, t1, w * 0.8], [x, t2, w]]; }
    g.fillStyle = col;
    for (var i = 0; i < body.length; i++) g.fillRect(body[i][0], body[i][1], body[i][2], b - body[i][1]);
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
        if (o.cells.length < 40000) o.cells.push(xx, yy, cw2, chh, o.row);
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
    var g = v.city.getContext('2d'), R = seeded(name === 'desk' ? 7 : 23), w = v.w, h = v.h, hy = v.hy, i, x;
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
    var cells = [], tops = [], steam = [], rows = [[hy + 14, 0.55, 0.12], [hy + 30, 0.8, 0.14], [hy + 58, 1.1, 0.16], [hy + 98, 1.45, 0.14]];
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
        tower(v, g, { x: x, top: top, w: bw, bottom: h + 5, col: col, s: s, tall: tall, crown: crown, R: R, cells: cells, tops: tops, steam: steam, row: r,
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
    // the two towers right outside, framing the view
    var near = name === 'desk' ? [[-40, 34, 130, 'deco'], [w - 120, 96, 150, null]] : [[-30, 70, 120, 'antenna'], [w - 96, 20, 120, 'spire']];
    for (i = 0; i < near.length; i++)
      tower(v, g, { x: near[i][0], top: near[i][1], w: near[i][2], bottom: h + 5, col: city.near, s: 1.9, tall: true, crown: near[i][3], R: R, cells: cells, tops: tops, steam: steam, row: 4,
        rim: city.rim ? (near[i][0] + near[i][2] / 2 < sunX ? 1 : -1) : 0 });
    if (kind === 'fog') { gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgba(sky.low, 0.75)); gr.addColorStop(0.6, rgba(sky.low, 0.45)); gr.addColorStop(1, rgba(sky.low, 0.2)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (kind === 'snow' || kind === 'blizzard') { g.fillStyle = 'rgba(240,244,250,0.18)'; g.fillRect(0, hy, w, h - hy); }
    v.cells = cells; v.tops = tops; v.steamAt = steam;
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
      if (S.bloom > 0.1) { g.fillStyle = phase === 'night' ? '#8d8fa8' : '#f7c9d6'; for (var j = 0; j < 6; j++) { g.beginPath(); g.arc(tx + rnd(-r, r) * 0.8, y0 - 10 + rnd(-r, r) * 0.8, 1.1, 0, 6.2832); g.fill(); } }
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
    for (i = 0; i < c.length; i += 5) {
      if (R() > f * (c[i + 4] === 4 ? 0.8 : 1)) continue;
      g.fillStyle = cols[Math.floor(R() * 4)]; g.globalAlpha = c[i + 4] < 2 ? 0.75 : 0.95;
      g.fillRect(c[i], c[i + 1], c[i + 2], c[i + 3]);
    }
    g.globalAlpha = 1;
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

  var D = { code: { x: 446, y: 266, w: 280, h: 164 }, photo: { x: 748, y: 272, w: 236, h: 158 }, disp: { x: 36, y: 312, w: 264, h: 180 } };
  function drawDeskRoom() {
    var v = V.desk, g = v.room.getContext('2d'), night = phase === 'night', gold = phase === 'golden', i;
    g.clearRect(0, 0, W, H);
    wallAndWindow(g, v, 'desk');
    // floor and the dark under the desk
    var fg_ = g.createLinearGradient(0, 560, 0, H); fg_.addColorStop(0, room.dark); fg_.addColorStop(0.45, mix(room.dark, room.floor, 0.55)); fg_.addColorStop(1, room.floor);
    g.fillStyle = fg_; g.fillRect(0, 560, W, H - 560);
    g.strokeStyle = rgba(room.dark, 0.25); g.lineWidth = 1; g.beginPath();
    for (i = 0; i < 6; i++) { var py = 640 + i * i * 4.5; g.moveTo(0, py); g.lineTo(W, py); } g.stroke();   // floorboards
    g.fillStyle = rgba(room.dark, 0.35); ellipse(g, 372, 730, 120, 18); g.fill();   // the chair's shadow
    // desk: walnut top seen from just above, black steel legs
    g.fillStyle = room.dark; g.fillRect(30, 560, 12, H - 560); g.fillRect(W - 46, 560, 12, H - 560);
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
    // desk display (time, weather, wind) on a small stand
    rrect(g, D.disp.x, D.disp.y, D.disp.w, D.disp.h, 10); g.fillStyle = '#0d0f13'; g.fill();
    rrect(g, D.disp.x + 8, D.disp.y + 8, D.disp.w - 16, D.disp.h - 16, 5); g.fillStyle = '#05070b'; g.fill();
    g.fillStyle = '#1a1c22'; g.fillRect(D.disp.x + D.disp.w / 2 - 30, D.disp.y + D.disp.h, 60, 8);
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
    // light: the sunset coming in, or the room by screen light at night
    if (gold) { g.fillStyle = 'rgba(255,140,80,0.08)'; g.fillRect(0, 0, W, H); }
    if (night) {
      light(g, D.code.x + D.code.w / 2, D.code.y + 80, 330, '#4aa8ff', 0.22);
      light(g, D.code.x + D.code.w / 2, 506, 200, '#ffd7a0', 0.25);
      light(g, D.disp.x + D.disp.w / 2, D.disp.y + 90, 190, '#ffb36b', 0.12);
      light(g, 860, 360, 200, '#8fd0ff', 0.12);
    }
  }
  function drawBedRoom() {
    var v = V.bed, g = v.room.getContext('2d'), night = phase === 'night', i;
    g.clearRect(0, 0, W, H);
    wallAndWindow(g, v, 'bed');
    g.fillStyle = mix(room.wall, '#ffffff', night ? 0.05 : 0.35); g.fillRect(v.x - 16, v.y + v.h + 8, v.w + 32, 10);   // sill
    g.fillStyle = room.floor; g.fillRect(0, 640, W, H - 640);
    g.fillStyle = rgba(mix(room.duvet, room.floor, 0.5), 0.6); ellipse(g, 600, 712, 380, 40); g.fill();
    g.fillStyle = mix(room.wallLo, '#000000', 0.2); g.fillRect(W - 22, 0, 22, H);   // the wall between the rooms
    // a print on the wall
    g.fillStyle = room.frame; g.fillRect(56, 112, 140, 180);
    var gr = g.createLinearGradient(0, 122, 0, 282); gr.addColorStop(0, night ? '#2a3150' : '#e7b48f'); gr.addColorStop(1, night ? '#151a30' : '#5f6f95');
    g.fillStyle = gr; g.fillRect(64, 120, 124, 164);
    g.fillStyle = night ? '#0e1122' : '#2f3550'; for (i = 0; i < 9; i++) { var bh = 20 + ((i * 37) % 60); g.fillRect(68 + i * 13, 284 - bh, 10, bh); }
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
  }

  /* he sits with his back to us, headphones on, like the painter */
  var guy = {}, duvet = null;
  function sprite(box, x, y, w, h, draw) { var c = mk(w, h), g = c.getContext('2d'); g.translate(-x, -y); draw(g); return place(box, c, x, y); }
  function buildPeople() {
    var bd = V.desk.box, bb = V.bed.box, rim = room.rim, night = phase === 'night';
    [guy.armL, guy.armR, guy.body, guy.head, guy.chair, duvet, guy.empty, guy.bedEmpty].forEach(function (e) { if (e && e.parentNode) e.parentNode.removeChild(e); });
    var awake = view === 'desk';
    if (awake) {
      guy.armL = sprite(bd, 236, 440, 110, 110, function (g) { arm(g, 300, 452, 262, 528, 304, 520); });
      guy.armR = sprite(bd, 420, 440, 110, 110, function (g) { arm(g, 444, 452, 482, 530, 506, 518); });
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
      guy.chair = sprite(bd, 260, 450, 230, 318, function (g) {
        g.fillStyle = room.chair; rrect(g, 290, 470, 164, 150, 26); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.beginPath();
        for (var i = 0; i < 14; i++) { g.moveTo(300 + i * 11, 478); g.lineTo(300 + i * 11, 612); } g.stroke();
        g.fillStyle = mix(room.chair, '#ffffff', 0.08); rrect(g, 296, 476, 152, 16, 8); g.fill();
        g.fillStyle = room.chair; g.fillRect(366, 620, 12, 76);
        g.fillRect(300, 700, 144, 8); g.fillRect(368, 696, 8, 30);
        g.fillStyle = '#08090c'; ellipse(g, 302, 714, 7, 6); g.fill(); ellipse(g, 442, 714, 7, 6); g.fill(); ellipse(g, 372, 732, 7, 6); g.fill();
        if (rim) { g.strokeStyle = rgba(rim, 0.25); g.lineWidth = 2; g.beginPath(); g.moveTo(454, 496); g.lineTo(454, 600); g.stroke(); }
      });
      guy.bedEmpty = sprite(bb, 340, 470, 680, 180, function (g) { duvetShape(g, false); });
    } else {
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
    // the cat, curled up by his feet
    var cat = phase === 'night' ? '#3a3d4a' : '#7b7f8b';
    g.fillStyle = cat; ellipse(g, 892, 488, 30, 15); g.fill(); g.beginPath(); g.arc(866, 484, 11, 0, 6.2832); g.fill();
    g.beginPath(); g.moveTo(858, 476); g.lineTo(860, 466); g.lineTo(866, 474); g.moveTo(868, 474); g.lineTo(874, 465); g.lineTo(876, 476); g.fill();
    g.strokeStyle = cat; g.lineWidth = 6; g.beginPath(); g.moveTo(920, 492); g.quadraticCurveTo(916, 506, 884, 502); g.stroke();
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
  var code = { lines: [], li: 0, ci: 0, row: 0, cols: null, next: 0, think: 0, lastKey: 0, cur: false };
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
    var x = GUT + code.ci * CW, y = rowY(code.row);
    if (code.row < 0 || x > D.code.w - CW) return;
    cg.fillStyle = on ? '#89ddff' : '#0d1320'; cg.fillRect(x, y, on ? 1.5 : CW, LH - 2);
    code.cur = on;
  }
  function typeChar() {
    var line = code.lines[code.li], x = GUT + code.ci * CW;
    cursor(false);
    if (x < D.code.w - CW) { cg.fillStyle = code.cols[code.ci]; cg.fillText(line.charAt(code.ci), x, rowY(code.row) + 9); }
    code.ci++;
  }
  function newRow() {
    cursor(false);
    code.li = (code.li + 1) % code.lines.length; code.ci = 0; code.cols = colours(code.lines[code.li]);
    code.row++;
    if (code.row >= ROWS) {   // scroll the editor up a line
      code.row = ROWS - 1;
      cg.drawImage(cs, 0, rowY(1) - 1, D.code.w, LH * (ROWS - 1), 0, rowY(0) - 1, D.code.w, LH * (ROWS - 1));
      cg.fillStyle = '#0d1320'; cg.fillRect(0, rowY(code.row) - 1, D.code.w, LH);
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
    if (t < code.next) { if (t > code.lastKey + 0.5) { var on = Math.floor(t * 2) % 2 === 0; if (on !== code.cur) cursor(on); } return; }
    var line = code.lines[code.li];
    if (code.ci < line.length) {
      var burst = 1 + Math.floor(Math.random() * 2);
      while (burst-- && code.ci < line.length) typeChar();
      if (GUT + code.ci * CW > D.code.w - CW) code.ci = line.length;   // the rest of a long line is off screen
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
    drawDeskRoom(); drawBedRoom(); buildPeople(); buildWx();
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
    }
    if (!forced.wind) windKmh = w.wind;
    windDir = w.wind_dir == null ? 270 : w.wind_dir;
    var v = forced.view || (asleep() ? 'bed' : 'desk');
    var key = k + '/' + ph + '/' + v + '/' + Math.floor(litFraction() * 100);
    var changed = v !== view;
    if (key !== built || Date.now() - builtAt > 5 * 60 * 1000) {
      kind = k; phase = ph;
      setView(v, !!built && changed); built = key; rebuild();
    }
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
      var aim = !ed.done && ed.t0 > 0 && t > ed.t0 - 1 ? 7 : code.think && t < code.think ? -3 : 0, ay = code.think && t < code.think ? -3 : 0;
      headA += (aim - headA) * Math.min(1, dt * 2); headY += (ay - headY) * Math.min(1, dt * 2);
      if (guy.head) tr(guy.head, 'translate3d(' + (headA * 0.5).toFixed(2) + 'px,' + headY.toFixed(2) + 'px,0) rotate(' + headA.toFixed(2) + 'deg)');
      if (guy.armR && t > jitterAt) {
        var typing = t - code.lastKey < 0.2;
        tr(guy.armL, 'translate3d(' + (typing ? rnd(-1, 1) : 0).toFixed(1) + 'px,' + (typing ? rnd(-1.2, 0.6) : 0).toFixed(1) + 'px,0)');
        tr(guy.armR, 'translate3d(' + (typing ? rnd(-1, 1) : 0).toFixed(1) + 'px,' + (typing ? rnd(-1.2, 0.6) : 0).toFixed(1) + 'px,0)');
        jitterAt = t + 0.08;
      }
    } else if (duvet) {
      tr(duvet, 'scaleY(' + (1 + 0.022 * (0.5 + 0.5 * Math.sin(t * 6.2832 / 4.6))).toFixed(4) + ')');   // slow breathing
    }
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
    setPhotos: function (urls, secs) { list = urls.slice(); li = 0; if (secs) paintSecs = secs; }
  };
  if (forced.view) setView(forced.view, false);
  loadList();
  nextFrame(frame);
})();
