@echo off
title ZOMBIE SURVIVAL - LAN Game Server
cd /d "%~dp0"
echo.
echo  =====================================================
echo    ZOMBIE SURVIVAL  -  LAN co-op round-based survival
echo  =====================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js was not found on this computer.
  echo  Please install the LTS version from  https://nodejs.org  and run this file again.
  echo.
  pause
  exit /b 1
)
echo  Starting local game server... your browser will open automatically.
echo  If Windows Firewall asks, click "Allow access" so friends on the LAN can join.
echo  Keep this window open while playing. Close it to stop the server.
echo.
node server/index.js %*
echo.
echo  Server stopped.
pause
