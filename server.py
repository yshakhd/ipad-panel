#!/usr/bin/env python3
"""Tiny dashboard server for an old iPad (iOS 9-12 Safari).

Stdlib only. Serves static/index.html and a JSON feed at /api/state.
Weather is fetched server-side so the iPad never has to deal with modern TLS.

Push a message to the panel from any machine on the LAN:
    curl -d 'Laundry is done' http://<host>:8765/api/message
Clear it:
    curl -X DELETE http://<host>:8765/api/message
"""
import json
import os
import re
import socket
import threading
import time
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import ha
import photos
import sysinfo

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
CONFIG_PATH = os.path.join(ROOT, "config.json")

state_lock = threading.Lock()
message = {"text": "", "at": 0}
weather_cache = {"data": None, "at": 0}
_prev_cpu = None
_seen = {}


def load_config():
    path = CONFIG_PATH if os.path.exists(CONFIG_PATH) else os.path.join(ROOT, "config.example.json")
    with open(path) as f:
        return json.load(f)


def cpu_percent():
    global _prev_cpu
    with open("/proc/stat") as f:
        parts = [int(x) for x in f.readline().split()[1:]]
    idle = parts[3] + parts[4]
    total = sum(parts)
    pct = None
    if _prev_cpu:
        dt = total - _prev_cpu[0]
        di = idle - _prev_cpu[1]
        pct = round(100.0 * (1 - di / dt), 1) if dt else 0.0
    _prev_cpu = (total, idle)
    return pct


def mem_info():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0])
    total = info["MemTotal"]
    used = total - info["MemAvailable"]
    return {"used_gb": round(used / 1048576, 1), "total_gb": round(total / 1048576, 1),
            "percent": round(100.0 * used / total, 1)}


def disk_info(path="/", label=None):
    st = os.statvfs(path)
    total = st.f_blocks * st.f_frsize
    free = st.f_bavail * st.f_frsize
    return {"label": label or path, "percent": round(100.0 * (total - free) / total, 1),
            "free_gb": round(free / 1e9, 1)}


def disks(cfg):
    out = []
    for d in cfg.get("disks") or [{"path": "/", "label": "Disk"}]:
        try:
            out.append(disk_info(d["path"], d.get("label")))
        except OSError:
            pass
    return out


def uptime_hours():
    with open("/proc/uptime") as f:
        return round(float(f.read().split()[0]) / 3600, 1)


def cpu_temp():
    base = "/sys/class/thermal"
    try:
        for z in sorted(os.listdir(base)):
            p = os.path.join(base, z)
            try:
                kind = open(os.path.join(p, "type")).read().strip()
                if kind in ("x86_pkg_temp", "k10temp", "cpu-thermal", "acpitz"):
                    return round(int(open(os.path.join(p, "temp")).read()) / 1000, 1)
            except OSError:
                continue
    except OSError:
        pass
    # hwmon fallback (AMD k10temp often only appears here)
    hw = "/sys/class/hwmon"
    try:
        for h in os.listdir(hw):
            p = os.path.join(hw, h)
            name = open(os.path.join(p, "name")).read().strip()
            if name in ("k10temp", "coretemp", "zenpower"):
                return round(int(open(os.path.join(p, "temp1_input")).read()) / 1000, 1)
    except OSError:
        pass
    return None


WMO = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
       51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain",
       65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow",
       75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers", 82: "Heavy showers",
       85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm",
       99: "Thunderstorm"}


