"""API halaman admin: dasbor langsung, pesanan, pengguna, mitra, layanan, pengaturan situs."""
import csv, io, re, secrets, datetime
from flask import Blueprint, jsonify, request, Response
from werkzeug.security import generate_password_hash
from core import (db, err, clean, norm_wa, to_float, now, log_event, current_user, login_required, get_settings, tz_hours,
                  ORDER_SQL, order_events, csv_safe, ORDER_STATUS, MITRA_STATUS, DEFAULT_SETTINGS, SETTING_MAX, ICONS)

bp = Blueprint("admin", __name__)
admin_only = login_required("admin")
PAGE = 20

def _q(sql, *a): return db().execute(sql, a).fetchone()[0]

# ---------- dasbor langsung ----------
@bp.get("/api/admin/live")
@admin_only
def live():
    off = f"{tz_hours():+d} hours"
    today = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + datetime.timedelta(hours=tz_hours())).date()
    days = [today - datetime.timedelta(days=i) for i in range(13, -1, -1)]
    first = days[0].isoformat()
    per = {r[0]: r[1] for r in db().execute("SELECT date(created_at,?) d, COUNT(*) FROM orders WHERE date(created_at,?)>=? GROUP BY d", (off, off, first))}
    rev = {r[0]: r[1] for r in db().execute("SELECT date(updated_at,?) d, COALESCE(SUM(harga),0) FROM orders WHERE status='selesai' AND date(updated_at,?)>=? GROUP BY d", (off, off, first))}
    bulan = f"strftime('%Y-%m', datetime(updated_at,'{off}'))=strftime('%Y-%m', datetime('now','{off}'))"
    status = {r[0]: r[1] for r in db().execute("SELECT status, COUNT(*) FROM orders GROUP BY status")}
    layanan = [dict(r) for r in db().execute(
        """SELECT s.nama, COUNT(*) n FROM orders o JOIN services s ON s.id=o.service_id
           WHERE date(o.created_at,?)>=? GROUP BY s.id ORDER BY n DESC LIMIT 8""", (off, (today - datetime.timedelta(days=29)).isoformat()))]
    feed = [dict(r) for r in db().execute(
        """SELECT e.id, e.status, e.catatan, e.created_at, o.kode, o.nama, s.nama AS layanan
           FROM order_events e JOIN orders o ON o.id=e.order_id JOIN services s ON s.id=o.service_id
           ORDER BY e.id DESC LIMIT 12""")]
    return jsonify(
        diperbarui=now(), tz=tz_hours(),
        tiles=dict(
            pesanan_baru=status.get("baru", 0), berjalan=status.get("dikonfirmasi", 0) + status.get("dikerjakan", 0),
            hari_ini=per.get(today.isoformat(), 0), kemarin=per.get((today - datetime.timedelta(days=1)).isoformat(), 0),
            selesai_bulan_ini=_q(f"SELECT COUNT(*) FROM orders WHERE status='selesai' AND {bulan}"),
            omzet_bulan_ini=_q(f"SELECT COALESCE(SUM(harga),0) FROM orders WHERE status='selesai' AND {bulan}"),
            mitra_aktif=_q("SELECT COUNT(*) FROM mitra WHERE status='aktif'"),
            pendaftar_mitra=_q("SELECT COUNT(*) FROM mitra WHERE status='pendaftar'"),
            pengguna=_q("SELECT COUNT(*) FROM users WHERE role='user'")),
        harian=[{"tanggal": d.isoformat(), "pesanan": per.get(d.isoformat(), 0), "pendapatan": rev.get(d.isoformat(), 0)} for d in days],
        status=status, layanan=layanan, aktivitas=feed,
        last_order_id=_q("SELECT COALESCE(MAX(id),0) FROM orders"))

# ---------- pesanan ----------
def _order_filter(args):
    w, a = ["1=1"], []
    st, q = args.get("status", ""), clean(args.get("q"), 60)
    if st in ORDER_STATUS: w.append("o.status=?"); a.append(st)
    elif st == "aktif": w.append("o.status IN ('baru','dikonfirmasi','dikerjakan')")
    if q:
        w.append("(o.kode LIKE ? OR o.nama LIKE ? OR o.wa LIKE ? OR o.alamat LIKE ? OR s.nama LIKE ? OR m.nama LIKE ?)"); a += [f"%{q}%"] * 6
    return " AND ".join(w), a

