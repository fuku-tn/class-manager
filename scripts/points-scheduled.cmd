@echo off
rem Cap nhat diem HW tu dong: Windows Task Scheduler goi file nay 12:00 hang ngay (xem Documents/3-ky-thuat/google-sheet-sync.md, muc Diem tu Excel).
rem 1) Mo file "Cham diem.xlsx" bang Excel, Refresh All + tinh lai, luu (bo qua neu file dang mo o noi khac)
rem 2) Nhap bang Point_Transform vao database (scripts\import-points.js). Nhat ky: private-data\points-log.txt
chcp 65001 >nul
cd /d "%~dp0.."
if not exist "private-data" mkdir "private-data"
set "LOG=private-data\points-log.txt"
set "NODE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
set "XLSX=%POINTS_XLSX%"
if "%XLSX%"=="" if exist "private-data\excel\Chấm điểm.xlsx" set "XLSX=%CD%\private-data\excel\Chấm điểm.xlsx"
if "%XLSX%"=="" set "XLSX=%CD%\Chấm điểm.xlsx"
echo ===== %date% %time% =====>> "%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\refresh-excel.ps1" -Path "%XLSX%" >> "%LOG%" 2>&1
"%NODE%" --env-file-if-exists=.env --no-warnings=ExperimentalWarning scripts\import-points.js "%XLSX%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo LOI: nhap diem that bai, xem dong ben tren.>> "%LOG%"
  exit /b 1
)
exit /b 0
