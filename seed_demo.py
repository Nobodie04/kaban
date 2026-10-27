"""Isi database dengan DATA CONTOH (pelanggan, mitra, pesanan 3 minggu) agar dasbor dan grafik terlihat hidup.
Hanya untuk mencoba. Jalankan:  python seed_demo.py   (hapus data contoh: hapus file instance/kaban.db)"""
import random, sqlite3, datetime, os
from werkzeug.security import generate_password_hash
import core

core.init_db(os.environ.get("KABAN_ADMIN_WA", ""), os.environ.get("KABAN_ADMIN_PASSWORD", ""))
random.seed(7)
con = sqlite3.connect(core.DB_PATH); con.row_factory = sqlite3.Row
if con.execute("SELECT COUNT(*) FROM orders").fetchone()[0]:
    raise SystemExit("Database sudah berisi pesanan. Seed dibatalkan agar data asli tidak tercampur.")

svc = {r["kode"]: r["id"] for r in con.execute("SELECT id,kode FROM services")}
kodes = ["anak", "tandon", "taman", "titip", "antar", "lain"]
harga = {"anak": (15000, 35000), "tandon": (150000, 400000), "taman": (100000, 300000), "titip": (20000, 60000), "antar": (15000, 50000), "lain": (30000, 120000)}

mitra = [("Rudi Hartono", "6281355500001", "Tamalanrea", "Sepeda motor", ["anak", "antar", "titip"]),
         ("Siti Aminah", "6281355500002", "Panakkukang", "Sepeda motor", ["titip", "antar"]),
         ("Andi Pratama", "6281355500003", "Rappocini", "Pikap kecil", ["tandon", "taman"]),
         ("Dewi Lestari", "6281355500004", "Biringkanaya", "Mobil", ["anak"]),
         ("Yusuf Rahman", "6281355500005", "Mamajang", "Sepeda motor", ["taman", "tandon", "antar"]),
         ("Nur Halimah", "6281355500006", "Manggala", "Sepeda motor", ["titip"])]
mid = []
for i, (n, wa, kel, kend, ks) in enumerate(mitra):
    cur = con.execute("INSERT INTO mitra (nama,wa,kelurahan,kendaraan,status) VALUES (?,?,?,?,?)", (n, wa, kel, kend, "pendaftar" if i == 5 else "aktif"))
    mid.append(cur.lastrowid)
    if i < 5:                                                    # akun login untuk 5 mitra aktif (password demo12345)
        uid = con.execute("INSERT INTO users (nama,wa,password_hash) VALUES (?,?,?)", (n, wa, generate_password_hash("demo12345"))).lastrowid
        con.execute("UPDATE mitra SET user_id=? WHERE id=?", (uid, cur.lastrowid))
    con.executemany("INSERT INTO mitra_services VALUES (?,?)", [(cur.lastrowid, svc[k]) for k in ks])

names = ["Budi Santoso", "Rina Wulandari", "Hasan Basri", "Maya Putri", "Fajar Nugraha", "Lina Marlina", "Agus Salim", "Tari Anggraini"]
users = []
for i, n in enumerate(names):
    wa = f"62813555100{i:02d}"
    cur = con.execute("INSERT INTO users (nama,wa,password_hash,last_login) VALUES (?,?,?,?)", (n, wa, generate_password_hash("demo12345"), None))
    users.append((cur.lastrowid, n, wa))
    con.execute("INSERT INTO addresses (user_id,label,alamat,catatan,lat,lng,utama) VALUES (?,?,?,?,?,?,1)",
                (cur.lastrowid, "Rumah", f"Jl. Contoh No. {10 + i * 3}, Makassar", "pagar hijau", -5.14 - random.random() * .03, 119.41 + random.random() * .05))

now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
fmt = lambda d: d.strftime("%Y-%m-%d %H:%M:%S")
count = 0
for day in range(20, -1, -1):
    for _ in range(max(0, int(random.gauss(3.2, 1.6) + (0.8 if day < 7 else 0)))):
        k = random.choices(kodes, weights=[4, 2, 2, 5, 4, 1])[0]
        u = random.choice(users) if random.random() < .75 else None
        nama, wa = (u[1], u[2]) if u else (random.choice(["Tamu " + x for x in "ABCDE"]), "6281355520" + str(random.randint(100, 999)))
        t0 = now - datetime.timedelta(days=day, hours=random.randint(0, 10), minutes=random.randint(0, 59))
        jadwal = (t0 + datetime.timedelta(days=random.randint(0, 2))).strftime("%Y-%m-%d ") + f"{random.randint(6, 18):02d}:{random.choice(['00', '30'])}"
        if day > 2: status = random.choices(["selesai", "dibatalkan"], weights=[9, 1])[0]
        elif day == 0: status = random.choices(["baru", "dikonfirmasi", "dikerjakan"], weights=[5, 2, 2])[0]
        else: status = random.choices(["selesai", "dikerjakan", "dikonfirmasi", "baru"], weights=[5, 2, 2, 1])[0]
        cands = [m for m, row in zip(mid[:5], mitra[:5]) if k in row[4]] or mid[:5]
        mi = random.choice(cands) if status in ("dikonfirmasi", "dikerjakan", "selesai") else None
        hg = random.randrange(harga[k][0], harga[k][1], 5000) if status == "selesai" else None
        kode = core.__dict__.get("_k") or None
        kode = "KBN-" + "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
        cur = con.execute("""INSERT INTO orders (kode,user_id,nama,wa,service_id,alamat,lat,lng,jadwal,detail,harga,status,mitra_id,created_at,updated_at)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                          (kode, u[0] if u else None, nama, wa, svc[k], f"Jl. Contoh No. {random.randint(1, 90)}, Makassar", None, None, jadwal,
                           random.choice(["", "Mohon tepat waktu", "Hubungi dulu sebelum tiba", "Barang agak berat"]), hg, status, mi,
                           fmt(t0), fmt(t0 + datetime.timedelta(hours=random.randint(2, 20)))))
        oid = cur.lastrowid; ev = [("baru", "Pesanan diterima")]
        if mi:
            respon = "menunggu" if status == "dikonfirmasi" and random.random() < .4 else "diterima"
            con.execute("UPDATE orders SET mitra_respon=? WHERE id=?", (respon, oid))
        if status == "selesai" and random.random() < .65:
            con.execute("UPDATE orders SET rating=?, ulasan=? WHERE id=?", (random.choice([5, 5, 5, 4, 4, 3]), random.choice(["", "", "Rapi dan tepat waktu", "Ramah, terima kasih", "Sesuai harapan"]), oid))
        if status in ("dikonfirmasi", "dikerjakan", "selesai"): ev.append(("dikonfirmasi", "Mitra ditugaskan"))
        if status in ("dikerjakan", "selesai"): ev.append(("dikerjakan", "Mitra berangkat"))
        if status == "selesai": ev.append(("selesai", ""))
        if status == "dibatalkan": ev.append(("dibatalkan", "Dibatalkan oleh pelanggan"))
        for j, (s, c) in enumerate(ev):
            con.execute("INSERT INTO order_events (order_id,status,catatan,created_at) VALUES (?,?,?,?)", (oid, s, c, fmt(t0 + datetime.timedelta(minutes=25 * j))))
        count += 1
con.commit(); con.close()
print(f"Data contoh dibuat: {len(mitra)} mitra, {len(users)} pelanggan, {count} pesanan.")
print("Semua akun contoh memakai password demo12345. Mitra boleh masuk dengan nomor 081355500001 sampai 081355500005 (halaman /mitra).")
