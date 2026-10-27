"""API halaman pelanggan: ringkasan, riwayat pesanan, profil, lokasi tersimpan."""
import csv, io, json, threading, time, urllib.parse, urllib.request
from flask import Blueprint, jsonify, request, session, Response
from werkzeug.security import generate_password_hash, check_password_hash
from core import (db, err, clean, norm_wa, to_float, now, log_event, current_user, login_required,
                  ORDER_SQL, order_events, csv_safe, ORDER_STATUS)

bp = Blueprint("user", __name__)
PAGE = 15

def _me(): return current_user()

def _filter(status, uid, q):
    w, a = ["o.user_id=?"], [uid]
    if status == "aktif": w.append("o.status IN ('baru','dikonfirmasi','dikerjakan')")
    elif status in ORDER_STATUS: w.append("o.status=?"); a.append(status)
    if q:
        w.append("(o.kode LIKE ? OR s.nama LIKE ? OR o.alamat LIKE ? OR o.detail LIKE ?)"); a += [f"%{q}%"] * 4
    return " AND ".join(w), a

def _order(r, events=True):
    o = dict(r); o.pop("wa", None); o.pop("user_id", None)
    if events: o["events"] = order_events(r["id"])
    return o

@bp.get("/api/my/summary")
@login_required()
def summary():
    u = _me(); uid = u["id"]
    q = lambda sql, *a: db().execute(sql, a).fetchone()[0]
    aktif = db().execute(ORDER_SQL + " WHERE o.user_id=? AND o.status IN ('baru','dikonfirmasi','dikerjakan') ORDER BY o.jadwal LIMIT 10", (uid,)).fetchall()
    last = db().execute(ORDER_SQL + " WHERE o.user_id=? ORDER BY o.id DESC LIMIT 1", (uid,)).fetchone()
    status = {r[0]: r[1] for r in db().execute("SELECT status, COUNT(*) FROM orders WHERE user_id=? GROUP BY status", (uid,))}
    utama = db().execute("SELECT label,alamat FROM addresses WHERE user_id=? ORDER BY utama DESC,id DESC LIMIT 1", (uid,)).fetchone()
    aktivitas = db().execute("""SELECT e.status, e.catatan, e.created_at, o.kode, s.nama AS layanan
        FROM order_events e JOIN orders o ON o.id=e.order_id JOIN services s ON s.id=o.service_id
        WHERE o.user_id=? ORDER BY e.id DESC LIMIT 6""", (uid,)).fetchall()
    favorit = db().execute("""SELECT s.nama, COUNT(*) AS n FROM orders o JOIN services s ON s.id=o.service_id
        WHERE o.user_id=? AND o.status<>'dibatalkan' GROUP BY s.id ORDER BY n DESC, s.urutan LIMIT 3""", (uid,)).fetchall()
    return jsonify(
        total=q("SELECT COUNT(*) FROM orders WHERE user_id=?", uid),
        berjalan=q("SELECT COUNT(*) FROM orders WHERE user_id=? AND status IN ('baru','dikonfirmasi','dikerjakan')", uid),
        selesai=q("SELECT COUNT(*) FROM orders WHERE user_id=? AND status='selesai'", uid),
        belanja=q("SELECT COALESCE(SUM(harga),0) FROM orders WHERE user_id=? AND status='selesai'", uid),
        lokasi=q("SELECT COUNT(*) FROM addresses WHERE user_id=?", uid),
        status=status, lokasi_utama=dict(utama) if utama else None,
        aktivitas=[dict(r) for r in aktivitas], favorit=[dict(r) for r in favorit],
        belum_dinilai=q("SELECT COUNT(*) FROM orders WHERE user_id=? AND status='selesai' AND rating IS NULL", uid),
        aktif=[_order(r) for r in aktif],
        terakhir=_order(last, events=False) if last else None)

