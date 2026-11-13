/* Background scene for the panel: photo slideshow + time-of-day tint + animated weather.
 * ES5 only (iOS 9-12 Safari). Tuned for an A7 iPad mini: canvas at 1x, ~30fps, batched paths.
 * Test any look with URL params, e.g. /?wx=storm&phase=night  (wx: clear partly cloudy fog
 * drizzle rain heavy snow blizzard storm; phase: day golden night)
 */
(function () {
  function $(id) { return document.getElementById(id); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setTransform(el, t) { el.style.webkitTransform = t; el.style.transform = t; }
  function setTransition(el, t) { el.style.webkitTransition = t; el.style.transition = t.replace(/-webkit-transform/g, 'transform'); }

  /* ---------------- slideshow ---------------- */
  var reported = false;
  var slides = [$('slide0'), $('slide1')], cur = 0, list = [], idx = 0, secs = 25, timer = null;

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function loadList() {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/photos?t=' + Date.now(), true);
    x.onload = function () {
      try {
        var r = JSON.parse(x.responseText), had = list.length;
        list = shuffle(r.photos); secs = r.seconds || 25; idx = 0;
        if (!had && list.length) next();
      } catch (e) {}
    };
    x.send();
  }
  function next() {
    clearTimeout(timer);
    if (!list.length) return;
    if (idx >= list.length) { shuffle(list); idx = 0; }
    var src = '/photo/' + list[idx++] + '.jpg';
    var img = new Image();
    img.onload = function () { show(src); timer = setTimeout(next, secs * 1000); };
    img.onerror = function () { timer = setTimeout(next, 2000); };
    img.src = src;
  }
  function show(src) {
    var el = slides[1 - cur], old = slides[cur];
    el.style.backgroundImage = 'url(' + src + ')';
    // Ken Burns: slow zoom + drift in a random direction
    var s0 = rnd(1.06, 1.1), s1 = rnd(1.16, 1.22);
    var a = 'scale(' + s0 + ') translate(' + rnd(-2, 2).toFixed(2) + '%,' + rnd(-2, 2).toFixed(2) + '%)';
    var b = 'scale(' + s1 + ') translate(' + rnd(-3, 3).toFixed(2) + '%,' + rnd(-3, 3).toFixed(2) + '%)';
    setTransition(el, 'none');
    setTransform(el, a);
    void el.offsetWidth;  // commit the start state before animating
    setTransition(el, 'opacity 3s ease-in-out, -webkit-transform ' + (secs + 4) + 's linear');
    setTransform(el, b);
    el.style.opacity = 1;
    old.style.opacity = 0;
    cur = 1 - cur;
    if (!reported) {   // one status line per page load, visible in the server journal
      reported = true;
      try {
        var x = new XMLHttpRequest(); x.open('POST', '/api/clientlog', true);
        x.send('status: photo shown, ' + list.length + ' photos, wx=' + (kind || 'pending') + '/' + (phase || '?') +
          ', screen ' + W + 'x' + H + ' @' + (window.devicePixelRatio || 1) + 'x');
      } catch (e) {}
    }
  }

  /* ---------------- weather + tint ---------------- */
  var canvas = $('wx'), ctx = canvas.getContext('2d');
  var W = 0, H = 0, kind = '', phase = '', windX = 0.15;
  var drops = [], flakes = [], clouds = [], fogs = [], stars = [];
  var flash = 0, nextFlash = 0, bolt = null, shooting = null, nextShoot = 0;
  var cloudLight = null, cloudDark = null, fogSprite = null, glow = null;

  function sprite(w, h, paint) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), w, h); return c;
  }
  function puff(g, x, y, r, rgb, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function makeCloud(rgb) {
    // every puff stays inside the sprite so no hard edges get clipped
    return sprite(520, 300, function (g) {
      puff(g, 150, 170, 100, rgb, 0.5); puff(g, 260, 140, 125, rgb, 0.55);
      puff(g, 370, 170, 100, rgb, 0.5); puff(g, 260, 175, 120, rgb, 0.3);
    });
  }
  function initSprites() {
    cloudLight = makeCloud('235,240,248');
    cloudDark = makeCloud('70,78,92');
    fogSprite = sprite(700, 200, function (g) {
      puff(g, 170, 100, 95, '210,215,222', 0.4); puff(g, 350, 100, 100, '210,215,222', 0.45); puff(g, 530, 100, 95, '210,215,222', 0.4);
    });
    glow = sprite(400, 400, function (g) {
      var gr = g.createRadialGradient(200, 200, 0, 200, 200, 200);
      gr.addColorStop(0, 'rgba(255,240,200,0.55)'); gr.addColorStop(0.15, 'rgba(255,220,150,0.3)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 400, 400);
    });
  }

  var KIND = { 0: 'clear', 1: 'clear', 2: 'partly', 3: 'cloudy', 45: 'fog', 48: 'fog',
    51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
    61: 'rain', 80: 'rain', 63: 'rain', 81: 'rain', 66: 'rain',
    65: 'heavy', 82: 'heavy', 67: 'heavy',
    71: 'snow', 73: 'snow', 77: 'snow', 85: 'snow', 75: 'blizzard', 86: 'blizzard',
    95: 'storm', 96: 'storm', 99: 'storm' };

  function minutesOf(iso) { var t = iso.split('T')[1].split(':'); return +t[0] * 60 + +t[1]; }
  function phaseFor(w) {
    if (w.sunrise && w.sunset) {
      var d = new Date(Date.now() + (w.utc_offset || 0) * 1000);   // location-local clock
      var now = d.getUTCHours() * 60 + d.getUTCMinutes();
      var rise = minutesOf(w.sunrise), set = minutesOf(w.sunset);
      if (Math.abs(now - rise) < 45 || Math.abs(now - set) < 45) return 'golden';
      return now > rise && now < set ? 'day' : 'night';
    }
    return w.is_day ? 'day' : 'night';
  }

  function build() {
    var i, n;
    drops = []; flakes = []; clouds = []; fogs = []; stars = [];
    n = { drizzle: 70, rain: 140, heavy: 240, storm: 220 }[kind] || 0;
    for (i = 0; i < n; i++) drops.push({ x: rnd(0, W), y: rnd(-H, H), l: rnd(10, kind === 'drizzle' ? 14 : 26), v: rnd(kind === 'drizzle' ? 6 : 13, kind === 'drizzle' ? 9 : 20) });
    n = { snow: 80, blizzard: 170 }[kind] || 0;
    for (i = 0; i < n; i++) flakes.push({ x: rnd(0, W), y: rnd(-H, H), r: rnd(1, 3.2), v: rnd(0.6, kind === 'blizzard' ? 3 : 1.6), p: rnd(0, 6.28) });
    n = { partly: 4, cloudy: 7, drizzle: 6, rain: 6, heavy: 7, snow: 6, blizzard: 7, storm: 7, fog: 2 }[kind] || 0;
    var dark = kind === 'storm' || kind === 'heavy' || kind === 'rain' || (phase === 'night' && kind !== 'partly');
    for (i = 0; i < n; i++) clouds.push({ x: rnd(-500, W), y: rnd(-120, H * 0.3), s: rnd(0.9, 1.8), v: rnd(0.08, 0.25), a: rnd(0.5, 0.9), dark: dark });
    if (kind === 'fog') for (i = 0; i < 5; i++) fogs.push({ x: rnd(-700, W), y: rnd(H * 0.2, H * 0.9), s: rnd(1.4, 2.4), v: rnd(0.15, 0.4) });
    if (phase === 'night' && (kind === 'clear' || kind === 'partly'))
      for (i = 0; i < 150; i++) stars.push({ x: rnd(0, W), y: rnd(0, H * 0.75), r: rnd(0.6, 1.8), b: rnd(0.3, 0.8), t: rnd(0.5, 2.5), p: rnd(0, 6.28) });
  }

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; build(); }

  function setKind(k, ph, w) {
    if (k === kind && ph === phase) return;
    kind = k; phase = ph;
    var tint = ph === 'night' ? 'night' : ph === 'golden' ? 'golden' : 'day';
    if (k === 'cloudy' || k === 'fog' || k === 'drizzle' || k === 'rain' || k === 'snow') tint += ' gray';
    if (k === 'heavy' || k === 'storm' || k === 'blizzard') tint += ' dark';
    $('tint').className = tint;
    $('sky').className = 'sky-' + ph;
    build();
  }

  var api = {
    setWeather: function (w) {
      if (!w || w.error || w.code == null) return;
      var spd = Math.min((w.wind || 0) / 25, 1) * 0.6;
      windX = w.wind_dir == null ? 0.15 : Math.sin(((w.wind_dir + 180) % 360) * Math.PI / 180) * spd;
      setKind(param('wx') || KIND[w.code] || 'clear', param('phase') || phaseFor(w), w);
    }
  };

  /* ---------------- render loop ---------------- */
  var last = 0, t0 = Date.now();
  function frame() {
    window.requestAnimationFrame(frame);
    if (window.WX_OPEN) return;   // the weather console is up: draw nothing
    var now = Date.now();
    if (now - last < 33 || document.hidden) return;   // ~30fps cap
    last = now;
    var t = (now - t0) / 1000, i, p;
    ctx.clearRect(0, 0, W, H);

    if (stars.length) {
      ctx.fillStyle = '#fff';
      for (i = 0; i < stars.length; i++) {
        p = stars[i];
        ctx.globalAlpha = Math.max(0, p.b + 0.3 * Math.sin(t * p.t + p.p));
        ctx.fillRect(p.x, p.y, p.r, p.r);
      }
      if (now > nextShoot) {
        if (!nextShoot) nextShoot = now + rnd(4000, 12000);
        else { shooting = { x: rnd(W * 0.2, W), y: rnd(0, H * 0.3), life: 1 }; nextShoot = now + rnd(15000, 40000); }
      }
      if (shooting) {
        ctx.globalAlpha = shooting.life; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(shooting.x, shooting.y); ctx.lineTo(shooting.x + 90, shooting.y - 40); ctx.stroke();
        shooting.x -= 22; shooting.y += 10; shooting.life -= 0.05;
        if (shooting.life <= 0) shooting = null;
      }
    }

    if (phase !== 'night' && (kind === 'clear' || kind === 'partly')) {
      var sx = W * 0.82, sy = H * 0.12, pulse = 1 + 0.04 * Math.sin(t * 0.6);
      ctx.globalAlpha = phase === 'golden' ? 1 : 0.8;
      ctx.drawImage(glow, sx - 260 * pulse, sy - 260 * pulse, 520 * pulse, 520 * pulse);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.02);
      ctx.fillStyle = phase === 'golden' ? 'rgba(255,190,120,0.045)' : 'rgba(255,240,200,0.035)';
      ctx.globalAlpha = 1;
      for (i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 1.2, -40); ctx.lineTo(W * 1.2, 40); ctx.fill();
      }
      ctx.restore();
    }

    for (i = 0; i < clouds.length; i++) {
      p = clouds[i];
      ctx.globalAlpha = p.a;
      ctx.drawImage(p.dark ? cloudDark : cloudLight, p.x, p.y, 520 * p.s, 300 * p.s);
      p.x += p.v + windX * 0.3;
      if (p.x > W + 50) p.x = -520 * p.s; else if (p.x < -520 * p.s - 50) p.x = W;
    }
    for (i = 0; i < fogs.length; i++) {
      p = fogs[i];
      ctx.globalAlpha = 0.8 + 0.15 * Math.sin(t * 0.2 + i);
      ctx.drawImage(fogSprite, p.x, p.y, 700 * p.s, 200 * p.s);
      p.x += p.v; if (p.x > W) p.x = -700 * p.s;
    }

    if (drops.length) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(200,215,240,' + (kind === 'drizzle' ? 0.3 : 0.4) + ')';
      ctx.lineWidth = kind === 'drizzle' ? 1 : 1.2;
      ctx.beginPath();
      for (i = 0; i < drops.length; i++) {
        p = drops[i];
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + windX * p.l * 1.5, p.y + p.l);
        p.y += p.v; p.x += windX * p.v * 1.5;
        if (p.y > H) { p.y = rnd(-60, -10); p.x = rnd(-100, W + 100); }
      }
      ctx.stroke();
    }

    if (flakes.length) {
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (i = 0; i < flakes.length; i++) {
        p = flakes[i];
        ctx.moveTo(p.x + p.r, p.y); ctx.arc(p.x, p.y, p.r, 0, 6.283);
        p.y += p.v; p.x += Math.sin(t + p.p) * 0.5 + windX * 2;
        if (p.y > H + 5) { p.y = -5; p.x = rnd(0, W); }
        if (p.x > W + 5) p.x = -5; else if (p.x < -5) p.x = W + 5;
      }
      ctx.fill();
    }

    if (kind === 'storm') {
      if (!nextFlash) nextFlash = now + rnd(3000, 8000);
      if (now > nextFlash) {
        flash = 1; nextFlash = now + rnd(6000, 16000);
        if (Math.random() < 0.7) {   // jagged bolt
          bolt = []; var bx = rnd(W * 0.1, W * 0.9), by = 0;
          while (by < H * rnd(0.45, 0.7)) { bolt.push(bx, by); bx += rnd(-35, 35); by += rnd(20, 45); }
        }
      }
      if (flash > 0.02) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(215,225,255,' + (flash * 0.35) + ')'; ctx.fillRect(0, 0, W, H);
        if (bolt) {
          ctx.strokeStyle = 'rgba(255,255,255,' + flash + ')'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(bolt[0], bolt[1]);
          for (i = 2; i < bolt.length; i += 2) ctx.lineTo(bolt[i], bolt[i + 1]);
          ctx.stroke();
        }
        // brief double-flicker, then fade
        flash *= flash > 0.6 && Math.random() < 0.15 ? 1.2 : 0.82;
        if (flash > 1) flash = 1;
      } else { flash = 0; bolt = null; }
    }
    ctx.globalAlpha = 1;
  }

  initSprites();
  // iPadOS sometimes reports the window's size before it has settled (opening from the Home Screen,
  // coming back from the background, a rotation while away) and then sends no resize event, which
  // left the picture drawn at the wrong size until the next visit. So re-measure on every hint, and once a second.
  function watchSize(fn) {
    var last = '';
    function check() { var k = window.innerWidth + 'x' + window.innerHeight; if (k !== last) { last = k; fn(); } }
    function soon() { check(); setTimeout(check, 250); setTimeout(check, 1000); }
    window.addEventListener('resize', soon, false);
    window.addEventListener('orientationchange', soon, false);
    window.addEventListener('pageshow', soon, false);
    window.addEventListener('focus', soon, false);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) soon(); }, false);
    setInterval(check, 1000);
    check();
  }
  watchSize(resize);
  window.requestAnimationFrame(frame);
  loadList();
  setInterval(loadList, 30 * 60 * 1000);
  // Preview a look without waiting for real weather
  if (param('wx')) setKind(param('wx'), param('phase') || 'day');
  window.Scene = api;
})();
