@echo off
setlocal EnableExtensions EnableDelayedExpansion
title RoadGuard AI launcher
cd /d "%~dp0"

rem ==========================================================================
rem  RoadGuard AI - one-click launcher
rem    RoadGuard.bat          set up (first run only) and start everything
rem    RoadGuard.bat stop     stop the three RoadGuard windows
rem    RoadGuard.bat setup    install or refresh dependencies, then exit
rem ==========================================================================

if /i "%~1"=="stop" goto :stop

set "STATE=%~dp0.roadguard"
if not exist "%STATE%" mkdir "%STATE%"
set "VENV_PY=%~dp0backend\.venv\Scripts\python.exe"

echo.
echo   ROADGUARD AI
echo   ------------------------------------------------------------
echo.

rem ---- 1. Tools ------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [x] Node.js was not found. Install Node 20 or newer from https://nodejs.org and run this again.
  goto :fail
)
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo   [ok] Node !NODE_VER!

set "PY="
where py >nul 2>nul && (py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3")
if not defined PY (
  where python >nul 2>nul && (python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python")
)
if not defined PY (
  echo   [x] Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/ ^(tick "Add to PATH"^) and run this again.
  goto :fail
)
for /f "delims=" %%v in ('%PY% -c "import platform; print(platform.python_version())"') do set "PY_VER=%%v"
echo   [ok] Python !PY_VER!

rem ---- 2. Backend environment ---------------------------------------------
if not exist "%VENV_PY%" (
  echo   [..] Creating the backend environment ^(first run^)
  %PY% -m venv --system-site-packages "%~dp0backend\.venv" || goto :fail
)

fc /b "%~dp0backend\requirements.txt" "%STATE%\requirements.txt" >nul 2>nul
if errorlevel 1 (
  echo   [..] Installing backend packages ^(first run can take several minutes^)
  "%VENV_PY%" -m pip install --upgrade pip >nul 2>nul
  "%VENV_PY%" -c "import torch" >nul 2>nul
  if errorlevel 1 (
    where nvidia-smi >nul 2>nul
    if errorlevel 1 (
      echo        No NVIDIA GPU found: installing PyTorch for CPU
      "%VENV_PY%" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu || goto :fail
    ) else (
      echo        NVIDIA GPU found: installing PyTorch with CUDA 12.8
      "%VENV_PY%" -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128 || goto :fail
    )
  )
  "%VENV_PY%" -m pip install -r "%~dp0backend\requirements.txt" || goto :fail
  copy /y "%~dp0backend\requirements.txt" "%STATE%\requirements.txt" >nul
)
echo   [ok] Backend packages

rem ---- 3. Frontend packages ------------------------------------------------
call :npm_deps "%~dp0" console 5173 || goto :fail
call :npm_deps "%~dp0public-app\" citizen 5175 || goto :fail
echo   [ok] Frontend packages

if /i "%~1"=="setup" (
  echo.
  echo   Setup complete. Run RoadGuard.bat to start.
  goto :end
)

rem ---- 4. Start the three services ----------------------------------------
call :listening 8000
if errorlevel 1 (
  echo   [..] Starting the API and loading the detector
  start "RoadGuard API" /min /D "%~dp0backend" cmd /k ""%VENV_PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000"
) else (
  echo   [ok] API already running on port 8000
)

call :listening 5173
if errorlevel 1 (
  start "RoadGuard Console" /min /D "%~dp0" cmd /k "npm run dev -- --port 5173 --strictPort"
) else (
  echo   [ok] Console already running on port 5173
)

call :listening 5175
if errorlevel 1 (
  start "RoadGuard Citizen" /min /D "%~dp0public-app" cmd /k "npm run dev -- --port 5175 --strictPort"
) else (
  echo   [ok] Citizen app already running on port 5175
)

rem ---- 5. Wait until they answer, then open the browser -------------------
set /a tries=0
:wait_api
set "CODE="
for /f %%c in ('curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8000/health 2^>nul') do set "CODE=%%c"
if "!CODE!"=="200" goto :api_up
set /a tries+=1
if !tries! geq 90 (
  echo   [x] The API did not start within 3 minutes. Check the "RoadGuard API" window for the error.
  goto :fail
)
timeout /t 2 /nobreak >nul
goto :wait_api
:api_up
echo   [ok] API ready      http://127.0.0.1:8000/docs

set /a tries=0
:wait_web
set "CODE="
for /f %%c in ('curl -s -o nul -w "%%{http_code}" http://127.0.0.1:5173/ 2^>nul') do set "CODE=%%c"
if "!CODE!"=="200" goto :web_up
set /a tries+=1
if !tries! geq 60 (
  echo   [x] The console did not start. Check the "RoadGuard Console" window for the error.
  goto :fail
)
timeout /t 1 /nobreak >nul
goto :wait_web
:web_up

set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"

echo   [ok] Console ready  http://localhost:5173
echo.
echo   ------------------------------------------------------------
echo   Landing page     http://localhost:5173
echo   Inspector        http://localhost:5173/console   ^(admin / admin123^)
echo   Citizen app      http://localhost:5175
if defined LANIP echo   On a phone       http://!LANIP!:5175   ^(same Wi-Fi^)
echo   API docs         http://127.0.0.1:8000/docs
echo   ------------------------------------------------------------
echo   Close the three RoadGuard windows, or run "RoadGuard.bat stop", to shut down.
echo.
start "" "http://localhost:5173/"
goto :end

rem ==========================================================================
:npm_deps
rem %1 = folder with package.json (trailing backslash), %2 = name, %3 = the port its dev server uses
set "DIR=%~1"
set "MARK=%STATE%\%~2-package-lock.json"
if not exist "%DIR%node_modules" (
  echo   [..] Installing %~2 packages ^(first run^)
  pushd "%DIR%"
  call npm ci --no-audit --no-fund --loglevel=error
  set "RC=!errorlevel!"
  popd
  if not "!RC!"=="0" exit /b 1
  copy /y "%DIR%package-lock.json" "%MARK%" >nul
  exit /b 0
)
fc /b "%DIR%package-lock.json" "%MARK%" >nul 2>nul
if not errorlevel 1 exit /b 0
call :listening %~3
if not errorlevel 1 (
  echo   [!] %~2 packages changed, but the %~2 app is running. Run "RoadGuard.bat stop" first to update them.
  exit /b 0
)
echo   [..] Updating %~2 packages
pushd "%DIR%"
call npm install --no-audit --no-fund --loglevel=error
set "RC=!errorlevel!"
popd
if not "!RC!"=="0" exit /b 1
copy /y "%DIR%package-lock.json" "%MARK%" >nul
exit /b 0

:listening
rem errorlevel 0 when something is already listening on port %1
netstat -ano | findstr /r /c:":%~1 .*LISTENING" >nul
exit /b %errorlevel%

:stop
echo   Stopping RoadGuard...
taskkill /fi "WINDOWTITLE eq RoadGuard API*" /t /f >nul 2>nul
taskkill /fi "WINDOWTITLE eq RoadGuard Console*" /t /f >nul 2>nul
taskkill /fi "WINDOWTITLE eq RoadGuard Citizen*" /t /f >nul 2>nul
echo   Stopped.
goto :end

:fail
echo.
echo   RoadGuard did not start. Fix the problem above and run RoadGuard.bat again.
echo.
pause
exit /b 1

:end
endlocal
exit /b 0