@bp.get("/api/my/orders")
@login_required()
def my_orders():
    uid = _me()["id"]
    status, qs = request.args.get("status", ""), clean(request.args.get("q"), 60)
    try: off = max(0, int(request.args.get("offset", 0)))
    except ValueError: off = 0
    w, a = _filter(status, uid, qs)
    total = db().execute(f"SELECT COUNT(*) FROM orders o JOIN services s ON s.id=o.service_id WHERE {w}", a).fetchone()[0]
    rows = db().execute(f"{ORDER_SQL} WHERE {w} ORDER BY o.id DESC LIMIT {PAGE} OFFSET {off}", a).fetchall()
    return jsonify(total=total, items=[_order(r) for r in rows], limit=PAGE)

@bp.get("/api/my/orders.csv")
@login_required()
def my_orders_csv():
    uid = _me()["id"]
    rows = db().execute(ORDER_SQL + " WHERE o.user_id=? ORDER BY o.id DESC", (uid,)).fetchall()
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Kode", "Dibuat (UTC)", "Layanan", "Jadwal", "Alamat", "Status", "Mitra", "Harga (Rp)"])
    for r in rows:
        w.writerow([csv_safe(x) for x in (r["kode"], r["created_at"], r["layanan"], r["jadwal"], r["alamat"], r["status"], r["mitra"] or "", r["harga"] or "")])
    return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": "attachment; filename=riwayat-pesanan-kaban.csv"})

@bp.post("/api/my/orders/<int:oid>/cancel")
@login_required()
def cancel_order(oid):
    u = _me()
    r = db().execute("SELECT status FROM orders WHERE id=? AND user_id=?", (oid, u["id"])).fetchone()
    if not r: return err("Pesanan tidak ditemukan.", 404)
    if r["status"] not in ("baru", "dikonfirmasi"): return err("Pesanan ini sudah berjalan, hubungi admin untuk membatalkan.", 409)
    db().execute("UPDATE orders SET status='dibatalkan',updated_at=? WHERE id=?", (now(), oid))
    log_event(oid, "dibatalkan", "Dibatalkan oleh pelanggan")
    db().commit()
    return jsonify(ok=True)

# ---------- penilaian ----------
@bp.post("/api/my/orders/<int:oid>/review")
@login_required()
def review_order(oid):
    u = _me(); d = request.get_json(silent=True) or {}
    r = db().execute("SELECT status, rating FROM orders WHERE id=? AND user_id=?", (oid, u["id"])).fetchone()
    if not r: return err("Pesanan tidak ditemukan.", 404)
    if r["status"] != "selesai": return err("Penilaian bisa diberikan setelah pesanan selesai.", 409)
    if r["rating"] is not None: return err("Pesanan ini sudah Anda nilai.", 409)
    try: rating = int(d.get("rating"))
    except (TypeError, ValueError): return err("Pilih jumlah bintang 1 sampai 5.")
    if not 1 <= rating <= 5: return err("Pilih jumlah bintang 1 sampai 5.")
    db().execute("UPDATE orders SET rating=?, ulasan=? WHERE id=?", (rating, clean(d.get("ulasan"), 500), oid))
    db().commit()
    return jsonify(ok=True)

# ---------- profil ----------
@bp.get("/api/my/profile")
@login_required()
def profile():
    r = db().execute("SELECT nama,wa,created_at,last_login FROM users WHERE id=?", (_me()["id"],)).fetchone()
    return jsonify(dict(r))

@bp.patch("/api/my/profile")
@login_required()
def update_profile():
    u = _me(); d = request.get_json(silent=True) or {}
    nama = clean(d.get("nama"), 80); wa = norm_wa(d.get("wa"))
    if not nama: return err("Isi nama Anda.")
    if not wa: return err("Nomor WhatsApp belum benar. Contoh: 081234567890.")
    if db().execute("SELECT 1 FROM users WHERE wa=? AND id<>?", (wa, u["id"])).fetchone():
        return err("Nomor ini dipakai akun lain.", 409)
    db().execute("UPDATE users SET nama=?, wa=? WHERE id=?", (nama, wa, u["id"])); db().commit()
    return jsonify(ok=True, nama=nama, wa=wa)

