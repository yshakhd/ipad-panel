/* Meadow scene: an old painter in a field of grass, painting your photos one at a time.
 * Everything is drawn in code at a fixed 1024x768 design size (the iPad's screen).
 * ES5 only (iOS 9 Safari). Static layers are drawn once into canvases; each frame only
 * redraws the foreground grass, the painter's arm and the painting in progress.
 * Preview any look with URL params, e.g. /meadow.html?wx=rain&phase=night&wind=40
 * (wx: clear partly cloudy fog drizzle rain heavy snow blizzard storm; phase: day golden night;
 *  wind in km/h; time=HH:MM for another time of day; days=N to look N days ahead)
 * Needs sky.js loaded first. Embedding without the panel server (see demo/): set window.MEADOW_STANDALONE = true before
 * loading this file, then feed it with Meadow.setWeather(), Meadow.setTime() and Meadow.paint().
 */
(function () {
  var W = 1024, H = 768, STANDALONE = !!window.MEADOW_STANDALONE;
  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
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
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------------- palettes ---------------- */
  var BASE = {
    day: { skyTop: '#3f7fc2', skyMid: '#86bbe3', skyLow: '#d8eef2', far: '#7fa9b8', farHi: '#a9c9d2',
      mid: '#78a94f', midHi: '#a6cf6c', near: '#5b9639', nearLo: '#3a6f28', tree: '#3b6b33', treeHi: '#79a94b',
      blade: ['#2c6127', '#3b7a30', '#4c8d36'], bladeHi: '#a7d661', back: ['#5f9a3c', '#6fa845'],
      cloud: '#ffffff', cloudSh: '#b8cde2', tint: null },
    golden: { skyTop: '#5a63a3', skyMid: '#e59c78', skyLow: '#fcdca4', far: '#9a8aa8', farHi: '#cfa6a2',
      mid: '#93a050', midHi: '#dcc174', near: '#6b8a39', nearLo: '#45652a', tree: '#47552e', treeHi: '#c7a052',
      blade: ['#38561f', '#4a6c28', '#5b7e2f'], bladeHi: '#f3c96c', back: ['#78903c', '#8a9c45'],
      cloud: '#ffe8cc', cloudSh: '#d0908a', tint: 'rgba(255,150,70,0.16)' },
    night: { skyTop: '#081330', skyMid: '#172a56', skyLow: '#2f4c7c', far: '#1c2f4e', farHi: '#2a4266',
      mid: '#1d3839', midHi: '#2b4d48', near: '#163026', nearLo: '#0d211a', tree: '#11251e', treeHi: '#23403a',
      blade: ['#0c2117', '#122d1e', '#183825'], bladeHi: '#3d6b5c', back: ['#183626', '#1d3f2c'],
      cloud: '#3a4d76', cloudSh: '#1c2948', tint: 'rgba(20,35,85,0.52)' }
  };
  var OVERCAST = { clear: 0, partly: 0.08, cloudy: 0.55, fog: 0.62, drizzle: 0.55, rain: 0.65, heavy: 0.78,
    snow: 0.5, blizzard: 0.72, storm: 0.85 };
  var GREY = { day: '#a6b0ba', golden: '#b39d98', night: '#273044' };
  var KIND = { 0: 'clear', 1: 'clear', 2: 'partly', 3: 'cloudy', 45: 'fog', 48: 'fog',
    51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
    61: 'rain', 80: 'rain', 63: 'rain', 81: 'rain', 66: 'rain', 65: 'heavy', 82: 'heavy', 67: 'heavy',
    71: 'snow', 73: 'snow', 77: 'snow', 85: 'snow', 75: 'blizzard', 86: 'blizzard',
    95: 'storm', 96: 'storm', 99: 'storm' };

  /* ---------------- seasons ----------------
   * A smooth year rather than four switches: how far the leaves have turned, how much canopy
   * is left, spring blossom, and how dry the field is, keyed by day of the year (north of the
   * equator; shifted half a year south of it). Preview with ?season=autumn or ?days=N. */
  var season = { turn: 0, cover: 1, bloom: 0, dry: 0 };
  function seasonAt(ms) { return Sky.season(ms, lat, param('season')); }
  var FALL = {   // turned leaves
    day: { tree: '#b65a2c', treeHi: '#eaa43c', leaf: ['#c2492b', '#dd7d2a', '#e8b33f', '#9e3d26'] },
    golden: { tree: '#a9461f', treeHi: '#f4a63e', leaf: ['#c03f22', '#e07526', '#f0ad3a', '#97361e'] },
    night: { tree: '#2b1e17', treeHi: '#47301f', leaf: ['#3b2a20', '#4b3322', '#33251c', '#2a2019'] } };
  var DRY = {    // a tawny late-year field
    day: { mid: '#aba25c', midHi: '#dccb86', near: '#8f8f45', nearLo: '#5d6131', bladeHi: '#e6d47c',
      blade: ['#56652c', '#6c7834', '#848a3c'], back: ['#99974f', '#ada358'] },
    golden: { mid: '#b39a4c', midHi: '#efc477', near: '#877d36', nearLo: '#575327', bladeHi: '#f9cd6c',
      blade: ['#4f5421', '#636528', '#78772f'], back: ['#a0923f', '#b39f46'] },
    night: { mid: '#26352e', midHi: '#33443a', near: '#1d2d22', nearLo: '#111f17', bladeHi: '#4f6656',
      blade: ['#14251a', '#1b2e1e', '#223622'], back: ['#203424', '#27392a'] } };
  var BLOSSOM = { day: ['#f7c9d6', '#fde4ec', '#ffffff'], golden: ['#f9c2b8', '#fddcc8', '#fff0de'], night: ['#8d8fa8', '#a3a3b8'] };

  function palette(phase, kind) {
    var b = BASE[phase], p = {}, k, oc = OVERCAST[kind] || 0, grey = GREY[phase];
    for (k in b) p[k] = b[k];
    var S = season, dry = DRY[phase], fall = FALL[phase], dm = S.dry * 0.85;
    ['mid', 'midHi', 'near', 'nearLo', 'bladeHi'].forEach(function (n) { p[n] = mix(b[n], dry[n], dm); });
    p.blade = b.blade.map(function (c, i) { return mix(c, dry.blade[i], dm); });
    p.back = b.back.map(function (c, i) { return mix(c, dry.back[i], dm); });
    p.tree = mix(b.tree, fall.tree, S.turn); p.treeHi = mix(b.treeHi, fall.treeHi, S.turn);
    p.leaf = fall.leaf.map(function (c) { return mix(b.treeHi, c, S.turn); });
    p.skyTop = mix(b.skyTop, grey, oc); p.skyMid = mix(b.skyMid, grey, oc); p.skyLow = mix(b.skyLow, grey, oc * 0.8);
    p.far = mix(b.far, grey, oc * 0.6); p.farHi = mix(b.farHi, grey, oc * 0.6);
    p.cloud = mix(b.cloud, grey, oc * 0.55); p.cloudSh = mix(b.cloudSh, '#6d7686', oc * 0.6);
    var dull = oc * 0.28;
    ['mid', 'midHi', 'near', 'nearLo', 'tree', 'treeHi'].forEach(function (n) { p[n] = mix(p[n], grey, dull); });
    p.leaf = p.leaf.map(function (c) { return mix(c, grey, dull); });
    if (kind === 'snow' || kind === 'blizzard') {
      var snow = phase === 'night' ? '#7d8aa3' : '#eef2f5';
      ['mid', 'midHi', 'near', 'nearLo'].forEach(function (n) { p[n] = mix(p[n], snow, 0.78); });
      p.back = [mix(p.back[0], snow, 0.5), mix(p.back[1], snow, 0.5)];
    }
    p.oc = oc;
    return p;
  }

  /* ---------------- state ---------------- */
  var kind = param('wx') || '', phase = param('phase') || '', windKmh = param('wind') ? +param('wind') : null;
  var windDir = 270, dirSign = 1, lat = 51.5, lon = -0.13, timeShift = 0, pal = palette('day', 'clear');
  var forced = { wx: !!param('wx'), phase: !!param('phase'), wind: param('wind') !== null };
  var builtKey = '', builtAt = 0;

  /* ---------------- layers ---------------- */
  var stage = $('stage');
  var back = $('backdrop'), bctx = back.getContext('2d');
  var land = $('land'), lctx = land.getContext('2d'), sunEl = $('sun'), moonEl = $('moon');
  var figBox = $('figure');
  var fg = $('grass');
  var wx = $('wx'), wctx = wx.getContext('2d');
  var cloudBox = $('clouds'), waveBox = $('waves');
  back.width = W; back.height = H; land.width = W; land.height = H;
  var FX = 380, FY = 196, FW = 470, FH = H - 196;   // painter canvas region
  // Live layers. The arm sits behind the body (we see him from behind, so his back hides
  // the arm wherever it crosses in front of him); the hat ribbon sits in front.
  var AX = 440, AY = 260, AW = 400, AH = 340, arm = mk(AW, AH), actx = arm.getContext('2d');
  var RX = 450, RY = 280, RW = 220, RH = 130, ribbon = mk(RW, RH), rctx = ribbon.getContext('2d');
  // Grass tufts are drawn at half resolution and scaled up: closest to the lens, a little
  // softness reads as depth of field, and it halves their memory.
  var GS = +(param('gs') || 0.5);

  // fireworks burst behind the hills; a haze of smoke or smog sits over the land, behind him
  var fwBox = document.createElement('div'), hazeEl = document.createElement('div');
  fwBox.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden;pointer-events:none';
  hazeEl.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;opacity:0';
  land.parentNode.insertBefore(fwBox, land);
  land.parentNode.insertBefore(hazeEl, cloudBox);
  wx.width = W / 2; wx.height = H / 2; wx.style.width = W + 'px'; wx.style.height = H + 'px';

  function viewSize() {   // the demo measures the screen itself, which a wide page can't inflate; the iPad page, as always
    var d = document.documentElement;
    return STANDALONE && d.clientWidth ? [d.clientWidth, d.clientHeight || window.innerHeight] : [window.innerWidth, window.innerHeight];
  }
  function fitStage() {
    var v = viewSize(), s = Math.min(v[0] / W, v[1] / H);
    var top = STANDALONE && v[1] > v[0] ? 0 : (v[1] - H * s) / 2;   // phones held upright: scene at the top
    var t = 'translate(' + ((v[0] - W * s) / 2) + 'px,' + top + 'px) scale(' + s + ')';
    stage.style.webkitTransform = t; stage.style.transform = t;
  }
  // iPadOS sometimes reports the window's size before it has settled (opening from the Home Screen,
  // coming back from the background, a rotation while away) and then sends no resize event, which
  // left the picture drawn small until the next visit. So re-measure on every hint, and once a second.
  function watchSize(fn) {
    var last = '';
    function check() { var k = viewSize().join('x') + '/' + window.innerWidth + 'x' + window.innerHeight; if (k !== last) { last = k; fn(); } }
    function soon() { check(); setTimeout(check, 250); setTimeout(check, 1000); }
    window.addEventListener('resize', soon, false);
    window.addEventListener('orientationchange', soon, false);
    window.addEventListener('pageshow', soon, false);
    window.addEventListener('focus', soon, false);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) soon(); }, false);
    setInterval(check, 1000);
    check();
  }
  watchSize(fitStage);

  /* ---------------- landscape shapes ---------------- */
  function farY(x) { return 350 + 15 * Math.sin(x / 150 + 0.7) + 8 * Math.sin(x / 61 + 2.1) - 26 * Math.exp(-Math.pow((x - 800) / 110, 2)); }
  function midY(x) { return 404 + 22 * Math.sin(x / 210 + 2.6) + 8 * Math.sin(x / 83 + 1) - 20 * Math.exp(-Math.pow((x - 170) / 150, 2)); }
  function nearY(x) { return 466 + 10 * Math.sin(x / 260 + 4) + 5 * Math.sin(x / 97); }
  function hillPath(g, fn) {
    g.beginPath(); g.moveTo(0, H);
    for (var x = 0; x <= W; x += 8) g.lineTo(x, fn(x));
    g.lineTo(W, H); g.closePath();
  }
  function texture(g, fn, R, n, y0, y1, colors, lmin, lmax, wid) {
    g.save(); hillPath(g, fn); g.clip();
    g.lineCap = 'round';
    for (var c = 0; c < colors.length; c++) {
      g.strokeStyle = colors[c]; g.lineWidth = wid; g.beginPath();
      for (var i = 0; i < n / colors.length; i++) {
        var x = R() * W, top = fn(x), y = top + Math.pow(R(), 1.4) * (y1 - top);
        if (y > y1) continue;
        var depth = (y - y0) / (y1 - y0), l = lmin + (lmax - lmin) * depth * (0.6 + R() * 0.8);
        var lean = (R() - 0.5) * l * 0.5 + dirSign * l * 0.15;
        g.moveTo(x, y); g.lineTo(x + lean, y - l);
      }
      g.stroke();
    }
    g.restore();
  }

  function cumulus(g, x, y, w, h, light, shade, R) {
    var n = 7 + Math.floor(R() * 4), puffs = [], i;
    for (i = 0; i < n; i++) {
      var f = i / (n - 1), r = h * (0.28 + 0.55 * Math.sin(Math.PI * (0.1 + f * 0.8))) * (0.8 + R() * 0.35);
      puffs.push([x + w * (0.08 + f * 0.84) + (R() - 0.5) * w * 0.06, y - r * 0.55, r]);
    }
    for (i = 0; i < 4; i++) {  // second tier on top
      var f2 = 0.25 + R() * 0.5, r2 = h * (0.25 + R() * 0.2);
      puffs.push([x + w * f2, y - h * 0.55 - r2 * 0.4, r2]);
    }
    g.save(); g.beginPath(); g.rect(x - w, y - h * 3, w * 3, h * 3 + 2); g.clip();
    g.fillStyle = shade; g.beginPath();
    for (i = 0; i < puffs.length; i++) { g.moveTo(puffs[i][0] + puffs[i][2], puffs[i][1]); g.arc(puffs[i][0], puffs[i][1], puffs[i][2], 0, 6.2832); }
    g.fill();
    g.fillStyle = light; g.beginPath();
    for (i = 0; i < puffs.length; i++) {
      var p = puffs[i], r3 = p[2] * 0.86;
      g.moveTo(p[0] - p[2] * 0.12 + r3, p[1] - p[2] * 0.16); g.arc(p[0] - p[2] * 0.12, p[1] - p[2] * 0.16, r3, 0, 6.2832);
    }
    g.fill();
    var bg = g.createLinearGradient(0, y - h * 0.35, 0, y);
    bg.addColorStop(0, rgba(shade, 0)); bg.addColorStop(1, rgba(shade, 0.85));
    g.fillStyle = bg; g.fillRect(x - w * 0.1, y - h * 0.35, w * 1.2, h * 0.35 + 2);
    g.restore();
  }

  function tree(g, x, y, s, R) {
    var S = season, cov = S.cover, i, j, c;
    g.fillStyle = 'rgba(0,0,0,' + (0.05 + 0.08 * cov) + ')'; ellipse(g, x + 16 * s, y + 3, (40 + 30 * cov) * s, 8 * s); g.fill();
    if (S.turn > 0.2) {   // leaves already down, mostly downwind of the trunk
      var nl = Math.round(70 * S.turn * (1.15 - cov));
      for (i = 0; i < nl; i++) {
        var lx = x + (R() - 0.35 + 0.15 * dirSign) * 190 * s, ly = y - 3 + R() * 10 * s;
        g.fillStyle = rgba(pal.leaf[i % pal.leaf.length], 0.85); ellipse(g, lx, ly, (1.4 + R() * 1.4) * s, 0.9 * s); g.fill();
      }
    }
    var bark = phase === 'night' ? '#1a1712' : '#5a4330';
    g.fillStyle = bark;
    g.beginPath(); g.moveTo(x - 8 * s, y); g.quadraticCurveTo(x - 3 * s, y - 30 * s, x - 5 * s, y - 62 * s);
    g.lineTo(x + 5 * s, y - 62 * s); g.quadraticCurveTo(x + 3 * s, y - 30 * s, x + 9 * s, y); g.closePath(); g.fill();
    var cl = [[0, -84, 44], [-40, -66, 33], [40, -68, 35], [-20, -106, 32], [24, -108, 33], [2, -128, 25], [-58, -48, 22], [60, -50, 23], [-2, -60, 30]];
    // limbs and twigs: hidden under a full summer canopy, showing through as it thins
    g.strokeStyle = bark; g.lineCap = 'round';
    function branch(x0, y0, ang, len, wd, depth) {
      var x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, bend = (R() - 0.5) * 0.5;
      g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + Math.cos(ang + bend) * len * 0.5, y0 + Math.sin(ang + bend) * len * 0.5, x1, y1); g.stroke();
      if (depth <= 0) return;
      var n = R() < 0.4 ? 3 : 2;
      for (var k = 0; k < n; k++)   // forks spread out and lean a little upward
        branch(x1, y1, ang + (k - (n - 1) / 2) * 0.6 + (R() - 0.5) * 0.3 - 0.12 * Math.cos(ang), len * (0.55 + R() * 0.15), wd * 0.6, depth - 1);
    }
    for (i = 0; i < cl.length - 1; i++) {
      c = cl[i]; var dx = c[0], dy = c[1] + 56;
      branch(x, y - 56 * s, Math.atan2(dy, dx), Math.sqrt(dx * dx + dy * dy) * 0.6 * s, (c[2] > 30 ? 4.5 : 3.4) * s, 2);
    }
    if (cov < 0.02 && S.bloom < 0.05) return;
    // canopy: clusters shrink and drop out as the leaves come down
    var keep = [], rs = 0.68 + 0.32 * cov;
    for (i = 0; i < cl.length; i++) if (i === 0 || i === 8 || R() < cov + 0.3) keep.push(cl[i]);
    if (cov > 0.02) {
      g.fillStyle = pal.tree; g.beginPath();
      for (i = 0; i < keep.length; i++) { var cx = x + keep[i][0] * s, cy = y + keep[i][1] * s, r = keep[i][2] * rs * s; g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, 6.2832); }
      g.fill();
      g.fillStyle = rgba(pal.treeHi, 0.8 - 0.25 * S.turn); g.beginPath();
      for (i = 0; i < keep.length; i++) {
        var hx = x + (keep[i][0] - keep[i][2] * 0.28) * s, hy = y + (keep[i][1] - keep[i][2] * 0.32) * s, hr = keep[i][2] * 0.62 * rs * s;
        g.moveTo(hx + hr, hy); g.arc(hx, hy, hr, 0, 6.2832);
      }
      g.fill();
    }
    // dabs of separate leaves: sunlit speckle in summer, mixed reds and golds once they turn
    var nd = Math.round(40 * cov + 200 * cov * S.turn);
    for (i = 0; i < nd; i++) {
      c = keep[Math.floor(R() * keep.length)];
      var a = R() * 6.28, d = Math.sqrt(R()) * c[2] * rs * 1.1 * s, sx = x + c[0] * s + Math.cos(a) * d, sy = y + c[1] * s + Math.sin(a) * d;
      g.fillStyle = i < 40 * cov && S.turn < 0.5 ? rgba(mix(pal.treeHi, '#ffffff', 0.25), 0.5) : rgba(pal.leaf[i % pal.leaf.length], 0.9);
      g.beginPath(); g.arc(sx, sy, (1.3 + R() * (S.turn > 0.5 ? 1.6 : 2.4)) * s, 0, 6.2832); g.fill();
    }
    var nb = Math.round(110 * S.bloom), bl = BLOSSOM[phase];
    for (i = 0; i < nb; i++) {   // spring blossom
      c = keep[Math.floor(R() * keep.length)];
      var ba = R() * 6.28, bd = Math.sqrt(R()) * c[2] * 1.05 * s;
      g.fillStyle = bl[i % bl.length]; g.beginPath(); g.arc(x + c[0] * s + Math.cos(ba) * bd, y + c[1] * s + Math.sin(ba) * bd, (1.4 + R() * 1.6) * s, 0, 6.2832); g.fill();
    }
  }

  /* ---------------- holidays ----------------
   * A jack-o'-lantern in the field and by the cottage door in late October; snow on the roof,
   * coloured lights on the cottage and the tree from December to Twelfth Night; fireworks over
   * the hills on the Fourth of July and at New Year. Preview with ?holiday=halloween|winter|fireworks. */
  function localDate() { var off = lastW && lastW.utc_offset != null ? lastW.utc_offset : -new Date().getTimezoneOffset() * 60; return new Date(Date.now() + timeShift + off * 1000); }
  function holiday() {
    var p = param('holiday');
    if (p) return p;
    var d = localDate(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    if (m === 10 && day >= 17) return 'halloween';
    if (m === 12 || (m === 1 && day <= 6)) return 'winter';
    return '';
  }
  function fireworksNow() {
    if (param('holiday') === 'fireworks') return true;
    var d = localDate(), m = d.getUTCMonth() + 1, day = d.getUTCDate(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    return (m === 7 && day === 4 && h >= 21.2 && h < 22.6) || (m === 12 && day === 31 && h >= 23.95) || (m === 1 && day === 1 && h < 0.5);
  }
  function jackOLantern(g, x, y, s) {
    var lit = phase !== 'day' || pal.oc > 0.6, i;
    g.save(); g.translate(x, y); g.scale(s, s);
    if (lit) { var gl = g.createRadialGradient(0, -12, 0, 0, -12, 50); gl.addColorStop(0, 'rgba(255,160,70,0.4)'); gl.addColorStop(1, 'rgba(255,160,70,0)'); g.fillStyle = gl; g.fillRect(-50, -62, 100, 100); }
    var body = phase === 'night' ? '#9a4a1a' : '#e07a22', rib = phase === 'night' ? '#6e3410' : '#b85a14';
    g.fillStyle = 'rgba(0,0,0,0.22)'; ellipse(g, 2, 0, 24, 4); g.fill();
    for (i = -2; i <= 2; i++) { g.fillStyle = Math.abs(i) === 2 ? rib : body; ellipse(g, i * 6.5, -12, 9 + (2 - Math.abs(i)) * 1.2, 12.5); g.fill(); }
    g.fillStyle = '#4c6a2a'; g.beginPath(); g.moveTo(-1.5, -23); g.quadraticCurveTo(0, -30, 4, -31); g.lineTo(4, -28); g.quadraticCurveTo(2, -27, 1.5, -23); g.fill();
    g.fillStyle = lit ? '#ffd36a' : '#3a1a08';
    g.beginPath(); g.moveTo(-9, -16); g.lineTo(-3, -16); g.lineTo(-6, -21); g.closePath(); g.moveTo(9, -16); g.lineTo(3, -16); g.lineTo(6, -21); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-11, -10); g.quadraticCurveTo(0, -1, 11, -10); g.lineTo(7, -9); g.lineTo(5, -6); g.lineTo(2, -8); g.lineTo(-1, -5); g.lineTo(-4, -8); g.lineTo(-7, -6); g.closePath(); g.fill();
    g.restore();
  }
  var BULBS = ['#ff5a5a', '#ffd84a', '#6ad1ff', '#8dff8a', '#ff7ad9'];
  function bulb(g, x, y, c, r) {
    if (phase !== 'day' || pal.oc > 0.5) { var gl = g.createRadialGradient(x, y, 0, x, y, r * 4); gl.addColorStop(0, rgba(c, 0.55)); gl.addColorStop(1, rgba(c, 0)); g.fillStyle = gl; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8); }
    g.fillStyle = mix(c, '#ffffff', 0.35); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  function cottage(g, x, y) {
    var night = phase === 'night';
    g.fillStyle = 'rgba(0,0,0,0.12)'; ellipse(g, x + 4, y + 1, 22, 3); g.fill();
    g.fillStyle = night ? '#4a5168' : mix('#f1e8d6', GREY[phase], pal.oc * 0.3); g.fillRect(x - 14, y - 14, 28, 14);
    g.fillStyle = night ? '#3a2a30' : '#b4513b';
    g.beginPath(); g.moveTo(x - 18, y - 13); g.lineTo(x, y - 27); g.lineTo(x + 18, y - 13); g.closePath(); g.fill();
    g.fillRect(x + 7, y - 28, 4, 9);
    g.fillStyle = night ? '#ffcf73' : '#5b6b7c'; g.fillRect(x - 8, y - 10, 5, 5); g.fillRect(x + 3, y - 10, 5, 5);
    if (night) {
      var gl = g.createRadialGradient(x, y - 8, 0, x, y - 8, 30);
      gl.addColorStop(0, 'rgba(255,200,110,0.35)'); gl.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = gl; g.fillRect(x - 30, y - 38, 60, 60);
    }
    var hol = holiday(), i;
    if (hol === 'winter' || kind === 'snow' || kind === 'blizzard') {   // snow on the roof
      g.fillStyle = night ? '#c9d2e6' : '#ffffff';
      g.beginPath(); g.moveTo(x - 19, y - 12); g.lineTo(x, y - 28); g.lineTo(x + 19, y - 12); g.quadraticCurveTo(x + 9, y - 15, x, y - 14.5); g.quadraticCurveTo(x - 10, y - 15, x - 19, y - 12); g.fill();
      g.fillRect(x + 6.5, y - 30, 5, 2.5);
    }
    if (hol === 'winter') for (i = 0; i <= 6; i++) bulb(g, x - 15 + i * 5, y - 12 + Math.abs(i - 3) * 0.6, BULBS[i % 5], 0.9);   // lights along the eaves
    if (hol === 'halloween') jackOLantern(g, x - 20, y + 1, 0.32);
  }

  /* The real sun: elevation and compass bearing for this place and moment (low-precision
   * NOAA formulas, well under a degree off). We look south, so east is on the left.
   * Bearing maps to x (due south = centre), elevation to height above the far hills at that
   * x, so the sun rises and sets on the hilltops. Low elevations get stretched (a power curve),
   * so a sun that only reaches 4 degrees, like a November noon in the far north, still clears them. */
  var RAD = Math.PI / 180;
  function sunPosition(ms) { return Sky.sun(ms, lat, lon); }
  function moonPosition(ms) { return Sky.moon(ms, lat, lon); }
  function toScreen(p) {
    // North of the equator the midday sun is due south, so we face south (east on the left);
    // south of it we face north, so east is on the right.
    var off = lat >= 0 ? p.az - 180 : ((p.az + 180) % 360) - 180;
    if (lat < 0) off = -off;
    // e: height above the visible horizon. Sunrise is when the disc's top edge clears it, at
    // -0.833 degrees (the air bends the light, plus the disc's half-width), the same line the
    // sunrise times use; so at e = 0 the disc (radius 24) sits just under the hilltop, and on a
    // polar-night day it stays down with only its glow showing.
    var x = 512 + off / 120 * 470, h = farY(Math.max(0, Math.min(W, x))) + 25, e = p.el + 0.833;
    return [x, e > 0 ? Math.max(36, h - 300 * Math.pow(e / 75, 0.7)) : h - e * 50, p.el];
  }
  function sunXY() { return toScreen(sunPosition(Date.now() + timeShift)); }
  var SUN_R = 260;
  function buildSun() {
    var g = sunEl.getContext('2d'), c = SUN_R, gr;
    sunEl.width = sunEl.height = SUN_R * 2;
    g.clearRect(0, 0, SUN_R * 2, SUN_R * 2);
    if (phase === 'night') { sunEl.style.display = 'none'; return; }
    var glowR = phase === 'golden' ? 260 : 190, gc = phase === 'golden' ? '255,200,130' : '255,250,225';
    gr = g.createRadialGradient(c, c, 0, c, c, glowR);
    gr.addColorStop(0, 'rgba(' + gc + ',' + (0.75 - pal.oc * 0.55) + ')'); gr.addColorStop(0.25, 'rgba(' + gc + ',' + (0.3 - pal.oc * 0.2) + ')');
    gr.addColorStop(1, 'rgba(' + gc + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, SUN_R * 2, SUN_R * 2);
    if (pal.oc < 0.5) { g.fillStyle = phase === 'golden' ? '#ffe2a8' : '#fffbea'; g.beginPath(); g.arc(c, c, 24, 0, 6.2832); g.fill(); }
    placeSun();
  }
  function placeSun() {
    if (phase === 'night') return;
    var s = sunXY();
    sunEl.style.display = s[2] < -4 ? 'none' : 'block';   // below the hills
    setXY(sunEl, s[0] - SUN_R, s[1] - SUN_R);
  }
  setInterval(placeSun, 30000);

  /* The real moon: position like the sun, the right phase, and its lit side turned toward
   * wherever the sun is (even below the horizon), so waxing and waning come out right. */
  var MOON_R = 120;
  function placeMoon() {
    if (!moonEl) return;
    var ms = Date.now() + timeShift, m = moonPosition(ms), xy = toScreen(m), sxy = toScreen(sunPosition(ms));
    var night = phase === 'night';
    if (m.el < -4 || m.lit < 0.03 || pal.oc > (night ? 0.6 : 0.45)) { moonEl.style.display = 'none'; return; }
    moonEl.style.display = 'block';
    moonEl.width = moonEl.height = MOON_R * 2;
    var g = moonEl.getContext('2d'), c = MOON_R, r = 21, i;
    g.clearRect(0, 0, MOON_R * 2, MOON_R * 2);
    if (night) {
      var gr = g.createRadialGradient(c, c, 0, c, c, MOON_R);
      gr.addColorStop(0, 'rgba(240,235,210,' + (0.12 + 0.25 * m.lit) + ')'); gr.addColorStop(1, 'rgba(240,235,210,0)');
      g.fillStyle = gr; g.fillRect(0, 0, MOON_R * 2, MOON_R * 2);
      g.fillStyle = 'rgba(120,135,170,0.18)'; g.beginPath(); g.arc(c, c, r, 0, 6.2832); g.fill();   // earthshine
    }
    g.save(); g.translate(c, c); g.rotate(Math.atan2(sxy[1] - xy[1], sxy[0] - xy[0]));
    // lit limb on the +x side, terminator an ellipse that sweeps from crescent to full
    var k = 1 - 2 * m.lit;
    g.beginPath(); g.moveTo(0, -r);
    for (i = 0; i <= 24; i++) { var a = -Math.PI / 2 + Math.PI * i / 24; g.lineTo(r * Math.cos(a), r * Math.sin(a)); }
    for (i = 0; i <= 24; i++) { var b = Math.PI / 2 - Math.PI * i / 24; g.lineTo(r * k * Math.cos(b), r * Math.sin(b)); }
    g.closePath();
    g.fillStyle = night ? '#f3eed8' : 'rgba(255,255,255,0.6)'; g.fill();
    g.clip();
    g.fillStyle = night ? 'rgba(190,190,170,0.35)' : 'rgba(170,190,215,0.25)';
    g.beginPath(); g.arc(-6, -5, 5, 0, 6.2832); g.arc(7, 6, 3.5, 0, 6.2832); g.arc(4, -9, 2.5, 0, 6.2832); g.fill();
    g.restore();
    setXY(moonEl, xy[0] - MOON_R, xy[1] - MOON_R);
  }
  setInterval(placeMoon, 30000);

  function drawBackdrop() {
    var g = bctx, R = seeded(11), i, gr;
    gr = g.createLinearGradient(0, 0, 0, 470);
    gr.addColorStop(0, pal.skyTop); gr.addColorStop(0.55, pal.skyMid); gr.addColorStop(1, pal.skyLow);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);

    if (phase === 'night' && pal.oc < 0.6) {
      g.fillStyle = '#ffffff';
      for (i = 0; i < 170; i++) {
        var sx = R() * W, sy = Math.pow(R(), 1.6) * 330, sr = R() < 0.08 ? 1.6 : 0.5 + R() * 0.8;
        g.globalAlpha = (0.35 + R() * 0.6) * (1 - sy / 380); g.beginPath(); g.arc(sx, sy, sr, 0, 6.2832); g.fill();
      }
      g.globalAlpha = 1;
    }

    g = lctx; g.clearRect(0, 0, W, H);
    // towering cumulus sitting on the horizon, behind the far hills
    if (kind !== 'clear' && pal.oc < 0.75) {   // a clear sky gets no cloud bank, so the sun stays in view
      cumulus(g, 560, 352, 330, 150, pal.cloud, pal.cloudSh, R);
      cumulus(g, 20, 360, 230, 95, pal.cloud, pal.cloudSh, R);
      cumulus(g, 880, 340, 170, 70, pal.cloud, pal.cloudSh, R);
    }

    gr = g.createLinearGradient(0, 315, 0, 420);
    gr.addColorStop(0, pal.farHi); gr.addColorStop(1, pal.far);
    hillPath(g, farY); g.fillStyle = gr; g.fill();
    texture(g, farY, R, 260, 330, 420, [rgba(pal.farHi, 0.35)], 2, 4, 1);
    gr = g.createLinearGradient(0, 320, 0, 420);    // haze
    gr.addColorStop(0, rgba(pal.skyLow, 0.05)); gr.addColorStop(1, rgba(pal.skyLow, 0.45 + pal.oc * 0.3));
    hillPath(g, farY); g.fillStyle = gr; g.fill();

    gr = g.createLinearGradient(0, 375, 0, 480);
    gr.addColorStop(0, pal.midHi); gr.addColorStop(1, pal.mid);
    hillPath(g, midY); g.fillStyle = gr; g.fill();
    for (i = 0; i < 4; i++) {   // sunlit patches
      var px = 100 + R() * 820, py = midY(px) + 18 + R() * 20;
      gr = g.createRadialGradient(px, py, 0, px, py, 110);
      gr.addColorStop(0, rgba(pal.midHi, 0.5)); gr.addColorStop(1, rgba(pal.midHi, 0));
      g.save(); hillPath(g, midY); g.clip(); g.fillStyle = gr; g.fillRect(px - 110, py - 110, 220, 220); g.restore();
    }
    texture(g, midY, R, 900, 380, 480, [rgba(pal.mid, 0.6), rgba(pal.midHi, 0.55), rgba(mix(pal.mid, '#000000', 0.2), 0.4)], 2, 6, 1.2);
    g.strokeStyle = rgba(mix(pal.midHi, '#ffffff', 0.3), 0.45); g.lineWidth = 2; g.beginPath();
    for (var x = 0; x <= W; x += 8) { if (x) g.lineTo(x, midY(x) + 1); else g.moveTo(x, midY(x) + 1); }
    g.stroke();
    tree(g, 172, midY(172) + 6, 1, R);
    if (holiday() === 'winter') {   // a string of coloured lights wound round the tree
      var tr0 = seeded(7), ty = midY(172) + 6;
      for (i = 0; i < 26; i++) { var u = i / 26, bx = 172 + Math.sin(u * 6.2832 * 3) * (62 - u * 30), by = ty - 50 - u * 95 + tr0() * 6; bulb(g, bx, by, BULBS[i % 5], 1.6); }
    }
    cottage(g, 925, midY(925) + 4);

    gr = g.createLinearGradient(0, 455, 0, H);
    gr.addColorStop(0, pal.near); gr.addColorStop(1, pal.nearLo);
    hillPath(g, nearY); g.fillStyle = gr; g.fill();
    if (pal.oc > 0.05 && pal.oc < 0.6) {   // a drifting cloud's shadow
      gr = g.createRadialGradient(300, 560, 0, 300, 560, 220);
      gr.addColorStop(0, 'rgba(0,20,10,0.16)'); gr.addColorStop(1, 'rgba(0,20,10,0)');
      g.fillStyle = gr; g.fillRect(80, 340, 440, 440);
    }
    texture(g, nearY, R, 2600, 460, H, [rgba(pal.nearLo, 0.55), rgba(mix(pal.near, pal.midHi, 0.5), 0.5), rgba(pal.near, 0.6)], 3, 20, 1.6);
    // wildflowers scattered through the field
    var fl = phase === 'night' ? ['#9fb0c8', '#c4c9a8'] : ['#ffffff', '#ffe27a', '#f5b3c4', '#cfe0ff'];
    var nf = Math.round(90 * (1 - season.dry * 0.85) + 60 * season.bloom);
    for (i = 0; i < nf; i++) {
      var fx = R() * W, top = nearY(fx), fy = top + 8 + Math.pow(R(), 1.3) * (H - top - 8);
      var fr = 0.8 + (fy - 460) / 300 * 2.6;
      g.fillStyle = fl[i % fl.length]; g.globalAlpha = 0.85; g.beginPath(); g.arc(fx, fy, fr, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    if (holiday() === 'halloween') jackOLantern(g, 846, 606, 1.25);   // in the field, half in the grass
    var litter = kind === 'snow' || kind === 'blizzard' ? 0 : Math.round(80 * season.turn * (1.2 - season.cover * 0.6));
    for (i = 0; i < litter; i++) {   // fallen leaves blown into the field
      var qx = R() * W, qt = nearY(qx), qy = qt + 10 + Math.pow(R(), 1.2) * (H - qt - 10), qs = 1 + (qy - 460) / 300 * 3;
      g.save(); g.translate(qx, qy); g.rotate(R() * 6.28); g.fillStyle = rgba(pal.leaf[i % pal.leaf.length], 0.8);
      ellipse(g, 0, 0, 2.2 * qs, 1.1 * qs); g.fill(); g.restore();
    }
    if (kind === 'fog') {
      gr = g.createLinearGradient(0, 250, 0, 560);
      gr.addColorStop(0, rgba(GREY[phase], 0)); gr.addColorStop(0.5, rgba(mix(GREY[phase], '#ffffff', 0.3), 0.55)); gr.addColorStop(1, rgba(GREY[phase], 0.15));
      g.fillStyle = gr; g.fillRect(0, 250, W, 310);
    }
  }

  /* ---------------- moving clouds and wind waves (DOM, moved by transform) ---------------- */
  var clouds = [], waves = [];
  function setXY(el, x, y) { var t = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; el.style.webkitTransform = t; el.style.transform = t; }
  function buildClouds() {
    cloudBox.innerHTML = ''; clouds = [];
    var n = pal.oc < 0.05 ? 2 : pal.oc < 0.3 ? 4 : 6, R = seeded(23);
    for (var i = 0; i < n; i++) {
      var w = 150 + R() * 140, h = w * 0.42, c = mk(Math.round(w * 1.3), Math.round(h * 1.9));
      cumulus(c.getContext('2d'), w * 0.12, h * 1.75, w, h, pal.cloud, pal.cloudSh, R);
      c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '0';
      c.style.opacity = pal.oc > 0.5 ? 0.85 : 0.95;
      cloudBox.appendChild(c);
      clouds.push({ el: c, x: R() * (W + 300) - 300, y: 20 + R() * 190, v: 0.6 + R() * 0.6, w: c.width });
    }
    waveBox.innerHTML = ''; waves = [];
    if (phase === 'night' || kind === 'snow' || kind === 'blizzard') return;
    for (i = 0; i < 3; i++) {
      var d = document.createElement('div');
      d.className = 'wave';
      waveBox.appendChild(d);
      waves.push({ el: d, x: i * 420, y: 470 + i * 52, v: 0.8 + i * 0.25 });
    }
  }

  /* ---------------- the painter ---------------- */
  var PX = 562, PY = 318, PW = 200, PH = 150;     // the canvas on the easel (design coords)
  var PIVOT = [536, 560], SHOULDER = [584, 416], L1 = 64, L2 = 60, BRUSH = 54;
  var sprBack = null, sprFront = null, sprBody = null, linen = null;
  var painting = mk(PW, PH), pctx = painting.getContext('2d');
  pctx.fillStyle = '#efe7d6'; pctx.fillRect(0, 0, PW, PH);

  function place(c, x, y) { c.style.position = 'absolute'; c.style.left = x + 'px'; c.style.top = y + 'px'; figBox.appendChild(c); return c; }
  function sprite(paint, tint) {
    var c = mk(FW, FH), g = c.getContext('2d');
    g.translate(-FX, -FY); paint(g); g.setTransform(1, 0, 0, 1, 0, 0);
    if (tint) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.fillRect(0, 0, FW, FH); }
    return c;
  }
  function line(g, x0, y0, x1, y1, w, c) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  var WOOD = '#8b6142', WOOD_SH = '#5f4129';
  var rainy = function () { return kind === 'drizzle' || kind === 'rain' || kind === 'heavy' || kind === 'storm'; };

  function buildFigure() {
    var tint = pal.tint ? (phase === 'night' ? 'rgba(18,30,72,0.55)' : pal.tint) : (pal.oc > 0.4 ? 'rgba(90,100,115,0.18)' : null);
    sprBack = sprite(function (g) {
      g.lineCap = 'round';
      g.fillStyle = 'rgba(10,25,10,0.22)'; ellipse(g, 664, 690, 86, 9); g.fill();
      ellipse(g, 544, 716, 96, 12); g.fill();
      if (rainy()) {   // oiled-paper umbrella planted in the ground behind him
        line(g, 452, 712, 532, 248, 4, '#4a3828');
        g.fillStyle = '#3e5582'; g.beginPath(); g.moveTo(392, 278);
        g.quadraticCurveTo(420, 212, 532, 206); g.quadraticCurveTo(648, 212, 676, 280);
        g.quadraticCurveTo(650, 268, 620, 278); g.quadraticCurveTo(590, 266, 560, 278);
        g.quadraticCurveTo(532, 266, 504, 278); g.quadraticCurveTo(476, 266, 448, 278);
        g.quadraticCurveTo(420, 266, 392, 278); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5;
        for (var r = 0; r < 5; r++) { g.beginPath(); g.moveTo(532, 207); g.lineTo(420 + r * 57, 274); g.stroke(); }
      }
      line(g, 662, 300, 678, 640, 6, WOOD_SH);            // back leg
      line(g, 642, 292, 592, 690, 7, WOOD);               // front legs
      line(g, 680, 292, 738, 690, 7, WOOD);
      line(g, 662, 300, 662, 560, 8, WOOD_SH);            // mast
      line(g, 608, 600, 724, 600, 5, WOOD_SH);            // crossbar
      g.fillStyle = 'rgba(30,20,10,0.45)'; g.fillRect(PX + 3, PY + 3, PW, PH);   // canvas edge
      if (phase === 'night') {   // lantern on the ground
        g.fillStyle = '#2b2620'; g.fillRect(606, 682, 16, 22); g.fillRect(604, 678, 20, 5);
        g.fillStyle = '#ffd27a'; g.fillRect(609, 686, 10, 15);
        line(g, 614, 678, 614, 670, 2, '#2b2620');
      }
      // his legs: shins coming down in front of the stool, heels toward us; the stool
      // (drawn in the front layer) partly hides them
      g.fillStyle = 'rgba(10,25,10,0.25)'; ellipse(g, 488, 690, 20, 5); g.fill(); ellipse(g, 598, 686, 20, 5); g.fill();
      g.lineCap = 'round';
      line(g, 518, 572, 492, 676, 19, '#45372c'); line(g, 558, 572, 594, 672, 19, '#4b3c30');
      line(g, 513, 600, 496, 664, 3, 'rgba(255,255,255,0.08)');
      g.fillStyle = '#d9cfbb'; g.fillRect(482, 670, 20, 5); g.fillRect(585, 666, 20, 5);   // socks
      g.fillStyle = '#2f231b'; g.beginPath();
      g.moveTo(479, 676); g.quadraticCurveTo(477, 692, 490, 692); g.quadraticCurveTo(503, 692, 502, 676); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(585, 671); g.quadraticCurveTo(583, 688, 596, 688); g.quadraticCurveTo(609, 688, 607, 671); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(482, 678, 4, 8); g.fillRect(588, 673, 4, 8);
      // a paint box and a jar of brushes by the easel
      g.fillStyle = '#6e4b30'; g.fillRect(684, 668, 48, 22); g.fillStyle = '#86603f'; g.fillRect(684, 664, 48, 6);
      g.fillStyle = 'rgba(190,215,225,0.75)'; g.fillRect(642, 664, 16, 24);
      line(g, 646, 664, 640, 640, 2, '#5a3b24'); line(g, 651, 664, 654, 636, 2, '#7a4e2c'); line(g, 655, 664, 664, 642, 2, '#5a3b24');
    }, tint);
    sprFront = sprite(function (g) {   // easel ledge and clamp, then the stool he sits on
      g.fillStyle = WOOD; g.fillRect(PX - 12, PY + PH, PW + 24, 8);
      g.fillStyle = WOOD_SH; g.fillRect(PX - 12, PY + PH + 7, PW + 24, 3);
      g.fillStyle = WOOD; g.fillRect(652, PY - 10, 20, 12);
      line(g, 508, 566, 494, 714, 6, WOOD); line(g, 566, 566, 582, 714, 6, WOOD); line(g, 538, 570, 540, 704, 5, WOOD_SH);
      line(g, 500, 650, 578, 652, 4, WOOD_SH);
      g.fillStyle = '#9a7049'; ellipse(g, 537, 566, 44, 9); g.fill();
      g.fillStyle = '#4b3c30'; ellipse(g, 539, 562, 45, 11); g.fill();
    }, tint);
    sprBody = sprite(function (g) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      // left arm resting low, holding the palette
      line(g, 500, 424, 482, 482, 15, '#e9e0cb'); line(g, 482, 482, 470, 512, 12, '#e9e0cb');
      g.fillStyle = '#d7c29a'; g.beginPath();
      g.moveTo(428, 514); g.quadraticCurveTo(436, 488, 470, 492); g.quadraticCurveTo(500, 498, 494, 520);
      g.quadraticCurveTo(486, 540, 452, 536); g.quadraticCurveTo(424, 532, 428, 514); g.closePath(); g.fill();
      var dabs = [['#c8473a', 440, 512], ['#3f6fb5', 452, 503], ['#f1c84c', 466, 500], ['#fbf6ea', 478, 506], ['#4f8f45', 448, 524]];
      for (var d = 0; d < dabs.length; d++) { g.fillStyle = dabs[d][0]; ellipse(g, dabs[d][1], dabs[d][2], 5, 3.5); g.fill(); }
      g.fillStyle = '#efc9a4'; g.beginPath(); g.arc(470, 514, 6, 0, 6.2832); g.fill();
      // back: cream shirt with broad, slightly hunched shoulders, brown waistcoat over it
      var sg = g.createLinearGradient(484, 0, 594, 0);
      sg.addColorStop(0, '#cfc4ab'); sg.addColorStop(0.6, '#ece3cf'); sg.addColorStop(1, '#f4ecdb');
      g.fillStyle = sg; g.beginPath();
      g.moveTo(498, 566); g.bezierCurveTo(486, 520, 482, 468, 487, 438);
      g.quadraticCurveTo(491, 410, 516, 403); g.quadraticCurveTo(530, 398, 538, 398);
      g.quadraticCurveTo(548, 398, 562, 403); g.quadraticCurveTo(591, 410, 593, 440);
      g.bezierCurveTo(595, 482, 590, 530, 580, 566); g.closePath(); g.fill();
      var vg = g.createLinearGradient(496, 0, 584, 0);
      vg.addColorStop(0, '#523b2a'); vg.addColorStop(0.55, '#76563b'); vg.addColorStop(1, '#876548');
      g.fillStyle = vg; g.beginPath();
      g.moveTo(502, 566); g.bezierCurveTo(496, 530, 496, 482, 500, 456);
      g.quadraticCurveTo(512, 444, 518, 410); g.lineTo(530, 401); g.lineTo(548, 401); g.lineTo(560, 408);
      g.quadraticCurveTo(566, 444, 582, 456); g.bezierCurveTo(586, 486, 584, 530, 577, 566); g.closePath(); g.fill();
      line(g, 539, 404, 538, 562, 1.5, 'rgba(40,25,15,0.35)');
      g.fillStyle = 'rgba(40,25,15,0.3)'; g.fillRect(506, 520, 66, 5);   // waistcoat belt
      g.fillStyle = '#b9a98a'; g.fillRect(533, 521, 10, 3);
      g.fillStyle = 'rgba(80,60,40,0.18)'; g.beginPath(); g.moveTo(487, 440); g.quadraticCurveTo(486, 500, 498, 566); g.lineTo(504, 566); g.quadraticCurveTo(492, 500, 496, 446); g.fill();
      // nape, ears and the back of a white-haired head
      g.fillStyle = '#e2b28d'; g.beginPath(); g.moveTo(526, 404); g.lineTo(528, 378); g.lineTo(549, 378); g.lineTo(551, 404); g.closePath(); g.fill();
      g.fillStyle = 'rgba(150,90,60,0.25)'; g.fillRect(528, 384, 21, 4);
      g.fillStyle = '#e6b28c'; ellipse(g, 515, 361, 5, 8); g.fill(); ellipse(g, 561, 360, 5, 8); g.fill();
      g.fillStyle = '#d9d3c9'; g.beginPath(); g.arc(538, 356, 23, Math.PI, 0); g.lineTo(560, 368);
      g.quadraticCurveTo(556, 380, 548, 377); g.quadraticCurveTo(543, 384, 538, 378); g.quadraticCurveTo(532, 384, 527, 377);
      g.quadraticCurveTo(519, 380, 516, 368); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(140,130,118,0.55)'; g.lineWidth = 1;
      for (var hs = 0; hs < 7; hs++) { g.beginPath(); g.moveTo(522 + hs * 5, 350); g.quadraticCurveTo(521 + hs * 5.4, 364, 524 + hs * 4.8, 375); g.stroke(); }
      g.fillStyle = '#f2efe9'; g.beginPath(); g.moveTo(558, 372); g.quadraticCurveTo(572, 380, 566, 396); g.quadraticCurveTo(558, 388, 555, 378); g.closePath(); g.fill();
      // straw hat with a red band
      g.fillStyle = '#b8954e'; ellipse(g, 538, 348, 56, 15); g.fill();
      g.fillStyle = '#e3c37c'; ellipse(g, 538, 345, 56, 14); g.fill();
      g.strokeStyle = 'rgba(150,115,55,0.45)'; g.lineWidth = 1;
      for (var r = 0; r < 3; r++) { ellipse(g, 538, 345, 46 - r * 9, 11 - r * 2); g.stroke(); }
      g.fillStyle = '#d9b56c'; g.beginPath(); g.moveTo(512, 344); g.bezierCurveTo(510, 312, 566, 312, 564, 344); g.closePath(); g.fill();
      g.fillStyle = '#a2402e'; g.beginPath(); g.moveTo(512, 344); g.lineTo(513, 335); g.quadraticCurveTo(538, 330, 563, 335); g.lineTo(564, 344); g.quadraticCurveTo(538, 348, 512, 344); g.fill();
    }, tint);
    linen = mk(PW, PH);
    var lg = linen.getContext('2d'), R = seeded(5), i;
    lg.fillStyle = 'rgba(255,255,255,0.03)';
    for (i = 0; i < PH; i += 3) lg.fillRect(0, i, PW, 1);
    lg.fillStyle = 'rgba(0,0,0,0.025)';
    for (i = 0; i < PW; i += 4) lg.fillRect(i, 0, 1, PH);
    for (i = 0; i < 500; i++) { lg.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'; lg.fillRect(R() * PW, R() * PH, 1.5, 1.5); }
    var vg2 = lg.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PW * 0.7);
    vg2.addColorStop(0, 'rgba(60,40,20,0)'); vg2.addColorStop(1, 'rgba(60,40,20,0.22)');
    lg.fillStyle = vg2; lg.fillRect(0, 0, PW, PH);
    if (phase === 'night') { lg.fillStyle = 'rgba(16,28,70,0.45)'; lg.fillRect(0, 0, PW, PH); }
    else if (phase === 'golden') { lg.fillStyle = 'rgba(255,160,80,0.12)'; lg.fillRect(0, 0, PW, PH); }

    // Stack the layers as separate elements: the still ones are never redrawn, the body
    // leans with a CSS rotation, and only the arm layer and the painting change per frame.
    figBox.innerHTML = '';
    place(sprBack, FX, FY); place(painting, PX, PY); place(linen, PX, PY); place(sprFront, FX, FY);
    place(arm, AX, AY);
    place(sprBody, FX, FY);
    sprBody.style.webkitTransformOrigin = (PIVOT[0] - FX) + 'px ' + (PIVOT[1] - FY) + 'px';
    sprBody.style.transformOrigin = (PIVOT[0] - FX) + 'px ' + (PIVOT[1] - FY) + 'px';
    place(ribbon, RX, RY);
    if (phase === 'night') {   // lantern light
      var lamp = mk(FW, FH), lc = lamp.getContext('2d'), lgr = lc.createRadialGradient(614 - FX, 690 - FY, 0, 614 - FX, 690 - FY, 300);
      lgr.addColorStop(0, 'rgba(255,170,80,0.38)'); lgr.addColorStop(0.35, 'rgba(255,150,60,0.1)'); lgr.addColorStop(1, 'rgba(255,150,60,0)');
      lc.fillStyle = lgr; lc.fillRect(0, 0, FW, FH);
      place(lamp, FX, FY);
    }
    bodyAngle = null;
  }
  var bodyAngle = null;

  /* ---------------- painting a photo, stroke by stroke ---------------- */
  var layers = {}, pats = {}, cols = {}, job = null, tip = [640, 490], tipGoal = [640, 490], paintColor = '#6b8fb5';
  var idleNext = 0, lean = 0;

  function cover(src, w, h) {
    var c = mk(w, h), g = c.getContext('2d'), sw = src.width, sh = src.height, s = Math.max(w / sw, h / sh);
    g.drawImage(src, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
    return c;
  }
  function blur(src, f) { var t = mk(Math.max(2, Math.round(PW / f)), Math.max(2, Math.round(PH / f))); t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); return cover(t, PW, PH); }
  function colorAt(L, x, y) {
    var d = cols[L]; if (!d) return paintColor;
    var i = (clamp(Math.round(y), 0, PH - 1) * PW + clamp(Math.round(x), 0, PW - 1)) * 4;
    return 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')';
  }
  function stroke(L, x0, y0, x1, y1, w, dur) {
    return { L: L, x0: x0, y0: y0, x1: x1, y1: y1, cx: (x0 + x1) / 2 + rnd(-8, 8), cy: (y0 + y1) / 2 + rnd(-6, 6), w: w, dur: dur };
  }
  function grid(cols_, rows, f) { var a = []; for (var r = 0; r < rows; r++) for (var c = 0; c < cols_; c++) a.push([(c + 0.5) / cols_ * PW, (r + 0.5) / rows * PH]); return f ? shuffle(a) : a; }
  function plan() {
    var s = [], y, i, g, ang;
    for (y = 9; y < PH; y += 17) {   // broad underpainting, top to bottom
      s.push(stroke('B', rnd(-2, 6), y + rnd(-3, 3), PW * rnd(0.5, 0.6), y + rnd(-6, 6), rnd(20, 26), 0.45));
      s.push(stroke('B', PW * rnd(0.4, 0.5), y + rnd(-3, 3), PW + rnd(4, 14), y + rnd(-6, 6), rnd(20, 26), 0.45));
    }
    g = grid(7, 5, true);              // shapes
    for (i = 0; i < g.length; i++) {
      ang = -0.55 + rnd(-0.35, 0.35); var l = rnd(30, 42);
      s.push(stroke('M', g[i][0] - Math.cos(ang) * l / 2, g[i][1] - Math.sin(ang) * l / 2, g[i][0] + Math.cos(ang) * l / 2, g[i][1] + Math.sin(ang) * l / 2, rnd(14, 18), 0.3));
    }
    g = grid(11, 8, true);             // detail
    for (i = 0; i < g.length; i++) {
      ang = rnd(-1.2, 0.3); var l2 = rnd(12, 22), cx = g[i][0] + rnd(-5, 5), cy = g[i][1] + rnd(-5, 5);
      s.push(stroke('D', cx - Math.cos(ang) * l2 / 2, cy - Math.sin(ang) * l2 / 2, cx + Math.cos(ang) * l2 / 2, cy + Math.sin(ang) * l2 / 2, rnd(8, 11), 0.2));
    }
    s.push({ glaze: true, dur: 4 });   // final pass brings in the full photo
    return s;
  }
  function paintFrom(src) {
    var D = cover(src.width > 700 ? cover(src, PW * 2, PH * 2) : src, PW, PH);
    var dg = D.getContext('2d'); dg.fillStyle = 'rgba(255,232,190,0.07)'; dg.fillRect(0, 0, PW, PH);
    layers = { B: blur(D, 9), M: blur(D, 3.5), D: D };
    pats = {}; cols = {};
    for (var k in layers) {
      pats[k] = pctx.createPattern(layers[k], 'repeat');
      try { cols[k] = layers[k].getContext('2d').getImageData(0, 0, PW, PH).data; } catch (e) { cols[k] = null; }
    }
    job = { s: plan(), i: 0, mode: 'travel', t: 0, from: [tip[0] - PX, tip[1] - PY], last: null };
  }
  function bez(s, f) {
    var a = (1 - f) * (1 - f), b = 2 * (1 - f) * f, c = f * f;
    return [a * s.x0 + b * s.cx + c * s.x1, a * s.y0 + b * s.cy + c * s.y1];
  }
  function segment(s, a, b) {
    var g = pctx; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = pats[s.L];
    g.globalAlpha = s.L === 'B' ? 0.9 : 1; g.lineWidth = s.w;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l * s.w * 0.55, ny = dx / l * s.w * 0.55;
    g.globalAlpha = 0.65; g.lineWidth = s.w * 0.22;   // bristle marks along both edges
    g.beginPath(); g.moveTo(a[0] + nx, a[1] + ny); g.lineTo(b[0] + nx, b[1] + ny);
    g.moveTo(a[0] - nx, a[1] - ny); g.lineTo(b[0] - nx, b[1] - ny); g.stroke();
    g.globalAlpha = 1;
  }
  function ease(f) { return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; }
  function updatePainting(dt, t) {
    if (!job) {   // idle: brush lowered, with the odd small touch-up
      if (t > idleNext) {
        idleNext = t + rnd(9, 16);
        if (layers.D && Math.random() < 0.7) {
          var x = rnd(20, PW - 20), y = rnd(15, PH - 15), a = rnd(-1, 0.3);
          job = { s: [stroke('D', x, y, x + Math.cos(a) * 14, y + Math.sin(a) * 14, 9, 0.35)], i: 0, mode: 'travel', t: 0, from: [tip[0] - PX, tip[1] - PY], last: null, touch: true };
        } else tipGoal = [rnd(628, 652), rnd(478, 500)];
      }
      tip[0] += (tipGoal[0] - tip[0]) * Math.min(1, dt * 2.2); tip[1] += (tipGoal[1] - tip[1]) * Math.min(1, dt * 2.2);
      return;
    }
    var s = job.s[job.i];
    if (!s) { job = null; idleNext = t + 4; tipGoal = [640, 490]; return; }
    if (s.glaze) {
      job.t += dt; var f = job.t / s.dur;
      pctx.globalAlpha = Math.min(1, dt * 1.6); pctx.drawImage(layers.D, 0, 0); pctx.globalAlpha = 1;
      tip = [PX + PW * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(f * 9))), PY + PH * (0.2 + 0.6 * f)];
      paintColor = colorAt('D', tip[0] - PX, tip[1] - PY);
      if (f >= 1) { pctx.drawImage(layers.D, 0, 0); job.i++; }
      return;
    }
    if (job.mode === 'travel') {
      job.t += dt; var tf = Math.min(1, job.t / (job.touch ? 0.8 : 0.14)), e = ease(tf);
      tip = [PX + job.from[0] + (s.x0 - job.from[0]) * e, PY + job.from[1] + (s.y0 - job.from[1]) * e - Math.sin(tf * Math.PI) * 6];
      if (tf >= 1) { job.mode = 'paint'; job.t = 0; job.last = [s.x0, s.y0]; paintColor = colorAt(s.L, s.x0, s.y0); }
      return;
    }
    job.t += dt;
    var p = bez(s, Math.min(1, job.t / s.dur));
    segment(s, job.last, p); job.last = p;
    tip = [PX + p[0], PY + p[1]];
    if (job.t >= s.dur) { job.i++; job.mode = 'travel'; job.t = 0; job.from = p; }
  }

  function rot(p, a) {
    var dx = p[0] - PIVOT[0], dy = p[1] - PIVOT[1], c = Math.cos(a), s = Math.sin(a);
    return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c];
  }
  function drawFigure(t, dt) {
    var goal = clamp((tip[0] - 590) / 170 * 0.2, -0.03, 0.2) + Math.sin(t * 1.3) * 0.006;
    lean += (goal - lean) * Math.min(1, dt * 3);
    if (bodyAngle === null || Math.abs(lean - bodyAngle) > 0.001) {
      bodyAngle = lean;
      var rt = 'translate3d(0,0,0) rotate(' + lean.toFixed(4) + 'rad)';
      sprBody.style.webkitTransform = rt; sprBody.style.transform = rt;
    }
    var g = rctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, RW, RH);
    g.translate(-RX, -RY);
    g.save();
    g.translate(PIVOT[0], PIVOT[1]); g.rotate(lean); g.translate(-PIVOT[0], -PIVOT[1]);
    // hat ribbon, fluttering with the wind
    var wv = windNow(), flap = Math.min(1, wv / 35);
    g.strokeStyle = phase === 'night' ? '#4b2a2c' : '#a2402e'; g.lineWidth = 4; g.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      var ax = dirSign > 0 ? 561 : 515, ang = 1.57 - dirSign * (0.25 + flap * 1.1) + Math.sin(windPhase * 1.6 + k * 1.7) * (0.1 + flap * 0.25), len = 26 - k * 5;
      g.beginPath(); g.moveTo(ax, 341);
      g.quadraticCurveTo(ax + Math.cos(ang + dirSign * 0.3) * len * 0.5, 341 + Math.sin(ang + dirSign * 0.3) * len * 0.5, ax + Math.cos(ang) * len, 341 + Math.sin(ang) * len);
      g.stroke();
    }
    g.restore();

    g = actx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, AW, AH);
    g.translate(-AX, -AY);
    // painting arm: two-bone reach from the shoulder to the brush tip
    var S = rot(SHOULDER, lean), dx = tip[0] - S[0], dy = tip[1] - S[1], L2e = L2 + BRUSH;
    var d = clamp(Math.sqrt(dx * dx + dy * dy), Math.abs(L2e - L1) + 1, L1 + L2e - 0.5), a = Math.atan2(dy, dx);
    var b = Math.acos(clamp((L1 * L1 + d * d - L2e * L2e) / (2 * L1 * d), -1, 1));
    var E = [S[0] + Math.cos(a + b) * L1, S[1] + Math.sin(a + b) * L1];
    var fa = Math.atan2(S[1] + Math.sin(a) * d - E[1], S[0] + Math.cos(a) * d - E[0]);
    var Hd = [E[0] + Math.cos(fa) * L2, E[1] + Math.sin(fa) * L2], T = [E[0] + Math.cos(fa) * L2e, E[1] + Math.sin(fa) * L2e];
    var mid = [E[0] + Math.cos(fa) * L2 * 0.45, E[1] + Math.sin(fa) * L2 * 0.45];
    var night = phase === 'night';
    g.lineCap = 'round';
    line(g, S[0], S[1], E[0], E[1], 15, night ? '#5d6274' : '#e9e0cb');
    line(g, E[0], E[1], mid[0], mid[1], 13, night ? '#5d6274' : '#ddd2ba');
    line(g, mid[0], mid[1], Hd[0], Hd[1], 10, night ? '#6b5b5a' : '#e6b48f');
    line(g, Hd[0], Hd[1], T[0] - Math.cos(fa) * 10, T[1] - Math.sin(fa) * 10, 3, '#4a2f1c');
    line(g, T[0] - Math.cos(fa) * 12, T[1] - Math.sin(fa) * 12, T[0] - Math.cos(fa) * 7, T[1] - Math.sin(fa) * 7, 3.5, '#b9b4a8');
    line(g, T[0] - Math.cos(fa) * 7, T[1] - Math.sin(fa) * 7, T[0], T[1], 4.5, paintColor);
    g.fillStyle = night ? '#6b5b5a' : '#eab792'; g.beginPath(); g.arc(Hd[0], Hd[1], 7, 0, 6.2832); g.fill();

    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------------- foreground grass ----------------
   * Blades are drawn once into tufts (small canvases); each frame only shears them with a
   * CSS skew around their base, which the iPad's GPU does for free. Shear moves the top of
   * a blade more than its middle, so taller blades swing further, like real grass.
   */
  var tufts = [], motes = [], glow = null;
  function bladePath(g, x, base, h, w, th) {
    var tx = x + h * Math.sin(th) * 0.95, ty = base - h * Math.cos(th);
    var cx = x + h * 0.5 * Math.sin(th * 0.45), cy = base - h * 0.55;
    g.moveTo(x - w / 2, base);
    g.quadraticCurveTo(cx - w * 0.35, cy, tx, ty);
    g.quadraticCurveTo(cx + w * 0.35, cy, x + w / 2, base);
    return [tx, ty];
  }
  function makeTuft(list, colors, k, opts) {
    var minX = 1e9, maxX = -1e9, maxH = 0, i, b;
    for (i = 0; i < list.length; i++) {
      b = list[i]; var reach = b.h * Math.abs(Math.sin(b.rest)) + b.w;
      minX = Math.min(minX, b.x - reach - 8); maxX = Math.max(maxX, b.x + reach + 8); maxH = Math.max(maxH, b.h);
    }
    var cw = maxX - minX, ch = maxH + 14, base = ch, c = mk(Math.ceil(cw * GS), Math.ceil(ch * GS)), g = c.getContext('2d');
    g.scale(GS, GS);
    var tips = [];
    for (var ci = 0; ci < colors.length; ci++) {
      g.fillStyle = colors[ci]; g.beginPath();
      for (i = 0; i < list.length; i++) if (list[i].c % colors.length === ci) { b = list[i]; tips.push([b, bladePath(g, b.x - minX, base, b.h, b.w, b.rest)]); }
      g.fill();
    }
    if (opts.light) {   // sunlit edge on the tall blades
      g.strokeStyle = rgba(pal.bladeHi, phase === 'night' ? 0.25 : 0.45); g.lineWidth = 1.3; g.beginPath();
      for (i = 0; i < tips.length; i++) {
        b = tips[i][0]; if (b.h < 140) continue;
        g.moveTo(b.x - minX + b.w * 0.15, base - 30);
        g.quadraticCurveTo(b.x - minX + b.h * 0.5 * Math.sin(b.rest * 0.45), base - b.h * 0.55, tips[i][1][0], tips[i][1][1]);
      }
      g.stroke();
      g.fillStyle = phase === 'night' ? '#3b4a3a' : mix(pal.blade[2], '#d9c27a', 0.55);
      for (i = 0; i < tips.length; i++) {
        b = tips[i][0]; if (!b.head) continue;
        g.save(); g.translate(tips[i][1][0], tips[i][1][1]); g.rotate(b.rest); g.scale(3.2, 11); g.beginPath(); g.arc(0, -0.6, 1, 0, 6.2832); g.restore(); g.fill();
      }
    }
    if (opts.daisy && season.dry > 0.55) {   // gone to seed
      var t0 = tips[0][1];
      g.fillStyle = phase === 'night' ? '#38342a' : '#7a5a34'; ellipse(g, t0[0], t0[1], 4.5, 3.8); g.fill();
    } else if (opts.daisy) {
      var night = phase === 'night', t = tips[0][1];
      g.save(); g.translate(t[0], t[1]);
      g.fillStyle = night ? '#9aa6bd' : '#fbfaf3';
      for (i = 0; i < 12; i++) { g.rotate(Math.PI / 6); ellipse(g, 7, 0, 5.5, 2); g.fill(); }
      g.fillStyle = night ? '#a99b5a' : '#f2c230'; g.beginPath(); g.arc(0, 0, 3.6, 0, 6.2832); g.fill();
      g.restore();
    }
    c.style.position = 'absolute'; c.style.left = minX.toFixed(1) + 'px'; c.style.top = (H + 8 - ch).toFixed(1) + 'px';
    c.style.width = cw.toFixed(1) + 'px'; c.style.height = ch + 'px';
    var origin = (list[0].x - minX).toFixed(1) + 'px 100%';
    c.style.webkitTransformOrigin = origin; c.style.transformOrigin = origin;
    fg.appendChild(c);
    var sum = 0; for (i = 0; i < list.length; i++) sum += list[i].x;
    return { el: c, x: sum / list.length, ph: list[0].ph, k: k, last: null };
  }
  function buildGrass() {
    var R = seeded(3), i, x, all = [];
    fg.innerHTML = ''; tufts = [];
    for (i = 0; i < 45; i++) {   // short back row across the whole width
      x = R() * W;
      all.push({ x: x, h: 26 + R() * 48, w: 4 + R() * 3, c: i % 2, row: 0, ph: R() * 6.28, rest: (R() - 0.5) * 0.3 });
    }
    function clump(x0, x1, n, hFn) {
      for (var j = 0; j < n; j++) {
        var bx = x0 + R() * (x1 - x0), bh = hFn(bx) * (0.55 + R() * 0.5);
        all.push({ x: bx, h: bh, w: 9 + R() * 11, c: Math.floor(R() * 3), row: 1, ph: R() * 6.28, rest: (R() - 0.5) * 0.35 + (bx < 512 ? 0.06 : -0.06), head: bh > 170 && R() < 0.35 });
      }
    }
    clump(-30, 380, 78, function (bx) { return 360 - bx * 0.6; });
    clump(380, 740, 16, function () { return 95; });
    clump(720, 1054, 70, function (bx) { return 130 + (bx - 720) * 0.72; });
    function bins(row, size, colors, k, opts) {
      var groups = {}, keys = [], key;
      for (var j = 0; j < all.length; j++) if (all[j].row === row) {
        key = Math.floor((all[j].x + 60) / size);
        if (!groups[key]) { groups[key] = []; keys.push(key); }
        groups[key].push(all[j]);
      }
      keys.sort(function (a, b) { return a - b; });
      for (j = 0; j < keys.length; j++) {
        groups[keys[j]].sort(function (a, b) { return a.h - b.h; });
        tufts.push(makeTuft(groups[keys[j]], colors, k, opts));
      }
    }
    bins(0, 130, [pal.back[0], pal.back[1]], 0.6, {});
    bins(1, 55, pal.blade, 1, { light: true });
    var spots = [70, 150, 245, 820, 905, 975];   // daisies on thin stems
    for (i = 0; i < spots.length; i++)
      tufts.push(makeTuft([{ x: spots[i], h: 150 + R() * 90, w: 2.4, c: 0, ph: R() * 6.28, rest: (R() - 0.5) * 0.25 }], [mix(pal.blade[1], pal.bladeHi, 0.25)], 1.1, { daisy: true }));
    for (i = 0; i < 9; i++) {   // a few huge blades right in front of the lens
      x = i < 5 ? -40 + i * 38 + R() * 20 : 900 + (i - 5) * 40 + R() * 20;
      tufts.push(makeTuft([{ x: x, h: 300 + R() * 150, w: 22 + R() * 14, c: 0, ph: R() * 6.28, rest: (x < 512 ? 0.2 : -0.22) + (R() - 0.5) * 0.2 }],
        [mix(pal.blade[0], '#000000', 0.15)], 0.8, {}));
    }

    var night = phase === 'night';
    glow = mk(24, 24);
    var gg = glow.getContext('2d'), gr = gg.createRadialGradient(12, 12, 0, 12, 12, 12);
    if (night) { gr.addColorStop(0, 'rgba(250,255,170,1)'); gr.addColorStop(0.25, 'rgba(220,255,120,0.55)'); gr.addColorStop(1, 'rgba(200,255,100,0)'); }
    else { gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    gg.fillStyle = gr; gg.fillRect(0, 0, 24, 24);
    motes = [];
    var summer = season.dry < 0.35 && season.turn < 0.3;   // fireflies only on summer nights
    var n = rainy() || kind === 'snow' || kind === 'blizzard' ? 0 : night ? (summer ? 16 : 0) : 7;
    for (i = 0; i < n; i++) {
      var m = mk(24, 24), sz = night ? 16 : rnd(6, 11);
      m.getContext('2d').drawImage(glow, 0, 0);
      m.style.position = 'absolute'; m.style.left = '0'; m.style.top = '0'; m.style.width = sz + 'px'; m.style.height = sz + 'px';
      fg.appendChild(m);
      motes.push({ el: m, x: rnd(0, W), y: rnd(380, H - 40), p: rnd(0, 6.28), s: sz / 9 });
    }
  }
  function windNow() { return windKmh == null ? 6 : windKmh; }
  var windPhase = 0, gustPhase = 0;
  function drawGrass(t, dt) {
    var w = windNow(), i;
    var sp = 0.45 + w * 0.085, amp = Math.min(0.42, 0.025 + w * 0.0065), lean0 = dirSign * Math.min(0.32, w * 0.0045);
    windPhase += dt * sp; gustPhase += dt * (0.25 + w * 0.01);
    for (i = 0; i < tufts.length; i++) {
      var b = tufts[i];
      var gust = 0.75 + 0.55 * Math.max(0, Math.sin(gustPhase - dirSign * b.x * 0.004));
      var th = (lean0 + amp * gust * (0.75 * Math.sin(windPhase + b.ph - dirSign * b.x * 0.007) + 0.25 * Math.sin(windPhase * 2.3 + b.ph * 1.7))) * b.k;
      th = clamp(th, -0.6, 0.6);
      if (b.last !== null && Math.abs(th - b.last) < 0.0015) continue;
      b.last = th;
      var tr = 'translate3d(0,0,0) skewX(' + (-th).toFixed(4) + 'rad)';
      b.el.style.webkitTransform = tr; b.el.style.transform = tr;
    }
    var night = phase === 'night';
    for (i = 0; i < motes.length; i++) {   // fireflies at night, drifting seed fluff by day
      var m = motes[i];
      if (night) {
        m.p += dt * 0.7; m.x += Math.cos(m.p * 0.9) * dt * 12 + dirSign * w * 0.05 * dt; m.y += Math.sin(m.p * 1.3) * dt * 9;
        m.el.style.opacity = (0.25 + 0.75 * Math.max(0, Math.sin(m.p * 2.1 + i))).toFixed(2);
      } else {
        m.p += dt; m.x += dirSign * (6 + w * 2.2) * m.s * dt; m.y += Math.sin(m.p * 1.4) * dt * 10 - dt * 2;
      }
      if (m.x > W + 20) m.x = -20; if (m.x < -20) m.x = W + 20;
      if (m.y < 340) m.y = H - 60; if (m.y > H - 20) m.y = 380;
      setXY(m.el, m.x, m.y);
    }
  }

  /* ---------------- falling leaves ----------------
   * Gusts shake small leaves off the far tree; they flutter down onto the hill. Strong gusts
   * also carry a few big leaves across the foreground, from some tree just out of frame.
   * Each leaf is drawn once and moved with a CSS transform, like the grass. */
  var leafBox = document.createElement('div'), leafFar = [], leafNear = [], gustWas = 0, burst = 0, nextLeaf = 0;
  leafBox.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;overflow:hidden;pointer-events:none';
  figBox.parentNode.insertBefore(leafBox, figBox);   // behind the painter, in front of the hills
  var TREE_X = 172, TREE_Y = 384;
  function leafSprite(color, px, res, box) {
    var n = Math.ceil(px * res), c = mk(n, n), g = c.getContext('2d'), h = n;
    g.translate(h / 2, h / 2);
    g.fillStyle = color; g.beginPath();
    g.moveTo(-h * 0.42, 0); g.quadraticCurveTo(-h * 0.02, -h * 0.34, h * 0.42, 0); g.quadraticCurveTo(-h * 0.02, h * 0.34, -h * 0.42, 0); g.fill();
    g.fillStyle = 'rgba(255,240,200,0.22)'; g.beginPath();   // the lit half
    g.moveTo(-h * 0.42, 0); g.quadraticCurveTo(-h * 0.02, -h * 0.34, h * 0.42, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,30,12,0.5)'; g.lineWidth = Math.max(0.6, h * 0.035);
    g.beginPath(); g.moveTo(-h * 0.5, h * 0.03); g.lineTo(h * 0.4, 0); g.stroke();
    c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '0'; c.style.width = px + 'px'; c.style.height = px + 'px';
    c.style.display = 'none';
    box.appendChild(c);
    return { el: c, on: false };
  }
  function buildLeaves() {
    leafBox.innerHTML = ''; leafFar = []; leafNear = []; burst = 0;
    if (season.turn < 0.3 || kind === 'snow' || kind === 'blizzard') return;
    var i, cs = pal.leaf;
    if (season.cover > 0.03) for (i = 0; i < 10; i++) leafFar.push(leafSprite(cs[i % cs.length], 7 + (i % 3), 2, leafBox));
    for (i = 0; i < 3; i++) leafNear.push(leafSprite(cs[(i + 1) % cs.length], 44 + i * 8, GS * 2, fg));
  }
  function spawnFar() {
    for (var i = 0; i < leafFar.length; i++) {
      var L = leafFar[i]; if (L.on) continue;
      var a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 52;
      L.on = true; L.x = TREE_X + Math.cos(a) * d * 1.2; L.y = TREE_Y - 88 + Math.sin(a) * d * 0.8;
      L.vx = rnd(0.6, 1.2); L.vy = rnd(9, 15); L.p = rnd(0, 6.28); L.ps = rnd(2, 4); L.a = rnd(0, 6.28); L.spin = rnd(-3, 3); L.fade = 1;
      L.el.style.opacity = '1'; L.el.style.display = 'block';
      return;
    }
  }
  function spawnNear() {
    for (var i = 0; i < leafNear.length; i++) {
      var L = leafNear[i]; if (L.on) continue;
      L.on = true; L.x = dirSign > 0 ? -60 : W + 20; L.y = rnd(170, 520);
      L.vx = rnd(0.8, 1.25); L.vy = rnd(10, 40); L.p = rnd(0, 6.28); L.ps = rnd(2.5, 4.5); L.a = rnd(0, 6.28); L.spin = rnd(-5, 5);
      L.el.style.display = 'block';
      return;
    }
  }
  function moveLeaf(L) {
    var tr = 'translate3d(' + L.x.toFixed(1) + 'px,' + L.y.toFixed(1) + 'px,0) rotate(' + L.a.toFixed(2) + 'rad) scale(' + Math.cos(L.p).toFixed(2) + ',1)';
    L.el.style.webkitTransform = tr; L.el.style.transform = tr;
  }
  function drawLeaves(t, dt) {
    if (!leafFar.length && !leafNear.length) return;
    var w = windNow(), g = Math.max(0, Math.sin(gustPhase - dirSign * TREE_X * 0.004)), i, L;
    if (g > 0.8 && gustWas <= 0.8) burst = Math.round((1 + w / 8) * (0.3 + season.cover));   // a gust reaches the tree
    gustWas = g;
    if (burst > 0 && t > nextLeaf) { spawnFar(); burst--; nextLeaf = t + rnd(0.2, 0.7); }
    else if (Math.random() < dt * 0.04) spawnFar();   // now and then one lets go on its own
    if (w > 9 && g > 0.85 && Math.random() < dt * 0.35 * Math.min(1, w / 25)) spawnNear();
    for (i = 0; i < leafFar.length; i++) {
      L = leafFar[i]; if (!L.on) continue;
      L.p += dt * L.ps; L.a += dt * L.spin;
      if (L.fade < 1) {   // landed: lie still and fade into the grass
        L.fade -= dt * 0.5; L.el.style.opacity = Math.max(0, L.fade).toFixed(2);
        if (L.fade <= 0) { L.on = false; L.el.style.display = 'none'; }
        continue;
      }
      L.x += (dirSign * (4 + w * 0.6) * L.vx * (0.6 + 0.6 * g) + Math.sin(L.p * 0.7) * 8) * dt;
      L.y += (L.vy * (1 - 0.45 * g) + Math.cos(L.p * 0.9) * 6) * dt;
      if (L.y > midY(L.x) + 6) L.fade = 0.999;
      if (L.x < -20 || L.x > W + 20) { L.on = false; L.el.style.display = 'none'; continue; }
      moveLeaf(L);
    }
    for (i = 0; i < leafNear.length; i++) {
      L = leafNear[i]; if (!L.on) continue;
      L.p += dt * L.ps; L.a += dt * L.spin;
      L.x += dirSign * (110 + w * 5) * L.vx * (0.7 + 0.5 * g) * dt;
      L.y += (L.vy + Math.sin(L.p * 0.8) * 60) * dt;
      if (L.x < -80 || L.x > W + 80 || L.y > H + 40) { L.on = false; L.el.style.display = 'none'; continue; }
      moveLeaf(L);
    }
  }

  /* ---------------- rain and snow ---------------- */
  var drops = [], flakes = [], flash = 0, nextFlash = 0, wxOn = false;
  function buildWx() {
    drops = []; flakes = []; var i, n;
    var heavy = kind === 'heavy' || kind === 'storm';
    if (rainy()) { n = kind === 'drizzle' ? 90 : heavy ? 260 : 170; for (i = 0; i < n; i++) drops.push({ x: rnd(0, W), y: rnd(-H, H), l: rnd(10, kind === 'drizzle' ? 14 : 24), v: rnd(kind === 'drizzle' ? 6 : 13, kind === 'drizzle' ? 9 : 19) }); }
    if (kind === 'snow' || kind === 'blizzard') { n = kind === 'blizzard' ? 260 : 130; for (i = 0; i < n; i++) flakes.push({ x: rnd(0, W), y: rnd(-H, H), r: rnd(1, 3.2), v: rnd(0.6, kind === 'blizzard' ? 3 : 1.5), p: rnd(0, 6.28) }); }
    wxOn = drops.length || flakes.length || kind === 'storm';
    wctx.clearRect(0, 0, W, H);
  }
  function drawWx(t) {
    if (!wxOn) return;
    var g = wctx, i, wdx = dirSign * Math.min(8, windNow() * 0.12);
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.clearRect(0, 0, W, H);
    if (drops.length) {
      g.strokeStyle = phase === 'night' ? 'rgba(170,190,230,0.35)' : 'rgba(225,235,250,0.5)'; g.lineWidth = 1.2; g.beginPath();
      for (i = 0; i < drops.length; i++) {
        var d = drops[i]; d.y += d.v; d.x += wdx * 0.6;
        if (d.y > H) { d.y = rnd(-60, 0); d.x = rnd(-40, W + 40); }
        g.moveTo(d.x, d.y); g.lineTo(d.x - wdx * 1.5, d.y - d.l);
      }
      g.stroke();
    }
    if (flakes.length) {
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath();
      for (i = 0; i < flakes.length; i++) {
        var f = flakes[i]; f.y += f.v; f.p += 0.02; f.x += Math.sin(f.p) * 0.6 + wdx * 0.25;
        if (f.y > H) { f.y = rnd(-20, 0); f.x = rnd(0, W); }
        g.moveTo(f.x + f.r, f.y); g.arc(f.x, f.y, f.r, 0, 6.2832);
      }
      g.fill();
    }
    if (kind === 'storm') {
      if (t > nextFlash) { flash = 1; nextFlash = t + rnd(7, 18); }
      if (flash > 0.02) { g.fillStyle = 'rgba(235,240,255,' + (flash * 0.45) + ')'; g.fillRect(0, 0, W, H); flash *= 0.86; }
    }
  }

  /* ---------------- build + main loop ---------------- */
  function rebuild() {
    pal = palette(phase || 'day', kind || 'clear');
    drawBackdrop(); buildSun(); placeMoon(); buildClouds(); buildFigure(); buildGrass(); buildLeaves(); buildWx(); paintHaze();
    builtAt = Date.now();
  }
  var dayShift = +param('days') || 0;   // preview another day, e.g. ?days=9
  var lastW = null, timeOverride = (function () { var m = /^(\d+):(\d+)$/.exec(param('time') || ''); return m ? +m[1] + m[2] / 60 : null; })();
  function setWeather(w) {
    if (!w || w.error) {   // no weather yet (the forecast service is down): a clear sky, lit by the real sun
      if (!builtKey) {
        if (w && w.lat != null) { lat = w.lat; lon = w.lon; }
        kind = kind || 'clear';
        if (!forced.phase) phase = Sky.phase(Date.now(), lat, lon);
        builtKey = 'none'; rebuild();
      }
      return;
    }
    if (w.lat != null) { lat = w.lat; lon = w.lon; }
    lastW = w;
    if (timeOverride !== null) {   // show another time of day today (location-local hours)
      var off = (w.utc_offset || 0) * 1000, loc = new Date(Date.now() + off);
      timeShift = Date.UTC(loc.getUTCFullYear(), loc.getUTCMonth(), loc.getUTCDate()) + timeOverride * 3600000 - off - Date.now();
    } else timeShift = 0;
    timeShift += dayShift * 86400000;
    var k = forced.wx ? kind : (KIND[w.code] || 'cloudy'), ph = phase;
    if (!forced.phase) {
      ph = w.is_day ? 'day' : 'night';
      if (w.lat != null) ph = Sky.phase(Date.now() + timeShift, lat, lon);   // by the sun's height, so the far north comes out right
    }
    if (!forced.wind) windKmh = w.wind;
    windDir = w.wind_dir == null ? 270 : w.wind_dir;
    // wind blowing from the west pushes the grass to the right of the screen
    dirSign = windDir > 180 || windDir === 0 ? 1 : -1;
    season = seasonAt(Date.now() + timeShift);
    var key = k + '/' + ph + '/' + [season.turn, season.cover, season.bloom, season.dry].map(function (v) { return Math.round(v * 20); }).join(',') + '/' + holiday();
    if (key !== builtKey || Date.now() - builtAt > 5 * 60 * 1000) { kind = k; phase = ph; builtKey = key; rebuild(); }
  }

  /* ---------------- bad air: a haze over the land (US AQI from the server; preview ?aqi=180) ---------------- */
  var aqi = param('aqi') ? +param('aqi') : 0;
  function paintHaze() {
    var a = aqi <= 50 ? 0 : aqi <= 100 ? 0.14 : aqi <= 150 ? 0.28 : aqi <= 200 ? 0.45 : 0.58, night = phase === 'night';
    var col = aqi > 150 ? (night ? '92,58,38' : '222,128,52') : aqi > 100 ? (night ? '78,66,60' : '214,178,128') : (night ? '64,62,70' : '208,200,184');
    var g1 = 'rgba(' + col + ',' + (a * 0.6).toFixed(2) + ')', g2 = 'rgba(' + col + ',' + a.toFixed(2) + ')', g3 = 'rgba(' + col + ',' + (a * 0.35).toFixed(2) + ')';
    hazeEl.style.background = '-webkit-linear-gradient(top, ' + g1 + ', ' + g2 + ' 52%, ' + g3 + ')';
    hazeEl.style.background = 'linear-gradient(to bottom, ' + g1 + ', ' + g2 + ' 52%, ' + g3 + ')';
    hazeEl.style.opacity = a ? 1 : 0;
  }

  /* ---------------- fireworks over the hills ---------------- */
  var BOOM = { list: [], next: 0, sheets: null };
  function burstSprite(col) {
    var c = mk(160, 160), g = c.getContext('2d'), R = Math.random, i, n = 46;
    g.globalCompositeOperation = 'lighter';
    var gl = g.createRadialGradient(80, 80, 0, 80, 80, 80); gl.addColorStop(0, rgba(col, 0.35)); gl.addColorStop(1, rgba(col, 0));
    g.fillStyle = gl; g.fillRect(0, 0, 160, 160);
    for (i = 0; i < n; i++) {
      var a = i / n * 6.2832 + R() * 0.1, r = 52 + R() * 22, x0 = 80 + Math.cos(a) * r * 0.45, y0 = 80 + Math.sin(a) * r * 0.45, x = 80 + Math.cos(a) * r, y = 80 + Math.sin(a) * r + r * 0.12;
      var gr = g.createLinearGradient(x0, y0, x, y); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, 0.9));
      g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x, y); g.stroke();
      g.fillStyle = mix(col, '#ffffff', 0.6); g.beginPath(); g.arc(x, y, 1.8, 0, 6.2832); g.fill();
    }
    return c;
  }
  function fireworks(t) {
    var on = fireworksNow() && phase !== 'day', i;
    if (!on && !BOOM.list.length) return;
    if (!BOOM.sheets) BOOM.sheets = ['#ff5a5a', '#ffd84a', '#6ad1ff', '#ff7ad9', '#8dff8a', '#ffffff'].map(burstSprite);
    if (on && t > BOOM.next) {
      BOOM.next = t + rnd(0.4, 1.4);
      var el = mk(160, 160); el.getContext('2d').drawImage(BOOM.sheets[Math.floor(Math.random() * BOOM.sheets.length)], 0, 0);
      el.style.position = 'absolute'; el.style.left = '0px'; el.style.top = '0px';
      fwBox.appendChild(el);
      var bx = rnd(60, W - 60);
      BOOM.list.push({ el: el, t0: t, x: bx, y: rnd(110, farY(bx) - 40), s: rnd(0.45, 0.95), life: rnd(1.6, 2.3) });
    }
    for (i = BOOM.list.length - 1; i >= 0; i--) {
      var b = BOOM.list[i], k = (t - b.t0) / b.life;
      if (k >= 1) { fwBox.removeChild(b.el); BOOM.list.splice(i, 1); continue; }
      var grow = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3), sc = b.s * (0.15 + 0.85 * grow), tf = 'translate3d(' + (b.x - 80).toFixed(1) + 'px,' + (b.y - 80 + k * k * 26).toFixed(1) + 'px,0) scale(' + sc.toFixed(3) + ')';
      b.el.style.opacity = (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55).toFixed(2);
      b.el.style.webkitTransform = tf; b.el.style.transform = tf;
    }
  }

  // ?timer=1 drives frames with timers: headless browsers barely run requestAnimationFrame
  var nextFrame = param('timer') ? function (f) { setTimeout(function () { f(Date.now()); }, 33); } : function (f) { requestAnimationFrame(f); };
  var last = 0, acc = 0, dimmed = false, figSkip = 0, drawn = 0, fpsAt = 0;
  function frame(now) {
    nextFrame(frame);
    if (window.WX_OPEN || window.SWIPING) { last = 0; return; }   // the weather console is up, or a swipe is sliding: draw nothing
    if (!last) { last = now; return; }
    var dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    if (acc < (dimmed ? 1 / 12 : 0.029)) return;   // ~30 fps (12 when dimmed at night)
    dt = acc; acc = 0;
    if (!builtKey) return;
    if (SIM && job && !simDone) { simDone = true; for (var k = 0; k < SIM * 30; k++) { updatePainting(1 / 30, now / 1000 + k / 30); } }
    var t = now / 1000, w = windNow(), i;
    drawn++;
    if (!fpsAt) fpsAt = now;
    else if (fpsAt > 0 && now - fpsAt > 60000 && !STANDALONE) {   // one report per load, readable in the server journal
      try { var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog', true); x.send('status: meadow running at ' + (drawn / ((now - fpsAt) / 1000)).toFixed(1) + ' fps, painting ' + (job ? 'in progress' : 'done')); } catch (e) {}
      fpsAt = -1;
    }
    for (i = 0; i < clouds.length; i++) {
      var c = clouds[i]; c.x += dirSign * (3 + w * 0.5) * c.v * dt;
      if (c.x > W + 40) c.x = -c.w; if (c.x < -c.w - 40) c.x = W;
      setXY(c.el, c.x, c.y);
    }
    for (i = 0; i < waves.length; i++) {
      var v = waves[i]; v.x += dirSign * (15 + w * 4) * v.v * dt;
      if (v.x > W + 60) v.x = -480; if (v.x < -480) v.x = W + 60;
      v.el.style.opacity = Math.min(1, w / 12);
      setXY(v.el, v.x, v.y);
    }
    updatePainting(dt, t);
    figSkip = (figSkip + 1) % 3;
    if (job || !figSkip) drawFigure(t, dt);   // the painter only needs full frame rate while painting
    drawGrass(t, dt);
    drawLeaves(t, dt);
    drawWx(t);
    fireworks(t);
    if (DEBUG) { frames++; document.title = 'frames ' + frames + ' job ' + (job ? job.i + '/' + job.s.length + ' ' + job.mode : 'idle') + ' photos ' + list.length; }
  }
  var DEBUG = !!param('debug'), frames = 0, SIM = +(param('sim') || 0), simDone = false;

  /* ---------------- photos ---------------- */
  var list = [], li = 0, paintSecs = 120, current = null, cycle = null;
  function nextPainting() {
    clearTimeout(cycle);
    if (!list.length) {   // no photos yet: he paints the view in front of him
      current = null; paintFrom(cover((function () { var c = mk(400, 300); var cg = c.getContext('2d'); cg.drawImage(back, 300, 250, 520, 390, 0, 0, 400, 300); cg.drawImage(land, 300, 250, 520, 390, 0, 0, 400, 300); return c; })(), PW, PH));
      cycle = setTimeout(nextPainting, paintSecs * 1000); return;
    }
    if (li >= list.length) { shuffle(list); li = 0; }
    var id = list[li++], src = /^(\/|https?:|data:|blob:)/.test(id) ? id : '/photo/' + id + '.jpg', img = new Image();
    img.onload = function () { current = src; paintFrom(img); cycle = setTimeout(nextPainting, paintSecs * 1000); };
    img.onerror = function () { cycle = setTimeout(nextPainting, 3000); };
    img.src = src;
  }
  function loadList() {
    if (STANDALONE) { waitBuilt(); return; }
    var x = new XMLHttpRequest();
    x.open('GET', '/api/photos?t=' + Date.now(), true);
    x.onload = function () {
      try { var r = JSON.parse(x.responseText); list = shuffle(r.photos || []); paintSecs = r.painting_seconds || 120; } catch (e) {}
      waitBuilt();
    };
    x.onerror = waitBuilt;
    x.send();
  }
  function waitBuilt() { if (builtKey) nextPainting(); else setTimeout(waitBuilt, 300); }
  setInterval(function () {   // pick up new photos without restarting the current painting
    if (STANDALONE) return;
    var x = new XMLHttpRequest(); x.open('GET', '/api/photos?t=' + Date.now(), true);
    x.onload = function () { try { var r = JSON.parse(x.responseText); if ((r.photos || []).length !== list.length) { list = shuffle(r.photos); li = 0; } } catch (e) {} };
    x.send();
  }, 10 * 60 * 1000);

  window.Meadow = {
    setWeather: setWeather,
    wind: function () { return windNow(); },
    phase: function () { return phase || 'day'; },   // the light the scene is drawn in: day, golden or night
    dim: function (on) { dimmed = on; },
    photo: function () { return current; },
    paintingRect: function () { return [PX, PY, PW, PH]; },
    snapshot: function () { return painting.toDataURL('image/jpeg', 0.9); },
    // hours since local midnight (e.g. 16.5), or null for the real time
    setTime: function (h) { timeOverride = h; if (lastW) setWeather(lastW); placeSun(); placeMoon(); },
    season: function () { return season; },   // turn, cover, bloom, dry: each 0 to 1
    // whole days ahead (or back) of today, to watch the moon go through its phases
    setDays: function (n) { dayShift = n || 0; if (lastW) setWeather(lastW); placeSun(); placeMoon(); },
    // the moon as drawn: el (degrees above the horizon), lit (0 new to 1 full), waxing, x on the stage
    moon: function () {
      var m = moonPosition(Date.now() + timeShift);
      m.x = toScreen(m)[0];   // stage x; off either edge when it's far east or west
      return m;
    },
    // start painting an <img> (already loaded) right away; src is what a tap on the painting shows
    paint: function (img, src) { clearTimeout(cycle); current = src || null; paintFrom(img); cycle = setTimeout(nextPainting, paintSecs * 1000); },
    // photo URLs to cycle through, and seconds per painting
    setPhotos: function (urls, secs) { list = urls.slice(); li = 0; if (secs) paintSecs = secs; if (builtKey) nextPainting(); },   // starts on the new list now
    // the US air quality index: above 50 a haze, above 150 the orange of wildfire smoke
    setAir: function (n) { if (param('aqi')) return; n = +n || 0; if (n !== aqi) { aqi = n; if (builtKey) paintHaze(); } }
  };
  if (forced.wx || forced.phase) { kind = kind || 'clear'; phase = phase || 'day'; }
  loadList();
  nextFrame(frame);
})();
