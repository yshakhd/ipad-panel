/*
 * The weather console: tap the temperature on any scene. A dark, full-screen page with the
 * local radar loop (rain and snow, or storm-relative velocity), warning outlines, and the
 * readings a forecaster looks at first, plus the nearest airport's raw METAR.
 * Everything comes ready-made from /api/wx on this server (see wx.py). ES5, iOS 9 Safari.
 *
 *   Wx.attach(element, function () { return 'F' or 'C'; })
 * While it's open, window.WX_OPEN is true and the scenes skip their drawing.
 */
var Wx = (function () {
  'use strict';
  var CSS = [
    '#wxc { position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 100; display: none; opacity: 0; background: #0c1424;',
    '  -webkit-transition: opacity 0.25s; transition: opacity 0.25s; -webkit-user-select: none; }',
    '#wxc.on { display: block; } #wxc.in { opacity: 1; }',
    '#wxc-in { position: absolute; left: 0; top: 0; width: 1024px; height: 768px; color: #e9eef6;',
    '  font-family: "Newsreader", Georgia, serif; -webkit-transform-origin: 0 0; transform-origin: 0 0; }',
    '#wxc .n { font-family: "Big Shoulders Display", sans-serif; font-weight: 600; letter-spacing: 0.5px; }',
    '#wxc .m { color: #8e9db6; }',
    '#wxc-head { position: absolute; left: 24px; top: 14px; width: 620px; white-space: nowrap; overflow: hidden; }',
    '#wxc-place { font-size: 30px; font-style: italic; }',
    '#wxc-upd { font-size: 17px; margin-left: 12px; }',
    '#wxc-close { position: absolute; right: 20px; top: 10px; height: 42px; line-height: 40px; padding: 0 20px 0 18px; border-radius: 21px;',
    '  border: 1px solid rgba(233,238,246,0.28); font-size: 19px; cursor: pointer; }',
    '#wxc-close:active, #wxc .btn:active { background: rgba(233,238,246,0.16); }',
    '#wxc-radar { position: absolute; left: 20px; top: 64px; width: 640px; height: 640px; overflow: hidden; border-radius: 6px; background: #24272d; }',
    '#wxc-radar img, #wxc-radar canvas { position: absolute; left: 0; top: 0; width: 640px; height: 640px; }',
    '#wxc-load { position: absolute; left: 0; top: 300px; width: 640px; text-align: center; font-size: 20px; font-style: italic; color: #8e9db6; }',
    '#wxc-modes { position: absolute; left: 12px; top: 12px; border-radius: 19px; background: rgba(12,20,36,0.82); padding: 3px; }',
    '#wxc-modes span { display: inline-block; height: 32px; line-height: 32px; padding: 0 14px; border-radius: 16px; font-size: 17px; cursor: pointer; color: #b8c4d8; }',
    '#wxc-modes span.on { background: #e9eef6; color: #0c1424; }',
    '#wxc-key { position: absolute; right: 12px; top: 12px; padding: 7px 10px 6px; border-radius: 8px; background: rgba(12,20,36,0.82); font-size: 14px; }',
    '#wxc-key i { display: block; width: 150px; height: 8px; border-radius: 4px; margin: 5px 0 3px; }',
    '#wxc-key b { font-weight: 400; float: right; }',
    '#wxc-warn { position: absolute; right: 12px; top: 90px; text-align: right; font-size: 14px; }',
    '#wxc-warn div { display: inline-block; clear: both; float: right; margin-bottom: 4px; padding: 3px 9px; border-radius: 6px; background: rgba(12,20,36,0.82); }',
    '#wxc-warn i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }',
    '#wxc-bar { position: absolute; left: 0; bottom: 0; width: 640px; height: 64px;',
    '  background: -webkit-linear-gradient(top, rgba(12,20,36,0), rgba(12,20,36,0.9) 55%); background: linear-gradient(to bottom, rgba(12,20,36,0), rgba(12,20,36,0.9) 55%); }',
    '#wxc-play { position: absolute; left: 10px; bottom: 8px; width: 44px; height: 40px; border-radius: 20px; cursor: pointer; }',
    '#wxc-play:before { content: ""; position: absolute; left: 17px; top: 12px; border-left: 14px solid #e9eef6; border-top: 8px solid transparent; border-bottom: 8px solid transparent; }',
    '#wxc-play.on:before { left: 15px; top: 13px; width: 4px; height: 14px; border: 0; border-left: 4px solid #e9eef6; border-right: 4px solid #e9eef6; }',
    '#wxc-ticks { position: absolute; left: 62px; right: 150px; bottom: 14px; height: 30px; }',
    '#wxc-ticks span { position: absolute; top: 0; height: 30px; cursor: pointer; }',
    '#wxc-ticks span:after { content: ""; position: absolute; left: 3px; right: 3px; top: 12px; height: 6px; border-radius: 3px; background: rgba(233,238,246,0.25); }',
    '#wxc-ticks span.ok:after { background: rgba(233,238,246,0.5); }',
    '#wxc-ticks span.on:after { top: 9px; height: 12px; border-radius: 4px; background: #ff9a4a; }',
    '#wxc-clock { position: absolute; right: 14px; bottom: 12px; text-align: right; line-height: 1.05; }',
    '#wxc-clock .n { font-size: 24px; } #wxc-clock div { font-size: 14px; font-style: italic; }',
    '#wxc-credit { position: absolute; left: 22px; top: 714px; width: 980px; font-size: 13px; }',
    '#wxc-side { position: absolute; left: 684px; top: 58px; width: 318px; }',
    '#wxc-alert { display: none; margin: 4px 0 10px; padding: 8px 12px; border-radius: 6px; font-size: 17px; line-height: 1.25; border-left: 5px solid; background: rgba(255,255,255,0.06); }',
    '#wxc-alert .m { font-size: 15px; font-style: italic; }',
    '#wxc-temp { font-size: 108px; line-height: 0.9; font-weight: 400; margin-left: -4px; }',
    '#wxc-temp small { font-size: 0.42em; margin-left: 4px; color: #8e9db6; }',
    '#wxc-cond { font-size: 19px; margin: 6px 0 10px; line-height: 1.25; }',
    '#wxc-rows .r { border-top: 1px solid rgba(233,238,246,0.1); padding: 5px 0 4px; overflow: hidden; }',
    '#wxc-rows .k { float: left; font-size: 17px; line-height: 28px; color: #8e9db6; }',
    '#wxc-rows .v { float: right; font-size: 24px; line-height: 28px; text-align: right; }',
    '#wxc-rows .v em { font-family: "Newsreader", Georgia, serif; font-weight: 400; font-size: 15px; letter-spacing: 0; color: #b8c4d8; margin-left: 6px; }',
    '#wxc-metar { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(233,238,246,0.1); }',
    '#wxc-metar .m { font-size: 14px; font-style: italic; }',
    '#wxc-metar code { display: block; margin-top: 3px; font-family: Menlo, Courier, monospace; font-size: 12.5px; line-height: 1.45; color: #ffc995; word-wrap: break-word; }'
  ].join('\n');

  var COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  var KEYS = {
    rain: { grad: 'linear-gradient(to right, #04e9e7, #019ff4, #02fd02, #01c501, #fdf802, #fd9500, #fd0000, #bc0000, #f800fd)', lo: 'Light', hi: 'Heavy, hail' },
    vel: { grad: 'linear-gradient(to right, #00ff00, #008000, #7f7f7f, #800000, #ff0000)', lo: 'Toward the radar', hi: 'Away' }
  };
  var root, getUnit = function () { return 'F'; }, data = null, mode = 'rain', list = [], imgs = {}, fi = 0;
  var playing = true, playT = null, refreshT = null, idleT = null, over = null;

  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function tap(el, fn) { el.addEventListener('click', function (e) { e.stopPropagation(); poke(); fn(e); }, false); }
  function cls(el, name, on) {
    var c = (' ' + el.className + ' ').replace(' ' + name + ' ', ' ');
    el.className = (on ? c + name : c).replace(/^\s+|\s+$/g, '');
  }
  function iso(s) {   // ISO time (with or without seconds or an offset) -> ms; iOS 9's Date.parse is unreliable
    var m = /(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?/.exec(s || '');
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), z = m[7];
    if (z && z !== 'Z') { var sg = z.charAt(0) === '-' ? -1 : 1, hh = +z.substr(1, 2), mm = +z.substr(z.length - 2); t -= sg * (hh * 60 + mm) * 60000; }
    return t;
  }
  function clock(ms) { var d = new Date(ms), h = d.getHours(), m = d.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm'); }
  function ago(ms) { var m = Math.round((Date.now() - ms) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; }
  function comma(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // units: the scene's °F / °C choice picks the whole set
  function imp() { return getUnit() !== 'C'; }
  function temp(c) { return c == null ? '--' : Math.round(imp() ? c * 9 / 5 + 32 : c) + '°'; }
  function speed(k) { return k == null ? '--' : imp() ? Math.round(k * 0.6214) + ' mph' : Math.round(k) + ' km/h'; }
  function press(h) { return h == null ? '--' : imp() ? (h * 0.02953).toFixed(2) + ' in' : Math.round(h) + ' hPa'; }
  function dist(m) {
    if (m == null) return '--';
    if (imp()) { var mi = m / 1609.34; return (mi >= 9.95 ? '10+' : mi < 1 ? mi.toFixed(1) : Math.round(mi)) + ' mi'; }
    return (m >= 16000 ? '16+' : m < 1000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)) + ' km';
  }
  function height(m) { return m == null ? '--' : imp() ? comma(Math.round(m * 3.2808 / 100) * 100) + ' ft' : comma(Math.round(m / 10) * 10) + ' m'; }
  function amount(mm) { return imp() ? (mm / 25.4).toFixed(2) + ' in' : mm.toFixed(1) + ' mm'; }

  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'wxc';
    root.innerHTML =
      '<div id="wxc-in">' +
        '<div id="wxc-head"><span id="wxc-place"></span><span id="wxc-upd" class="m"></span></div>' +
        '<div id="wxc-close" class="btn">Close</div>' +
        '<div id="wxc-radar"><div id="wxc-load">Loading radar…</div><img id="wxc-frame" alt=""><canvas id="wxc-over" width="640" height="640"></canvas>' +
          '<div id="wxc-modes"><span data-k="rain" class="on">Rain and snow</span><span data-k="vel">Velocity</span></div>' +
          '<div id="wxc-key"><span id="wxc-key-t"></span><i id="wxc-key-g"></i><span id="wxc-key-lo"></span><b id="wxc-key-hi"></b></div>' +
          '<div id="wxc-warn"></div>' +
          '<div id="wxc-bar"><div id="wxc-play" class="btn on"></div><div id="wxc-ticks"></div><div id="wxc-clock"><span class="n" id="wxc-ft"></span><div id="wxc-fa" class="m"></div></div></div>' +
        '</div>' +
        '<div id="wxc-credit" class="m">Radar: NOAA NEXRAD via the Iowa Environmental Mesonet. Map: Esri, HERE, Garmin, OpenStreetMap contributors. Data: National Weather Service, Open-Meteo.</div>' +
        '<div id="wxc-side"><div id="wxc-alert"></div><div id="wxc-temp" class="n"></div><div id="wxc-cond"></div><div id="wxc-rows"></div><div id="wxc-metar"></div></div>' +
      '</div>';
    document.body.appendChild(root);
    $('wxc-frame').style.visibility = 'hidden';
    tap($('wxc-close'), close);
    tap($('wxc-play'), function () { playing = !playing; cls($('wxc-play'), 'on', playing); if (playing) step(); else clearTimeout(playT); });
    var ms = $('wxc-modes').getElementsByTagName('span');
    for (var i = 0; i < ms.length; i++) tap(ms[i], function (e) { setMode(e.target.getAttribute('data-k')); });
    root.addEventListener('click', poke, false);
    root.addEventListener('touchstart', poke, false);
    window.addEventListener('resize', fit, false);
    over = $('wxc-over').getContext('2d');
  }
  function fit() {
    if (!root) return;
    var s = Math.min(window.innerWidth / 1024, window.innerHeight / 768);
    var t = 'translate(' + ((window.innerWidth - 1024 * s) / 2) + 'px,' + ((window.innerHeight - 768 * s) / 2) + 'px) scale(' + s + ')';
    $('wxc-in').style.webkitTransform = t; $('wxc-in').style.transform = t;
  }
  function poke() { clearTimeout(idleT); idleT = setTimeout(close, 180000); }   // closes itself after 3 quiet minutes

  function open() {
    if (!root) build();
    fit();
    window.WX_OPEN = true;
    root.className = 'on';
    setTimeout(function () { root.className = 'on in'; }, 20);
    poke();
    load();
    clearInterval(refreshT); refreshT = setInterval(load, 120000);
  }
  function close() {
    if (!root) return;
    window.WX_OPEN = false;
    clearTimeout(playT); clearTimeout(idleT); clearInterval(refreshT);
    root.className = 'on';
    setTimeout(function () { if (!window.WX_OPEN) root.className = ''; }, 260);
    for (var u in imgs) if (imgs.hasOwnProperty(u)) imgs[u].src = '';   // let the old iPad have its memory back
    imgs = {}; list = [];
    $('wxc-frame').removeAttribute('src'); $('wxc-frame').style.visibility = 'hidden';
    $('wxc-load').style.display = 'block'; $('wxc-ticks').innerHTML = '';
  }

  function load() {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/wx?t=' + Date.now(), true);
    x.timeout = 20000;
    x.onload = function () {
      if (x.status !== 200) return;
      try { data = JSON.parse(x.responseText); render(); } catch (e) { if (window.onerror) window.onerror(String(e), 'wx.js', 0, 0); }
    };
    x.onerror = x.ontimeout = function () { $('wxc-upd').textContent = 'Can’t reach the panel server'; };
    x.send();
  }

  function render() {
    if (!data || data.error) { $('wxc-place').textContent = data ? data.error : ''; return; }
    $('wxc-place').textContent = data.place || 'Weather';
    $('wxc-upd').textContent = 'Updated ' + clock(Date.now());
    readings();
    overlay();
    frames();
  }

  /* ---------------- the readings column ---------------- */
  function hourIndex(f) {
    var h = f.hourly, now = (f.current.time || '').slice(0, 13) + ':00';
    for (var i = 0; i < h.time.length; i++) if (h.time[i] === now) return i;
    return 0;
  }
  function row(k, v, note) { return '<div class="r"><span class="k">' + k + '</span><span class="v n">' + v + (note ? '<em>' + note + '</em>' : '') + '</span></div>'; }
  function cloudBase(obs, c, h, i) {
    var L = obs && obs.clouds || [], j, words = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast', VV: 'sky hidden' };
    for (j = 0; j < L.length; j++) if (/BKN|OVC|VV/.test(L[j].amount) && L[j].base != null) return [height(L[j].base), words[L[j].amount]];
    for (j = 0; j < L.length; j++) if (L[j].base != null) return [height(L[j].base), words[L[j].amount] || ''];
    if (obs && /CLR|SKC/.test(obs.raw)) return ['None', 'below 12,000 ft'];
    if (h.cloud_cover_low[i] < 10 && c.cloud_cover < 20) return ['None', 'clear'];
    return [height(Math.max(0, (c.temperature_2m - c.dew_point_2m) * 125)), 'estimated'];   // about 125 m per degree of spread
  }
  function readings() {
    var f = data.forecast, obs = data.obs, side = $('wxc-rows');
    if (!f || !f.current) { side.innerHTML = '<div class="r m">Forecast numbers are unavailable.</div>'; return; }
    var c = f.current, h = f.hourly, i = hourIndex(f), back = Math.max(0, i - 3);
    $('wxc-temp').innerHTML = temp(c.temperature_2m).replace('°', '<small>°' + (imp() ? 'F' : 'C') + '</small>');
    var feels = Math.abs(c.apparent_temperature - c.temperature_2m) >= 1.5 ? 'Feels like ' + temp(c.apparent_temperature) + '. ' : '';
    $('wxc-cond').textContent = feels + (obs && obs.text ? obs.text + ' at ' + obs.name + '.' : '');

    var dp = c.dew_point_2m, dpF = dp * 9 / 5 + 32;
    // near saturation, fog and drizzle weather; otherwise how muggy it feels (that only means something when it's warm)
    var tF = c.temperature_2m * 9 / 5 + 32, feel = c.temperature_2m - dp < 1.5 ? 'nearly saturated' : tF < 60 ? (c.relative_humidity_2m < 35 ? 'dry air' : '') :
      dpF < 50 ? 'dry' : dpF < 60 ? 'comfortable' : dpF < 65 ? 'a little humid' : dpF < 70 ? 'humid' : 'oppressive';
    var dP = h.pressure_msl[i] - h.pressure_msl[back];
    var trend = Math.abs(dP) < 1 ? 'steady' : (dP > 0 ? '↑ rising' : '↓ falling') + (Math.abs(dP) >= 4 ? ' fast' : '');
    var dir = c.wind_direction_10m == null ? '' : COMPASS[Math.round(c.wind_direction_10m / 22.5) % 16] + ' ';
    var vis = obs && obs.vis != null ? obs.vis : h.visibility[i];
    var cb = cloudBase(obs, c, h, i);
    var pop = h.precipitation_probability[i + 1], rain = h.precipitation[i + 1] || 0, snow = h.snowfall[i + 1] || 0;
    var cape = h.cape[i] || 0, capeW = cape < 100 ? 'none' : cape < 1000 ? 'weak' : cape < 2500 ? 'moderate' : 'strong';
    var html = row('Dew point', temp(dp), feel) + row('Humidity', Math.round(c.relative_humidity_2m) + '%') +
      row('Pressure', press(c.pressure_msl), trend) +
      row('Wind', c.wind_speed_10m < 2 ? 'Calm' : dir + speed(c.wind_speed_10m), c.wind_gusts_10m > c.wind_speed_10m + 9 ? 'gusts ' + speed(c.wind_gusts_10m) : '') +
      row('Visibility', dist(vis)) + row('Cloud base', cb[0], cb[1]) +
      row('Freezing level', h.freezing_level_height[i] < 30 ? 'Ground' : height(h.freezing_level_height[i])) +
      row('Next hour', (pop == null ? '--' : pop + '%'), snow > 0.05 ? amount(snow * 10) + ' snow' : rain >= 0.1 ? amount(rain) : '') +
      row('Storm energy', cape < 100 ? 'None' : comma(cape) + ' J/kg', cape < 100 ? '' : capeW);
    if (h.is_day[i] && h.uv_index[i] >= 1) html += row('UV index', Math.round(h.uv_index[i]));
    side.innerHTML = html;

    $('wxc-metar').innerHTML = obs && obs.raw ? '<div class="m">' + esc(obs.name) + ', ' + ago(iso(obs.time)) + '</div><code>' + esc(obs.raw) + '</code>' : '';

    var here = null, w = data.warnings || [];
    for (var j = 0; j < w.length; j++) if (w[j].here) { here = w[j]; break; }
    var al = $('wxc-alert');
    if (here) {
      al.style.display = 'block'; al.style.borderColor = here.color;
      al.innerHTML = esc(here.event) + (here.ends ? '<div class="m">until ' + clock(iso(here.ends)) + '</div>' : '');
    } else al.style.display = 'none';
  }

  /* ---------------- radar: rings, home, warning outlines, the loop ---------------- */
  function overlay() {
    var r = data.radar, g = over, i, j;
    g.clearRect(0, 0, 640, 640);
    if (!r) { $('wxc-load').textContent = 'Radar needs Pillow on the server.'; return; }
    var w = data.warnings || [], seen = {}, chips = '';
    g.lineJoin = 'round';
    for (i = 0; i < w.length; i++) {
      for (j = 0; j < w[i].polys.length; j++) {
        var p = w[i].polys[j], k;
        g.beginPath(); g.moveTo(p[0][0], p[0][1]);
        for (k = 1; k < p.length; k++) g.lineTo(p[k][0], p[k][1]);
        g.closePath();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4.5; g.stroke();
        g.strokeStyle = w[i].color; g.lineWidth = 2.2; g.stroke();
      }
      if (w[i].polys.length && !seen[w[i].event]) { seen[w[i].event] = 1; chips += '<div><i style="background:' + w[i].color + '"></i>' + esc(w[i].event) + '</div>'; }
    }
    $('wxc-warn').innerHTML = chips;
    var hx = r.home[0], hy = r.home[1], rings = [25, 50, 75];
    g.font = '13px Newsreader, Georgia, serif'; g.textAlign = 'center';
    for (i = 0; i < rings.length; i++) {
      var rad = rings[i] * r.px_per_mile;
      g.strokeStyle = 'rgba(233,238,246,0.22)'; g.lineWidth = 1; g.beginPath(); g.arc(hx, hy, rad, 0, 6.2832); g.stroke();
      var lb = imp() ? rings[i] + ' mi' : Math.round(rings[i] * 1.609) + ' km';
      g.fillStyle = 'rgba(12,20,36,0.7)'; g.fillRect(hx - 19, hy - rad - 8, 38, 15);
      g.fillStyle = 'rgba(233,238,246,0.75)'; g.fillText(lb, hx, hy - rad + 4);
    }
    if (r.site_xy) {   // the radar itself: velocity is measured toward and away from it
      g.fillStyle = 'rgba(233,238,246,0.85)'; g.beginPath(); g.moveTo(r.site_xy[0], r.site_xy[1] - 6); g.lineTo(r.site_xy[0] + 5, r.site_xy[1] + 4); g.lineTo(r.site_xy[0] - 5, r.site_xy[1] + 4); g.closePath(); g.fill();
      g.textAlign = 'left'; g.fillStyle = 'rgba(12,20,36,0.75)'; g.fillRect(r.site_xy[0] - 18, r.site_xy[1] + 7, 36, 15);
      g.fillStyle = 'rgba(233,238,246,0.9)'; g.textAlign = 'center'; g.fillText(r.site, r.site_xy[0], r.site_xy[1] + 19);
    }
    g.fillStyle = '#ff9a4a'; g.strokeStyle = '#0c1424'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(hx, hy, 6, 0, 6.2832); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,154,74,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(hx, hy, 11, 0, 6.2832); g.stroke();
  }

  function setMode(k) {
    if (k === mode) return;
    mode = k;
    var ms = $('wxc-modes').getElementsByTagName('span');
    for (var i = 0; i < ms.length; i++) cls(ms[i], 'on', ms[i].getAttribute('data-k') === k);
    for (var u in imgs) if (imgs.hasOwnProperty(u)) imgs[u].src = '';
    imgs = {}; list = []; fi = 0;
    $('wxc-frame').style.visibility = 'hidden'; $('wxc-load').style.display = 'block';
    frames();
  }
  function frames() {
    var r = data.radar;
    if (!r) return;
    var key = KEYS[mode];
    $('wxc-key-t').textContent = mode === 'rain' ? 'Rain and snow, last hour' : 'Wind in storms, from ' + r.site;
    $('wxc-key-g').style.background = '-webkit-' + key.grad; $('wxc-key-g').style.background = key.grad;
    $('wxc-key-lo').textContent = key.lo; $('wxc-key-hi').textContent = key.hi;
    var fresh = r[mode] || [], wasEnd = fi >= list.length - 1, i;
    list = fresh;
    for (i = 0; i < list.length; i++) {
      if (imgs[list[i].url]) continue;
      var im = new Image();
      im.onload = function () { ticks(); if (!$('wxc-frame').getAttribute('src')) show(list.length - 1); };
      im.src = list[i].url;
      imgs[list[i].url] = im;
    }
    var keep = {};
    for (i = 0; i < list.length; i++) keep[list[i].url] = imgs[list[i].url];
    for (var u in imgs) if (imgs.hasOwnProperty(u) && !keep[u]) imgs[u].src = '';
    imgs = keep;
    if (wasEnd) fi = list.length - 1;
    ticks();
    if (playing) { clearTimeout(playT); playT = setTimeout(step, 600); }
  }
  function ready(i) { var im = list[i] && imgs[list[i].url]; return im && im.complete && im.naturalWidth > 0; }
  function ticks() {
    var t = $('wxc-ticks'), n = list.length, w = 428 / Math.max(1, n), html = '';
    for (var i = 0; i < n; i++) html += '<span data-i="' + i + '" style="left:' + (i * w) + 'px;width:' + w + 'px" class="' + (ready(i) ? 'ok' : '') + (i === fi ? ' on' : '') + '"></span>';
    t.innerHTML = html;
    var s = t.getElementsByTagName('span');
    for (i = 0; i < s.length; i++) tap(s[i], function (e) { playing = false; cls($('wxc-play'), 'on', false); clearTimeout(playT); show(+e.target.getAttribute('data-i')); });
  }
  function show(i) {
    if (!ready(i)) return;
    fi = i;
    var f = $('wxc-frame');
    f.src = list[i].url; f.style.visibility = 'visible';
    $('wxc-load').style.display = 'none';
    var t = iso(list[i].t), mins = Math.round((iso(list[list.length - 1].t) - t) / 60000);
    $('wxc-ft').textContent = clock(t);
    $('wxc-fa').textContent = i === list.length - 1 ? 'latest, ' + ago(t) : mins + ' min earlier';
    var s = $('wxc-ticks').getElementsByTagName('span');
    for (var k = 0; k < s.length; k++) cls(s[k], 'on', k === i);
  }
  function step() {
    clearTimeout(playT);
    if (!playing || !root || root.className.indexOf('on') < 0 || !list.length) return;
    var n = list.length, next = (fi + 1) % n, tries = 0;
    while (!ready(next) && tries++ < n) next = (next + 1) % n;
    if (ready(next)) show(next);
    playT = setTimeout(step, fi === n - 1 ? 1600 : 450);   // linger on the latest scan
  }

  return {
    attach: function (el, unitFn) {
      if (!el) return;
      if (unitFn) getUnit = unitFn;
      el.className += ' tap';
      el.addEventListener('click', function (e) { e.stopPropagation(); open(); }, false);
    },
    open: open, close: close
  };
})();
