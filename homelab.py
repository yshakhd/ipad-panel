"""Homelab status for the panel: services that are down (from an Uptime Kuma status
page) and ad blocking (from AdGuard Home), with a tile to pause blocking for a while.

config.json:
    "homelab": {
        "kuma": "http://127.0.0.1:3001/status/homelab",
        "adguard": {"url": "http://127.0.0.1:3080", "username": "...",
                    "password_file": "~/.config/homelab/adguard.pass"},
        "pause_minutes": 10
    }
Both halves are optional. The Kuma status page must be published (it's read without
a login); the AdGuard user only needs to read stats and switch protection.
"""
import base64
import json
import os
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
_cache = {"at": 0, "data": None}
_said = set()   # log each failure once, not every 20 s
_lock = threading.Lock()


def _get(url, headers=None, body=None, timeout=4):
    req = urllib.request.Request(url, headers=headers or {}, data=body,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    try:
        return json.loads(raw)
    except ValueError:   # AdGuard answers some POSTs with plain "OK"
        return None


def _adguard(cfg):
    a = (cfg.get("homelab") or {}).get("adguard")
    if not a:
        return None, None
    pw = a.get("password", "")
    if a.get("password_file"):
        with open(os.path.join(ROOT, os.path.expanduser(a["password_file"]))) as f:
            pw = f.read().strip()
    auth = base64.b64encode(("%s:%s" % (a.get("username", ""), pw)).encode()).decode()
    return a.get("url", "http://127.0.0.1:3080").rstrip("/"), {"Authorization": "Basic " + auth,
                                                               "Content-Type": "application/json"}


def _down(cfg):
    page = (cfg.get("homelab") or {}).get("kuma")
    if not page:
        return None
    base, slug = page.rstrip("/").split("/status/")
    names = {m["id"]: m["name"] for g in _get("%s/api/status-page/%s" % (base, slug))["publicGroupList"]
             for m in g["monitorList"]}
    beats = _get("%s/api/status-page/heartbeat/%s" % (base, slug))["heartbeatList"]
    return [names.get(int(k), k) for k, v in beats.items() if v and v[-1]["status"] == 0]


def _log(what, e):
    msg = "homelab: %s unreachable (%s)" % (what, e.__class__.__name__)
    if msg not in _said:
        _said.add(msg)
        print(msg, flush=True)


def _fetch(cfg):
    out = {}
    try:
        out["down"] = _down(cfg)
    except Exception as e:
        _log("Uptime Kuma", e)
    try:
        url, h = _adguard(cfg)
        if url:
            st = _get(url + "/control/stats", h)
            ps = _get(url + "/control/status", h)
            out["ads"] = {"blocked": st["num_blocked_filtering"], "queries": st["num_dns_queries"],
                          "on": bool(ps.get("protection_enabled")),
                          "paused_s": int((ps.get("protection_disabled_duration") or 0) / 1000)}
    except Exception as e:
        _log("AdGuard", e)
    return out


def summary(cfg):
    """{"down": [names], "ads": {...}}, refreshed at most every 20 s; None when not configured."""
    if not cfg.get("homelab"):
        return None
    with _lock:
        if _cache["data"] is not None and time.time() - _cache["at"] < 20:
            return _cache["data"]
    data = _fetch(cfg)
    with _lock:
        _cache.update(at=time.time(), data=data)
    return data


def tiles(cfg):
    """Tiles for the Home controls view, in the same shape as ha.py's."""
    s = summary(cfg) or {}
    ads = s.get("ads")
    if not ads:
        return []
    mins = (cfg.get("homelab") or {}).get("pause_minutes", 10)
    if ads["on"]:
        detail = "On · tap to pause %d min" % mins
    elif ads["paused_s"]:
        detail = "Paused, %d min left" % max(1, round(ads["paused_s"] / 60))
    else:
        detail = "Off · tap to turn on"
    return [
        {"id": "homelab.ad_blocking", "domain": "switch", "name": "Ad blocking", "state": "on" if ads["on"] else "off",
         "on": ads["on"], "control": True, "unavailable": False, "detail": detail},
        {"id": "homelab.ads_blocked", "domain": "sensor", "name": "Ads blocked · 24 h", "state": str(ads["blocked"]),
         "on": False, "control": False, "unavailable": False, "detail": "{:,}".format(ads["blocked"])},
    ]


def action(cfg, entity_id, act):
    """Pause ad blocking for pause_minutes, or turn it back on. Returns (ok, message)."""
    if entity_id != "homelab.ad_blocking" or act != "toggle":
        return False, "Unknown action"
    url, h = _adguard(cfg)
    if not url:
        return False, "AdGuard isn't configured"
    on = bool(_get(url + "/control/status", h).get("protection_enabled"))
    mins = (cfg.get("homelab") or {}).get("pause_minutes", 10)
    body = {"enabled": True} if not on else {"enabled": False, "duration": int(mins * 60000)}
    _get(url + "/control/protection", h, json.dumps(body).encode())
    with _lock:
        _cache["at"] = 0
    return True, "ok"
