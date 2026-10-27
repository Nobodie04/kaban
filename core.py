"""Kaban: database, pengaturan, dan fungsi bantu yang dipakai app.py, admin_api.py, dan user_api.py."""
import os, re, secrets, sqlite3, time
from functools import wraps
from flask import g, jsonify, session

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("KABAN_DB", os.path.join(BASE, "instance", "kaban.db"))
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

ORDER_STATUS = ["baru", "dikonfirmasi", "dikerjakan", "selesai", "dibatalkan"]
MITRA_STATUS = ["pendaftar", "aktif", "ditolak", "nonaktif"]

# Ikon kartu layanan. Isi SVG tetap di sini; admin hanya memilih kuncinya.
ICONS = {
    "anak":    '<circle cx="7" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M7 14l4-8h4l3 8M11 6h-2"/>',
    "tandon":  '<path d="M6 3h12v4H6zM7 7v14h10V7M10 11h4M10 15h4"/>',
    "taman":   '<path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-2 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/>',
    "titip":   '<path d="M6 7h12l1 13H5zM9 7a3 3 0 016 0"/>',
    "antar":   '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
    "rumah":   '<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/>',
    "alat":    '<path d="M14.5 6.5a4 4 0 005 5L10 21a2.1 2.1 0 01-3-3z"/>',
    "makanan": '<path d="M5 3v8a3 3 0 003 3v7M8 3v6M11 3v8a3 3 0 01-3 3M17 21V3c-2 1-3 4-3 8h3"/>',
    "jam":     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "lain":    '<path d="M12 5v14M5 12h14"/>',
}

DEFAULT_SETTINGS = {
    "hero_judul": "Ada urusan yang belum sempat?",
    "hero_sorot": "Titip ke Kaban.",
    "hero_lead": "Antar anak ke sekolah, bersihkan tandon air atau taman, titip beli barang, antar paket ke tujuan. Kami kerjakan lewat mitra terdekat, Anda tetap fokus pada pekerjaan Anda.",
    "banner": "",
    "bagi_hasil_mitra": "80",
    "wa_admin": "",
    "jam_operasional": "Setiap hari",
    "kota": "Makassar",
    "peta_lat": "-5.1477",
    "peta_lng": "119.4327",
    "tz_offset": "8",
}
SETTING_MAX = {"hero_judul": 90, "hero_sorot": 60, "hero_lead": 400, "banner": 200, "wa_admin": 20,
               "jam_operasional": 80, "kota": 60, "peta_lat": 20, "peta_lng": 20, "tz_offset": 4, "bagi_hasil_mitra": 3}

# Kolom yang ditambahkan ke database lama (dibuat dari versi sebelumnya) saat server dijalankan.
MIGRATIONS = {
    "users":    [("aktif", "INTEGER NOT NULL DEFAULT 1"), ("sesi", "INTEGER NOT NULL DEFAULT 0"), ("last_login", "TEXT")],
    "services": [("harga_mulai", "TEXT"), ("ikon", "TEXT NOT NULL DEFAULT 'lain'"), ("urutan", "INTEGER NOT NULL DEFAULT 0")],
    "orders":   [("lat", "REAL"), ("lng", "REAL"), ("catatan_admin", "TEXT"), ("rating", "INTEGER"), ("ulasan", "TEXT"), ("mitra_respon", "TEXT")],
    "mitra":    [("user_id", "INTEGER REFERENCES users(id)"), ("tersedia", "INTEGER NOT NULL DEFAULT 1"), ("bio", "TEXT")],
}
LEGACY_SERVICE_META = {"anak": ("Per perjalanan atau langganan harian", "anak", 1), "tandon": ("Harga menurut ukuran tandon", "tandon", 2),
                       "taman": ("Harga menurut luas area", "taman", 3), "titip": ("Ongkos jasa + harga barang", "titip", 4),
                       "antar": ("Harga menurut jarak", "antar", 5), "lain": ("Dihitung setelah ditanya detail", "lain", 6)}

ORDER_SQL = """SELECT o.id,o.kode,o.user_id,o.nama,o.wa,o.alamat,o.lat,o.lng,o.jadwal,o.detail,o.harga,o.status,
                      o.mitra_id,o.created_at,o.updated_at,o.rating,o.ulasan,
                      s.nama AS layanan, s.kode AS layanan_kode, s.ikon AS ikon, m.nama AS mitra
               FROM orders o JOIN services s ON s.id=o.service_id LEFT JOIN mitra m ON m.id=o.mitra_id"""

