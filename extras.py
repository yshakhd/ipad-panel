"""Everything the panel knows beyond the basic weather: air quality, weather warnings,
a rain heads-up, the next calendar event, who's home and doorbell/door events, plus two
background jobs: the iPad charger timer and the "the iPad has gone quiet" watchdog.

Every feature is off until its section is in config.json, and every one fails quietly:
the panel keeps working when a feed is down.
"""
import datetime as dt
import json
import threading
import time
import urllib.parse
import urllib.request

import ha

UA = "ipad-panel (home dashboard)"
_cache = {}
_lock = threading.Lock()


def _get(url, ttl, headers=None):
    """GET JSON with a cache; on failure keep serving the last good answer."""
    now = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and now - hit[1] < ttl:
        return hit[0]
    try:
        req = urllib.request.Request(url, headers=dict({"User-Agent": UA}, **(headers or {})))
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.load(r)
        with _lock:
            _cache[url] = (data, now)
        return data
    except Exception:
        if hit:
            with _lock:
                _cache[url] = (hit[0], now - ttl + 120)   # try again in two minutes
            return hit[0]
        return None


# ---------------- air quality (Open-Meteo, US AQI) ----------------
AQI_WORDS = [(50, "Good"), (100, "Moderate"), (150, "Unhealthy for sensitive groups"),
             (200, "Unhealthy"), (300, "Very unhealthy"), (10000, "Hazardous")]


def air(cfg):
    if cfg.get("air_quality") is False or cfg.get("latitude") is None:
        return None
    q = urllib.parse.urlencode({"latitude": cfg["latitude"], "longitude": cfg["longitude"],
                                "current": "us_aqi,pm2_5", "timezone": "auto"})
    d = _get("https://air-quality-api.open-meteo.com/v1/air-quality?" + q, 1800)
    try:
        aqi = int(round(d["current"]["us_aqi"]))
    except (TypeError, KeyError, ValueError):
        return None
    return {"aqi": aqi, "words": next(w for lim, w in AQI_WORDS if aqi <= lim)}


# ---------------- weather warnings (US National Weather Service) ----------------
SEVERITY = {"Extreme": 4, "Severe": 3, "Moderate": 2, "Minor": 1}


def _clock(iso):
    """'2026-11-09T18:00:00-05:00' -> '6 pm' or 'Tue 6 pm' when it isn't today."""
    try:
        t = dt.datetime.fromisoformat(iso).astimezone()
    except (TypeError, ValueError):
        return ""
    h = t.hour % 12 or 12
    s = "%d%s %s" % (h, (":%02d" % t.minute) if t.minute else "", "am" if t.hour < 12 else "pm")
    if t.date() != dt.date.today():
        s = t.strftime("%a ") + s
    return s


def alerts(cfg):
    if cfg.get("weather_alerts") is False or cfg.get("latitude") is None:
        return []
    url = "https://api.weather.gov/alerts/active?point=%.4f,%.4f" % (cfg["latitude"], cfg["longitude"])
    d = _get(url, 300, {"Accept": "application/geo+json"})
    out = []
    for f in (d or {}).get("features", []):
        p = f.get("properties", {})
        if p.get("status") != "Actual" or p.get("messageType") == "Cancel":
            continue
        until = _clock(p.get("ends") or p.get("expires"))
        out.append({"event": p.get("event", "Weather alert"), "until": until,
                    "severity": SEVERITY.get(p.get("severity"), 0)})
    out.sort(key=lambda a: -a["severity"])
    seen, uniq = set(), []
    for a in out:   # one line per kind of warning
        if a["event"] not in seen:
            seen.add(a["event"])
            uniq.append(a)
    return uniq[:2]


