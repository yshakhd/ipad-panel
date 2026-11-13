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
    '#wxc .wxn { font-family: "Big Shoulders Display", sans-serif; font-weight: 600; letter-spacing: 0.5px; }',
    '#wxc .wxm { color: #8e9db6; }',
    '#wxc-head { position: absolute; left: 24px; top: 14px; width: 620px; white-space: nowrap; overflow: hidden; }',
    '#wxc-place { font-size: 30px; font-style: italic; }',
    '#wxc-upd { font-size: 17px; margin-left: 12px; }',
    '#wxc-tabs { position: absolute; left: 340px; top: 11px; border-radius: 21px; border: 1px solid rgba(233,238,246,0.18); padding: 3px; }',
    '#wxc-tabs span { display: inline-block; height: 34px; line-height: 34px; padding: 0 16px; border-radius: 17px; font-size: 18px; cursor: pointer; color: #b8c4d8; }',
    '#wxc-tabs span.on { background: #e9eef6; color: #0c1424; }',
    '#wxc .wxp { display: none; } #wxc .wxp.on { display: block; }',
    '#wxc-mg { position: absolute; left: 20px; top: 66px; }',
    '#wxc-sk { position: absolute; left: 14px; top: 62px; }',
    '#wxc-skbar { position: absolute; left: 66px; top: 664px; width: 560px; height: 40px; }',
    '#wxc-skbar span { position: absolute; top: 0; height: 40px; cursor: pointer; }',
    '#wxc-skbar span:after { content: ""; position: absolute; left: 2px; right: 2px; top: 17px; height: 6px; border-radius: 3px; background: rgba(233,238,246,0.3); }',
    '#wxc-skbar span.wxd:after { background: rgba(233,238,246,0.5); }',
    '#wxc-skbar span.on:after { top: 13px; height: 14px; border-radius: 4px; background: #ff9a4a; }',
    '#wxc-skt { position: absolute; left: 636px; top: 662px; line-height: 1.05; } #wxc-skt .wxn { font-size: 24px; } #wxc-skt div { font-size: 14px; font-style: italic; }',
    '#wxc-sknote { position: absolute; left: 22px; top: 714px; width: 980px; font-size: 13px; }',
    '#wxc-skside { position: absolute; left: 730px; top: 66px; width: 274px; }',
    '#wxc-sksum { font-size: 19px; line-height: 1.3; margin-bottom: 12px; min-height: 100px; }',
    '#wxc-skrows .wxr { border-top: 1px solid rgba(233,238,246,0.1); padding: 5px 0 4px; overflow: hidden; }',
    '#wxc-skrows .wxk { float: left; font-size: 16px; line-height: 27px; color: #8e9db6; }',
    '#wxc-skrows .wxv { float: right; font-size: 23px; line-height: 27px; text-align: right; }',
    '#wxc-skrows .wxv em { font-family: "Newsreader", Georgia, serif; font-weight: 400; font-size: 14px; letter-spacing: 0; color: #b8c4d8; margin-left: 5px; }',
    '#wxc-close { position: absolute; right: 20px; top: 10px; height: 42px; line-height: 40px; padding: 0 20px 0 18px; border-radius: 21px;',
    '  border: 1px solid rgba(233,238,246,0.28); font-size: 19px; cursor: pointer; }',
    '#wxc-close:active, #wxc .wxb:active { background: rgba(233,238,246,0.16); }',
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
    '#wxc-clock .wxn { font-size: 24px; } #wxc-clock div { font-size: 14px; font-style: italic; }',
    '#wxc-credit { position: absolute; left: 22px; top: 714px; width: 980px; font-size: 13px; }',
    '#wxc-side { position: absolute; left: 684px; top: 58px; width: 318px; }',
    '#wxc-alert { display: none; margin: 4px 0 10px; padding: 8px 12px; border-radius: 6px; font-size: 17px; line-height: 1.25; border-left: 5px solid; background: rgba(255,255,255,0.06); }',
    '#wxc-alert .wxm { font-size: 15px; font-style: italic; }',
    '#wxc-temp { font-size: 108px; line-height: 0.9; font-weight: 400; margin-left: -4px; }',
    '#wxc-temp small { font-size: 0.42em; margin-left: 4px; color: #8e9db6; }',
    '#wxc-cond { font-size: 19px; margin: 6px 0 10px; line-height: 1.25; }',
    '#wxc-rows .wxr { border-top: 1px solid rgba(233,238,246,0.1); padding: 5px 0 4px; overflow: hidden; }',
    '#wxc-rows .wxk { float: left; font-size: 17px; line-height: 28px; color: #8e9db6; }',
    '#wxc-rows .wxv { float: right; font-size: 24px; line-height: 28px; text-align: right; }',
    '#wxc-rows .wxv em { font-family: "Newsreader", Georgia, serif; font-weight: 400; font-size: 15px; letter-spacing: 0; color: #b8c4d8; margin-left: 6px; }',
    '#wxc-metar { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(233,238,246,0.1); }',
    '#wxc-metar .wxm { font-size: 14px; font-style: italic; }',
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
        '<div id="wxc-head"><span id="wxc-place"></span><span id="wxc-upd" class="wxm"></span></div>' +
        '<div id="wxc-tabs"></div><div id="wxc-close" class="wxb">Close</div>' +
        '<div class="wxp on" id="wxc-pg-now"><div id="wxc-radar"><div id="wxc-load">Loading radar…</div><img id="wxc-frame" alt=""><canvas id="wxc-over" width="640" height="640"></canvas>' +
          '<div id="wxc-modes"><span data-k="rain" class="on">Rain and snow</span><span data-k="vel">Velocity</span></div>' +
          '<div id="wxc-key"><span id="wxc-key-t"></span><i id="wxc-key-g"></i><span id="wxc-key-lo"></span><b id="wxc-key-hi"></b></div>' +
          '<div id="wxc-warn"></div>' +
          '<div id="wxc-bar"><div id="wxc-play" class="wxb on"></div><div id="wxc-ticks"></div><div id="wxc-clock"><span class="wxn" id="wxc-ft"></span><div id="wxc-fa" class="wxm"></div></div></div>' +
        '</div>' +
        '<div id="wxc-credit" class="wxm">Radar: NOAA NEXRAD via the Iowa Environmental Mesonet. Map: Esri, HERE, Garmin, OpenStreetMap contributors. Data: National Weather Service, Open-Meteo.</div>' +
        '<div id="wxc-side"><div id="wxc-alert"></div><div id="wxc-temp" class="wxn"></div><div id="wxc-cond"></div><div id="wxc-rows"></div><div id="wxc-metar"></div></div></div>' +
        '<div class="wxp" id="wxc-pg-48"><canvas id="wxc-mg" width="984" height="636"></canvas></div>' +
        '<div class="wxp" id="wxc-pg-sky"><canvas id="wxc-sk" width="700" height="596"></canvas><div id="wxc-skbar"></div>' +
          '<div id="wxc-skt"><span class="wxn" id="wxc-skh"></span><div id="wxc-skd" class="wxm"></div></div>' +
          '<div id="wxc-skside"><div id="wxc-sksum"></div><div id="wxc-skrows"></div></div>' +
          '<div id="wxc-sknote" class="wxm">The air above home from the NOAA GFS and HRRR models (via Open-Meteo). Temperatures in °C, heights above the ground.</div></div>' +
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
    var tabs = '';
    for (i = 0; i < PAGES.length; i++) tabs += '<span data-p="' + PAGES[i][0] + '"' + (i ? '' : ' class="on"') + '>' + PAGES[i][1] + '</span>';
    $('wxc-tabs').innerHTML = tabs;
    var ts = $('wxc-tabs').getElementsByTagName('span');
    for (i = 0; i < ts.length; i++) tap(ts[i], function (e) { showPage(e.target.getAttribute('data-p')); });
    tap($('wxc-mg'), function (e) { var r = $('wxc-mg').getBoundingClientRect(); mgPick = (e.clientX - r.left) * 984 / r.width; meteogram(); });
  }
  var PAGES = [['now', 'Radar'], ['48', 'Next 48 hours'], ['sky', 'Sounding']], page = 'now', mgPick = null, skSel = 0;
  function showPage(p) {
    page = p;
    var ts = $('wxc-tabs').getElementsByTagName('span'), i;
    for (i = 0; i < ts.length; i++) cls(ts[i], 'on', ts[i].getAttribute('data-p') === p);
    for (i = 0; i < PAGES.length; i++) cls($('wxc-pg-' + PAGES[i][0]), 'on', PAGES[i][0] === p);
    if (p === 'now') step(); else clearTimeout(playT);
    if (p === '48') { mgPick = null; meteogram(); }
    if (p === 'sky') { skSel = 0; skewT(); }
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
    if (page === '48') meteogram();
    if (page === 'sky') skewT();
  }

  /* ---------------- the readings column ---------------- */
  function hourIndex(f) {
    var h = f.hourly, now = (f.current.time || '').slice(0, 13) + ':00';
    for (var i = 0; i < h.time.length; i++) if (h.time[i] === now) return i;
    return 0;
  }
  function row(k, v, note) { return '<div class="wxr"><span class="wxk">' + k + '</span><span class="wxv wxn">' + v + (note ? '<em>' + note + '</em>' : '') + '</span></div>'; }
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
    if (!f || !f.current) { side.innerHTML = '<div class="wxr wxm">Forecast numbers are unavailable.</div>'; return; }
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

    $('wxc-metar').innerHTML = obs && obs.raw ? '<div class="wxm">' + esc(obs.name) + ', ' + ago(iso(obs.time)) + '</div><code>' + esc(obs.raw) + '</code>' : '';

    var here = null, w = data.warnings || [];
    for (var j = 0; j < w.length; j++) if (w[j].here) { here = w[j]; break; }
    var al = $('wxc-alert');
    if (here) {
      al.style.display = 'block'; al.style.borderColor = here.color;
      al.innerHTML = esc(here.event) + (here.ends ? '<div class="wxm">until ' + clock(iso(here.ends)) + '</div>' : '');
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
    if (!playing || page !== 'now' || !root || root.className.indexOf('on') < 0 || !list.length) return;
    var n = list.length, next = (fi + 1) % n, tries = 0;
    while (!ready(next) && tries++ < n) next = (next + 1) % n;
    if (ready(next)) show(next);
    playT = setTimeout(step, fi === n - 1 ? 1600 : 450);   // linger on the latest scan
  }

  /* ---------------- next 48 hours: a meteogram, the forecaster's chart ----------------
   * Stacked lanes on one time axis: temperature with dew point and feels-like, rain and
   * snow (amount bars, chance line, a bolt where storms are possible), low/mid/high cloud,
   * wind with gusts and barbs, and pressure. Night hours are shaded. Tap for one hour's numbers. */
  var DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var NUM = '600 16px "Big Shoulders Display", sans-serif', TXT = '14px Newsreader, Georgia, serif';
  function tU(c) { return imp() ? c * 9 / 5 + 32 : c; }
  function nice(lo, hi, steps) {
    var st = steps[steps.length - 1];
    for (var i = 0; i < steps.length; i++) if ((hi - lo) / steps[i] <= 5) { st = steps[i]; break; }
    lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
    if (hi === lo) hi = lo + st;
    return [lo, hi, st];
  }
  function barb(g, x, y, dir, kt) {   // standard wind barb: staff points to where the wind comes from
    var a = dir * Math.PI / 180, ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, len = 22, pos = len;
    if (kt < 3) { g.beginPath(); g.arc(x, y, 3.5, 0, 6.2832); g.stroke(); return; }
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ux * len, y + uy * len); g.stroke();
    var r = Math.round(kt / 5) * 5;
    function S(d) { return [x + ux * d, y + uy * d]; }
    while (r >= 50) { var p0 = S(pos), p1 = S(pos - 7); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p0[0] + px * 9, p0[1] + py * 9); g.lineTo(p1[0], p1[1]); g.closePath(); g.fill(); r -= 50; pos -= 9; }
    while (r >= 10) { var q = S(pos); g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + px * 9 + ux * 3, q[1] + py * 9 + uy * 3); g.stroke(); r -= 10; pos -= 4; }
    if (r >= 5) { if (pos === len) pos -= 4; var hq = S(pos); g.beginPath(); g.moveTo(hq[0], hq[1]); g.lineTo(hq[0] + px * 5 + ux * 1.6, hq[1] + py * 5 + uy * 1.6); g.stroke(); }
  }
  function meteogram() {
    var f = data && data.forecast, g = $('wxc-mg').getContext('2d'), W = 984, H = 636, L = 56, RG = 44;
    g.clearRect(0, 0, W, H);
    if (!f || !f.hourly) return;
    var h = f.hourly, i0 = hourIndex(f), n = Math.min(49, h.time.length - i0), j, v;
    var dx = (W - L - RG) / (n - 1);
    function X(k) { return L + k * dx; }
    function at(key, k) { return h[key][i0 + k]; }
    var LT = [52, 170], LR = [256, 76], LC = [360, 48], LW = [436, 56], LB = 506, LP = [568, 56];
    function title(t, y, col) { g.font = TXT; g.textAlign = 'left'; g.fillStyle = col || '#8e9db6'; g.fillText(t, L, y - 8); }   // above its lane
    function span(k) { var a = Math.max(L, X(k) - dx / 2), b = Math.min(W - RG, X(k) + dx / 2); return [a, b - a]; }
    function gridY(y, lab) { g.strokeStyle = 'rgba(233,238,246,0.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y + 0.5); g.lineTo(W - RG, y + 0.5); g.stroke(); if (lab != null) { g.font = NUM; g.textAlign = 'right'; g.fillStyle = '#8e9db6'; g.fillText(lab, L - 8, y + 5); } }

    // night bands, midnights and the hour labels along the top
    for (j = 0; j < n; j++) if (!at('is_day', j)) { var sp = span(j); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(sp[0], 30, sp[1] + 0.5, H - 30); }
    g.font = TXT; g.textAlign = 'left'; g.fillStyle = '#e9eef6';
    var t0 = at('time', 0).split('T')[0].split('-');
    var firstMid = 99;
    for (j = 1; j < n; j++) if (at('time', j).substr(11, 2) === '00') { firstMid = j; break; }
    if (X(firstMid) - L > 90) g.fillText(DAYN[new Date(+t0[0], +t0[1] - 1, +t0[2]).getDay()], L + 4, 18);
    for (j = 1; j < n; j++) {
      var tm = at('time', j), hr = +tm.substr(11, 2);
      if (hr === 0) {
        var dd = tm.split('T')[0].split('-');
        g.strokeStyle = 'rgba(233,238,246,0.22)'; g.beginPath(); g.moveTo(X(j) + 0.5, 26); g.lineTo(X(j) + 0.5, H); g.stroke();
        g.fillStyle = '#e9eef6'; g.textAlign = 'left'; g.fillText(DAYN[new Date(+dd[0], +dd[1] - 1, +dd[2]).getDay()], X(j) + 5, 18);
      } else if (hr % 6 === 0 && X(j) > L + 90) {
        g.fillStyle = '#8e9db6'; g.textAlign = 'center'; g.fillText(hr === 12 ? 'noon' : (hr % 12) + (hr < 12 ? ' am' : ' pm'), X(j), 18);
      }
    }

    // temperature, dew point, feels like
    var T = [], D = [], F = [], lo = 1e9, hi = -1e9;
    for (j = 0; j < n; j++) { T[j] = tU(at('temperature_2m', j)); D[j] = tU(at('dew_point_2m', j)); F[j] = tU(at('apparent_temperature', j)); lo = Math.min(lo, T[j], D[j], F[j]); hi = Math.max(hi, T[j], D[j], F[j]); }
    var sc = nice(lo, hi, imp() ? [5, 10, 20] : [2, 5, 10]);
    function YT(val) { return LT[0] + LT[1] - (val - sc[0]) / (sc[1] - sc[0]) * LT[1]; }
    for (v = sc[0]; v <= sc[1]; v += sc[2]) gridY(YT(v), v + '°');
    var fz = imp() ? 32 : 0;
    if (fz > sc[0] && fz < sc[1]) {
      g.strokeStyle = 'rgba(127,200,255,0.7)'; g.setLineDash && g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, YT(fz)); g.lineTo(W - RG, YT(fz)); g.stroke(); g.setLineDash && g.setLineDash([]);
      g.font = TXT; g.fillStyle = '#7fc8ff'; g.textAlign = 'right'; g.fillText('freezing', W - RG - 4, YT(fz) - 5);
    }
    function line(arr, Y, col, w, dash) {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
      if (dash && g.setLineDash) g.setLineDash(dash);
      g.beginPath(); for (var k = 0; k < arr.length; k++) { if (k) g.lineTo(X(k), Y(arr[k])); else g.moveTo(X(k), Y(arr[k])); } g.stroke();
      if (dash && g.setLineDash) g.setLineDash([]);
    }
    line(F, YT, 'rgba(255,154,74,0.55)', 1.5, [4, 4]);
    line(D, YT, '#6fd48f', 2);
    line(T, YT, '#ff9a4a', 2.5);
    var mx = 0, mn = 0;
    for (j = 1; j < n; j++) { if (T[j] > T[mx]) mx = j; if (T[j] < T[mn]) mn = j; }
    g.font = NUM; g.textAlign = 'center'; g.fillStyle = '#ffb27a';
    g.fillText(Math.round(T[mx]) + '°', Math.min(W - RG - 10, Math.max(L + 300, X(mx))), Math.max(LT[0] + 14, YT(T[mx]) - 8));
    g.fillText(Math.round(T[mn]) + '°', Math.min(W - RG - 10, Math.max(L + 12, X(mn))), YT(T[mn]) + 20);
    title('Temperature', LT[0], '#ff9a4a');
    g.fillStyle = '#6fd48f'; g.fillText('Dew point', L + 96, LT[0] - 8);
    g.fillStyle = 'rgba(255,154,74,0.75)'; g.fillText('Feels like', L + 172, LT[0] - 8);

    // rain and snow: amount bars, chance line, storms
    var P = [], maxA = imp() ? 2.54 : 2;
    for (j = 0; j < n; j++) { P[j] = at('precipitation', j) || 0; maxA = Math.max(maxA, P[j]); }
    gridY(LR[0]); gridY(LR[0] + LR[1]);
    g.font = NUM; g.textAlign = 'right'; g.fillStyle = '#8e9db6';
    g.fillText(imp() ? (maxA / 25.4).toFixed(2) + '"' : maxA.toFixed(1), L - 8, LR[0] + 12);
    g.textAlign = 'left'; g.fillText('100%', W - RG + 4, LR[0] + 12); g.fillText('0', W - RG + 4, LR[0] + LR[1] + 4);
    for (j = 0; j < n; j++) {
      if (P[j] <= 0) continue;
      var bh = Math.max(2, P[j] / maxA * LR[1]);
      g.fillStyle = (at('snowfall', j) || 0) > 0 ? '#dfe7ff' : '#4aa8ff';
      g.fillRect(X(j) - dx * 0.35, LR[0] + LR[1] - bh, dx * 0.7, bh);
    }
    g.strokeStyle = 'rgba(160,210,255,0.9)'; g.lineWidth = 1.5; g.beginPath();
    for (j = 0; j < n; j++) { var py2 = LR[0] + LR[1] - (at('precipitation_probability', j) || 0) / 100 * LR[1]; if (j) g.lineTo(X(j), py2); else g.moveTo(X(j), py2); }
    g.stroke();
    for (j = 0; j < n; j++) if ((at('cape', j) || 0) >= 500 && (at('precipitation_probability', j) || 0) >= 30) {   // storms possible
      var bx = X(j), by = LR[0] + 4; g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(bx + 2, by); g.lineTo(bx - 4, by + 10); g.lineTo(bx, by + 10); g.lineTo(bx - 2, by + 18); g.lineTo(bx + 5, by + 7); g.lineTo(bx + 1, by + 7); g.closePath(); g.fill();
    }
    title('Rain and snow per hour', LR[0], '#4aa8ff'); g.fillStyle = 'rgba(160,210,255,0.9)'; g.fillText('Chance', L + 160, LR[0] - 8);
    g.fillStyle = '#dfe7ff'; g.fillText('Snow', L + 222, LR[0] - 8);

    // clouds by height
    var rows = [['High', 'cloud_cover_high'], ['Mid', 'cloud_cover_mid'], ['Low', 'cloud_cover_low']], rh = LC[1] / 3;
    for (var c = 0; c < 3; c++) {
      var yc = LC[0] + c * rh;
      g.font = TXT; g.textAlign = 'right'; g.fillStyle = '#8e9db6'; g.fillText(rows[c][0], L - 8, yc + rh / 2 + 4);
      for (j = 0; j < n; j++) { var cc = at(rows[c][1], j) || 0; if (cc < 5) continue; var cs = span(j); g.fillStyle = 'rgba(205,215,232,' + (cc / 100 * 0.85).toFixed(2) + ')'; g.fillRect(cs[0], yc + 1, cs[1] + 0.5, rh - 2); }
    }
    title('Cloud cover', LC[0]);

    // wind and gusts, with barbs every 3 hours
    var Sp = [], G = [], wmax = 0, k2 = imp() ? 0.6214 : 1;
    for (j = 0; j < n; j++) { Sp[j] = at('wind_speed_10m', j) * k2; G[j] = Math.max(Sp[j], (at('wind_gusts_10m', j) || 0) * k2); wmax = Math.max(wmax, G[j]); }
    var ws = nice(0, Math.max(wmax, 10), [5, 10, 20]);
    function YW(val) { return LW[0] + LW[1] - val / ws[1] * LW[1]; }
    for (v = 0; v <= ws[1]; v += ws[2] * 2) gridY(YW(v), v);
    g.fillStyle = 'rgba(159,208,255,0.18)'; g.beginPath();
    for (j = 0; j < n; j++) { if (j) g.lineTo(X(j), YW(G[j])); else g.moveTo(X(j), YW(G[j])); }
    for (j = n - 1; j >= 0; j--) g.lineTo(X(j), YW(Sp[j]));
    g.closePath(); g.fill();
    line(Sp, YW, '#9fd0ff', 2);
    g.strokeStyle = 'rgba(233,238,246,0.8)'; g.fillStyle = 'rgba(233,238,246,0.8)'; g.lineWidth = 1.3;
    for (j = 0; j < n; j += 3) barb(g, X(j), LB + 14, at('wind_direction_10m', j) || 0, (at('wind_speed_10m', j) || 0) * 0.54);
    title('Wind (' + (imp() ? 'mph' : 'km/h') + ')', LW[0], '#9fd0ff'); g.fillStyle = 'rgba(159,208,255,0.75)'; g.fillText('Gusts', L + 94, LW[0] - 8);

    // pressure
    var Pr = [], plo = 1e9, phi = -1e9, pk = imp() ? 0.02953 : 1;
    for (j = 0; j < n; j++) { Pr[j] = at('pressure_msl', j) * pk; plo = Math.min(plo, Pr[j]); phi = Math.max(phi, Pr[j]); }
    var ps = nice(plo, phi, imp() ? [0.05, 0.1, 0.2, 0.5] : [2, 5, 10, 20]);
    function YP(val) { return LP[0] + LP[1] - (val - ps[0]) / (ps[1] - ps[0]) * LP[1]; }
    gridY(YP(ps[0]), imp() ? ps[0].toFixed(2) : ps[0]); gridY(YP(ps[1]), imp() ? ps[1].toFixed(2) : ps[1]);
    line(Pr, YP, '#c9b6ff', 2);
    title('Pressure (' + (imp() ? 'inches' : 'hPa') + ')', LP[0], '#c9b6ff');

    // now, and the picked hour
    var mins = +(f.current.time || '').substr(14, 2) || 0, xn = X(mins / 60);
    g.strokeStyle = '#ff9a4a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xn, 26); g.lineTo(xn, H); g.stroke();
    if (mgPick != null) {
      var sel = Math.max(0, Math.min(n - 1, Math.round((mgPick - L) / dx))), xs = X(sel), tt = at('time', sel), hh = +tt.substr(11, 2);
      var dp = tt.split('T')[0].split('-');
      g.strokeStyle = 'rgba(233,238,246,0.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xs + 0.5, 30); g.lineTo(xs + 0.5, H); g.stroke();
      var lines = [
        DAYN[new Date(+dp[0], +dp[1] - 1, +dp[2]).getDay()].substr(0, 3) + ' ' + (hh === 12 ? 'noon' : hh === 0 ? 'midnight' : (hh % 12) + (hh < 12 ? ' am' : ' pm')),
        temp(at('temperature_2m', sel)) + ', dew point ' + temp(at('dew_point_2m', sel)),
        'Feels like ' + temp(at('apparent_temperature', sel)),
        (at('precipitation_probability', sel) || 0) + '% chance' + ((at('precipitation', sel) || 0) >= 0.1 ? ', ' + amount(at('precipitation', sel)) : ''),
        'Wind ' + COMPASS[Math.round((at('wind_direction_10m', sel) || 0) / 22.5) % 16] + ' ' + speed(at('wind_speed_10m', sel)) + ', gusts ' + speed(at('wind_gusts_10m', sel)),
        'Pressure ' + press(at('pressure_msl', sel))
      ];
      var bw = 230, bxp = xs + 12 + bw > W ? xs - 12 - bw : xs + 12, byp = 44;
      g.fillStyle = 'rgba(12,20,36,0.94)'; g.fillRect(bxp, byp, bw, 20 + lines.length * 20);
      g.strokeStyle = 'rgba(233,238,246,0.25)'; g.strokeRect(bxp + 0.5, byp + 0.5, bw, 20 + lines.length * 20);
      g.textAlign = 'left';
      for (j = 0; j < lines.length; j++) { g.font = j ? TXT : 'italic 16px Newsreader, Georgia, serif'; g.fillStyle = j ? '#e9eef6' : '#ffb27a'; g.fillText(lines[j], bxp + 12, byp + 22 + j * 20); }
    }
  }

  /* ---------------- the sounding: a Skew-T log-P diagram ----------------
   * Pressure falls (log scale) up the page; isotherms lean 45 degrees to the right. Red is the
   * temperature, green the dew point, dashed gold the path air rising from the ground would
   * take (computed on the server); red shading is storm energy (CAPE), blue the lid (CIN).
   * Faint background: dry adiabats (orange), moist adiabats (blue, dashed), mixing ratio (green). */
  var SK = { X0: 50, Y0: 8, W: 560, H: 560, PB: 1050, PT: 175, TMIN: -40, TMAX: 50 };
  function skY(p) { return SK.Y0 + SK.H - SK.H * Math.log(SK.PB / p) / Math.log(SK.PB / SK.PT); }
  function skX(t, p) { return SK.X0 + (t - SK.TMIN + 42 * Math.log(SK.PB / p)) / (SK.TMAX - SK.TMIN) * SK.W; }   // the usual skew: about 29 degrees from 1000 to 500 mb
  function es(t) { return 6.112 * Math.exp(17.67 * t / (t + 243.5)); }
  function moistSlope(p, tk) { var e = Math.min(es(tk - 273.15), p * 0.5), r = 0.622 * e / (p - e); return (287.04 * tk + 2.501e6 * r) / (1005.7 + 2.501e6 * 2.501e6 * r * 0.622 / (287.04 * tk * tk)) / p; }
  function lvAt(lv, p, k) {   // lv: [p, t, td, ws, wd, z] from the ground up; linear in ln p
    for (var i = 0; i < lv.length - 1; i++) if (lv[i][0] >= p && p >= lv[i + 1][0]) { var f = Math.log(lv[i][0] / p) / Math.log(lv[i][0] / lv[i + 1][0]); return lv[i][k] + (lv[i + 1][k] - lv[i][k]) * f; }
    return null;
  }
  function skewT() {
    var snd = data && data.sounding, g = $('wxc-sk').getContext('2d'), i, p, t;
    g.clearRect(0, 0, 700, 596);
    if (!snd || !snd.length) { $('wxc-sksum').textContent = 'The sounding is unavailable right now.'; return; }
    if (skSel >= snd.length) skSel = 0;
    var hr = snd[skSel], lv = hr.lv, ix = hr.idx;
    g.save(); g.beginPath(); g.rect(SK.X0, SK.Y0, SK.W, SK.H); g.clip();
    // background: dry adiabats, moist adiabats, mixing ratio, isotherms, isobars
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,170,90,0.13)';
    for (t = -30; t <= 170; t += 10) { g.beginPath(); for (p = SK.PB; p >= SK.PT; p -= 25) { var tt = (t + 273.15) * Math.pow(p / 1000, 0.2857) - 273.15; if (p === SK.PB) g.moveTo(skX(tt, p), skY(p)); else g.lineTo(skX(tt, p), skY(p)); } g.stroke(); }
    g.strokeStyle = 'rgba(120,200,255,0.17)'; g.setLineDash && g.setLineDash([5, 4]);
    for (t = -12; t <= 36; t += 6) { var tk = t + 273.15; g.beginPath(); g.moveTo(skX(t, 1000), skY(1000)); for (p = 1000; p > 200; p -= 10) { var k1 = moistSlope(p, tk), k2 = moistSlope(p - 10, tk - 10 * k1); tk -= 10 * (k1 + k2) / 2; g.lineTo(skX(tk - 273.15, p - 10), skY(p - 10)); } g.stroke(); }
    g.strokeStyle = 'rgba(111,212,143,0.3)'; g.setLineDash && g.setLineDash([2, 4]);
    var W_ = [1, 2, 4, 8, 16];
    for (i = 0; i < W_.length; i++) { var r = W_[i] / 1000; g.beginPath(); for (p = SK.PB; p >= 600; p -= 25) { var e = r * p / (0.622 + r), lg = Math.log(e / 6.112), td = 243.5 * lg / (17.67 - lg); if (p === SK.PB) g.moveTo(skX(td, p), skY(p)); else g.lineTo(skX(td, p), skY(p)); } g.stroke(); }
    g.setLineDash && g.setLineDash([]);
    for (t = -100; t <= 50; t += 10) {
      g.strokeStyle = t === 0 ? 'rgba(127,200,255,0.55)' : 'rgba(233,238,246,0.08)'; g.lineWidth = t === 0 ? 1.5 : 1;
      g.beginPath(); g.moveTo(skX(t, SK.PB), skY(SK.PB)); g.lineTo(skX(t, SK.PT), skY(SK.PT)); g.stroke();
    }
    var ISO = [1000, 925, 850, 700, 500, 400, 300, 250, 200];
    g.strokeStyle = 'rgba(233,238,246,0.1)'; g.lineWidth = 1;
    for (i = 0; i < ISO.length; i++) { g.beginPath(); g.moveTo(SK.X0, Math.round(skY(ISO[i])) + 0.5); g.lineTo(SK.X0 + SK.W, Math.round(skY(ISO[i])) + 0.5); g.stroke(); }

    // storm energy and the lid, between the rising-air path and the temperature
    var pc = hr.parcel;
    function shade(pTop, pBot, col) {
      var pts = [], j;
      for (j = 0; j < pc.length; j++) if (pc[j][0] <= pBot + 0.5 && pc[j][0] >= pTop - 0.5) pts.push(pc[j]);
      if (pts.length < 2) return;
      g.fillStyle = col; g.beginPath();
      for (j = 0; j < pts.length; j++) { if (j) g.lineTo(skX(pts[j][1], pts[j][0]), skY(pts[j][0])); else g.moveTo(skX(pts[j][1], pts[j][0]), skY(pts[j][0])); }
      for (j = pts.length - 1; j >= 0; j--) { var te = lvAt(lv, pts[j][0], 1); if (te != null) g.lineTo(skX(te, pts[j][0]), skY(pts[j][0])); }
      g.closePath(); g.fill();
    }
    if (ix.lfc && ix.el && ix.cape > 0) shade(ix.el, ix.lfc, 'rgba(255,90,70,0.3)');
    if (ix.lfc && ix.cin < -1) shade(ix.lfc, lv[0][0], 'rgba(90,150,255,0.25)');
    function prof(k, col, w, dash) {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; if (dash && g.setLineDash) g.setLineDash(dash);
      g.beginPath();
      for (var j = 0; j < (k === 'parcel' ? pc.length : lv.length); j++) {
        var pp = k === 'parcel' ? pc[j][0] : lv[j][0], tv = k === 'parcel' ? pc[j][1] : lv[j][k];
        if (j) g.lineTo(skX(tv, pp), skY(pp)); else g.moveTo(skX(tv, pp), skY(pp));
      }
      g.stroke(); if (dash && g.setLineDash) g.setLineDash([]);
    }
    prof('parcel', 'rgba(255,225,120,0.9)', 1.6, [6, 4]);
    prof(2, '#5fd38d', 2.5);
    prof(1, '#ff6a5a', 2.5);
    var yl = skY(ix.lcl_p), xl = skX(lvAt(lv, ix.lcl_p, 1) || 0, ix.lcl_p);   // cloud base tick
    g.strokeStyle = '#e9eef6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(xl + 6, yl); g.lineTo(xl + 26, yl); g.stroke();
    g.font = TXT; g.fillStyle = '#e9eef6'; g.textAlign = 'left'; g.fillText('cloud base', xl + 30, yl + 4);
    g.restore();

    // axes: pressure and height on the left, temperature along the bottom, barbs on the right
    g.font = NUM; g.textAlign = 'right';
    for (i = 0; i < ISO.length; i++) {
      if (ISO[i] === 925) continue;   // too close to its neighbours to label
      var yy = skY(ISO[i]), z = lvAt(lv, ISO[i], 5);
      g.fillStyle = '#b8c4d8'; g.fillText(ISO[i], SK.X0 - 6, yy + 3);
      if (z != null && z > 300) { g.font = '12px Newsreader, Georgia, serif'; g.fillStyle = '#8e9db6'; g.fillText(imp() ? Math.round(z * 3.2808 / 1000) + 'k ft' : (z / 1000).toFixed(1) + ' km', SK.X0 - 6, yy + 16); g.font = NUM; }
    }
    g.textAlign = 'center'; g.fillStyle = '#8e9db6';
    for (t = -40; t <= 40; t += 10) g.fillText(t + '°', skX(t, SK.PB), SK.Y0 + SK.H + 18);
    g.strokeStyle = 'rgba(233,238,246,0.85)'; g.fillStyle = 'rgba(233,238,246,0.85)'; g.lineWidth = 1.3;
    var lastY = 1e9;
    for (i = 1; i < lv.length; i++) {   // one barb per level, skipping levels that would overlap
      var by2 = skY(lv[i][0]);
      if (lv[i][3] == null || lv[i][0] < SK.PT || lastY - by2 < 24) continue;
      barb(g, SK.X0 + SK.W + 40, by2, lv[i][4], lv[i][3] * 0.54); lastY = by2;
    }
    g.font = TXT; g.textAlign = 'left';
    g.fillStyle = '#ff6a5a'; g.fillText('Temperature', SK.X0 + SK.W - 250, SK.Y0 + 18);
    g.fillStyle = '#5fd38d'; g.fillText('Dew point', SK.X0 + SK.W - 162, SK.Y0 + 18);
    g.fillStyle = 'rgba(255,225,120,0.95)'; g.fillText('Rising air', SK.X0 + SK.W - 92, SK.Y0 + 18);

    skSide(hr);
    skBar();
  }
  function skSide(hr) {
    var ix = hr.idx, s1, s2 = '';
    if (ix.cape >= 1000 && ix.cin > -50) s1 = 'Unstable: storms could grow quickly if something sets them off.';
    else if (ix.cape >= 250) s1 = ix.cin <= -50 ? 'Some storm energy, held down by a lid of warm air.' : 'A little storm energy: thunder is possible.';
    else s1 = 'Stable air: no thunderstorms.';
    if (ix.kind === 'snow' && ix.moist) s2 = ' Cold from the clouds to the ground, so anything that falls is snow.';
    else if (ix.kind === 'ice' && ix.moist) s2 = ' A warm layer aloft over freezing ground: watch for freezing rain or sleet.';
    else if (ix.kind === 'mix' && ix.moist) s2 = ' Barely above freezing at the ground: rain and snow could mix.';
    else if (ix.moist) s2 = ' Moist through the lower atmosphere: clouds, and rain if there’s lift.';
    else s2 = ' Dry air in the lower atmosphere.';
    $('wxc-sksum').textContent = s1 + s2;
    var sh = ix.shear, shU = sh == null ? '--' : imp() ? Math.round(sh * 0.54) + ' kt' : Math.round(sh) + ' km/h';
    var lrW = ix.lr == null ? '' : ix.lr >= 7.5 ? 'steep' : ix.lr >= 6 ? 'moderate' : 'gentle';
    var kinds = { snow: 'Snow', ice: 'Ice risk', mix: 'Rain and snow', rain: 'Rain' };
    $('wxc-skrows').innerHTML =
      row('Storm energy', ix.cape < 25 ? 'None' : comma(ix.cape) + ' J/kg', ix.cape >= 2500 ? 'high' : ix.cape >= 1000 ? 'moderate' : ix.cape >= 100 ? 'low' : '') +
      row('Lid (CIN)', ix.cin > -5 ? 'None' : comma(ix.cin) + ' J/kg', ix.cin > -5 ? '' : ix.cin <= -100 ? 'strong' : ix.cin <= -25 ? 'some' : 'weak') +
      row('Lifted index', ix.li == null ? '--' : (ix.li > 0 ? '+' : '') + ix.li, ix.li == null ? '' : ix.li <= -4 ? 'very unstable' : ix.li < 0 ? 'unstable' : 'stable') +
      row('Cloud base', height(ix.lcl_z)) +
      row('Freezing level', ix.frz == null ? '--' : ix.frz < 30 ? 'Ground' : height(ix.frz)) +
      row('Water in the air', imp() ? (ix.pw / 25.4).toFixed(2) + ' in' : Math.round(ix.pw) + ' mm', 'precipitable') +
      row('Lapse rate', ix.lr == null ? '--' : ix.lr + '°/km', lrW) +
      row('Wind shear', shU, sh != null && sh * 0.54 >= 40 ? '0–6 km, strong' : '0–6 km') +
      row('Falls as', kinds[ix.kind] || '--', ix.moist ? '' : 'if anything');
  }
  function skBar() {
    var snd = data.sounding, n = snd.length, w = 560 / n, html = '', i;
    for (i = 0; i < n; i++) { var hh = +snd[i].time.substr(11, 2); html += '<span data-i="' + i + '" style="left:' + (i * w) + 'px;width:' + w + 'px" class="' + (hh >= 7 && hh < 19 ? 'wxd' : '') + (i === skSel ? ' on' : '') + '"></span>'; }
    var b = $('wxc-skbar'); b.innerHTML = html;
    var sp = b.getElementsByTagName('span');
    for (i = 0; i < sp.length; i++) tap(sp[i], function (e) { skSel = +e.target.getAttribute('data-i'); skewT(); });
    var tm = snd[skSel].time, h = +tm.substr(11, 2), d = tm.split('T')[0].split('-');
    $('wxc-skh').textContent = h === 12 ? 'Noon' : h === 0 ? 'Midnight' : (h % 12) + (h < 12 ? ' am' : ' pm');
    $('wxc-skd').textContent = skSel === 0 ? 'now' : DAYN[new Date(+d[0], +d[1] - 1, +d[2]).getDay()] + ', in ' + skSel + ' h';
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
