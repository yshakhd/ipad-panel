/*
 * The extra lines every scene shows, from /api/state:
 *   under the date (#notes): weather warnings, the doorbell, and the next calendar event;
 *   under the sunrise (#w-more): a rain heads-up, and the air quality.
 * Also says when everyone's away (the scene dims) and hands doorbell and door events,
 * and new messages, to the scene. ES5, for the iPad's iOS 9 Safari.
 *
 *   Extras.render(state, { door: function (kind, name) {}, message: function (text, isNew) {} })
 *   Extras.away()   true while nobody's home
 */
var Extras = (function () {
  'use strict';
  var seen = {}, first = true, lastMsg = null, isAway = false, recent = [];
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function $(id) { return document.getElementById(id); }

  function render(s, hooks) {
    hooks = hooks || {};
    isAway = !!s.away;
    var now = s.server_time || Date.now() / 1000, i, lines = [];

    // doorbell and door events: react once to each, only if it's fresh (not replayed after a reload)
    var evs = s.events || [];
    for (i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (seen[e.id]) continue;
      seen[e.id] = 1;
      if (first || now - e.at > 30) continue;
      recent.push({ at: Date.now(), kind: e.kind, name: e.name });
      if (hooks.door) hooks.door(e.kind, e.name);
    }
    first = false;
    var keep = [];
    for (i = 0; i < recent.length; i++) if (Date.now() - recent[i].at < 90000) keep.push(recent[i]);
    recent = keep;
    if (recent.length) {
      var r = recent[recent.length - 1];
      lines.push('<div class="n-ev">' + (r.kind === 'doorbell' ? 'Someone’s at the door' : esc(r.name) + ' opened') + '</div>');
    }

    var al = s.alerts || [];
    for (i = 0; i < al.length; i++) lines.push('<div class="n-alert">' + esc(al[i].event) + (al[i].until ? ' until ' + esc(al[i].until) : '') + '</div>');

    var cal = s.calendar || [];
    for (i = 0; i < cal.length && i < 2; i++) {
      var c = cal[i];
      lines.push('<div class="n-cal">' + (c.when === 'Today' ? esc(c.text) + ' today'
        : c.now ? 'Now: ' + esc(c.text) : esc(c.text) + ', ' + esc(c.when)) + '</div>');
    }
    var n = $('notes');
    if (n) { var h = lines.join(''); if (n.innerHTML !== h) n.innerHTML = h; }

    var more = [];
    if (s.outlook) more.push(esc(s.outlook) + '.');
    if (s.air) more.push('Air quality ' + s.air.aqi + ', ' + esc(s.air.words.toLowerCase()) + '.');
    var m = $('w-more');
    if (m) { var mh = more.join('<br>'); if (m.innerHTML !== mh) m.innerHTML = mh; }

    var msg = s.message && s.message.text || '';
    if (msg !== lastMsg) { if (hooks.message) hooks.message(msg, lastMsg !== null); lastMsg = msg; }   // second argument: it just arrived
  }
  return { render: render, away: function () { return isAway; } };
})();