# ---------------- rain heads-up (Open-Meteo, 15-minute steps) ----------------
def outlook(cfg):
    """'Rain from about 3:15 pm' / 'Snow ending around 4 pm', from the next three hours."""
    if cfg.get("latitude") is None:
        return None
    q = urllib.parse.urlencode({"latitude": cfg["latitude"], "longitude": cfg["longitude"],
                                "minutely_15": "precipitation,snowfall", "forecast_minutely_15": 24,
                                "timezone": "auto"})
    d = _get("https://api.open-meteo.com/v1/forecast?" + q, 600)
    try:
        m = d["minutely_15"]
        off = dt.timezone(dt.timedelta(seconds=d.get("utc_offset_seconds", 0)))
        now = dt.datetime.now(off).replace(tzinfo=None)
        steps = [(dt.datetime.fromisoformat(t), p or 0, s or 0)
                 for t, p, s in zip(m["time"], m["precipitation"], m["snowfall"])]
    except (TypeError, KeyError, ValueError):
        return None
    steps = [x for x in steps if x[0] > now - dt.timedelta(minutes=15)][:13]   # now and the next 3 hours
    if len(steps) < 2:
        return None
    wet = [p >= 0.1 for _, p, _ in steps]
    snowy = sum(s for _, _, s in steps) > 0.2

    def hm(t):
        h = t.hour % 12 or 12
        return "%d%s %s" % (h, (":%02d" % t.minute) if t.minute else "", "am" if t.hour < 12 else "pm")
    what = "Snow" if snowy else "Rain"
    if not wet[0]:
        i = next((k for k, w in enumerate(wet) if w), None)
        if i is not None:
            return "%s from about %s" % (what, hm(steps[i][0]))
    elif not all(wet):
        i = next(k for k, w in enumerate(wet) if not w)
        if all(not w for w in wet[i:i + 2]):
            return "%s ending around %s" % (what, hm(steps[i][0]))
    return None


# ---------------- the next calendar event (iCalendar feeds) ----------------
def _unfold(text):
    lines = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def _when(name_params, value):
    """DTSTART;TZID=America/New_York:20261110T153000 -> (aware datetime, all_day)."""
    params = dict(p.split("=", 1) for p in name_params.split(";")[1:] if "=" in p)
    v = value.strip()
    if params.get("VALUE") == "DATE" or len(v) == 8:
        d = dt.datetime.strptime(v[:8], "%Y%m%d")
        return d.astimezone(), True   # local midnight
    if v.endswith("Z"):
        return dt.datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=dt.timezone.utc), False
    t = dt.datetime.strptime(v[:15], "%Y%m%dT%H%M%S")
    tz = params.get("TZID")
    if tz:
        try:
            from zoneinfo import ZoneInfo
            return t.replace(tzinfo=ZoneInfo(tz.strip('"'))), False
        except Exception:
            pass
    return t.astimezone(), False   # floating time: local


DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]


