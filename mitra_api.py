"""API halaman mitra: ringkasan, tugas masuk/berjalan, aksi tugas, riwayat dan pendapatan, profil.

Akses: akun login yang ditautkan admin ke satu mitra berstatus aktif (mitra.user_id).
Pelanggan hanya terlihat nomor WhatsApp-nya setelah mitra menerima tugas."""
import csv, io, datetime as dt
from flask import Blueprint, jsonify, request, Response, g
from functools import wraps
from core import (db, err, clean, now, log_event, current_user, mitra_for, bagi_hasil, tz_hours, csv_safe)

bp = Blueprint("mitra", __name__)

def mitra_only(f):
    @wraps(f)
    def wrapper(*a, **k):
        u = current_user()
        if not u: return err("Silakan masuk dulu.", 401)
        m = mitra_for(u["id"])
        if not m: return err("Akun ini bukan mitra aktif.", 403)
        g.m = m
        return f(*a, **k)
    return wrapper

# ---------- waktu setempat ----------
def _local_now():
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=tz_hours())

def _to_local(s):
    try: return dt.datetime.strptime((s or "")[:19], "%Y-%m-%d %H:%M:%S") + dt.timedelta(hours=tz_hours())
    except ValueError: return None

# ---------- pesanan milik mitra ----------
BASE = """SELECT o.id,o.kode,o.nama,o.wa,o.alamat,o.lat,o.lng,o.jadwal,o.detail,o.harga,o.status,o.rating,o.ulasan,o.created_at,
                 COALESCE(o.mitra_respon,'menunggu') AS respon, s.nama AS layanan, s.kode AS layanan_kode, s.ikon AS ikon,
                 (SELECT MAX(e.created_at) FROM order_events e WHERE e.order_id=o.id AND e.status='selesai') AS selesai_at
          FROM orders o JOIN services s ON s.id=o.service_id WHERE o.mitra_id=?"""
MASUK = " AND o.status IN ('baru','dikonfirmasi') AND COALESCE(o.mitra_respon,'menunggu')<>'diterima'"
AKTIF = " AND o.status IN ('baru','dikonfirmasi','dikerjakan') AND (o.mitra_respon='diterima' OR o.status='dikerjakan')"

def _share(harga):
    return None if harga is None else harga * bagi_hasil() // 100

def _job(r, events=True):
    j = dict(r)
    j["penghasilan"] = _share(j["harga"])
    j["kontak_terbuka"] = j["respon"] == "diterima" or j["status"] == "dikerjakan"
    if not j["kontak_terbuka"]: j["wa"] = None                    # sembunyikan sampai tugas diterima
    if events:
        j["events"] = [dict(e) for e in db().execute("SELECT status,catatan,created_at FROM order_events WHERE order_id=? ORDER BY id", (j["id"],))]
    return j

def _mine(oid):
    return db().execute("SELECT * FROM orders WHERE id=? AND mitra_id=?", (oid, g.m["id"])).fetchone()

def _count(cond):
    return db().execute("SELECT COUNT(*) FROM orders o WHERE o.mitra_id=?" + cond, (g.m["id"],)).fetchone()[0]

def _finished():
    """Semua pesanan selesai milik mitra, dengan waktu selesai setempat."""
    out = []
    for r in db().execute(BASE + " AND o.status='selesai'", (g.m["id"],)):
        j = _job(r, events=False); j["selesai_lokal"] = _to_local(j["selesai_at"]) or _to_local(j["created_at"]); out.append(j)
    return out

