@echo off
rem Sao luu tu dong: Windows Task Scheduler goi file nay (xem Documents/4-van-hanh/backup.md).
rem Ghi nhat ky vao private-data\backups\backup-log.txt; giu 28 ban moi nhat (2 lan/ngay x 14 ngay).
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "private-data\backups" mkdir "private-data\backups"
set "LOG=private-data\backups\backup-log.txt"
set "NODE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
echo ===== %date% %time% =====>> "%LOG%"
"%NODE%" --env-file-if-exists=.env --no-warnings=ExperimentalWarning scripts\backup.js --keep 28 >> "%LOG%" 2>&1
if errorlevel 1 (
  echo LOI: sao luu that bai, xem dong ben tren.>> "%LOG%"
  exit /b 1
)
exit /b 0
