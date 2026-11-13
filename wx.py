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
_pool = ThreadPoolExecutor(max_workers=6)
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


# ---------------- what /api/wx returns ----------------
def summary(cfg):
    if cfg.get("latitude") is None:
        return {"error": "Set latitude/longitude in config.json"}
    _opened[0] = time.time()
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
        _pool.submit(_warm, cfg, ("rain", "vel"))
    return {
        "place": cfg.get("place_name") or rel.get("city", ""),
        "office": p.get("gridId"), "radar": radar,
        "forecast": forecast(cfg), "obs": observation(cfg), "warnings": warnings(cfg),
        "server_time": time.time(),
    }


def _loop(load_config):
    """Keep the newest rain frame and the readings warm, so a tap opens the console at once.
    The velocity loop is only kept up while someone has looked at the console lately."""
    while True:
        try:
            cfg = load_config()
            if cfg.get("latitude") is not None and Image is not None:
                _warm(cfg, ("rain", "vel") if time.time() - _opened[0] < 900 else ("rain",))
                forecast(cfg)
                observation(cfg)
        except Exception as e:
            print("wx: %s" % e, flush=True)
        time.sleep(150)


def start(load_config):
    threading.Thread(target=_loop, args=(load_config,), daemon=True).start()
