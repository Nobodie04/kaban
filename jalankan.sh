#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Python 3 belum terpasang."; exit 1; }
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
if [ ! -f instance/kaban.db ]; then
  echo "Pertama kali dijalankan. Buat akun admin:"
  read -r -p "Nomor WhatsApp admin (08xxxxxxxxxx): " KABAN_ADMIN_WA
  read -r -s -p "Password admin (min 8 karakter): " KABAN_ADMIN_PASSWORD; echo
  export KABAN_ADMIN_WA KABAN_ADMIN_PASSWORD
fi
echo "Kaban berjalan di http://localhost:5000 (Ctrl+C untuk berhenti)"
exec python app.py
