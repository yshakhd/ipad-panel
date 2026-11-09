"""Home Assistant bridge for the panel.

The iPad never talks to Home Assistant directly. It asks this server, which holds
the token and only exposes entities listed in config.json -> home_assistant.entities.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
_cache = {"states": None, "at": 0}
_lock = threading.Lock()

CONTROLLABLE = ("light", "switch", "fan", "cover", "lock", "scene", "script",
                "media_player", "climate", "input_boolean")


def _cfg(cfg):
    return cfg.get("home_assistant") or {}


def _token(ha):
    tok = os.environ.get("HA_TOKEN")
    if tok:
        return tok.strip()
    path = os.path.join(ROOT, ha.get("token_file", "ha-token.txt"))
    with open(path) as f:
        return f.read().strip()


def _request(ha, method, path, body=None):
    url = ha.get("url", "http://localhost:8123").rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + _token(ha), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.load(r)


def _allowed(ha):
    """Entity list from config, in display order. Items are ids or {id, name}."""
    out = []
    for item in ha.get("entities", []):
        if isinstance(item, str):
            out.append({"id": item})
        else:
            out.append(item)
    return out


def _tile(ent, override):
    eid = ent["entity_id"]
    domain = eid.split(".")[0]
    a = ent.get("attributes", {})
    s = ent["state"]
    t = {"id": eid, "domain": domain, "state": s,
         "name": override.get("name") or a.get("friendly_name") or eid,
         "control": domain in CONTROLLABLE,
         "unavailable": s in ("unavailable", "unknown") and domain not in ("scene", "script")}
    if domain in ("light", "switch", "fan", "input_boolean"):
        t["on"] = s == "on"
        if domain == "light" and s == "on" and a.get("brightness") is not None:
            t["detail"] = "%d%%" % round(a["brightness"] / 2.55)
        elif domain == "fan" and s == "on" and a.get("percentage"):
            t["detail"] = "%d%%" % a["percentage"]
        else:
            t["detail"] = "On" if t["on"] else "Off"
    elif domain == "cover":
        t["on"] = s in ("open", "opening")
        t["detail"] = s.capitalize()
        t["confirm"] = a.get("device_class") == "garage" or "garage" in eid
    elif domain == "lock":
        t["on"] = s != "locked"          # "on" = needs attention
        t["detail"] = s.capitalize()
        t["confirm"] = s == "locked"    # confirm before unlocking
    elif domain == "media_player":
        t["on"] = s == "playing"
        title = a.get("media_title")
        t["detail"] = (s.capitalize() + (" · " + title if title else ""))[:40]
    elif domain == "climate":
        unit = a.get("temperature_unit") or ""
        t["on"] = s != "off"
        t["current"] = a.get("current_temperature")
        t["target"] = a.get("temperature")
        t["unit"] = unit
        t["step"] = a.get("target_temp_step") or (1 if "F" in unit else 0.5)
        t["min"], t["max"] = a.get("min_temp"), a.get("max_temp")
        t["detail"] = s.replace("_", " ").capitalize()
    elif domain in ("scene", "script"):
        t["on"] = False
        t["detail"] = "Tap to run"
    elif domain == "binary_sensor":
        t["on"] = s == "on"
        dc = a.get("device_class")
        words = {"moisture": ("Wet", "Dry"), "motion": ("Motion", "Clear"),
                 "door": ("Open", "Closed"), "window": ("Open", "Closed"),
                 "occupancy": ("Occupied", "Clear")}.get(dc, ("On", "Off"))
        t["detail"] = words[0] if t["on"] else words[1]
        t["alert"] = t["on"] and dc in ("moisture", "smoke", "gas", "safety")
    else:  # sensor and anything else: read-only value
        t["on"] = False
        unit = a.get("unit_of_measurement") or ""
        t["detail"] = s + (" " + unit if unit else "")
    return t


def states(cfg):
    ha = _cfg(cfg)
    if not ha.get("enabled"):
        return None
    with _lock:
        fresh = _cache["states"] is not None and time.time() - _cache["at"] < 2
    try:
        if not fresh:
            all_states = _request(ha, "GET", "/api/states")
            with _lock:
                _cache.update(states={e["entity_id"]: e for e in all_states}, at=time.time())
        with _lock:
            by_id = _cache["states"]
        tiles = []
        for item in _allowed(ha):
            ent = by_id.get(item["id"])
            if ent:
                tiles.append(_tile(ent, item))
            else:
                tiles.append({"id": item["id"], "name": item.get("name", item["id"]),
                              "domain": item["id"].split(".")[0], "state": "missing",
                              "detail": "Not found", "unavailable": True, "control": False})
        return {"tiles": tiles}
    except (OSError, urllib.error.URLError, ValueError) as e:
        return {"error": "Home Assistant unreachable (%s)" % e.__class__.__name__}


def action(cfg, entity_id, act):
    """Run a panel action. Returns (ok, message)."""
    ha = _cfg(cfg)
    if not ha.get("enabled"):
        return False, "Home Assistant disabled"
    if entity_id not in [i["id"] for i in _allowed(ha)]:
        return False, "Entity not on panel"
    domain = entity_id.split(".")[0]
    ent = _request(ha, "GET", "/api/states/" + entity_id)
    s, a = ent["state"], ent.get("attributes", {})
    data = {"entity_id": entity_id}
    if act == "toggle":
        if domain in ("light", "switch", "fan", "input_boolean", "cover"):
            svc = (domain, "toggle")
        elif domain == "lock":
            svc = ("lock", "unlock" if s == "locked" else "lock")
        elif domain in ("scene", "script"):
            svc = (domain, "turn_on")
        elif domain == "media_player":
            svc = ("media_player", "media_play_pause")
        elif domain == "climate":
            modes = a.get("hvac_modes") or []
            on_mode = next((m for m in ("heat_cool", "auto", "heat", "cool") if m in modes), None)
            if s != "off":
                data["hvac_mode"] = "off"
            elif on_mode:
                data["hvac_mode"] = on_mode
            else:
                return False, "No on mode"
            svc = ("climate", "set_hvac_mode")
        else:
            return False, "Not controllable"
    elif act in ("temp_up", "temp_down") and domain == "climate":
        if a.get("temperature") is None:
            return False, "No single setpoint"
        unit = a.get("temperature_unit") or ""
        step = a.get("target_temp_step") or (1 if "F" in unit else 0.5)
        t = a["temperature"] + (step if act == "temp_up" else -step)
        lo, hi = a.get("min_temp", -100), a.get("max_temp", 100)
        data["temperature"] = max(lo, min(hi, t))
        svc = ("climate", "set_temperature")
    else:
        return False, "Unknown action"
    _request(ha, "POST", "/api/services/%s/%s" % svc, data)
    with _lock:
        _cache["at"] = 0  # force a refresh on the next poll
    return True, "ok"


def raw(cfg):
    """Every Home Assistant state by entity id (cached for 2 s), or None. Server-side only."""
    ha = _cfg(cfg)
    if not ha.get("enabled"):
        return None
    with _lock:
        if _cache["states"] is not None and time.time() - _cache["at"] < 2:
            return _cache["states"]
    try:
        all_states = _request(ha, "GET", "/api/states")
    except (OSError, urllib.error.URLError, ValueError):
        with _lock:
            return _cache["states"]
    with _lock:
        _cache.update(states={e["entity_id"]: e for e in all_states}, at=time.time())
        return _cache["states"]


def call(cfg, domain, service, data):
    """Call a Home Assistant service from the server (charger, notifications)."""
    ha = _cfg(cfg)
    if not ha.get("enabled"):
        raise OSError("Home Assistant disabled")
    _request(ha, "POST", "/api/services/%s/%s" % (domain, service), data)
    with _lock:
        _cache["at"] = 0