# ---------- database ----------
def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

def init_db(admin_wa="", admin_pw=""):
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode = WAL")
    for table, cols in MIGRATIONS.items():        # migrasi database lama
        have = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        if have:
            for col, ddl in cols:
                if col not in have: con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
    if [r[1] for r in con.execute("PRAGMA table_info(services)")]:
        for kode, (hm, ik, ur) in LEGACY_SERVICE_META.items():
            con.execute("UPDATE services SET harga_mulai=COALESCE(harga_mulai,?), ikon=CASE WHEN ikon='lain' THEN ? ELSE ikon END, urutan=CASE WHEN urutan=0 THEN ? ELSE urutan END WHERE kode=?", (hm, ik, ur, kode))
    con.commit()
    con.executescript(open(os.path.join(BASE, "schema.sql"), encoding="utf-8").read())
    if not con.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        from werkzeug.security import generate_password_hash
        wa = norm_wa(admin_wa) or "6281200000000"
        pw = admin_pw or secrets.token_urlsafe(9)
        con.execute("INSERT INTO users (nama, wa, password_hash, role) VALUES (?,?,?,'admin')", ("Admin Kaban", wa, generate_password_hash(pw)))
        print(f"\n=== Akun admin dibuat ===\nWhatsApp : {wa}\nPassword : {pw}\n(Atur lewat KABAN_ADMIN_WA / KABAN_ADMIN_PASSWORD sebelum dijalankan pertama kali.)\n")
    con.commit(); con.close()

# ---------- util ----------
def norm_wa(v):
    v = re.sub(r"[\s\-().]", "", v or "")
    if v.startswith("+"): v = v[1:]
    if v.startswith("0"): v = "62" + v[1:]
    return v if re.fullmatch(r"628\d{7,12}", v) else ""

def err(msg, code=400):
    return jsonify(error=msg), code

def clean(v, n=300):
    return v.strip()[:n] if isinstance(v, str) else ""

def to_float(v, lo, hi):
    try: f = float(str(v).replace(",", ".").strip())
    except (TypeError, ValueError): return None
    return f if lo <= f <= hi else None

def now():
    return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())

def csv_safe(v):
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

def log_event(order_id, status, catatan=""):
    db().execute("INSERT INTO order_events (order_id,status,catatan) VALUES (?,?,?)", (order_id, status, catatan))

def order_events(order_id):
    return [dict(r) for r in db().execute("SELECT status,catatan,created_at FROM order_events WHERE order_id=? ORDER BY id", (order_id,))]

def get_settings():
    s = dict(DEFAULT_SETTINGS)
    for r in db().execute("SELECT kunci,nilai FROM settings"):
        if r["kunci"] in s: s[r["kunci"]] = r["nilai"]
    return s

def tz_hours():
    try: return max(-12, min(14, int(get_settings()["tz_offset"])))
    except (TypeError, ValueError): return 8

def mitra_for(uid):
    """Baris mitra aktif yang akun loginnya = uid, atau None."""
    if not uid: return None
    return db().execute("SELECT * FROM mitra WHERE user_id=? AND status='aktif'", (uid,)).fetchone()

def bagi_hasil():
    try: return max(0, min(100, int(get_settings()["bagi_hasil_mitra"])))
    except (TypeError, ValueError, KeyError): return 80

def current_user():
    uid = session.get("uid")
    if not uid: return None
    u = db().execute("SELECT id,nama,wa,role,aktif,sesi FROM users WHERE id=?", (uid,)).fetchone()
    if not u or not u["aktif"] or session.get("sv", 0) != u["sesi"]:
        session.clear(); return None
    return u

def login_required(role=None):
    def deco(f):
        @wraps(f)
        def wrapper(*a, **k):
            u = current_user()
            if not u: return err("Silakan masuk dulu.", 401)
            if role and u["role"] != role: return err("Akses ditolak.", 403)
            return f(*a, **k)
        return wrapper
    return deco

# pembatas percobaan (di memori)
_fails = {}
def throttle(key, limit=8, window=300):
    t = time.time()
    hits = [x for x in _fails.get(key, []) if t - x < window]
    _fails[key] = hits
    return len(hits) >= limit
def record_fail(key):
    _fails.setdefault(key, []).append(time.time())
