PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nama          TEXT NOT NULL,
  wa            TEXT NOT NULL UNIQUE,            -- nomor WhatsApp format 628xxx, dipakai untuk login
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  aktif         INTEGER NOT NULL DEFAULT 1,      -- 0 = akun dinonaktifkan admin
  sesi          INTEGER NOT NULL DEFAULT 0,      -- dinaikkan saat password diganti/akun dinonaktifkan agar sesi lama keluar
  last_login    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (            -- lokasi tersimpan milik pelanggan
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,                       -- Rumah, Kantor, Sekolah, ...
  alamat     TEXT NOT NULL,
  catatan    TEXT,                                -- patokan, warna pagar, dll
  lat        REAL,
  lng        REAL,
  utama      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS services (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kode         TEXT NOT NULL UNIQUE,
  nama         TEXT NOT NULL,
  deskripsi    TEXT,
  harga_mulai  TEXT,                              -- teks bebas, mis. "Mulai Rp 25.000"
  ikon         TEXT NOT NULL DEFAULT 'lain',
  urutan       INTEGER NOT NULL DEFAULT 0,
  aktif        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (             -- pengaturan situs yang diubah admin
  kunci TEXT PRIMARY KEY,
  nilai TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS mitra (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nama       TEXT NOT NULL,
  wa         TEXT NOT NULL UNIQUE,
  kelurahan  TEXT NOT NULL,
  kendaraan  TEXT,
  catatan    TEXT,
  status     TEXT NOT NULL DEFAULT 'pendaftar' CHECK (status IN ('pendaftar','aktif','ditolak','nonaktif')),
  user_id    INTEGER REFERENCES users(id),        -- akun login mitra (dibuat/ditautkan admin)
  tersedia   INTEGER NOT NULL DEFAULT 1,          -- 0 = mitra sedang libur
  bio        TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mitra_services (
  mitra_id   INTEGER NOT NULL REFERENCES mitra(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id),
  PRIMARY KEY (mitra_id, service_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kode          TEXT NOT NULL UNIQUE,             -- contoh KBN-7K2QX
  user_id       INTEGER REFERENCES users(id),     -- NULL bila dipesan sebagai tamu
  nama          TEXT NOT NULL,
  wa            TEXT NOT NULL,
  service_id    INTEGER NOT NULL REFERENCES services(id),
  alamat        TEXT NOT NULL,
  lat           REAL,
  lng           REAL,
  jadwal        TEXT NOT NULL,                    -- YYYY-MM-DD HH:MM (waktu setempat)
  detail        TEXT,
  harga         INTEGER,                          -- rupiah, diisi admin setelah konfirmasi
  status        TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','dikonfirmasi','dikerjakan','selesai','dibatalkan')),
  mitra_id      INTEGER REFERENCES mitra(id),
  mitra_respon  TEXT,                             -- menunggu | diterima (NULL bila belum ada mitra)
  catatan_admin TEXT,                             -- catatan internal, tidak terlihat pelanggan
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),  -- penilaian pelanggan setelah selesai
  ulasan        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_wa     ON orders(wa);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  catatan    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO services (kode, nama, deskripsi, harga_mulai, ikon, urutan) VALUES
  ('anak',   'Antar jemput anak', 'Antar ke sekolah atau jemput saat pulang, dengan mitra terverifikasi dan kabar ke orang tua setiap tahap.', 'Per perjalanan atau langganan harian', 'anak',   1),
  ('tandon', 'Bersih tandon air', 'Kuras, sikat, bilas, dan isi ulang tandon agar air rumah tetap bersih. Peralatan dibawa mitra.', 'Harga menurut ukuran tandon', 'tandon', 2),
  ('taman',  'Rawat taman',       'Potong rumput, pangkas tanaman, buang sampah daun, dan rapikan halaman rumah atau kantor.', 'Harga menurut luas area', 'taman', 3),
  ('titip',  'Titip barang',      'Titip beli kebutuhan harian, obat, makanan, atau barang dari toko yang tidak sempat Anda datangi.', 'Ongkos jasa + harga barang', 'titip', 4),
  ('antar',  'Antar barang',      'Antar paket, berkas, atau barang dagangan dari satu titik ke titik lain di dalam kota.', 'Harga menurut jarak', 'antar', 5),
  ('lain',   'Urusan lain',       'Antre di loket, jaga rumah sebentar, bantu pindahan kecil. Ceritakan lewat form, kami carikan mitranya.', 'Dihitung setelah ditanya detail', 'lain', 6);