def weather(cfg):
    if cfg.get("latitude") is None or cfg.get("longitude") is None:
        return {"error": "Set latitude/longitude in config.json"}
    if weather_cache["data"] and time.time() - weather_cache["at"] < 600:
        return weather_cache["data"]
    q = urllib.parse.urlencode({
        "latitude": cfg["latitude"], "longitude": cfg["longitude"],
        "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day,cloud_cover",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset",
        "temperature_unit": "celsius", "wind_speed_unit": "kmh",
        "timezone": "auto", "forecast_days": 4,
    })
    try:
        with urllib.request.urlopen("https://api.open-meteo.com/v1/forecast?" + q, timeout=8) as r:
            raw = json.load(r)
        cur, d = raw["current"], raw["daily"]
        data = {
            "place": cfg.get("place_name", ""),
            "lat": cfg["latitude"], "lon": cfg["longitude"],
            "temp": cur["temperature_2m"], "feels": cur["apparent_temperature"],
            "desc": WMO.get(cur["weather_code"], "?"), "wind": round(cur["wind_speed_10m"]),
            "humidity": cur["relative_humidity_2m"],
            "code": cur["weather_code"], "is_day": cur["is_day"], "clouds": cur["cloud_cover"],
            "wind_dir": cur["wind_direction_10m"],
            "utc_offset": raw.get("utc_offset_seconds", 0),
            "sunrise": d["sunrise"][0], "sunset": d["sunset"][0],
            "days": [{"date": d["time"][i], "hi": d["temperature_2m_max"][i],
                      "lo": d["temperature_2m_min"][i],
                      "desc": WMO.get(d["weather_code"][i], "?"),
                      "rain": d["precipitation_probability_max"][i]} for i in range(len(d["time"]))],
        }
        weather_cache.update(data=data, at=time.time())
        return data
    except Exception as e:  # keep serving stale data if the API hiccups
        return weather_cache["data"] or {"error": "Weather unavailable: %s" % e}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        pass  # the iPad polls every few seconds; keep the journal quiet

    def _note_client(self):
        """Log page loads, and each client's polling once per 10 minutes."""
        path = self.path.split("?")[0]
        kind = "/photo/" if path.startswith("/photo/") else path
        key = (self.client_address[0], kind)
        now = time.time()
        if kind in ("/api/state", "/photo/") and now - _seen.get(key, 0) < 600:
            return
        _seen[key] = now
        if kind in ("/", "/index.html", "/scene.js", "/api/state", "/api/photos", "/photo/"):
            ua = self.headers.get("User-Agent", "")
            m = re.search(r"OS (\d+_\d+)", ua)
            print("client %s %s %s" % (self.client_address[0], kind,
                                       "iOS " + m.group(1).replace("_", ".") if m else ua[:60]), flush=True)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        if not self.path.startswith(("/api/", "/photo/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        self._note_client()
        if self.path.startswith("/api/system"):
            return self._json(sysinfo.detail(disks(load_config())))
        if self.path.startswith("/api/photos"):
            cfg = load_config()
            return self._json({"photos": photos.listing(cfg),
                               "seconds": (cfg.get("photos") or {}).get("seconds_per_photo", 5),
                               "painting_seconds": (cfg.get("photos") or {}).get("seconds_per_painting", 120)})
        if self.path.startswith("/photo/"):
            pid = self.path[len("/photo/"):].split(".")[0].split("?")[0]
            fp = photos.path_for(pid)
            if not fp:
                return self._json({"error": "not found"}, 404)
            with open(fp, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "max-age=86400")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/state"):
            cfg = load_config()
            with state_lock:
                msg = dict(message)
            w = weather(cfg)
            return self._json({
                "host": socket.gethostname(),
                "server_time": time.time(),
                "system": {"cpu": cpu_percent(), "threads": sysinfo.thread_usage()[0], "mem": mem_info(), "disks": disks(cfg), "disk": (disks(cfg) or [{"percent": 0, "free_gb": 0}])[0],
                           "uptime_h": uptime_hours(), "temp_c": cpu_temp(),
                           "load": os.getloadavg()[0]},
                "weather": w,
                "message": msg,
                "home": ha.states(cfg),
                "build": max(os.path.getmtime(os.path.join(STATIC, f)) for f in os.listdir(STATIC)),
                "default_unit": "F" if cfg.get("units", "fahrenheit") == "fahrenheit" else "C",
                "night": [cfg.get("night_dim_start_hour", 23), cfg.get("night_dim_end_hour", 7)],
                "default_scene": cfg.get("scene", "photos"),
                "city": {"sleep_hour": (cfg.get("city") or {}).get("sleep_hour", 1),
                         "wake_hour": (cfg.get("city") or {}).get("wake_hour", 8)},
            })
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/clientlog"):
            n = int(self.headers.get("Content-Length", 0))
            print("client-log %s %s" % (self.client_address[0],
                  self.rfile.read(min(n, 2000)).decode("utf-8", "replace")), flush=True)
            return self._json({"ok": True})
        if self.path.startswith("/api/home/action"):
            n = int(self.headers.get("Content-Length", 0))
            try:
                req = json.loads(self.rfile.read(n) or b"{}")
                ok, msg = ha.action(load_config(), req.get("entity_id", ""), req.get("action", ""))
            except Exception as e:
                ok, msg = False, "Home Assistant error: %s" % e.__class__.__name__
            return self._json({"ok": ok, "message": msg}, 200 if ok else 400)
        if self.path.startswith("/api/message"):
            n = int(self.headers.get("Content-Length", 0))
            text = self.rfile.read(n).decode("utf-8", "replace").strip()[:500]
            with state_lock:
                message.update(text=text, at=time.time())
            return self._json({"ok": True})
        self._json({"error": "not found"}, 404)

    def do_DELETE(self):
        if self.path.startswith("/api/message"):
            with state_lock:
                message.update(text="", at=time.time())
            return self._json({"ok": True})
        self._json({"error": "not found"}, 404)


def main():
    cfg = load_config()
    port = int(os.environ.get("PANEL_PORT", cfg.get("port", 8765)))
    cpu_percent()  # prime the CPU delta
    sysinfo.start()
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("iPad panel on http://0.0.0.0:%d" % port, flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
