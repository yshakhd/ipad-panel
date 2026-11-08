"""Workstation detail sampler for the panel's breakdown sheet.

A background thread samples every second so rates (CPU per thread, network,
per-process CPU) are measured over a steady interval no matter who polls.
Linux-only: reads /proc and /sys. Works the same on a Raspberry Pi.
"""
import glob
import os
import platform
import subprocess
import threading
import time

CLK = os.sysconf("SC_CLK_TCK")
PAGE = os.sysconf("SC_PAGE_SIZE")
NCPU = os.cpu_count() or 1
_lock = threading.Lock()
_latest = {}


def _read(path, default=None):
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        return default


def _cpu_times():
    out = {}
    with open("/proc/stat") as f:
        for line in f:
            if not line.startswith("cpu"):
                break
            p = line.split()
            v = [int(x) for x in p[1:]]
            out[p[0]] = (sum(v), v[3] + v[4])
    return out


def _topology():
    """thread index -> physical core id, and a readable CPU model name."""
    cores = {}
    for d in glob.glob("/sys/devices/system/cpu/cpu[0-9]*"):
        n = int(d.rsplit("cpu", 1)[1])
        cid = _read(d + "/topology/core_id")
        cores[n] = int(cid) if cid is not None else n
    model = platform.processor()
    for line in (_read("/proc/cpuinfo", "") or "").splitlines():
        if line.startswith(("model name", "Model")):
            model = line.split(":", 1)[1].strip()
            break
    for junk in (" Processor", "(R)", "(TM)", " CPU"):
        model = model.replace(junk, "")
    model = " ".join(w for w in model.split() if not w.endswith("-Core"))
    return cores, model


def _freqs():
    out = {}
    for d in glob.glob("/sys/devices/system/cpu/cpu[0-9]*"):
        f = _read(d + "/cpufreq/scaling_cur_freq")
        if f:
            out[int(d.rsplit("cpu", 1)[1])] = round(int(f) / 1e6, 2)
    return out


TEMP_NAMES = {
    ("k10temp", "Tctl"): "CPU", ("k10temp", "Tccd1"): "CPU die 1", ("k10temp", "Tccd2"): "CPU die 2",
    ("coretemp", "Package id 0"): "CPU", ("cpu_thermal", None): "CPU",
    ("amdgpu", "edge"): "Built-in GPU", ("nvme", "Composite"): "SSD",
    ("spd5118", None): "RAM", ("mt7921_phy0", None): "Wi-Fi card", ("r8169_0_c00:00", None): "Ethernet chip",
}


def _temps():
    seen = {}
    out = []
    for h in sorted(glob.glob("/sys/class/hwmon/hwmon*"), key=lambda p: int(p.rsplit("hwmon", 1)[1])):
        name = _read(h + "/name", "")
        for inp in sorted(glob.glob(h + "/temp*_input")):
            label = _read(inp.replace("_input", "_label"))
            nice = TEMP_NAMES.get((name, label)) or TEMP_NAMES.get((name, None))
            if not nice:
                continue
            v = _read(inp)
            if not v:
                continue
            seen[nice] = seen.get(nice, 0) + 1
            out.append({"name": nice, "c": round(int(v) / 1000, 1)})
    # number duplicates: SSD 1, SSD 2 / RAM 1, RAM 2
    counts = {}
    for t in out:
        if seen[t["name"]] > 1:
            counts[t["name"]] = counts.get(t["name"], 0) + 1
            t["name"] = "%s %d" % (t["name"], counts[t["name"]])
    return out


_gpu = {"at": 0, "data": None, "fail_until": 0}


def _nvidia():
    now = time.time()
    if now < _gpu["fail_until"]:
        return None
    if now - _gpu["at"] < 5:
        return _gpu["data"]
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw",
                            "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=3)
        if r.returncode != 0:
            raise RuntimeError(r.stdout + r.stderr)
        n, u, t, mu, mt, pw = [x.strip() for x in r.stdout.splitlines()[0].split(",")]
        data = {"name": n.replace("NVIDIA GeForce ", ""), "util": float(u), "c": float(t),
                "mem_used_gb": round(float(mu) / 1024, 1), "mem_total_gb": round(float(mt) / 1024, 1),
                "watts": None if "N/A" in pw else round(float(pw))}
        _gpu.update(at=now, data=data)
        return data
    except Exception:
        _gpu.update(fail_until=now + 300, data=None)
        return None


