# Kaban (kami bantu)

Website layanan titip-kerja dengan backend Flask + SQLite.

## Menjalankan

Jangan membuka `index.html` langsung dari folder. Halaman butuh server agar tombol Masuk, formulir, dan database berfungsi.

Cara termudah: klik dua kali `jalankan.bat` (Windows) atau jalankan `./jalankan.sh` (Mac/Linux).
Skrip memasang kebutuhan, menanyakan akun admin saat pertama kali, lalu membuka http://localhost:5000.

Cara manual:

    pip install -r requirements.txt
    KABAN_ADMIN_WA=08xxxxxxxxxx KABAN_ADMIN_PASSWORD='password-kuat' python app.py

Database `instance/kaban.db` dibuat otomatis dari `schema.sql`. Database lama dimigrasi otomatis (kolom baru ditambahkan).
Untuk mencoba dengan data contoh (pelanggan, mitra, 3 minggu pesanan): `python seed_demo.py` sebelum menjalankan server
(hapus `instance/kaban.db` untuk membuang data contoh).

## Tema terang dan gelap

Tombol tema (terang atau gelap) ada di pojok kanan atas halaman admin, pelanggan, dan mitra, serta melayang di halaman masuk. Pilihan disimpan di browser masing-masing pengguna. Sebelum memilih, tampilan mengikuti perangkat. Kodenya di `static/theme.js`, warnanya di `static/tokens.css`.

## Alur mitra

1. Pendaftar masuk lewat form di beranda, lalu admin menyetujuinya di menu **Mitra**.
2. Admin menekan **Buat akun login**. Password sementara tampil sekali, kirimkan lewat WhatsApp. Mitra masuk di halaman Masuk dan otomatis dibawa ke `/mitra`.
3. Admin memilih mitra di detail pesanan. Mitra melihatnya di **Tugas > Masuk** dan memilih *Terima* atau *Lepas tugas* (alasan tercatat, pesanan kembali ke admin).
4. Nomor WhatsApp pelanggan baru terbuka setelah tugas diterima. Mitra menekan *Mulai mengerjakan*, lalu *Selesaikan*. Tugas hanya bisa selesai bila admin sudah mengisi harga.
5. Penghasilan mitra = harga x persentase bagi hasil (default 80%, diubah di Pengaturan > Mitra).

Hanya akun yang ditautkan admin yang bisa membuka `/mitra`. Mitra yang dinonaktifkan langsung kehilangan akses. Mitra juga bisa membuka akun pelanggan lewat tombol di sidebar.

## Alamat dan peta

Di dialog lokasi, ketuk peta atau geser pin untuk mengisi alamat otomatis; atau ketik alamat lalu Enter untuk menaruh pin. Pencarian memakai Nominatim (OpenStreetMap) lewat server, maks. 1 permintaan/detik per pengguna. Sebelum disimpan, pengguna diminta memastikan alamat sudah benar.

## Lupa password admin atau pelanggan

    python reset_password.py --daftar                 lihat semua akun dan nomornya
    python reset_password.py 08xxxxxxxxxx             buat password baru acak
    python reset_password.py 08xxxxxxxxxx "sandi-baru" pilih password sendiri

Jalankan di komputer yang menyimpan `instance/kaban.db`. Password disimpan terenkripsi sehingga tidak bisa dilihat kembali, hanya diganti.

## Halaman

| Alamat   | Untuk     | Isi |
|----------|-----------|-----|
| `/`      | Publik    | Beranda, peta, pesan sebagai tamu, daftar mitra. Teks, layanan, dan kontak diatur dari admin |
| `/masuk` | Semua     | Masuk dan daftar (admin juga masuk dari sini) |
| `/mitra` | Mitra | Ringkasan dan grafik penghasilan, tugas masuk (terima atau lepas), tugas berjalan (mulai, selesai), pendapatan per bulan + CSV, profil, tombol tersedia/libur |
| `/akun`  | Pelanggan | Ringkasan, riwayat pesanan (filter, cari, unduh CSV, penilaian), pesan baru, lokasi tersimpan dengan peta, profil dan password |
| `/admin` | Admin     | Dasbor grafik langsung, pesanan, pengguna, mitra, layanan, pengaturan situs |

## Admin

- **Dasbor langsung:** angka dan grafik (pesanan dan pendapatan 14 hari, layanan terlaris, status, aktivitas) diperbarui otomatis tiap 8 detik; pesanan baru memunculkan notifikasi.
- **Pengguna:** cari, tambah, ubah data dan peran, nonaktifkan (sesi aktifnya langsung putus), reset password.
- **Pesanan:** filter, cari, tetapkan mitra dan harga, ubah status, catatan internal, ekspor CSV.
- **Mitra:** terima atau tolak pendaftar, ubah data, tambah manual.
- **Layanan dan Pengaturan:** tambah, ubah, sembunyikan layanan; ubah judul beranda, pengumuman, WhatsApp, jam operasional, kota, pusat peta, zona waktu. Perubahan langsung tampil di beranda.

## Struktur

    app.py          server, halaman, login, pesan publik
    core.py         database, pengaturan, fungsi bantu
    admin_api.py    API admin
    user_api.py     API pelanggan
    mitra_api.py    API mitra
    schema.sql      struktur database
    seed_demo.py    data contoh (opsional)
    templates/      index, masuk, user, admin
    static/         tokens.css (semua warna dan font), home/shell/base/masuk/akun/mitra.css, JS tiap halaman

## Sebelum online

- Jalankan lewat HTTPS dan set `KABAN_HTTPS=1` (cookie sesi jadi Secure).
- Pakai server produksi, mis. `pip install gunicorn && gunicorn -w 2 app:app`. Jangan pakai server bawaan Flask.
- Pembatas percobaan login disimpan di memori; dengan lebih dari satu worker, hitungannya per worker.
