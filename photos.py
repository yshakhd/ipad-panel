"""Photo slideshow source.

Scans the folders in config.json -> photos.dirs, and serves each photo resized
to fit 1600px with EXIF rotation applied. Full-size phone photos would exhaust
the old iPad's 1 GB of RAM; resized JPEGs keep Safari stable.
Resized copies are cached in ~/.cache/ipad-panel/photos.
"""
import hashlib
import os
import threading
import time

try:
    from PIL import Image, ImageOps
except ImportError:  # slideshow just stays empty without Pillow
    Image = None

EXTS = (".jpg", ".jpeg", ".png", ".webp")
MAX_EDGE = 1600
MIN_EDGE = 800       # skip icons, logos, tiny screenshots
CACHE = os.path.expanduser("~/.cache/ipad-panel/photos")
_index = {"at": 0, "ids": [], "paths": {}}
_lock = threading.Lock()


def _scan(dirs):
    paths = {}
    for d in dirs:
        d = os.path.expanduser(d)
        for root, _, files in os.walk(d):
            for f in sorted(files):
                if f.lower().endswith(EXTS) and not f.startswith("."):
                    p = os.path.join(root, f)
                    try:
                        st = os.stat(p)
                    except OSError:
                        continue
                    pid = hashlib.sha1(("%s|%d|%d" % (p, st.st_mtime, st.st_size)).encode()).hexdigest()[:16]
                    paths[pid] = p
    return paths


def _usable(path):
    try:
        with Image.open(path) as im:
            return max(im.size) >= MIN_EDGE
    except Exception:
        return False


def listing(cfg):
    if Image is None:
        return []
    with _lock:
        if time.time() - _index["at"] < 60:
            return list(_index["ids"])
    dirs = (cfg.get("photos") or {}).get("dirs", [])
    paths = {k: v for k, v in _scan(dirs).items() if _usable(v)}
    with _lock:
        _index.update(at=time.time(), ids=sorted(paths), paths=paths)
    threading.Thread(target=_prewarm, args=(list(paths),), daemon=True).start()
    return sorted(paths)


def _render(pid):
    with _lock:
        src = _index["paths"].get(pid)
    if not src:
        return None
    out = os.path.join(CACHE, pid + ".jpg")
    if not os.path.exists(out):
        os.makedirs(CACHE, exist_ok=True)
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            tmp = out + ".tmp"
            im.save(tmp, "JPEG", quality=82)
            os.replace(tmp, out)
    return out


def _prewarm(ids):
    for pid in ids:
        try:
            _render(pid)
        except Exception:
            pass


def path_for(pid):
    if Image is None or not pid.isalnum():
        return None
    try:
        return _render(pid)
    except Exception:
        return None
