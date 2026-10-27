"""Kaban: aplikasi Flask + SQLite. Jalankan: python app.py"""
import os, re, secrets
from flask import Flask, g, jsonify, request, session, render_template, redirect
from markupsafe import Markup
from werkzeug.security import generate_password_hash, check_password_hash
from core import (mitra_for, BASE, db, init_db, err, clean, to_float, norm_wa, now, log_event, current_user, get_settings,
                  throttle, record_fail, ICONS)
from admin_api import bp as admin_bp
from user_api import bp as user_bp
from mitra_api import bp as mitra_bp

app = Flask(__name__)

def _secret():
    if os.environ.get("KABAN_SECRET"):
        return os.environ["KABAN_SECRET"]
    p = os.path.join(BASE, "instance", "secret.key")
    if not os.path.exists(p):
        with open(p, "w") as f:
            f.write(secrets.token_hex(32))
        os.chmod(p, 0o600)
    return open(p).read().strip()

app.config.update(
    SECRET_KEY=_secret(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("KABAN_HTTPS") == "1",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 14,
    MAX_CONTENT_LENGTH=64 * 1024,
)
app.register_blueprint(admin_bp)
app.register_blueprint(user_bp)
app.register_blueprint(mitra_bp)

@app.template_global()
def icon(key):
    """Kartu layanan di beranda: ikon dipilih admin, isi SVG tetap dari core.ICONS."""
    return Markup('<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS.get(key, ICONS["lain"]) + "</svg>")

@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d: d.close()

@app.before_request
def csrf_guard():
    # Permintaan yang mengubah data wajib membawa header ini (tidak bisa dikirim lintas situs oleh form biasa).
    if request.method in ("POST", "PATCH", "DELETE") and request.path.startswith("/api/"):
        if request.headers.get("X-Requested-With") != "kaban":
            return err("Permintaan tidak valid.", 400)

@app.after_request
def headers(r):
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["X-Frame-Options"] = "DENY"
    r.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.path.startswith("/api/"):
        r.headers["Cache-Control"] = "no-store"
    return r

# ---------- halaman ----------
def active_services():
    return [dict(r) for r in db().execute("SELECT id,kode,nama,deskripsi,harga_mulai,ikon FROM services WHERE aktif=1 ORDER BY urutan,id")]

@app.get("/")
def page_home():
    return render_template("index.html", s=get_settings(), services=active_services())

@app.get("/masuk")
def page_login():
    u = current_user()
    if u:
        return redirect("/admin" if u["role"] == "admin" else "/mitra" if mitra_for(u["id"]) else "/akun")
    return render_template("masuk.html")

@app.get("/akun")
def page_user():
    u = current_user()
    if not u: return redirect("/masuk?next=/akun")
    if u["role"] == "admin": return redirect("/admin")
    return render_template("user.html")

@app.get("/mitra")
def page_mitra():
    u = current_user()
    if not u: return redirect("/masuk?next=/mitra")
    if u["role"] == "admin": return redirect("/admin")
    if not mitra_for(u["id"]): return redirect("/akun")
    return render_template("mitra.html")

@app.get("/admin")
def page_admin():
    u = current_user()
    if not u: return redirect("/masuk?next=/admin")
    if u["role"] != "admin": return redirect("/akun")
    return render_template("admin.html")

# ---------- publik ----------
@app.get("/api/config")
def config():
    s = get_settings()
    return jsonify(wa_admin=s["wa_admin"], kota=s["kota"], jam_operasional=s["jam_operasional"],
                   peta_lat=s["peta_lat"], peta_lng=s["peta_lng"], icons=ICONS)

@app.get("/api/services")
def services():
    return jsonify([{k: r[k] for k in ("kode", "nama", "deskripsi", "harga_mulai", "ikon")} for r in active_services()])

# ---------- auth ----------
def start_session(uid, sesi):
    session.clear(); session["uid"] = uid; session["sv"] = sesi; session.permanent = True

@app.post("/api/register")
def register():
    d = request.get_json(silent=True) or {}
    nama, wa, pw = clean(d.get("nama"), 80), norm_wa(d.get("wa")), d.get("password") or ""
    if not nama: return err("Isi nama Anda.")
    if not wa: return err("Nomor WhatsApp belum benar. Contoh: 081234567890.")
    if len(pw) < 8: return err("Password minimal 8 karakter.")
    if db().execute("SELECT 1 FROM users WHERE wa=?", (wa,)).fetchone():
        return err("Nomor ini sudah terdaftar. Silakan masuk.", 409)
    cur = db().execute("INSERT INTO users (nama,wa,password_hash,last_login) VALUES (?,?,?,?)", (nama, wa, generate_password_hash(pw), now()))
    uid = cur.lastrowid
    db().execute("UPDATE orders SET user_id=? WHERE user_id IS NULL AND wa=?", (uid, wa))   # sambungkan pesanan tamu
    db().commit()
    start_session(uid, 0)
    return jsonify(ok=True, nama=nama, role="user")

@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    wa, pw = norm_wa(d.get("wa")), d.get("password") or ""
    key = f"{request.remote_addr}|{wa}"
    if throttle(key): return err("Terlalu banyak percobaan. Coba lagi 5 menit lagi.", 429)
    u = db().execute("SELECT * FROM users WHERE wa=?", (wa,)).fetchone() if wa else None
    if not u or not check_password_hash(u["password_hash"], pw):
        record_fail(key); return err("Nomor WhatsApp atau password salah.", 401)
    if not u["aktif"]: return err("Akun ini dinonaktifkan. Hubungi admin Kaban.", 403)
    db().execute("UPDATE users SET last_login=? WHERE id=?", (now(), u["id"])); db().commit()
    start_session(u["id"], u["sesi"])
    return jsonify(ok=True, nama=u["nama"], role=u["role"], mitra=bool(mitra_for(u["id"])))

@app.post("/api/logout")
def logout():
    session.clear(); return jsonify(ok=True)

@app.get("/api/me")
def me():
    u = current_user()
    return jsonify(user=({**{k: u[k] for k in ("id", "nama", "wa", "role")}, "mitra": bool(mitra_for(u["id"]))}) if u else None)

# ---------- pesan & daftar mitra ----------
@app.post("/api/orders")
def create_order():
    d = request.get_json(silent=True) or {}
    u = current_user()
    nama = clean(d.get("nama"), 80) or (u["nama"] if u else "")
    wa = norm_wa(d.get("wa")) or (u["wa"] if u else "")
    svc = db().execute("SELECT id FROM services WHERE kode=? AND aktif=1", (clean(d.get("service"), 30),)).fetchone()
    alamat, lat, lng = clean(d.get("alamat"), 200), None, None
    if u and d.get("address_id"):                       # lokasi tersimpan milik pelanggan ini
        a = db().execute("SELECT alamat,lat,lng FROM addresses WHERE id=? AND user_id=?", (d.get("address_id"), u["id"])).fetchone()
        if not a: return err("Lokasi tersimpan tidak ditemukan.")
        alamat, lat, lng = a["alamat"], a["lat"], a["lng"]
    elif "lat" in d and "lng" in d:
        lat, lng = to_float(d.get("lat"), -90, 90), to_float(d.get("lng"), -180, 180)
        if lat is None or lng is None: lat = lng = None
    tgl, jam = clean(d.get("tanggal"), 10), clean(d.get("jam"), 5)
    if not nama: return err("Isi nama.")
    if not wa: return err("Nomor WhatsApp belum benar. Contoh: 081234567890.")
    if not svc: return err("Pilih layanan.")
    if not alamat: return err("Isi alamat lokasi pekerjaan.")
    if not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", tgl) and re.fullmatch(r"\d{2}:\d{2}", jam)): return err("Isi tanggal dan jam.")
    alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        kode = "KBN-" + "".join(secrets.choice(alpha) for _ in range(5))
        if not db().execute("SELECT 1 FROM orders WHERE kode=?", (kode,)).fetchone(): break
    cur = db().execute("""INSERT INTO orders (kode,user_id,nama,wa,service_id,alamat,lat,lng,jadwal,detail)
                          VALUES (?,?,?,?,?,?,?,?,?,?)""",
                       (kode, u["id"] if u else None, nama, wa, svc["id"], alamat, lat, lng, f"{tgl} {jam}", clean(d.get("detail"), 1000)))
    log_event(cur.lastrowid, "baru", "Pesanan diterima")
    db().commit()
    return jsonify(ok=True, kode=kode, login=bool(u)), 201

@app.post("/api/mitra-applications")
def apply_mitra():
    d = request.get_json(silent=True) or {}
    nama, wa, kel = clean(d.get("nama"), 80), norm_wa(d.get("wa")), clean(d.get("kelurahan"), 80)
    kodes = [clean(x, 30) for x in (d.get("layanan") or [])][:20]
    if not nama or not kel: return err("Isi nama dan kelurahan.")
    if not wa: return err("Nomor WhatsApp belum benar. Contoh: 081234567890.")
    ids = [r["id"] for r in db().execute(f"SELECT id FROM services WHERE aktif=1 AND kode IN ({','.join('?'*len(kodes))})", kodes)] if kodes else []
    if not ids: return err("Pilih minimal satu layanan.")
    if db().execute("SELECT 1 FROM mitra WHERE wa=?", (wa,)).fetchone():
        return err("Nomor ini sudah pernah mendaftar. Kami akan menghubungi Anda.", 409)
    cur = db().execute("INSERT INTO mitra (nama,wa,kelurahan,kendaraan,catatan) VALUES (?,?,?,?,?)",
                       (nama, wa, kel, clean(d.get("kendaraan"), 40), clean(d.get("catatan"), 500)))
    db().executemany("INSERT INTO mitra_services VALUES (?,?)", [(cur.lastrowid, i) for i in ids])
    db().commit()
    return jsonify(ok=True), 201

init_db(os.environ.get("KABAN_ADMIN_WA", ""), os.environ.get("KABAN_ADMIN_PASSWORD", ""))
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("KABAN_DEBUG") == "1")
