"""Spotify for the panel: a remote control, not a player.

iOS 9 Safari can't play Spotify (and the Spotify app left iOS 9 long ago), so the music plays
on a Spotify Connect device (spotifyd on this computer by default, or your phone, a speaker...)
and the iPad shows and drives it through the Spotify Web API, by way of this server.

Setup (once): make an app at https://developer.spotify.com/dashboard with the redirect URI
    http://127.0.0.1:8765/api/spotify/callback
put its Client ID and Secret in config.json:
    "spotify": { "client_id": "...", "client_secret": "...", "device": "Spotifyd" }
then open http://127.0.0.1:8765/api/spotify/login in a browser on this computer and allow it.
The refresh token is kept in spotify-token.json (git-ignored).

Spotify's 2026 rules for apps in Development Mode: the app owner needs Premium; search
returns at most 10 per type; track lists only for playlists you own or collaborate on
(others still play, by their URI).
"""
import base64
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(ROOT, "spotify-token.json")
API = "https://api.spotify.com/v1"
SCOPES = ("user-read-playback-state user-modify-playback-state user-read-currently-playing "
          "playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played")
ART_HOSTS = ("i.scdn.co", "mosaic.scdn.co", "image-cdn-ak.spotifycdn.com", "image-cdn-fa.spotifycdn.com",
             "thisis-images.spotifycdn.com", "seeded-session-images.scdn.co", "blend-playlist-covers.spotifycdn.com",
             "pickasso.spotifycdn.com", "wrapped-images.spotifycdn.com", "lineup-images.scdn.co")

_lock = threading.Lock()
_tok = {"access": None, "exp": 0}
_cache = {}          # key -> (time, value)
_art = {}            # url -> (time, bytes, type), a few dozen covers
_player = {"at": 0, "data": None, "busy": False}


def redirect_uri(cfg):
    return "http://127.0.0.1:%d/api/spotify/callback" % int(cfg.get("port", 8765))


def _conf(cfg):
    s = cfg.get("spotify") or {}
    return s if s.get("client_id") and s.get("client_secret") else None