# ---------- ringkasan ----------
@bp.get("/api/mitra/ringkasan")
@mitra_only
def ringkasan():
    m, today = g.m, _local_now()
    fin = [j for j in _finished() if j["selesai_lokal"]]
    bln = [j for j in fin if (j["selesai_lokal"].year, j["selesai_lokal"].month) == (today.year, today.month)]
    harian = []
    for i in range(13, -1, -1):
        d = (today - dt.timedelta(days=i)).date()
        harian.append({"tanggal": d.isoformat(), "pendapatan": sum(j["penghasilan"] or 0 for j in fin if j["selesai_lokal"].date() == d),
                       "tugas": sum(1 for j in fin if j["selesai_lokal"].date() == d)})
    aktif = [_job(r) for r in db().execute(BASE + AKTIF + " ORDER BY o.jadwal", (m["id"],))]
    rated = [j for j in fin if j["rating"]]
    ulasan = sorted([j for j in rated if j["ulasan"]], key=lambda j: j["selesai_lokal"], reverse=True)[:3]
    return jsonify(
        nama=m["nama"], tersedia=bool(m["tersedia"]), bagi_hasil=bagi_hasil(),
        masuk=_count(MASUK), aktif=len(aktif),
        hari_ini=sum(1 for j in aktif if j["jadwal"].startswith(today.strftime("%Y-%m-%d"))),
        selesai_bulan=len(bln), pendapatan_bulan=sum(j["penghasilan"] or 0 for j in bln),
        selesai_total=len(fin), pendapatan_total=sum(j["penghasilan"] or 0 for j in fin),
        rating=round(sum(j["rating"] for j in rated) / len(rated), 1) if rated else None, rating_n=len(rated),
        berikutnya=aktif[0] if aktif else None, harian=harian,
        ulasan=[{"kode": j["kode"], "layanan": j["layanan"], "rating": j["rating"], "ulasan": j["ulasan"]} for j in ulasan])

# ---------- tugas ----------
@bp.get("/api/mitra/tugas")
@mitra_only
def tugas():
    cond = MASUK if request.args.get("tab") == "masuk" else AKTIF
    return jsonify([_job(r) for r in db().execute(BASE + cond + " ORDER BY o.jadwal", (g.m["id"],))])

def _changed(oid):
    r = db().execute(BASE + " AND o.id=?", (g.m["id"], oid)).fetchone()
    return jsonify(ok=True, tugas=_job(r))

@bp.post("/api/mitra/tugas/<int:oid>/terima")
@mitra_only
def terima(oid):
    o = _mine(oid)
    if not o: return err("Tugas tidak ditemukan.", 404)
    if o["status"] not in ("baru", "dikonfirmasi"): return err("Tugas ini sudah tidak bisa diterima.", 409)
    status = "dikonfirmasi"
    db().execute("UPDATE orders SET mitra_respon='diterima', status=?, updated_at=? WHERE id=?", (status, now(), oid))
    log_event(oid, status, "Diterima mitra " + g.m["nama"]); db().commit()
    return _changed(oid)

@bp.post("/api/mitra/tugas/<int:oid>/tolak")
@mitra_only
def tolak(oid):
    d = request.get_json(silent=True) or {}
    o = _mine(oid)
    if not o: return err("Tugas tidak ditemukan.", 404)
    if o["status"] not in ("baru", "dikonfirmasi"): return err("Tugas yang sudah dikerjakan tidak bisa dilepas. Hubungi admin.", 409)
    alasan = clean(d.get("alasan"), 150)
    db().execute("UPDATE orders SET mitra_id=NULL, mitra_respon=NULL, status='baru', updated_at=? WHERE id=?", (now(), oid))
    log_event(oid, "baru", "Mitra " + g.m["nama"] + " melepas tugas" + (": " + alasan if alasan else "")); db().commit()
    return jsonify(ok=True)

@bp.post("/api/mitra/tugas/<int:oid>/mulai")
@mitra_only
def mulai(oid):
    o = _mine(oid)
    if not o: return err("Tugas tidak ditemukan.", 404)
    if o["status"] != "dikonfirmasi" or o["mitra_respon"] != "diterima": return err("Terima tugas dulu sebelum mulai mengerjakan.", 409)
    db().execute("UPDATE orders SET status='dikerjakan', updated_at=? WHERE id=?", (now(), oid))
    log_event(oid, "dikerjakan", "Mitra mulai mengerjakan"); db().commit()
    return _changed(oid)

@bp.post("/api/mitra/tugas/<int:oid>/selesai")
@mitra_only
def selesai(oid):
    d = request.get_json(silent=True) or {}
    o = _mine(oid)
    if not o: return err("Tugas tidak ditemukan.", 404)
    if o["status"] != "dikerjakan": return err("Tugas harus berstatus dikerjakan sebelum diselesaikan.", 409)
    if o["harga"] is None: return err("Harga belum ditetapkan admin. Hubungi admin sebelum menyelesaikan tugas.", 409)
    db().execute("UPDATE orders SET status='selesai', updated_at=? WHERE id=?", (now(), oid))
    log_event(oid, "selesai", clean(d.get("catatan"), 200) or "Pekerjaan selesai"); db().commit()
    return _changed(oid)