@bp.post("/api/my/password")
@login_required()
def change_password():
    u = _me(); d = request.get_json(silent=True) or {}
    row = db().execute("SELECT password_hash, sesi FROM users WHERE id=?", (u["id"],)).fetchone()
    if not check_password_hash(row["password_hash"], d.get("lama") or ""): return err("Password lama salah.", 403)
    baru = d.get("baru") or ""
    if len(baru) < 8: return err("Password baru minimal 8 karakter.")
    sesi = row["sesi"] + 1  # perangkat lain otomatis keluar
    db().execute("UPDATE users SET password_hash=?, sesi=? WHERE id=?", (generate_password_hash(baru), sesi, u["id"])); db().commit()
    session["sv"] = sesi
    return jsonify(ok=True)

@bp.post("/api/my/logout-all")
@login_required()
def logout_all():
    """Keluarkan akun ini dari semua perangkat lain; perangkat ini tetap masuk."""
    row = db().execute("SELECT sesi FROM users WHERE id=?", (_me()["id"],)).fetchone()
    sesi = row["sesi"] + 1
    db().execute("UPDATE users SET sesi=? WHERE id=?", (sesi, _me()["id"])); db().commit()
    session["sv"] = sesi
    return jsonify(ok=True)

# ---------- lokasi tersimpan ----------
def _addr_fields(d, partial=False):
    out = {}
    if "label" in d or not partial:
        out["label"] = clean(d.get("label"), 30) or "Lokasi"
    if "alamat" in d or not partial:
        out["alamat"] = clean(d.get("alamat"), 200)
        if not out["alamat"]: return None, "Isi alamat lokasi."
    if "catatan" in d or not partial: out["catatan"] = clean(d.get("catatan"), 150)
    if "lat" in d or "lng" in d or not partial:
        lat, lng = to_float(d.get("lat"), -90, 90), to_float(d.get("lng"), -180, 180)
        if lat is None or lng is None: lat = lng = None
        out["lat"], out["lng"] = lat, lng
    return out, None

@bp.get("/api/my/addresses")
@login_required()
def addresses():
    rows = db().execute("SELECT id,label,alamat,catatan,lat,lng,utama FROM addresses WHERE user_id=? ORDER BY utama DESC, id DESC", (_me()["id"],)).fetchall()
    return jsonify([dict(r) for r in rows])

@bp.post("/api/my/addresses")
@login_required()
def add_address():
    uid = _me()["id"]; d = request.get_json(silent=True) or {}
    f, e = _addr_fields(d)
    if e: return err(e)
    n = db().execute("SELECT COUNT(*) FROM addresses WHERE user_id=?", (uid,)).fetchone()[0]
    if n >= 10: return err("Maksimal 10 lokasi tersimpan. Hapus yang tidak dipakai dulu.")
    utama = 1 if (n == 0 or d.get("utama")) else 0
    if utama: db().execute("UPDATE addresses SET utama=0 WHERE user_id=?", (uid,))
    cur = db().execute("INSERT INTO addresses (user_id,label,alamat,catatan,lat,lng,utama) VALUES (?,?,?,?,?,?,?)",
                       (uid, f["label"], f["alamat"], f["catatan"], f["lat"], f["lng"], utama))
    db().commit()
    return jsonify(ok=True, id=cur.lastrowid), 201

@bp.patch("/api/my/addresses/<int:aid>")
@login_required()
def edit_address(aid):
    uid = _me()["id"]; d = request.get_json(silent=True) or {}
    if not db().execute("SELECT 1 FROM addresses WHERE id=? AND user_id=?", (aid, uid)).fetchone(): return err("Lokasi tidak ditemukan.", 404)
    f, e = _addr_fields(d, partial=True)
    if e: return err(e)
    if d.get("utama"):
        db().execute("UPDATE addresses SET utama=0 WHERE user_id=?", (uid,)); f["utama"] = 1
    if f:
        db().execute(f"UPDATE addresses SET {','.join(k+'=?' for k in f)} WHERE id=?", (*f.values(), aid))
    db().commit()
    return jsonify(ok=True)