def _saved():
    try:
        with open(TOKEN_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def status(cfg):
    if not _conf(cfg):
        return "unconfigured"
    return "ready" if _saved().get("refresh_token") else "unauthorized"


def login_url(cfg):
    c = _conf(cfg)
    q = urllib.parse.urlencode({"client_id": c["client_id"], "response_type": "code",
                                "redirect_uri": redirect_uri(cfg), "scope": SCOPES})
    return "https://accounts.spotify.com/authorize?" + q


def _token_call(cfg, form):
    c = _conf(cfg)
    auth = base64.b64encode(("%s:%s" % (c["client_id"], c["client_secret"])).encode()).decode()
    req = urllib.request.Request("https://accounts.spotify.com/api/token", data=urllib.parse.urlencode(form).encode(),
                                 headers={"Authorization": "Basic " + auth,
                                          "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def finish_login(cfg, code):
    t = _token_call(cfg, {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri(cfg)})
    with open(TOKEN_FILE, "w") as f:
        json.dump({"refresh_token": t["refresh_token"]}, f)
    os.chmod(TOKEN_FILE, 0o600)
    with _lock:
        _tok.update(access=t["access_token"], exp=time.time() + t.get("expires_in", 3600) - 60)


def _access(cfg):
    with _lock:
        if _tok["access"] and time.time() < _tok["exp"]:
            return _tok["access"]
        rt = _saved().get("refresh_token")
        if not rt:
            raise RuntimeError("not connected")
        t = _token_call(cfg, {"grant_type": "refresh_token", "refresh_token": rt})
        if t.get("refresh_token") and t["refresh_token"] != rt:   # Spotify may hand out a new one
            with open(TOKEN_FILE, "w") as f:
                json.dump({"refresh_token": t["refresh_token"]}, f)
        _tok.update(access=t["access_token"], exp=time.time() + t.get("expires_in", 3600) - 60)
        return _tok["access"]


class SpotifyError(Exception):
    def __init__(self, code, reason, message):
        super().__init__(message)
        self.code, self.reason, self.message = code, reason, message


def call(cfg, method, path, params=None, body=None):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = json.dumps(body).encode() if body is not None else (b"" if method in ("PUT", "POST") else None)
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Authorization": "Bearer " + _access(cfg), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read()).get("error", {})
        except ValueError:
            err = {}
        if e.code == 401:
            with _lock:
                _tok["access"] = None
        raise SpotifyError(e.code, err.get("reason", ""), err.get("message", "Spotify said %d" % e.code))


def _cached(key, secs, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < secs:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


# ---------------- shapes the iPad gets ----------------
def _img(images, want=300):
    """The smallest cover at least `want` px, as a link through this server (old Safari, modern TLS)."""
    if not images:
        return None
    imgs = sorted(images, key=lambda i: i.get("width") or 640)
    pick = next((i for i in imgs if (i.get("width") or 640) >= want), imgs[-1])
    return "/api/spotify/art?u=" + urllib.parse.quote(pick["url"], safe="")


def _track(t):
    if not t:
        return None
    album = t.get("album") or {}
    return {"uri": t.get("uri"), "name": t.get("name"), "ms": t.get("duration_ms"),
            "artist": ", ".join(a.get("name", "") for a in t.get("artists") or []) or (t.get("show") or {}).get("name", ""),
            "album": album.get("name") or "", "art": _img(album.get("images") or t.get("images")),
            "thumb": _img(album.get("images") or t.get("images"), 64)}


def _refresh_player(cfg):
    try:
        p = call(cfg, "GET", "/me/player", {"additional_types": "episode"})
        if not p:
            data = {"active": False}
        else:
            dev = p.get("device") or {}
            data = {"active": True, "playing": bool(p.get("is_playing")), "progress": p.get("progress_ms") or 0,
                    "shuffle": p.get("shuffle_state"), "repeat": p.get("repeat_state"),
                    "device": {"id": dev.get("id"), "name": dev.get("name"), "type": dev.get("type"),
                               "volume": dev.get("volume_percent"), "can_volume": dev.get("supports_volume", True)},
                    "track": _track(p.get("item")), "context": (p.get("context") or {}).get("uri")}
        data["at"] = time.time()
        _player.update(at=time.time(), data=data)
    except Exception as e:
        _player.update(at=time.time(), data={"active": False, "error": str(e), "at": time.time()})
    finally:
        _player["busy"] = False


def player(cfg, fresh=False, max_age=1.5):
    """Now playing. Served from a cache refreshed in the background, so a poll never waits on Spotify."""
    if status(cfg) != "ready":
        return {"status": status(cfg)}
    age = time.time() - _player["at"]
    if fresh or _player["data"] is None:
        _refresh_player(cfg)
    elif age > max_age and not _player["busy"]:
        _player["busy"] = True
        threading.Thread(target=_refresh_player, args=(cfg,), daemon=True).start()
    d = dict(_player["data"] or {})
    if d.get("playing") and d.get("at"):   # move the clock on since it was read
        d["progress"] = min((d.get("track") or {}).get("ms") or 0, d["progress"] + int((time.time() - d["at"]) * 1000))
    d["status"] = "ready"
    return d


def summary(cfg):
    """For /api/state: whether music is playing, without ever waiting on Spotify."""
    if status(cfg) != "ready":
        return None
    if _player["data"] is None:   # not read yet: start reading, answer next time
        if not _player["busy"]:
            _player["busy"] = True
            threading.Thread(target=_refresh_player, args=(cfg,), daemon=True).start()
        return None
    d = player(cfg, max_age=20)
    t = d.get("track") or {}
    return {"playing": bool(d.get("playing")), "name": t.get("name"), "artist": t.get("artist")} if d.get("active") else {"playing": False}


def library(cfg):
    def build():
        out = {"playlists": [], "liked": [], "recent": []}
        pl = call(cfg, "GET", "/me/playlists", {"limit": 50}) or {}
        for p in pl.get("items") or []:
            if not p:
                continue
            out["playlists"].append({"id": p.get("id"), "uri": p.get("uri"), "name": p.get("name"),
                                     "by": (p.get("owner") or {}).get("display_name") or "",
                                     "thumb": _img(p.get("images"), 64)})
        try:
            for it in (call(cfg, "GET", "/me/tracks", {"limit": 30}) or {}).get("items") or []:
                out["liked"].append(_track(it.get("track") or it.get("item")))
        except SpotifyError:
            pass
        try:
            seen = set()
            for it in (call(cfg, "GET", "/me/player/recently-played", {"limit": 30}) or {}).get("items") or []:
                t = _track(it.get("track") or it.get("item"))
                if t and t["uri"] not in seen:
                    seen.add(t["uri"]); out["recent"].append(t)
        except SpotifyError:
            pass
        return out
    return _cached("library", 120, build)


def playlist(cfg, pid):
    def build():
        meta = call(cfg, "GET", "/playlists/" + urllib.parse.quote(pid), {"fields": "name,uri,images,owner(display_name)"}) or {}
        tracks = []
        try:   # only for playlists you own or collaborate on, since 2026
            got = call(cfg, "GET", "/playlists/%s/items" % urllib.parse.quote(pid), {"limit": 100}) or {}
            for it in got.get("items") or []:
                t = _track(it.get("item") or it.get("track"))
                if t and t.get("uri"):
                    tracks.append(t)
        except SpotifyError:
            pass
        return {"name": meta.get("name"), "uri": meta.get("uri"), "art": _img(meta.get("images")),
                "by": (meta.get("owner") or {}).get("display_name") or "", "tracks": tracks}
    return _cached("pl:" + pid, 120, build)


def search(cfg, q):
    q = (q or "").strip()[:100]
    if not q:
        return {"tracks": [], "playlists": [], "albums": []}
    def build():
        r = call(cfg, "GET", "/search", {"q": q, "type": "track,playlist,album", "limit": 10}) or {}
        return {"tracks": [_track(t) for t in ((r.get("tracks") or {}).get("items") or []) if t],
                "playlists": [{"id": p.get("id"), "uri": p.get("uri"), "name": p.get("name"),
                               "by": (p.get("owner") or {}).get("display_name") or "", "thumb": _img(p.get("images"), 64)}
                              for p in ((r.get("playlists") or {}).get("items") or []) if p],
                "albums": [{"uri": a.get("uri"), "name": a.get("name"),
                            "by": ", ".join(x.get("name", "") for x in a.get("artists") or []),
                            "thumb": _img(a.get("images"), 64)}
                           for a in ((r.get("albums") or {}).get("items") or []) if a]}
    return _cached("q:" + q.lower(), 300, build)


def devices(cfg):
    got = call(cfg, "GET", "/me/player/devices") or {}
    return [{"id": d.get("id"), "name": d.get("name"), "type": d.get("type"), "active": d.get("is_active")}
            for d in got.get("devices") or []]


def _home_device(cfg):
    """The device to wake when nothing is playing anywhere: config spotify.device (default Spotifyd)."""
    want = ((cfg.get("spotify") or {}).get("device") or "Spotifyd").lower()
    ds = devices(cfg)
    for d in ds:
        if (d["name"] or "").lower() == want:
            return d["id"]
    return ds[0]["id"] if ds else None


def command(cfg, req):
    """play, pause, next, prev, seek {ms}, volume {pct}, shuffle {on}, transfer {device},
    start {context | uris, offset}. Starts on the home device when nothing is active."""
    a = req.get("action")
    def with_device(fn):
        try:
            return fn(None)
        except SpotifyError as e:
            if e.code != 404:   # NO_ACTIVE_DEVICE
                raise
            dev = _home_device(cfg)
            if not dev:
                raise SpotifyError(404, "NO_DEVICE", "No Spotify speaker is on. Open Spotify on a phone or computer, or start spotifyd.")
            return fn(dev)
    def q(dev, extra=None):
        p = dict(extra or {})
        if dev:
            p["device_id"] = dev
        return p or None
    if a == "play":
        with_device(lambda d: call(cfg, "PUT", "/me/player/play", q(d)))
    elif a == "pause":
        call(cfg, "PUT", "/me/player/pause")
    elif a == "next":
        call(cfg, "POST", "/me/player/next")
    elif a == "prev":
        call(cfg, "POST", "/me/player/previous")
    elif a == "seek":
        call(cfg, "PUT", "/me/player/seek", {"position_ms": int(req.get("ms", 0))})
    elif a == "volume":
        call(cfg, "PUT", "/me/player/volume", {"volume_percent": max(0, min(100, int(req.get("pct", 50))))})
    elif a == "shuffle":
        call(cfg, "PUT", "/me/player/shuffle", {"state": "true" if req.get("on") else "false"})
    elif a == "transfer":
        call(cfg, "PUT", "/me/player", body={"device_ids": [req["device"]], "play": True})
    elif a == "start":
        body = {}
        if req.get("context"):
            body["context_uri"] = req["context"]
            if req.get("offset"):
                body["offset"] = {"uri": req["offset"]}
        elif req.get("uris"):
            body["uris"] = list(req["uris"])[:100]
            if req.get("offset"):
                body["offset"] = {"uri": req["offset"]}
        with_device(lambda d: call(cfg, "PUT", "/me/player/play", q(d), body))
    else:
        raise SpotifyError(400, "BAD_ACTION", "Unknown action")
    time.sleep(0.35)   # let Spotify catch up before reading the state back
    return player(cfg, fresh=True)


def art(url):
    """A cover image, fetched by the server (the iPad's old TLS can't always reach Spotify's CDN)."""
    host = urllib.parse.urlparse(url).hostname or ""
    if urllib.parse.urlparse(url).scheme != "https" or host not in ART_HOSTS:
        return None, None
    hit = _art.get(url)
    if hit:
        return hit[1], hit[2]
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ipad-panel"}), timeout=10) as r:
        body, typ = r.read(), r.headers.get("Content-Type", "image/jpeg")
    if len(_art) > 80:
        for k in sorted(_art, key=lambda k: _art[k][0])[:20]:
            _art.pop(k, None)
    _art[url] = (time.time(), body, typ)
    return body, typ
