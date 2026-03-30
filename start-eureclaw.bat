@echo off
title EureClaw
echo Starting EureClaw...

:: Start the backend in a minimized window
start /min "EureClaw Server" bun start

:: Wait for the API server to be ready
echo Waiting for backend server...
:wait_loop
timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:4300/health >nul 2>&1
if errorlevel 1 goto wait_loop
echo Backend ready!

:: Start the Web UI dev server in a minimized window
echo Starting Web UI...
start /min "EureClaw Web UI" cmd /c "cd web-ui && bun run dev"

:: Wait for the Web UI to be ready
:wait_ui
timeout /t 2 /nobreak >nul
curl -s http://localhost:8174/ >nul 2>&1
if errorlevel 1 goto wait_ui

:: Open the Web UI in default browser
echo Web UI ready! Opening browser...
start http://localhost:8174
