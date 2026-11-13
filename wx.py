"""The weather console behind a tap on the temperature: everything it shows, fetched and
prepared here so the iPad (iOS 9, an iPad mini with little memory and old TLS roots) only
loads finished JSON and ready-made pictures from this server.

  /api/wx                         readings, the next 48 hours, the nearest station's METAR,
                                  warnings drawn as outlines, and the radar frame lists
  /api/wx/radar/<kind>/<ts>.jpg   one radar frame: dark map + radar + place names, 640 px

Radar: NEXRAD through the Iowa Environmental Mesonet (IEM). "rain" is the national
reflectivity mosaic every 5 minutes; "vel" is storm-relative velocity from the local radar.
Frames are stamped with their scan time and never change, so each is built once.
Map: Esri's dark gray canvas (credited on screen), fetched once and kept on disk.
Forecast numbers: Open-Meteo. Station, warnings and outlines: the National Weather Service.
"""
import io
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

try:
    from PIL import Image
except ImportError:   # the console still works without radar pictures
    Image = None

ROOT = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(ROOT, "cache", "tiles")
UA = "ipad-panel (github.com/yshakhd/ipad-panel)"
Z, SIZE, FRAMES = 8, 640, 10
IEM = "https://mesonet.agron.iastate.edu"
LAYERS = {
    "base": "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    "labels": "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
}

_lock = threading.Lock()
_cache = {}            # url -> (data, fetched at)
_frames = {}           # (kind, ts) -> jpeg bytes
_building = {}         # (kind, ts) -> lock, so two requests don't build the same frame
_map = {}              # (lat, lon) -> (base RGB, labels RGBA)
_pool = ThreadPoolExecutor(max_workers=8)   # tile downloads only
_bg = ThreadPoolExecutor(max_workers=1)     # snapshots and frame building, one at a time
_opened = [0.0]        # when the console last asked for data