def _occurrences(ev, start, horizon):
    """Start times of an event between now-ish and the horizon; the common RRULEs only."""
    s0 = ev["start"]
    rule = ev.get("rrule")
    if not rule:
        return [s0]
    r = dict(p.split("=", 1) for p in rule.split(";") if "=" in p)
    freq, step = r.get("FREQ"), int(r.get("INTERVAL", 1))
    count = int(r["COUNT"]) if "COUNT" in r else None
    until = None
    if "UNTIL" in r:
        try:
            until = _when("UNTIL", r["UNTIL"])[0]
        except ValueError:
            until = None
    byday = [d[-2:] for d in r.get("BYDAY", "").split(",") if d]
    out, n, k = [], 0, 0
    while k < 2000:
        if freq == "DAILY":
            cands = [s0 + dt.timedelta(days=k * step)]
        elif freq == "WEEKLY":
            base = s0 + dt.timedelta(weeks=k * step)
            if byday:
                monday = base - dt.timedelta(days=base.weekday())
                cands = sorted(monday + dt.timedelta(days=DAYS.index(d)) for d in byday if d in DAYS)
                cands = [c for c in cands if c >= s0]
            else:
                cands = [base]
        elif freq == "MONTHLY":
            mo = s0.month - 1 + k * step
            try:
                cands = [s0.replace(year=s0.year + mo // 12, month=mo % 12 + 1)]
            except ValueError:
                cands = []   # e.g. the 31st in a short month
            if r.get("BYDAY") and len(r["BYDAY"]) > 2 and cands:   # e.g. 2TU: the second Tuesday
                try:
                    nth, wd = int(r["BYDAY"][:-2]), DAYS.index(r["BYDAY"][-2:])
                    first = cands[0].replace(day=1)
                    day = 1 + (wd - first.weekday()) % 7 + 7 * (nth - 1) if nth > 0 else None
                    cands = [first.replace(day=day)] if day else []
                except (ValueError, IndexError):
                    cands = []
        elif freq == "YEARLY":
            try:
                cands = [s0.replace(year=s0.year + k * step)]
            except ValueError:
                cands = []
        else:
            return [s0]
        for c in cands:
            if (until and c > until) or c > horizon:
                return out
            n += 1
            if count and n > count:
                return out
            if c >= start:
                out.append(c)
        k += 1
    return out


def _events(text, start, horizon):
    evs, cur, over = [], None, []
    for line in _unfold(text):
        if line == "BEGIN:VEVENT":
            cur = {"ex": set()}
        elif line == "END:VEVENT" and cur is not None:
            if "start" in cur and cur.get("status") != "CANCELLED":
                evs.append(cur)
            cur = None
        elif cur is not None and ":" in line:
            name, value = line.split(":", 1)
            key = name.split(";")[0].upper()
            try:
                if key == "DTSTART":
                    cur["start"], cur["all_day"] = _when(name, value)
                elif key == "DTEND":
                    cur["end"] = _when(name, value)[0]
                elif key == "SUMMARY":
                    cur["title"] = value.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ").strip()
                elif key == "RRULE":
                    cur["rrule"] = value
                elif key == "EXDATE":
                    for v in value.split(","):
                        cur["ex"].add(_when(name, v)[0])
                elif key == "RECURRENCE-ID":
                    cur["rid"] = _when(name, value)[0]
                elif key == "UID":
                    cur["uid"] = value
                elif key == "STATUS":
                    cur["status"] = value.strip().upper()
            except ValueError:
                pass
    moved = {(e.get("uid"), e["rid"]) for e in evs if "rid" in e}   # single changed or cancelled occurrences
    out = []
    for e in evs:
        span = (e.get("end") - e["start"]) if e.get("end") else dt.timedelta(days=1 if e["all_day"] else 0)
        for s in _occurrences(e, start - span, horizon):
            if s in e["ex"] or ("rid" not in e and (e.get("uid"), s) in moved):
                continue
            if s + span > start or s >= start:
                out.append({"start": s, "end": s + span, "all_day": e["all_day"], "title": e.get("title", "Event")})
    return out


def _read_feed(src):
    if src.startswith(("http://", "https://", "webcal://")):
        src = src.replace("webcal://", "https://", 1)
        req = urllib.request.Request(src, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.read().decode("utf-8", "replace")
    with open(src.replace("file://", "", 1), encoding="utf-8") as f:
        return f.read()


def calendar(cfg):
    """The next event or two today and the next couple of days, as short lines."""
    c = cfg.get("calendar") or {}
    feeds = c.get("ics") or []
    if isinstance(feeds, str):
        feeds = [feeds]
    if not feeds:
        return None
    key = "cal:" + "|".join(feeds)
    with _lock:
        hit = _cache.get(key)
    now = dt.datetime.now().astimezone()
    if not hit or time.time() - hit[1] > 900:
        evs, ok = [], False
        for src in feeds:
            try:
                evs += _events(_read_feed(src), now - dt.timedelta(days=1), now + dt.timedelta(days=c.get("days", 3) + 1))
                ok = True
            except Exception:
                pass
        if ok or not hit:
            hit = (evs, time.time())
            with _lock:
                _cache[key] = hit
    today = now.date()
    lines = []
    for e in sorted(hit[0], key=lambda e: (not e["all_day"], e["start"])):
        if e["end"] <= now or (e["start"].date() - today).days > c.get("days", 3):
            continue
        d = e["start"].astimezone().date()
        if e["all_day"]:
            if d > today:
                continue   # all-day events only on their day
            lines.append({"text": e["title"], "when": "Today", "now": True})
            continue
        s = e["start"].astimezone()
        h = s.hour % 12 or 12
        clock = "%d%s %s" % (h, (":%02d" % s.minute) if s.minute else "", "am" if s.hour < 12 else "pm")
        day = "" if d == today else "Tomorrow " if (d - today).days == 1 else s.strftime("%A ")
        lines.append({"text": e["title"], "when": (day + clock).strip(), "now": s <= now})
    timed = [l for l in lines if l["when"] != "Today"]
    allday = [l for l in lines if l["when"] == "Today"]
    return (allday[:1] + timed[:2])[:2]


# ---------------- who's home, and doorbell / door events from Home Assistant ----------------
def away(cfg):
    """True when everyone listed under presence is away from home (the panel dims)."""
    who = cfg.get("presence") or []
    if not who:
        return False
    st = ha.raw(cfg)
    if not st:
        return False
    states = [st.get(e, {}).get("state") for e in who]
    known = [s for s in states if s not in (None, "unknown", "unavailable")]
    return bool(known) and all(s != "home" for s in known)


_ev = {"last": {}, "list": [], "n": 0}


def events(cfg):
    """Recent scene events: {"id", "kind": "doorbell"|"door", "name", "at"}."""
    watch = cfg.get("scene_events") or {}
    if not watch:
        return []
    st = ha.raw(cfg) or {}
    now = time.time()
    with _lock:
        for kind in ("doorbell", "door"):
            for eid in watch.get(kind) or []:
                e = st.get(eid)
                if not e:
                    continue
                s = e["state"]
                prev = _ev["last"].get(eid)
                _ev["last"][eid] = s
                fired = prev is not None and s != prev and (
                    s == "on" if eid.startswith(("binary_sensor.", "input_boolean.")) else
                    s not in ("unknown", "unavailable"))   # event entities: the state is the time it fired
                if fired:
                    _ev["n"] += 1
                    name = e.get("attributes", {}).get("friendly_name") or eid
                    _ev["list"].append({"id": _ev["n"], "kind": kind, "name": name, "at": now})
        _ev["list"] = [x for x in _ev["list"] if now - x["at"] < 120]
        return list(_ev["list"])


# ---------------- background jobs: the charger timer and the watchdog ----------------
ipad = {"last": 0, "ip": None, "quiet": False}


def saw_ipad(ip, ua):
    if "iPad" in ua or ip == ipad.get("ip"):
        ipad["last"] = time.time()
        ipad["ip"] = ip


def notify(cfg, text):
    w = cfg.get("watchdog") or {}
    print("watchdog: " + text, flush=True)
    svc = w.get("notify") or "persistent_notification.create"
    try:
        dom, name = svc.split(".", 1)
        ha.call(cfg, dom, name, {"title": "iPad panel", "message": text})
    except Exception as e:
        print("watchdog: couldn't notify through Home Assistant (%s)" % e.__class__.__name__, flush=True)
    if w.get("ntfy"):
        try:
            urllib.request.urlopen(urllib.request.Request(w["ntfy"], data=text.encode(),
                                   headers={"Title": "iPad panel"}), timeout=8)
        except Exception as e:
            print("watchdog: ntfy failed (%s)" % e.__class__.__name__, flush=True)


def _charger_want(c, quiet):
    """On for on_minutes, off for off_minutes, by the clock; always on if the iPad has gone quiet."""
    if quiet:
        return True
    on, off = c.get("on_minutes", 120), c.get("off_minutes", 120)
    m = dt.datetime.now()
    return (m.hour * 60 + m.minute) % (on + off) < on


def _loop(load_config):
    started = time.time()
    last_switch = None
    while True:
        try:
            cfg = load_config()
            for feed in (air, alerts, outlook, calendar):   # keep the caches warm so the iPad never waits
                feed(cfg)
            w = cfg.get("watchdog")
            if w:
                mins = w.get("minutes", 15)
                seen = ipad["last"] or started
                quiet = time.time() - seen > mins * 60
                if quiet and not ipad["quiet"]:
                    ipad["quiet"] = True
                    notify(cfg, "The iPad hasn't checked in for %d minute%s. It may have crashed, lost Wi-Fi or run out of battery." % (mins, "" if mins == 1 else "s"))
                elif not quiet and ipad["quiet"]:
                    ipad["quiet"] = False
                    notify(cfg, "The iPad is back.")
            c = cfg.get("charger")
            if c and c.get("entity"):
                want = "on" if _charger_want(c, ipad["quiet"]) else "off"
                st = (ha.raw(cfg) or {}).get(c["entity"], {}).get("state")
                if st and st != want and (last_switch is None or time.time() - last_switch > 50):
                    dom = c["entity"].split(".")[0]
                    ha.call(cfg, dom, "turn_" + want, {"entity_id": c["entity"]})
                    last_switch = time.time()
                    print("charger %s" % want, flush=True)
        except Exception as e:
            print("background job error: %s" % e, flush=True)
        time.sleep(30)


def start(load_config):
    threading.Thread(target=_loop, args=(load_config,), daemon=True).start()
