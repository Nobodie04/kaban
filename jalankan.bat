@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul || (echo Python belum terpasang. Unduh di https://www.python.org/downloads/ lalu jalankan ulang. & pause & exit /b 1)
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
if not exist instance\kaban.db (
  echo Pertama kali dijalankan. Buat akun admin:
  set /p KABAN_ADMIN_WA=Nomor WhatsApp admin ^(08xxxxxxxxxx^): 
  set /p KABAN_ADMIN_PASSWORD=Password admin ^(min 8 karakter^): 
)
echo.
echo Kaban berjalan di http://localhost:5000  ^(tekan Ctrl+C untuk berhenti^)
start "" http://localhost:5000
python app.py