@bp.delete("/api/my/addresses/<int:aid>")
@login_required()
def delete_address(aid):
    uid = _me()["id"]
    r = db().execute("SELECT utama FROM addresses WHERE id=? AND user_id=?", (aid, uid)).fetchone()
    if not r: return err("Lokasi tidak ditemukan.", 404)
    db().execute("DELETE FROM addresses WHERE id=?", (aid,))
    if r["utama"]:
        db().execute("UPDATE addresses SET utama=1 WHERE id=(SELECT id FROM addresses WHERE user_id=? ORDER BY id DESC LIMIT 1)", (uid,))
    db().commit()
    return jsonify(ok=True)


# ---------- pencarian alamat <-> titik peta (Nominatim/OpenStreetMap, lewat server) ----------
# Kebijakan Nominatim: maks. 1 permintaan/detik, wajib User-Agent, jangan dipakai untuk autocomplete per ketukan.
_geo_cache, _geo_last, _geo_lock = {}, {}, threading.Lock()
GEO_UA = "Kaban/1.0 (layanan bantuan kerja; kontak lewat situs)"

def _geo_get(path, params):
    key = (path, tuple(sorted(params.items())))
    hit = _geo_cache.get(key)
    if hit and time.time() - hit[0] < 3600: return hit[1]
    uid = _me()["id"]
    with _geo_lock:                                   # satu permintaan keluar per detik untuk seluruh situs
        if time.time() - _geo_last.get(uid, 0) < 1: raise ValueError("Terlalu cepat. Tunggu sebentar lalu coba lagi.")
        wait = 1.05 - (time.time() - _geo_last.get("*", 0))
        if wait > 0: time.sleep(wait)
        _geo_last[uid] = _geo_last["*"] = time.time()
        q = urllib.parse.urlencode({**params, "format": "jsonv2", "accept-language": "id", "addressdetails": 1})
        req = urllib.request.Request("https://nominatim.openstreetmap.org/" + path + "?" + q, headers={"User-Agent": GEO_UA})
        with urllib.request.urlopen(req, timeout=6) as r: data = json.load(r)
    if len(_geo_cache) > 500: _geo_cache.clear()
    _geo_cache[key] = (time.time(), data)
    return data

def _alamat(it):
    a = it.get("address") or {}
    jalan = a.get("road") or a.get("pedestrian") or a.get("footway") or ""
    if jalan and a.get("house_number"): jalan += " No. " + a["house_number"]
    kel = a.get("neighbourhood") or a.get("quarter") or ""
    parts = [jalan or it.get("name") or "", kel, a.get("suburb") or a.get("village") or "",
             a.get("city_district") or a.get("municipality") or "", a.get("city") or a.get("town") or a.get("county") or ""]
    out, seen = [], set()
    for x in parts:
        if x and x.lower() not in seen: seen.add(x.lower()); out.append(x)
    return (", ".join(out) or it.get("display_name", ""))[:200]

def _geo_call(path, params):
    try: return _geo_get(path, params), None
    except ValueError as e: return None, err(str(e), 429)
    except Exception: return None, err("Layanan peta sedang tidak bisa dihubungi. Isi alamat manual atau ketuk peta.", 502)

@bp.get("/api/geo/cari")
@login_required()
def geo_cari():
    q = clean(request.args.get("q", ""), 150)
    if len(q) < 4: return err("Ketik minimal 4 huruf alamat.")
    data, e = _geo_call("search", {"q": q, "countrycodes": "id", "limit": 5})
    if e: return e
    return jsonify([{"alamat": _alamat(i), "lat": round(float(i["lat"]), 6), "lng": round(float(i["lon"]), 6)} for i in data])

@bp.get("/api/geo/balik")
@login_required()
def geo_balik():
    lat, lng = to_float(request.args.get("lat"), -11.5, 6.5), to_float(request.args.get("lng"), 94, 142)
    if lat is None or lng is None: return err("Titik di luar wilayah Indonesia.")
    data, e = _geo_call("reverse", {"lat": lat, "lon": lng, "zoom": 18})
    if e: return e
    if not isinstance(data, dict) or data.get("error"): return jsonify(alamat="")
    return jsonify(alamat=_alamat(data))