def _fetch(url, headers=None, timeout=10):
    req = urllib.request.Request(url, headers=dict({"User-Agent": UA}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _json(url, ttl, headers=None):
    """GET JSON with a cache; on failure keep serving the last good answer."""
    now = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and now - hit[1] < ttl:
        return hit[0]
    try:
        data = json.loads(_fetch(url, headers))
        with _lock:
            _cache[url] = (data, now)
        return data
    except Exception:
        if hit:
            with _lock:
                _cache[url] = (hit[0], now - ttl + 60)   # try again in a minute
            return hit[0]
        return None


# ---------------- map geometry (web mercator, the tiles' own projection) ----------------
def _gpx(lat, lon, z=Z):
    n = 256 * 2 ** z
    s = math.sin(math.radians(max(-85, min(85, lat))))
    return (lon + 180) / 360 * n, (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n


def _origin(cfg):
    cx, cy = _gpx(cfg["latitude"], cfg["longitude"])
    return cx - SIZE / 2, cy - SIZE / 2


def _xy(cfg, lat, lon):
    ox, oy = _origin(cfg)
    x, y = _gpx(lat, lon)
    return round(x - ox, 1), round(y - oy, 1)


def _px_per_mile(cfg):
    m_per_px = math.cos(math.radians(cfg["latitude"])) * 2 * math.pi * 6378137 / (256 * 2 ** Z)
    return 1609.344 / m_per_px


def _tile(url, disk=None):
    if disk and os.path.exists(disk):
        with open(disk, "rb") as f:
            return Image.open(io.BytesIO(f.read())).convert("RGBA")
    raw = _fetch(url, timeout=15)
    if disk:
        os.makedirs(os.path.dirname(disk), exist_ok=True)
        with open(disk, "wb") as f:
            f.write(raw)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def _stitch(cfg, template, layer=None):
    """The SIZE x SIZE square around home, from 256 px tiles (fetched in parallel)."""
    ox, oy = _origin(cfg)
    x0, y0 = int(ox // 256), int(oy // 256)
    x1, y1 = int((ox + SIZE - 1) // 256), int((oy + SIZE - 1) // 256)
    jobs = {}
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            disk = os.path.join(TILES, layer, str(Z), str(tx), "%d" % ty) if layer else None
            jobs[(tx, ty)] = _pool.submit(_tile, template.format(z=Z, x=tx, y=ty), disk)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for (tx, ty), job in jobs.items():
        out.alpha_composite(job.result(), (int(tx * 256 - ox), int(ty * 256 - oy)))
    return out


def _basemap(cfg):
    key = (cfg["latitude"], cfg["longitude"])
    if key not in _map:
        base = _stitch(cfg, LAYERS["base"], "esri-dark")
        labels = _stitch(cfg, LAYERS["labels"], "esri-labels")
        _map[key] = (base, labels)
    return _map[key]


# ---------------- radar ----------------
def _site(cfg):
    """The local NEXRAD (KDIX -> DIX), from config or the NWS's answer for this point."""
    c = cfg.get("weather_console") or {}
    if c.get("radar"):
        return c["radar"].upper()[-3:]
    p = _points(cfg)
    st = (p or {}).get("radarStation") or "KDIX"
    return st[-3:]


def _scans(cfg, kind):
    now = datetime.now(timezone.utc)
    radar, product = ("USCOMP", "N0Q") if kind == "rain" else (_site(cfg), "N0S")
    url = "%s/json/radar.py?%s" % (IEM, urllib.parse.urlencode({
        "operation": "list", "product": product, "radar": radar,
        "start": (now - timedelta(minutes=75)).strftime("%Y-%m-%dT%H:%MZ"),
        "end": now.strftime("%Y-%m-%dT%H:%MZ")}))
    d = _json(url, 120)
    ts = [s["ts"] for s in (d or {}).get("scans", [])]
    return ts[-FRAMES:]


def _stamp(iso):   # "2026-11-12T23:05Z" -> "202611122305"
    return iso.replace("-", "").replace("T", "").replace(":", "").rstrip("Z")


def frame(cfg, kind, ts):
    """One radar picture as JPEG bytes, built once per scan."""
    if Image is None or kind not in ("rain", "vel") or not ts.isdigit() or len(ts) != 12:
        return None
    key = (kind, ts)
    with _lock:
        if key in _frames:
            return _frames[key]
        lk = _building.setdefault(key, threading.Lock())
    with lk:
        with _lock:
            if key in _frames:
                return _frames[key]
        layer = "ridge::USCOMP-N0Q-%s" % ts if kind == "rain" else "ridge::%s-N0S-%s" % (_site(cfg), ts)
        radar = _stitch(cfg, IEM + "/cache/tile.py/1.0.0/" + layer + "/{z}/{x}/{y}.png")
        base, labels = _basemap(cfg)
        img = base.copy()
        img.alpha_composite(radar)
        img.alpha_composite(labels)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=80, optimize=True)
        data = buf.getvalue()
        with _lock:
            _frames[key] = data
            _building.pop(key, None)
            mine = sorted(k for k in _frames if k[0] == kind)
            for old in mine[:-2 * FRAMES]:   # keep about two loops of each kind
                _frames.pop(old, None)
        return data


def _frame_list(cfg, kind):
    return [{"t": t, "url": "/api/wx/radar/%s/%s.jpg" % (kind, _stamp(t))} for t in _scans(cfg, kind)]


def _warm(cfg, kinds=("rain",)):
    for kind in kinds:
        for f in _frame_list(cfg, kind):
            try:
                frame(cfg, kind, f["url"].rsplit("/", 1)[1][:-4])
            except Exception:
                pass


# ---------------- NWS: grid point, station, warnings ----------------
def _points(cfg):
    d = _json("https://api.weather.gov/points/%.4f,%.4f" % (cfg["latitude"], cfg["longitude"]), 86400,
              {"Accept": "application/geo+json"})
    return (d or {}).get("properties")


def _station(cfg):
    c = cfg.get("weather_console") or {}
    if c.get("station"):
        return c["station"].upper()
    p = _points(cfg)
    if not p:
        return None
    d = _json(p["observationStations"], 86400, {"Accept": "application/geo+json"})
    fs = (d or {}).get("features") or []
    return fs[0]["properties"]["stationIdentifier"] if fs else None


def _val(p, k):
    v = p.get(k)
    return v.get("value") if isinstance(v, dict) else None


def observation(cfg):
    sid = _station(cfg)
    if not sid:
        return None
    d = _json("https://api.weather.gov/stations/%s/observations/latest" % sid, 300,
              {"Accept": "application/geo+json"})
    p = (d or {}).get("properties")
    if not p:
        return None
    meta = _json("https://api.weather.gov/stations/" + sid, 86400, {"Accept": "application/geo+json"})
    name = ((meta or {}).get("properties") or {}).get("name", sid)
    return {
        "id": sid, "name": name.split(",")[-1].strip(), "time": p.get("timestamp"),
        "raw": p.get("rawMessage") or "", "text": p.get("textDescription") or "",
        "temp": _val(p, "temperature"), "dew": _val(p, "dewpoint"),
        "pressure": _val(p, "seaLevelPressure") or _val(p, "barometricPressure"),
        "vis": _val(p, "visibility"), "gust": _val(p, "windGust"),
        "clouds": [{"amount": c.get("amount"), "base": (c.get("base") or {}).get("value")}
                   for c in (p.get("cloudLayers") or [])],
    }


WARN_COLORS = {   # the NWS's own map colours for the warnings that come with outlines
    "Tornado Warning": "#ff2a2a", "Severe Thunderstorm Warning": "#ffa500",
    "Flash Flood Warning": "#22dd55", "Flood Warning": "#00ff7f", "Flood Advisory": "#00ff7f",
    "Special Marine Warning": "#ffa500", "Snow Squall Warning": "#d070ff",
    "Extreme Wind Warning": "#ff8c00", "Dust Storm Warning": "#e0c060",
    "Special Weather Statement": "#ffe4b5",
}


def _rings(geom):
    if not geom:
        return []
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    if geom["type"] == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def warnings(cfg):
    """Warnings near home: their outlines in frame pixels, and the ones that cover home."""
    p = _points(cfg) or {}
    home_state = ((p.get("relativeLocation") or {}).get("properties") or {}).get("state", "NJ")
    c = cfg.get("weather_console") or {}
    states = c.get("states") or sorted({home_state, "NJ", "NY", "PA", "DE"} if home_state == "NJ" else {home_state})
    d = _json("https://api.weather.gov/alerts/active?area=" + ",".join(states), 180,
              {"Accept": "application/geo+json"})
    out = []
    for f in (d or {}).get("features", []):
        pr = f.get("properties", {})
        if pr.get("status") != "Actual" or pr.get("messageType") == "Cancel":
            continue
        polys = []
        for ring in _rings(f.get("geometry")):
            pts = [_xy(cfg, la, lo) for lo, la in ring]
            if any(-200 < x < SIZE + 200 and -200 < y < SIZE + 200 for x, y in pts):
                polys.append(pts)
        out.append({"event": pr.get("event"), "headline": pr.get("headline"),
                    "ends": pr.get("ends") or pr.get("expires"),
                    "color": WARN_COLORS.get(pr.get("event"), "#ffd84a"), "polys": polys,
                    "here": False})
    here = _json("https://api.weather.gov/alerts/active?point=%.4f,%.4f" % (cfg["latitude"], cfg["longitude"]),
                 180, {"Accept": "application/geo+json"})
    names = {(f.get("properties") or {}).get("event") for f in (here or {}).get("features", [])}
    for a in out:
        a["here"] = a["event"] in names
    return [a for a in out if a["polys"] or a["here"]]


# ---------------- forecast numbers (Open-Meteo) ----------------
HOURLY = ("temperature_2m,dew_point_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,"
          "precipitation,snowfall,weather_code,cloud_cover_low,cloud_cover_mid,cloud_cover_high,pressure_msl,"
          "wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,freezing_level_height,cape,uv_index,is_day")


def forecast(cfg):
    q = urllib.parse.urlencode({
        "latitude": cfg["latitude"], "longitude": cfg["longitude"], "hourly": HOURLY,
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,"
                   "cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,is_day",
        "past_hours": 3, "forecast_hours": 48, "timezone": "auto",
        "temperature_unit": "celsius", "wind_speed_unit": "kmh",
    })
    return _json("https://api.open-meteo.com/v1/forecast?" + q, 600)


# ---------------- the sounding: the air above home, hour by hour (Open-Meteo's GFS/HRRR) ----------------
LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200]
RD, CP, LV, EPS, G = 287.04, 1005.7, 2.501e6, 0.622, 9.80665


def _es(tc):   # saturation vapour pressure, hPa
    return 6.112 * math.exp(17.67 * tc / (tc + 243.5))


def _rs(p, tc):   # saturation mixing ratio, kg/kg
    e = min(_es(tc), p * 0.5)
    return EPS * e / (p - e)


def _interp(p, prof, k):
    """prof: levels sorted from the ground up (falling pressure); linear in ln p."""
    for a, b in zip(prof, prof[1:]):
        if a["p"] >= p >= b["p"]:
            f = math.log(a["p"] / p) / math.log(a["p"] / b["p"])
            return a[k] + (b[k] - a[k]) * f
    return None


def _parcel(p0, t0, td0, top=100):
    """A surface parcel: dry up to its cloud base (LCL, Bolton 1980), then pseudo-adiabatic."""
    tk, tdk = t0 + 273.15, td0 + 273.15
    tl = 1 / (1 / (tdk - 56) + math.log(tk / tdk) / 800) + 56
    pl = p0 * (tl / tk) ** (CP / RD)
    r0 = _rs(p0, td0)
    path, p = [], p0
    while p > pl:
        path.append((p, tk * (p / p0) ** (RD / CP) - 273.15, r0))
        p -= 5
    path.append((pl, tl - 273.15, r0))
    p, t = pl, tl

    def slope(pp, tt):
        r = _rs(pp, tt - 273.15)
        return (RD * tt + LV * r) / (CP + LV * LV * r * EPS / (RD * tt * tt)) / pp
    while p - 5 >= top:
        k1 = slope(p, t)
        k2 = slope(p - 5, t - 5 * k1)
        t -= 5 * (k1 + k2) / 2
        p -= 5
        path.append((p, t - 273.15, _rs(p, t - 273.15)))
    return path, pl, tl - 273.15


def _uv(ws, wd):
    a = math.radians(wd)
    return -ws * math.sin(a), -ws * math.cos(a)


def _sounding_hour(h, i, elev):
    p0, t0, td0 = h["surface_pressure"][i], h["temperature_2m"][i], h["dew_point_2m"][i]
    if None in (p0, t0, td0):
        return None
    prof = [{"p": p0, "t": t0, "td": td0, "z": 0.0, "ws": None, "wd": None}]
    for lv in LEVELS:
        if lv >= p0 - 2:
            continue   # under the ground here
        v = [h["%s_%dhPa" % (k, lv)][i] for k in ("temperature", "dew_point", "wind_speed", "wind_direction", "geopotential_height")]
        if None in v:
            continue
        prof.append({"p": lv, "t": v[0], "td": v[1], "ws": v[2], "wd": v[3], "z": v[4] - elev})
    if len(prof) < 6:
        return None
    path, pl, tl = _parcel(p0, t0, td0)

    def tv(t, r):
        return (t + 273.15) * (1 + 0.61 * r)
    # buoyancy layer by layer, with the virtual temperature correction
    layers = []
    for a, b in zip(path, path[1:]):
        te_a, te_b = _interp(a[0], prof, "t"), _interp(b[0], prof, "t")
        if te_a is None or te_b is None:
            break
        re_a, re_b = _rs(a[0], _interp(a[0], prof, "td")), _rs(b[0], _interp(b[0], prof, "td"))
        bu = (tv(a[1], a[2]) - tv(te_a, re_a) + tv(b[1], b[2]) - tv(te_b, re_b)) / 2
        layers.append((a[0], b[0], bu, RD * bu * math.log(a[0] / b[0])))
    pos = [k for k, l in enumerate(layers) if l[2] > 0]
    cape = cin = 0.0
    lfc = el = None
    if pos:
        k0, k1 = pos[0], pos[-1]
        lfc, el = layers[k0][0], layers[k1][1]
        cape = max(0.0, sum(l[3] for l in layers[k0:k1 + 1]))
        cin = sum(l[3] for l in layers[:k0] if l[3] < 0)
    t500p = next((t for p, t, r in path if p <= 500), None)
    t500e = _interp(500, prof, "t")
    # precipitable water, ground to 300 hPa
    pw = 0.0
    for a, b in zip(prof, prof[1:]):
        if b["p"] < 300:
            break
        q = [EPS * _es(x["td"]) / (x["p"] - (1 - EPS) * _es(x["td"])) for x in (a, b)]
        pw += (q[0] + q[1]) / 2 * (a["p"] - b["p"]) * 100 / G
    # freezing level above the ground, and any warm layer over freezing ground
    frz = 0.0 if t0 <= 0 else None
    for a, b in zip(prof, prof[1:]):
        if frz is None and a["t"] > 0 >= b["t"]:
            frz = a["z"] + (b["z"] - a["z"]) * a["t"] / (a["t"] - b["t"])
    low = [x for x in prof if x["p"] >= 600]
    warm_nose = max(x["t"] for x in low[1:]) if len(low) > 1 else -99
    sat = [x for x in low if x["t"] - x["td"] < 3]
    # what would fall: a warm layer aloft over freezing ground melts snow that refreezes (ice);
    # with no warm layer aloft, snow survives to the ground when it is cold or the freezing
    # level is low (melting takes a few hundred metres of above-freezing air)
    frz_m = frz if frz is not None else 0
    if t0 <= 0.5 and warm_nose > 0.5:
        kind = "ice"
    elif warm_nose <= 0.5 and (t0 <= 1.5 or frz_m < 300):
        kind = "snow"
    elif warm_nose <= 0.5 and t0 <= 4 and frz_m < 700:
        kind = "mix"
    else:
        kind = "rain"

    def at_z(z, k):
        for a, b in zip(prof[1:], prof[2:]):
            if a["z"] <= z <= b["z"]:
                f = (z - a["z"]) / (b["z"] - a["z"])
                return a[k] + (b[k] - a[k]) * f
        return None
    shear = None
    lowest = prof[1]
    u6 = at_z(6000, "ws"), at_z(6000, "wd")
    if None not in u6 and lowest["ws"] is not None:
        ua, va = _uv(lowest["ws"], lowest["wd"])
        ub, vb = _uv(*u6)
        shear = math.hypot(ub - ua, vb - va)
    t700, t500 = _interp(700, prof, "t"), t500e
    z700, z500 = _interp(700, prof, "z"), _interp(500, prof, "z")
    lr = (t700 - t500) / ((z500 - z700) / 1000) if None not in (t700, t500, z700, z500) else None
    thin = [x for k, x in enumerate(path) if k % 5 == 0 or abs(x[0] - pl) < 0.01 or k == len(path) - 1]   # every 25 hPa, plus cloud base
    return {
        "time": h["time"][i],
        "lv": [[round(x["p"], 1), round(x["t"], 1), round(x["td"], 1),
                None if x["ws"] is None else round(x["ws"]), None if x["wd"] is None else round(x["wd"]),
                round(x["z"])] for x in prof],
        "parcel": [[round(p, 1), round(t, 2)] for p, t, r in thin],
        "idx": {"cape": round(cape), "cin": round(cin), "lfc": lfc and round(lfc), "el": el and round(el),
                "lcl_p": round(pl), "lcl_z": round(_interp(pl, prof, "z") or 0),
                "li": None if t500p is None or t500e is None else round(t500e - t500p, 1),
                "pw": round(pw, 1), "frz": None if frz is None else round(frz), "lr": lr and round(lr, 1),
                "shear": None if shear is None else round(shear), "kind": kind,
                "moist": len(sat) >= 2},
    }


def sounding(cfg):
    keys = ["%s_%dhPa" % (k, lv) for k in ("temperature", "dew_point", "wind_speed", "wind_direction", "geopotential_height") for lv in LEVELS]
    q = urllib.parse.urlencode({
        "latitude": cfg["latitude"], "longitude": cfg["longitude"],
        "hourly": ",".join(keys + ["temperature_2m", "dew_point_2m", "surface_pressure"]),
        "forecast_hours": 25, "timezone": "auto", "wind_speed_unit": "kmh",
    })
    d = _json("https://api.open-meteo.com/v1/gfs?" + q, 1800)
    if not d or "hourly" not in d:
        return None
    h, out = d["hourly"], []
    for i in range(len(h["time"])):
        try:
            hr = _sounding_hour(h, i, d.get("elevation") or 0)
        except (ValueError, ZeroDivisionError, TypeError):
            hr = None
        if hr:
            out.append(hr)
    return out


# ---------------- the big picture: satellite, the forecasters' discussion, the storm outlook ----------------
SAT = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/%s/GEOCOLOR/"
_sat = {}   # (sector, stamp) -> jpeg bytes


def _text(url, ttl):
    now = time.time()
    with _lock:
        hit = _cache.get(url)
    if hit and now - hit[1] < ttl:
        return hit[0]
    try:
        data = _fetch(url).decode("utf-8", "replace")
        with _lock:
            _cache[url] = (data, now)
        return data
    except Exception:
        return hit[0] if hit else None


def _sector(cfg):
    return ((cfg.get("weather_console") or {}).get("satellite") or "ne").lower()


def satellite(cfg):
    """The last hour of GOES-19 GeoColor for the region (true colour by day, infrared and city
    lights at night), every 10 minutes."""
    import re
    sec = _sector(cfg)
    page = _text(SAT % sec, 240)
    if not page:
        return []
    stamps = sorted(set(re.findall(r"(\d{11})_GOES19-ABI-%s-GEOCOLOR-600x600\.jpg" % re.escape(sec), page)))
    out = []
    for st in stamps[-13:][::-2][::-1]:   # every other 5-minute scan, ending on the newest
        t = datetime(int(st[:4]), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(st[4:7]) - 1, hours=int(st[7:9]), minutes=int(st[9:11]))
        out.append({"t": t.strftime("%Y-%m-%dT%H:%MZ"), "url": "/api/wx/sat/%s/%s.jpg" % (sec, st)})
    return out


SECTORS = {"ne": "the Northeast", "se": "the Southeast", "umv": "the Upper Mississippi Valley", "smv": "the Southern Mississippi Valley",
           "cgl": "the Great Lakes", "sp": "the Southern Plains", "np": "the Northern Plains", "nr": "the Northern Rockies",
           "sr": "the Southern Rockies", "psw": "the Pacific Southwest", "pnw": "the Pacific Northwest", "cgp": "the Central Plains"}


def sat_frame(cfg, sec, stamp):
    if sec != _sector(cfg) or not stamp.isdigit() or len(stamp) != 11:
        return None
    key = (sec, stamp)
    with _lock:
        if key in _sat:
            return _sat[key]
    try:
        data = _fetch(SAT % sec + "%s_GOES19-ABI-%s-GEOCOLOR-600x600.jpg" % (stamp, sec), timeout=15)
        if Image is not None:   # about a third of the size, for the iPad's memory and Wi-Fi
            buf = io.BytesIO()
            Image.open(io.BytesIO(data)).convert("RGB").save(buf, "JPEG", quality=78, optimize=True)
            data = buf.getvalue()
    except Exception:
        return None
    with _lock:
        _sat[key] = data
        for old in sorted(_sat)[:-16]:
            _sat.pop(old, None)
    return data


def discussion(cfg):
    """The latest Area Forecast Discussion from the local NWS office, split into its sections."""
    import re
    office = (_points(cfg) or {}).get("gridId")
    if not office:
        return None
    lst = _json("https://api.weather.gov/products/types/AFD/locations/" + office, 600, {"Accept": "application/ld+json"})
    items = (lst or {}).get("@graph") or []
    if not items:
        return None
    prod = _json("https://api.weather.gov/products/" + items[0]["id"], 86400, {"Accept": "application/ld+json"})
    text = (prod or {}).get("productText") or ""
    issued = re.search(r"^\d{3,4} [AP]M [A-Z]{3,4} \w{3} \w{3} \d+ \d{4}$", text, re.M)
    office_name = re.search(r"^National Weather Service (.+)$", text, re.M)
    sections = []
    for m in re.finditer(r"^\.([A-Z][A-Z0-9 /,&-]+?)\.\.\.(.*?)(?=^\.[A-Z][A-Z0-9 /,&-]+?\.\.\.|^\$\$|\Z)", text, re.M | re.S):
        title, body = m.group(1).strip(), m.group(2)
        if "WATCHES/WARNINGS" in title:
            continue
        body = body.replace("&&", "").strip()
        paras = [" ".join(l.strip() for l in p.splitlines()).strip() for p in re.split(r"\n\s*\n", body)]
        paras = [p for p in paras if p]
        if paras:
            sections.append({"title": title.capitalize().split("/")[0].strip(), "paras": paras})
    return {"office": office_name.group(1) if office_name else office, "issued": issued.group(0) if issued else "",
            "time": items[0].get("issuanceTime"), "sections": sections}


SPC_RANK = ["TSTM", "MRGL", "SLGT", "ENH", "MDT", "HIGH"]
SPC_NAMES = {"TSTM": "Thunder", "MRGL": "Marginal", "SLGT": "Slight", "ENH": "Enhanced", "MDT": "Moderate", "HIGH": "High"}
SPC_COLORS = {"TSTM": "#c1e9c1", "MRGL": "#7fc57f", "SLGT": "#f6f67b", "ENH": "#e6c27a", "MDT": "#e67f7f", "HIGH": "#ff7fff"}


def _inside(lon, lat, ring):
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def spc(cfg):
    """The Storm Prediction Center's severe-storm outlook for home, today and the next two days."""
    out = []
    for day in (1, 2, 3):
        d = _json("https://www.spc.noaa.gov/products/outlook/day%dotlk_cat.nolyr.geojson" % day, 1800)
        best = None
        for f in (d or {}).get("features", []):
            lab = (f.get("properties") or {}).get("LABEL")
            if lab not in SPC_RANK:
                continue
            g = f.get("geometry") or {}
            polys = g.get("coordinates", []) if g.get("type") == "MultiPolygon" else [g.get("coordinates", [])]
            if any(p and _inside(cfg["longitude"], cfg["latitude"], [tuple(c[:2]) for c in p[0]]) for p in polys):
                if best is None or SPC_RANK.index(lab) > SPC_RANK.index(best):
                    best = lab
        out.append({"day": day, "label": best, "name": SPC_NAMES.get(best, "None"), "color": SPC_COLORS.get(best),
                    "ok": d is not None})
    return out


# ---------------- what /api/wx returns ----------------
_ready = {"data": None, "at": 0, "busy": False}


def summary(cfg):
    """Answer at once from the last snapshot (the background loop keeps it fresh); only the
    very first request waits for the National Weather Service and Open-Meteo."""
    if cfg.get("latitude") is None:
        return {"error": "Set latitude/longitude in config.json"}
    _opened[0] = time.time()
    if Image is not None:
        _bg.submit(_warm, cfg, ("rain", "vel"))   # usually all built already
    age = time.time() - _ready["at"]
    if _ready["data"] and age < 900:
        if age > 90 and not _ready["busy"]:
            _ready["busy"] = True
            _bg.submit(_snapshot, cfg)
        return _ready["data"]
    return _snapshot(cfg)


def _snapshot(cfg):
    try:
        data = _build(cfg)
        _ready.update(data=data, at=time.time())
        return data
    finally:
        _ready["busy"] = False


def _build(cfg):
    p = _points(cfg) or {}
    rel = (p.get("relativeLocation") or {}).get("properties") or {}
    site = _site(cfg)
    st = _json("https://api.weather.gov/radar/stations/K" + site, 86400, {"Accept": "application/geo+json"})
    site_xy = None
    if st and st.get("geometry"):
        lo, la = st["geometry"]["coordinates"][:2]
        site_xy = _xy(cfg, la, lo)
    radar = None
    if Image is not None:
        radar = {"size": SIZE, "home": [SIZE / 2, SIZE / 2], "px_per_mile": round(_px_per_mile(cfg), 4),
                 "site": "K" + site, "site_xy": site_xy,
                 "rain": _frame_list(cfg, "rain"), "vel": _frame_list(cfg, "vel")}
    return {
        "place": cfg.get("place_name") or rel.get("city", ""),
        "office": p.get("gridId"), "radar": radar,
        "forecast": forecast(cfg), "obs": observation(cfg), "warnings": warnings(cfg),
        "sounding": sounding(cfg),
        "satellite": satellite(cfg), "sat_area": SECTORS.get(_sector(cfg), ""), "discussion": discussion(cfg), "spc": spc(cfg),
        "server_time": time.time(),
    }


def _loop(load_config):
    """Keep the snapshot and the newest rain frames warm, so a tap opens the console at once.
    The velocity loop is only kept up while someone has looked at the console lately."""
    while True:
        try:
            cfg = load_config()
            if cfg.get("latitude") is not None and Image is not None:
                _snapshot(cfg)
                _warm(cfg, ("rain", "vel") if time.time() - _opened[0] < 900 else ("rain",))
        except Exception as e:
            print("wx: %s" % e, flush=True)
        time.sleep(150)


def start(load_config):
    threading.Thread(target=_loop, args=(load_config,), daemon=True).start()
