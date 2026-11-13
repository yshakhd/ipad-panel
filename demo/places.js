/*
 * Place search with suggestions as you type, for the demos' "Change the weather" panel.
 * Open-Meteo's geocoder; up to 6 matches under the box. Arrow keys move, Enter picks
 * (the first match if none is highlighted), Escape closes the list before the panel.
 *
 *   Places.attach({ input, button, list, status, pick: function (r) {} })
 *   r: { name, lat, lon, label }
 */
var Places = (function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function attach(o) {
    var input = o.input, list = o.list, results = [], active = -1, seq = 0, timer = null, lastQ = '';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', list.id);
    list.setAttribute('role', 'listbox');

    function where(r) {
      var bits = [];
      if (r.admin1 && r.admin1 !== r.name) bits.push(r.admin1);
      if (r.country) bits.push(r.country);
      return bits.join(', ');
    }
    function show(open) {
      list.className = open ? 'open' : '';
      input.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) { active = -1; input.removeAttribute('aria-activedescendant'); }
    }
    function paint() {
      var html = '';
      for (var i = 0; i < results.length; i++) {
        html += '<li role="option" id="' + list.id + '-' + i + '" data-i="' + i + '"' + (i === active ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + '>' +
          esc(results[i].name) + (where(results[i]) ? '<small>' + esc(where(results[i])) + '</small>' : '') + '</li>';
      }
      list.innerHTML = html;
      if (active >= 0) input.setAttribute('aria-activedescendant', list.id + '-' + active);
      show(results.length > 0);
      if (results.length && list.scrollIntoView) { try { list.scrollIntoView({ block: 'nearest' }); } catch (e) { list.scrollIntoView(false); } }   // the panel scrolls; keep the list in sight
    }
    function fetch(q, then) {
      var my = ++seq, x = new XMLHttpRequest();
      x.open('GET', 'https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&name=' + encodeURIComponent(q), true);
      x.onload = function () {
        if (my !== seq) return;   // a newer search has gone out
        var r = [];
        try { r = JSON.parse(x.responseText).results || []; } catch (e) {}
        then(r);
      };
      x.onerror = function () { if (my === seq) then(null); };
      x.send();
    }
    function choose(r) {
      clearTimeout(timer); seq++;
      input.value = r.name;
      lastQ = r.name;
      results = []; show(false); list.innerHTML = '';
      o.pick({ name: r.name, lat: r.latitude, lon: r.longitude, label: r.name + (where(r) ? ', ' + where(r) : '') });
    }
    function go() {   // Enter or the Go button
      var q = input.value.replace(/^\s+|\s+$/g, '');
      if (!q) return;
      if (active >= 0 && results[active]) return choose(results[active]);
      if (results.length && q === lastQ) return choose(results[0]);
      o.status.textContent = 'Looking for ' + q;
      fetch(q, function (r) {
        if (r === null) { o.status.textContent = 'The town search is unavailable right now.'; return; }
        if (!r.length) { o.status.textContent = 'No town called ' + q + ' found. Try another spelling.'; return; }
        choose(r[0]);
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.replace(/^\s+|\s+$/g, '');
      if (q.length < 2) { seq++; results = []; show(false); return; }
      timer = setTimeout(function () {
        lastQ = q;
        fetch(q, function (r) { results = r || []; active = -1; paint(); });
      }, 220);
    }, false);
    input.addEventListener('keydown', function (e) {
      var open = list.className === 'open';
      if (e.keyCode === 40 && open) { active = (active + 1) % results.length; paint(); e.preventDefault(); }
      else if (e.keyCode === 38 && open) { active = active <= 0 ? results.length - 1 : active - 1; paint(); e.preventDefault(); }
      else if (e.keyCode === 13) { e.preventDefault(); go(); }
      else if (e.keyCode === 27 && open) { show(false); e.stopPropagation(); e.preventDefault(); }   // close the list, not the panel
    }, false);
    input.addEventListener('blur', function () { setTimeout(function () { show(false); }, 150); }, false);
    input.addEventListener('focus', function () { if (results.length) paint(); }, false);
    // mousedown, not click, so it lands before the input's blur closes the list
    list.addEventListener('mousedown', function (e) {
      var li = e.target;
      while (li && li !== list && li.nodeName !== 'LI') li = li.parentNode;
      if (li && li.nodeName === 'LI') { e.preventDefault(); choose(results[+li.getAttribute('data-i')]); }
    }, false);
    o.button.addEventListener('click', go, false);
  }
  return { attach: attach };
})();
