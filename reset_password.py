"""Pulihkan akses akun tanpa membuka database secara manual.

  python reset_password.py --daftar                    tampilkan semua akun (nama, nomor, peran, status)
  python reset_password.py 081234567890                buat password baru acak untuk akun itu, lalu tampilkan
  python reset_password.py 081234567890 "sandi-baru-1" pakai password pilihan Anda (minimal 8 karakter)

Jalankan di folder proyek, di komputer yang menyimpan database (instance/kaban.db). Akun yang dinonaktifkan ikut diaktifkan
kembali, dan semua perangkat yang sedang masuk dikeluarkan."""
import secrets, sqlite3, sys
from werkzeug.security import generate_password_hash
import core

def main(a):
    con = sqlite3.connect(core.DB_PATH); con.row_factory = sqlite3.Row
    if not a or a[0] in ("-h", "--help"): print(__doc__); return 0
    if a[0] == "--daftar":
        rows = con.execute("SELECT nama,wa,role,aktif FROM users ORDER BY role='admin' DESC, id").fetchall()
        for r in rows: print(f"{r['nama']:<24} 0{r['wa'][2:]:<14} {'ADMIN' if r['role']=='admin' else 'pelanggan':<10} {'' if r['aktif'] else '(nonaktif)'}")
        print(f"\n{len(rows)} akun di {core.DB_PATH}"); return 0
    wa = core.norm_wa(a[0])
    u = con.execute("SELECT id,nama,role FROM users WHERE wa=?", (wa,)).fetchone() if wa else None
    if not u: print("Nomor itu tidak ada. Lihat daftar akun dengan:  python reset_password.py --daftar"); return 1
    pw = a[1] if len(a) > 1 else secrets.token_urlsafe(9)
    if len(pw) < 8: print("Password minimal 8 karakter."); return 1
    con.execute("UPDATE users SET password_hash=?, aktif=1, sesi=sesi+1 WHERE id=?", (generate_password_hash(pw), u["id"])); con.commit()
    print(f"Password untuk {u['nama']} ({'admin' if u['role']=='admin' else 'pelanggan'}) sudah diganti.\nNomor    : 0{wa[2:]}\nPassword : {pw}")
    return 0

if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