# ---------- riwayat dan pendapatan ----------
def _bulan(arg):
    try:
        y, m = (arg or "").split("-"); y, m = int(y), int(m)
        if 2000 <= y <= 2100 and 1 <= m <= 12: return y, m
    except ValueError: pass
    t = _local_now(); return t.year, t.month

def _riwayat_rows(bulan):
    y, m = _bulan(bulan)
    rows = [j for j in _finished() if j["selesai_lokal"] and (j["selesai_lokal"].year, j["selesai_lokal"].month) == (y, m)]
    rows.sort(key=lambda j: j["selesai_lokal"], reverse=True)
    return y, m, rows

@bp.get("/api/mitra/riwayat")
@mitra_only
def riwayat():
    y, m, rows = _riwayat_rows(request.args.get("bulan"))
    for j in rows: j["selesai_lokal"] = j["selesai_lokal"].strftime("%Y-%m-%d %H:%M")
    return jsonify(bulan=f"{y}-{m:02d}", bagi_hasil=bagi_hasil(), items=rows, selesai=len(rows),
                   kotor=sum(j["harga"] or 0 for j in rows), penghasilan=sum(j["penghasilan"] or 0 for j in rows))

@bp.get("/api/mitra/riwayat.csv")
@mitra_only
def riwayat_csv():
    y, m, rows = _riwayat_rows(request.args.get("bulan"))
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Kode", "Selesai", "Layanan", "Pelanggan", "Alamat", "Harga", "Penghasilan", "Rating"])
    for j in rows:
        w.writerow([csv_safe(x) for x in (j["kode"], j["selesai_lokal"].strftime("%Y-%m-%d %H:%M"), j["layanan"], j["nama"], j["alamat"], j["harga"] or 0, j["penghasilan"] or 0, j["rating"] or "")])
    return Response("﻿" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=pendapatan-kaban-{y}-{m:02d}.csv"})

# ---------- profil ----------
def _profil():
    m = db().execute("SELECT * FROM mitra WHERE id=?", (g.m["id"],)).fetchone()
    u = db().execute("SELECT last_login, created_at FROM users WHERE id=?", (m["user_id"],)).fetchone()
    lay = [r["nama"] for r in db().execute("SELECT s.nama FROM mitra_services ms JOIN services s ON s.id=ms.service_id WHERE ms.mitra_id=? ORDER BY s.urutan", (m["id"],))]
    return dict(nama=m["nama"], wa=m["wa"], kelurahan=m["kelurahan"], kendaraan=m["kendaraan"] or "", bio=m["bio"] or "", tersedia=bool(m["tersedia"]),
                layanan=lay, bergabung=m["created_at"], last_login=u["last_login"] if u else None, bagi_hasil=bagi_hasil())

@bp.get("/api/mitra/profil")
@mitra_only
def profil():
    return jsonify(_profil())

@bp.patch("/api/mitra/profil")
@mitra_only
def profil_update():
    d, m = request.get_json(silent=True) or {}, g.m
    nama = clean(d["nama"], 80) if "nama" in d else m["nama"]
    kel = clean(d["kelurahan"], 80) if "kelurahan" in d else m["kelurahan"]
    if not nama or not kel: return err("Nama dan kelurahan wajib diisi.")
    tersedia = (1 if d["tersedia"] else 0) if "tersedia" in d else m["tersedia"]
    db().execute("UPDATE mitra SET nama=?,kelurahan=?,kendaraan=?,bio=?,tersedia=? WHERE id=?",
                 (nama, kel, clean(d["kendaraan"], 40) if "kendaraan" in d else m["kendaraan"],
                  clean(d["bio"], 300) if "bio" in d else m["bio"], tersedia, m["id"]))
    db().execute("UPDATE users SET nama=? WHERE id=?", (nama, m["user_id"])); db().commit()
    g.m = db().execute("SELECT * FROM mitra WHERE id=?", (m["id"],)).fetchone()
    return jsonify(_profil())
