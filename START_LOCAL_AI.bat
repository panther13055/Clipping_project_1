@echo off
setlocal
cd /d "%~dp0"

echo.
echo Ranking Shorts Maker - FREE Local AI
echo =====================================

if not exist "tools\realesrgan\realesrgan-ncnn-vulkan.exe" (
  echo Real-ESRGAN is not installed yet. Installing the official free engine...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_local_ai.ps1"
  if errorlevel 1 (
    echo.
    echo Setup failed. Read the message above, then try again.
    pause
    exit /b 1
  )
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Install Python 3.9+ and enable "Add Python to PATH", then run this file again.
  pause
  exit /b 1
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo.
  echo FFmpeg is not installed or not in PATH.
  echo Real-ESRGAN is ready, but the video pipeline also needs FFmpeg.
  pause
  exit /b 1
)

where ffprobe >nul 2>nul
if errorlevel 1 (
  echo.
  echo ffprobe is not installed or not in PATH.
  echo Install the full FFmpeg package, then run this file again.
  pause
  exit /b 1
)

echo.
echo Starting Local AI on http://127.0.0.1:8765
echo Keep this window open while using Local AI Enhance in the website.
echo.
python "%~dp0local_ai_server.py"

echo.
echo Local AI stopped.
pause