@bp.get("/api/admin/orders")
@admin_only
def orders():
    w, a = _order_filter(request.args)
    try: off = max(0, int(request.args.get("offset", 0)))
    except ValueError: off = 0
    base = "FROM orders o JOIN services s ON s.id=o.service_id LEFT JOIN mitra m ON m.id=o.mitra_id"
    total = db().execute(f"SELECT COUNT(*) {base} WHERE {w}", a).fetchone()[0]
    rows = db().execute(f"{ORDER_SQL} WHERE {w} ORDER BY o.id DESC LIMIT {PAGE} OFFSET {off}", a).fetchall()
    return jsonify(total=total, limit=PAGE, items=[dict(r) for r in rows])

@bp.get("/api/admin/orders.csv")
@admin_only
def orders_csv():
    w, a = _order_filter(request.args)
    rows = db().execute(f"{ORDER_SQL} WHERE {w} ORDER BY o.id DESC", a).fetchall()
    buf = io.StringIO(); wr = csv.writer(buf)
    wr.writerow(["Kode", "Dibuat (UTC)", "Pelanggan", "WhatsApp", "Layanan", "Jadwal", "Alamat", "Status", "Mitra", "Harga (Rp)"])
    for r in rows:
        wr.writerow([csv_safe(x) for x in (r["kode"], r["created_at"], r["nama"], r["wa"], r["layanan"], r["jadwal"], r["alamat"], r["status"], r["mitra"] or "", r["harga"] or "")])
    return Response("﻿" + buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=pesanan-kaban.csv"})

@bp.get("/api/admin/orders/<int:oid>")
@admin_only
def order_detail(oid):
    r = db().execute(ORDER_SQL + " WHERE o.id=?", (oid,)).fetchone()
    if not r: return err("Pesanan tidak ditemukan.", 404)
    o = dict(r); o["events"] = order_events(oid)
    o["catatan_admin"] = db().execute("SELECT catatan_admin FROM orders WHERE id=?", (oid,)).fetchone()[0] or ""
    o["akun"] = None
    if r["user_id"]:
        u = db().execute("SELECT id,nama,wa FROM users WHERE id=?", (r["user_id"],)).fetchone()
        o["akun"] = dict(u) if u else None
    return jsonify(o)

@bp.patch("/api/admin/orders/<int:oid>")
@admin_only
def update_order(oid):
    d = request.get_json(silent=True) or {}
    o = db().execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
    if not o: return err("Pesanan tidak ditemukan.", 404)
    status = d.get("status", o["status"])
    if status not in ORDER_STATUS: return err("Status tidak dikenal.")
    harga = o["harga"]
    if "harga" in d:
        try: harga = None if d["harga"] in (None, "") else int(d["harga"])
        except (ValueError, TypeError): return err("Harga harus angka.")
        if harga is not None and not (0 <= harga <= 100_000_000): return err("Harga di luar batas.")
    mitra_id = o["mitra_id"]
    if "mitra_id" in d:
        mitra_id = d["mitra_id"] or None
        if mitra_id and not db().execute("SELECT 1 FROM mitra WHERE id=? AND status='aktif'", (mitra_id,)).fetchone():
            return err("Mitra tidak aktif atau tidak ditemukan.")
    if status in ("dikonfirmasi", "dikerjakan", "selesai") and not mitra_id: return err("Pilih mitra sebelum status dikonfirmasi.")
    if status == "selesai" and harga is None: return err("Isi harga sebelum menandai selesai.")
    cat_admin = clean(d["catatan_admin"], 500) if "catatan_admin" in d else o["catatan_admin"]
    respon = o["mitra_respon"]
    if mitra_id != o["mitra_id"]: respon = "menunggu" if mitra_id else None       # mitra baru harus menerima dulu
    db().execute("UPDATE orders SET status=?,harga=?,mitra_id=?,mitra_respon=?,catatan_admin=?,updated_at=? WHERE id=?", (status, harga, mitra_id, respon, cat_admin, now(), oid))
    if mitra_id and mitra_id != o["mitra_id"]:
        nm = db().execute("SELECT nama FROM mitra WHERE id=?", (mitra_id,)).fetchone()["nama"]
        log_event(oid, status, "Ditugaskan ke " + nm)
    elif status != o["status"]: log_event(oid, status, clean(d.get("catatan"), 200))
    db().commit()
    return jsonify(ok=True)

# ---------- pengguna ----------
@bp.get("/api/admin/users")
@admin_only
def users():
    q = clean(request.args.get("q"), 60); role = request.args.get("role", "")
    w, a = ["1=1"], []
    if q: w.append("(u.nama LIKE ? OR u.wa LIKE ?)"); a += [f"%{q}%"] * 2
    if role in ("user", "admin"): w.append("u.role=?"); a.append(role)
    if role == "mitra": w.append("EXISTS (SELECT 1 FROM mitra m WHERE m.user_id=u.id)")
    rows = db().execute(f"""SELECT u.id,u.nama,u.wa,u.role,u.aktif,u.last_login,u.created_at,
                           EXISTS (SELECT 1 FROM mitra m WHERE m.user_id=u.id) AS is_mitra,
                           (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS pesanan
                           FROM users u WHERE {' AND '.join(w)} ORDER BY u.id DESC LIMIT 300""", a).fetchall()
    return jsonify([dict(r) for r in rows])

@bp.get("/api/admin/users/<int:uid>")
@admin_only
def user_detail(uid):
    u = db().execute("SELECT id,nama,wa,role,aktif,last_login,created_at FROM users WHERE id=?", (uid,)).fetchone()
    if not u: return err("Pengguna tidak ditemukan.", 404)
    o = dict(u)
    mt = db().execute("SELECT nama,status FROM mitra WHERE user_id=?", (uid,)).fetchone()
    o["mitra"] = dict(mt) if mt else None
    o["pesanan"] = [dict(r) for r in db().execute(ORDER_SQL + " WHERE o.user_id=? ORDER BY o.id DESC LIMIT 8", (uid,))]
    o["lokasi"] = [dict(r) for r in db().execute("SELECT label,alamat,lat,lng,utama FROM addresses WHERE user_id=? ORDER BY utama DESC,id DESC", (uid,))]
    o["belanja"] = _q("SELECT COALESCE(SUM(harga),0) FROM orders WHERE user_id=? AND status='selesai'", uid)
    return jsonify(o)

@bp.post("/api/admin/users")
@admin_only
def create_user():
    d = request.get_json(silent=True) or {}
    nama, wa = clean(d.get("nama"), 80), norm_wa(d.get("wa"))
    role = d.get("role") if d.get("role") in ("user", "admin") else "user"
    pw = d.get("password") or secrets.token_urlsafe(8)
    if not nama: return err("Isi nama.")
    if not wa: return err("Nomor WhatsApp belum benar. Contoh: 081234567890.")
    if len(pw) < 8: return err("Password minimal 8 karakter.")
    if db().execute("SELECT 1 FROM users WHERE wa=?", (wa,)).fetchone(): return err("Nomor ini sudah terdaftar.", 409)
    cur = db().execute("INSERT INTO users (nama,wa,password_hash,role) VALUES (?,?,?,?)", (nama, wa, generate_password_hash(pw), role))
    db().execute("UPDATE orders SET user_id=? WHERE user_id IS NULL AND wa=?", (cur.lastrowid, wa))
    db().commit()
    return jsonify(ok=True, id=cur.lastrowid, password=pw), 201

@bp.patch("/api/admin/users/<int:uid>")
@admin_only
def update_user(uid):
    me = current_user(); d = request.get_json(silent=True) or {}
    u = db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not u: return err("Pengguna tidak ditemukan.", 404)
    nama = clean(d["nama"], 80) if "nama" in d else u["nama"]
    wa = norm_wa(d["wa"]) if "wa" in d else u["wa"]
    role = d.get("role", u["role"]); aktif = int(bool(d.get("aktif", u["aktif"])))
    if not nama: return err("Isi nama.")
    if not wa: return err("Nomor WhatsApp belum benar.")
    if role not in ("user", "admin"): return err("Peran tidak dikenal.")
    if db().execute("SELECT 1 FROM users WHERE wa=? AND id<>?", (wa, uid)).fetchone(): return err("Nomor ini dipakai akun lain.", 409)
    if uid == me["id"] and (role != u["role"] or not aktif):
        return err("Anda tidak bisa menurunkan atau menonaktifkan akun Anda sendiri.", 409)
    sesi = u["sesi"] + (1 if (not aktif and u["aktif"]) or role != u["role"] else 0)  # paksa keluar bila dinonaktifkan/diubah perannya
    db().execute("UPDATE users SET nama=?,wa=?,role=?,aktif=?,sesi=? WHERE id=?", (nama, wa, role, aktif, sesi, uid)); db().commit()
    return jsonify(ok=True)

@bp.post("/api/admin/users/<int:uid>/reset-password")
@admin_only
def reset_password(uid):
    u = db().execute("SELECT sesi FROM users WHERE id=?", (uid,)).fetchone()
    if not u: return err("Pengguna tidak ditemukan.", 404)
    pw = secrets.token_urlsafe(8)
    db().execute("UPDATE users SET password_hash=?, sesi=? WHERE id=?", (generate_password_hash(pw), u["sesi"] + 1, uid))
    db().commit()
    return jsonify(ok=True, password=pw)

# ---------- mitra ----------
def _mitra_row(r):
    m = dict(r)
    m["layanan"] = [x["kode"] for x in db().execute("SELECT s.kode FROM mitra_services ms JOIN services s ON s.id=ms.service_id WHERE ms.mitra_id=?", (r["id"],))]
    m["akun"] = bool(r["user_id"])
    m["pesanan"] = _q("SELECT COUNT(*) FROM orders WHERE mitra_id=?", r["id"])
    m["selesai"] = _q("SELECT COUNT(*) FROM orders WHERE mitra_id=? AND status='selesai'", r["id"])
    return m

def _set_mitra_services(mid, kodes):
    kodes = [clean(k, 30) for k in (kodes or [])]
    ids = [r["id"] for r in db().execute(f"SELECT id FROM services WHERE kode IN ({','.join('?'*len(kodes))})", kodes)] if kodes else []
    db().execute("DELETE FROM mitra_services WHERE mitra_id=?", (mid,))
    db().executemany("INSERT INTO mitra_services VALUES (?,?)", [(mid, i) for i in ids])

@bp.get("/api/admin/mitra")
@admin_only
def mitra_list():
    rows = db().execute("SELECT * FROM mitra ORDER BY CASE status WHEN 'pendaftar' THEN 0 WHEN 'aktif' THEN 1 ELSE 2 END, id DESC").fetchall()
    return jsonify([_mitra_row(r) for r in rows])

@bp.post("/api/admin/mitra")
@admin_only
def mitra_create():
    d = request.get_json(silent=True) or {}
    nama, wa, kel = clean(d.get("nama"), 80), norm_wa(d.get("wa")), clean(d.get("kelurahan"), 80)
    if not nama or not kel: return err("Isi nama dan kelurahan.")
    if not wa: return err("Nomor WhatsApp belum benar.")
    if db().execute("SELECT 1 FROM mitra WHERE wa=?", (wa,)).fetchone(): return err("Nomor ini sudah terdaftar sebagai mitra.", 409)
    st = d.get("status") if d.get("status") in MITRA_STATUS else "aktif"
    cur = db().execute("INSERT INTO mitra (nama,wa,kelurahan,kendaraan,catatan,status) VALUES (?,?,?,?,?,?)",
                       (nama, wa, kel, clean(d.get("kendaraan"), 40), clean(d.get("catatan"), 500), st))
    _set_mitra_services(cur.lastrowid, d.get("layanan")); db().commit()
    return jsonify(ok=True, id=cur.lastrowid), 201

@bp.patch("/api/admin/mitra/<int:mid>")
@admin_only
def mitra_update(mid):
    d = request.get_json(silent=True) or {}
    m = db().execute("SELECT * FROM mitra WHERE id=?", (mid,)).fetchone()
    if not m: return err("Mitra tidak ditemukan.", 404)
    st = d.get("status", m["status"])
    if st not in MITRA_STATUS: return err("Status tidak dikenal.")
    nama = clean(d["nama"], 80) if "nama" in d else m["nama"]
    wa = norm_wa(d["wa"]) if "wa" in d else m["wa"]
    kel = clean(d["kelurahan"], 80) if "kelurahan" in d else m["kelurahan"]
    if not nama or not kel or not wa: return err("Nama, WhatsApp, dan kelurahan wajib diisi.")
    if db().execute("SELECT 1 FROM mitra WHERE wa=? AND id<>?", (wa, mid)).fetchone(): return err("Nomor ini dipakai mitra lain.", 409)
    db().execute("UPDATE mitra SET status=?,nama=?,wa=?,kelurahan=?,kendaraan=?,catatan=? WHERE id=?",
                 (st, nama, wa, kel, clean(d["kendaraan"], 40) if "kendaraan" in d else m["kendaraan"],
                  clean(d["catatan"], 500) if "catatan" in d else m["catatan"], mid))
    if "layanan" in d: _set_mitra_services(mid, d["layanan"])
    db().commit()
    return jsonify(ok=True)

@bp.post("/api/admin/mitra/<int:mid>/akun")
@admin_only
def mitra_akun(mid):
    """Buat (atau reset) akun login mitra. Password sementara hanya ditampilkan sekali ke admin."""
    m = db().execute("SELECT * FROM mitra WHERE id=?", (mid,)).fetchone()
    if not m: return err("Mitra tidak ditemukan.", 404)
    if m["status"] != "aktif": return err("Setujui mitra (status aktif) sebelum membuat akun login.")
    u = db().execute("SELECT id,role FROM users WHERE id=?", (m["user_id"],)).fetchone() if m["user_id"] else None
    if not u: u = db().execute("SELECT id,role FROM users WHERE wa=?", (m["wa"],)).fetchone()
    if u and u["role"] == "admin": return err("Nomor ini adalah akun admin. Pakai nomor lain untuk mitra.", 409)
    if u and db().execute("SELECT 1 FROM mitra WHERE user_id=? AND id<>?", (u["id"], mid)).fetchone(): return err("Akun ini sudah dipakai mitra lain.", 409)
    pw = secrets.token_urlsafe(8)
    if u:
        db().execute("UPDATE users SET password_hash=?, aktif=1, sesi=sesi+1 WHERE id=?", (generate_password_hash(pw), u["id"])); uid = u["id"]
    else:
        uid = db().execute("INSERT INTO users (nama,wa,password_hash) VALUES (?,?,?)", (m["nama"], m["wa"], generate_password_hash(pw))).lastrowid
    db().execute("UPDATE mitra SET user_id=? WHERE id=?", (uid, mid)); db().commit()
    return jsonify(ok=True, wa=m["wa"], password=pw, baru=u is None)

# ---------- layanan (muncul di beranda dan form) ----------
def _slug(nama):
    s = re.sub(r"[^a-z0-9]+", "-", nama.lower()).strip("-")[:24] or "layanan"
    base, i = s, 2
    while db().execute("SELECT 1 FROM services WHERE kode=?", (s,)).fetchone(): s = f"{base}-{i}"; i += 1
    return s

def _svc_fields(d, partial=False):
    out = {}
    if "nama" in d or not partial:
        out["nama"] = clean(d.get("nama"), 60)
        if not out["nama"]: return None, "Isi nama layanan."
    if "deskripsi" in d or not partial: out["deskripsi"] = clean(d.get("deskripsi"), 300)
    if "harga_mulai" in d or not partial: out["harga_mulai"] = clean(d.get("harga_mulai"), 80)
    if "ikon" in d or not partial:
        out["ikon"] = d.get("ikon") if d.get("ikon") in ICONS else "lain"
    if "urutan" in d or not partial:
        try: out["urutan"] = max(0, min(999, int(d.get("urutan", 50))))
        except (TypeError, ValueError): return None, "Urutan harus angka."
    if "aktif" in d or not partial: out["aktif"] = int(bool(d.get("aktif", True)))
    return out, None

@bp.get("/api/admin/services")
@admin_only
def services_list():
    rows = db().execute("""SELECT s.*, (SELECT COUNT(*) FROM orders o WHERE o.service_id=s.id) AS pesanan
                           FROM services s ORDER BY s.urutan, s.id""").fetchall()
    return jsonify(items=[dict(r) for r in rows], icons=ICONS)

@bp.post("/api/admin/services")
@admin_only
def services_create():
    f, e = _svc_fields(request.get_json(silent=True) or {})
    if e: return err(e)
    kode = _slug(f["nama"])
    cur = db().execute("INSERT INTO services (kode,nama,deskripsi,harga_mulai,ikon,urutan,aktif) VALUES (?,?,?,?,?,?,?)",
                       (kode, f["nama"], f["deskripsi"], f["harga_mulai"], f["ikon"], f["urutan"], f["aktif"]))
    db().commit()
    return jsonify(ok=True, id=cur.lastrowid, kode=kode), 201

@bp.patch("/api/admin/services/<int:sid>")
@admin_only
def services_update(sid):
    if not db().execute("SELECT 1 FROM services WHERE id=?", (sid,)).fetchone(): return err("Layanan tidak ditemukan.", 404)
    f, e = _svc_fields(request.get_json(silent=True) or {}, partial=True)
    if e: return err(e)
    if f: db().execute(f"UPDATE services SET {','.join(k+'=?' for k in f)} WHERE id=?", (*f.values(), sid)); db().commit()
    return jsonify(ok=True)

@bp.delete("/api/admin/services/<int:sid>")
@admin_only
def services_delete(sid):
    if not db().execute("SELECT 1 FROM services WHERE id=?", (sid,)).fetchone(): return err("Layanan tidak ditemukan.", 404)
    if _q("SELECT COUNT(*) FROM orders WHERE service_id=?", sid): return err("Layanan ini sudah punya pesanan. Nonaktifkan saja agar riwayat tetap utuh.", 409)
    db().execute("DELETE FROM mitra_services WHERE service_id=?", (sid,)); db().execute("DELETE FROM services WHERE id=?", (sid,)); db().commit()
    return jsonify(ok=True)

# ---------- pengaturan situs ----------
@bp.get("/api/admin/settings")
@admin_only
def settings_get():
    return jsonify(get_settings())

@bp.patch("/api/admin/settings")
@admin_only
def settings_set():
    d = request.get_json(silent=True) or {}
    out = {}
    for k, v in d.items():
        if k not in DEFAULT_SETTINGS: continue
        v = clean(v, SETTING_MAX[k]) if isinstance(v, str) else ""
        if k == "wa_admin" and v:
            v = norm_wa(v)
            if not v: return err("Nomor WhatsApp admin belum benar. Contoh: 081234567890.")
        if k == "peta_lat" and to_float(v, -90, 90) is None: return err("Latitude pusat peta harus angka antara -90 dan 90.")
        if k == "peta_lng" and to_float(v, -180, 180) is None: return err("Longitude pusat peta harus angka antara -180 dan 180.")
        if k == "tz_offset":
            try: assert -12 <= int(v) <= 14
            except Exception: return err("Selisih zona waktu harus angka antara -12 dan 14 (WITA = 8).")
        if k == "bagi_hasil_mitra":
            try: assert 0 <= int(v) <= 100
            except Exception: return err("Bagi hasil mitra harus angka antara 0 dan 100.")
        if k in ("hero_judul", "hero_sorot", "hero_lead", "kota") and not v: return err("Teks beranda dan kota tidak boleh kosong.")
        out[k] = v
    for k, v in out.items():
        db().execute("INSERT INTO settings (kunci,nilai) VALUES (?,?) ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai", (k, v))
    db().commit()
    return jsonify(ok=True)