def _mem():
    m = {}
    for line in open("/proc/meminfo"):
        k, v = line.split(":", 1)
        m[k] = int(v.split()[0]) * 1024
    total = m["MemTotal"]
    cache = m.get("Buffers", 0) + m.get("Cached", 0) + m.get("SReclaimable", 0) - m.get("Shmem", 0)
    free = m["MemFree"]
    apps = max(0, total - free - cache)
    return {"total": total, "apps": apps, "cache": cache, "free": free,
            "swap_used": m.get("SwapTotal", 0) - m.get("SwapFree", 0), "swap_total": m.get("SwapTotal", 0)}


def _net():
    out = {}
    for line in open("/proc/net/dev").readlines()[2:]:
        name, rest = line.split(":", 1)
        name = name.strip()
        if name == "lo" or name.startswith(("docker", "veth", "br-", "virbr")):
            continue
        v = rest.split()
        out[name] = (int(v[0]), int(v[8]))
    return out


def _procs():
    out = {}
    for d in os.listdir("/proc"):
        if not d.isdigit():
            continue
        try:
            with open("/proc/%s/stat" % d) as f:
                s = f.read()
            name = s[s.index("(") + 1:s.rindex(")")]
            rest = s[s.rindex(")") + 2:].split()
            jiffies = int(rest[11]) + int(rest[12])
            rss = int(rest[21]) * PAGE
            out[int(d)] = (name, jiffies, rss)
        except (OSError, ValueError, IndexError):
            continue
    return out


def _sampler():
    topo, model = _topology()
    prev_cpu, prev_net, prev_proc, prev_t = _cpu_times(), _net(), _procs(), time.time()
    tick = 0
    while True:
        time.sleep(1)
        tick += 1
        now = time.time()
        dt = now - prev_t
        cpu = _cpu_times()
        usage = {}
        for k, (tot, idle) in cpu.items():
            p = prev_cpu.get(k)
            if p and tot - p[0] > 0:
                usage[k] = round(100.0 * (1 - (idle - p[1]) / (tot - p[0])), 1)
        net = _net()
        rates = []
        for name, (rx, tx) in net.items():
            if name in prev_net:
                prx, ptx = prev_net[name]
                rates.append({"name": name, "rx": max(0, (rx - prx) / dt), "tx": max(0, (tx - ptx) / dt)})
        snap = {"usage": usage, "net": rates}
        if tick % 2 == 0:  # process scan is the expensive part
            procs = _procs()
            by_name = {}   # group multi-process apps (browsers, editors) under one name
            for pid, (name, j, rss) in procs.items():
                pct = 0.0
                if pid in prev_proc and prev_proc[pid][0] == name:
                    pct = 100.0 * (j - prev_proc[pid][1]) / CLK / 2.0 / NCPU
                g = by_name.setdefault(name, [0.0, 0, 0])
                g[0] += pct; g[1] += rss; g[2] += 1
            top = sorted(by_name.items(), key=lambda kv: (kv[1][0], kv[1][1]), reverse=True)[:6]
            snap["top"] = [{"name": n, "cpu": round(v[0], 1), "rss": v[1], "count": v[2]} for n, v in top]
            prev_proc = procs
        with _lock:
            _latest.update(snap)
            _latest["model"] = model
            _latest["topo"] = topo
        prev_cpu, prev_net, prev_t = cpu, net, now


def start():
    threading.Thread(target=_sampler, daemon=True, name="sysinfo").start()


def thread_usage():
    """Per-thread CPU % in thread order, for the inline meter."""
    with _lock:
        u = dict(_latest.get("usage", {}))
    return [u.get("cpu%d" % i, 0) for i in range(NCPU)], u.get("cpu")


def detail(disks):
    with _lock:
        snap = dict(_latest)
    usage = snap.get("usage", {})
    topo = snap.get("topo", {})
    freqs = _freqs()
    cores = {}
    for t in range(NCPU):
        cid = topo.get(t, t)
        cores.setdefault(cid, []).append({"thread": t, "pct": usage.get("cpu%d" % t, 0), "ghz": freqs.get(t)})
    try:
        up = float(open("/proc/uptime").read().split()[0])
    except OSError:
        up = 0
    return {
        "model": snap.get("model", ""), "threads": NCPU, "cpu": usage.get("cpu"),
        "load": [round(x, 2) for x in os.getloadavg()],
        "cores": [{"core": i, "threads": cores[k]} for i, k in enumerate(sorted(cores))],
        "mem": _mem(), "temps": _temps(), "gpu": _nvidia(), "net": snap.get("net", []),
        "top": snap.get("top", []), "disks": disks, "uptime_s": up,
    }
