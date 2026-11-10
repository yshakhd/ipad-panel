/*
 * Sky maths shared by the drawn scenes: where the sun and moon are, the moon's phase, and
 * how far through the year's seasons a place is. Low-precision formulas (NOAA for the sun,
 * a short lunar series for the moon), about a degree off: plenty for a picture. ES5.
 */
(function () {
  var RAD = Math.PI / 180;
  function days(ms) { return ms / 86400000 - 10957.5; }   // since J2000
  function horizontal(ra, dec, ms, lat, lon) {   // sky position -> elevation and compass bearing
    var n = days(ms), gmst = (18.697374558 + 24.06570982441908 * n) % 24;
    var H = (gmst * 15 + lon) * RAD - ra, la = lat * RAD;
    var el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H)) / RAD;
    return { el: el / RAD, az: (az + 360) % 360 };
  }
  function eclToEq(lam, beta, n) {
    var eps = (23.439 - 0.0000004 * n) * RAD;
    return { ra: Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lam)),
      dec: Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam)) };
  }
  function sunLon(n) {
    var g = (357.528 + 0.9856003 * n) * RAD;
    return (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  }
  function moonLon(n) {
    var L = (218.316 + 13.176396 * n) * RAD, M = (134.963 + 13.064993 * n) * RAD, F = (93.272 + 13.22935 * n) * RAD;
    return { lam: L + 6.289 * RAD * Math.sin(M), beta: 5.128 * RAD * Math.sin(F) };
  }
  function sun(ms, lat, lon) { var n = days(ms), q = eclToEq(sunLon(n), 0, n); return horizontal(q.ra, q.dec, ms, lat, lon); }
  /* Day, golden or night, from how high the sun is rather than the clock: near the poles a
   * winter sun can skim the horizon all day (golden light from rise to set), the summer sun
   * may never set, and in polar night the noon twilight still glows. */
  function phase(ms, lat, lon) { var el = sun(ms, lat, lon).el; return el > 8 ? 'day' : el > -5 ? 'golden' : 'night'; }
  // el, az, lit (0 new to 1 full) and waxing
  function moon(ms, lat, lon) {
    var n = days(ms), m = moonLon(n), q = eclToEq(m.lam, m.beta, n), p = horizontal(q.ra, q.dec, ms, lat, lon), s = sunLon(n);
    p.lit = (1 - Math.cos(m.lam - s)) / 2;
    p.waxing = Math.sin(m.lam - s) > 0;
    return p;
  }

  /* Seasons as a smooth year rather than four switches: how far the leaves have turned, how
   * much canopy is left, spring blossom, and how dry the grass is, keyed by day of the year
   * north of the equator (shifted half a year south of it). */
  var KEYS = [   // [day of year, turn, cover, bloom, dry]
    [0, 0, 0, 0, 1], [65, 0, 0, 0, 1], [95, 0, 0.55, 1, 0.35], [130, 0, 1, 0.15, 0], [150, 0, 1, 0, 0],
    [245, 0, 1, 0, 0.15], [290, 1, 1, 0, 0.55], [305, 1, 0.9, 0, 0.7], [340, 1, 0.05, 0, 1], [366, 0, 0, 0, 1]];
  var NAMED = { spring: 110, summer: 200, autumn: 300, fall: 300, winter: 20 };
  function season(ms, lat, name) {
    var d = new Date(ms), y = d.getUTCFullYear();
    var doy = (Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000;
    if (lat < 0) doy = (doy + 182.5) % 365;
    if (NAMED[name] != null) doy = NAMED[name];
    for (var i = 1; i < KEYS.length - 1; i++) if (doy <= KEYS[i][0]) break;
    var a = KEYS[i - 1], b = KEYS[i], f = Math.max(0, Math.min(1, (doy - a[0]) / (b[0] - a[0])));
    function at(j) { return a[j] + (b[j] - a[j]) * f; }
    return { turn: at(1), cover: at(2), bloom: at(3), dry: at(4), doy: doy };
  }

  window.Sky = { days: days, sun: sun, phase: phase, moon: moon, season: season, sunLon: sunLon, moonLon: moonLon };
})();
