@echo off
setlocal enabledelayedexpansion

REM ===================================================================
REM  SEO Dashboard launcher
REM
REM  Double-click for a menu, or pass a command:
REM     start.bat            interactive menu
REM     start.bat dev        check, fix what is missing, run dev server
REM     start.bat setup      create the database schema and admin login
REM     start.bat import     load the Mindcob workbook
REM     start.bat check      environment report only
REM     start.bat parity     compare the database against the workbook
REM     start.bat build      production build and serve
REM     start.bat test       typecheck and unit tests
REM
REM  Every external command is invoked with CALL. Without it, cmd.exe
REM  hands control to npm.cmd and never comes back to this script.
REM ===================================================================

REM Run from the script's own folder, whatever drive it lives on.
cd /d "%~dp0"

title SEO Dashboard

REM The Node scripts print UTF-8. Without this the console renders their
REM dashes and tick marks as mojibake. The original page is restored on exit.
set "OLDCP="
for /f "tokens=2 delims=:" %%c in ('chcp') do set "OLDCP=%%c"
set "OLDCP=%OLDCP: =%"
chcp 65001 >nul 2>&1

REM ANSI colour. The escape character has to be captured at runtime;
REM cmd.exe has no literal for it. Set NO_COLOR=1 to turn styling off.
set "E="
if defined NO_COLOR goto :nocolour
REM The caret escape only parses correctly when FOR is not behind an IF.
for /f %%A in ('echo prompt $E ^| cmd') do set "E=%%A"
:nocolour

set "DIM="
set "OK="
set "WARN="
set "ERR="
set "HEAD="
set "BOLD="
set "R="
if defined E set "DIM=%E%[90m"
if defined E set "OK=%E%[92m"
if defined E set "WARN=%E%[93m"
if defined E set "ERR=%E%[91m"
if defined E set "HEAD=%E%[96m"
if defined E set "BOLD=%E%[1m"
if defined E set "R=%E%[0m"

set "WORKBOOK=%USERPROFILE%\Downloads\Mindcob New SEO Dashboard.xlsx"

if /i "%~1"==""        goto :menu
if /i "%~1"=="dev"     goto :dev
if /i "%~1"=="setup"   goto :setup
if /i "%~1"=="import"  goto :import
if /i "%~1"=="check"   goto :check
if /i "%~1"=="parity"  goto :parity
if /i "%~1"=="build"   goto :build
if /i "%~1"=="test"    goto :test
if /i "%~1"=="reset"   goto :reset

echo.
echo   %ERR%Unknown command "%~1"%R%
echo   Try: dev ^| setup ^| import ^| check ^| parity ^| build ^| test
echo.
exit /b 1


REM ==================================================== banner ======
:banner
cls
echo.
echo   %HEAD%%BOLD%SEO Dashboard%R%
echo   %DIM%Agency console and client portal%R%
echo   %DIM%---------------------------------------------------------%R%
exit /b 0


REM ====================================================== menu ======
:menu
call :banner
echo.
echo     %BOLD%1%R%   Start the app          %DIM%set up anything missing, then run%R%
echo     %BOLD%2%R%   Check environment      %DIM%what is configured and what is not%R%
echo     %BOLD%3%R%   Set up database        %DIM%create tables and the admin login%R%
echo     %BOLD%4%R%   Import workbook        %DIM%load the Excel file%R%
echo     %BOLD%5%R%   Verify against Excel   %DIM%compare every figure%R%
echo     %BOLD%6%R%   Production build       %DIM%build once, then serve%R%
echo     %BOLD%7%R%   Run tests              %DIM%typecheck and unit tests%R%
echo.
echo     %BOLD%Q%R%   Quit
echo.
set "choice="
set /p "choice=  Choose: "
echo.
if /i "!choice!"=="1" goto :dev
if /i "!choice!"=="2" goto :check
if /i "!choice!"=="3" goto :setup
if /i "!choice!"=="4" goto :import
if /i "!choice!"=="5" goto :parity
if /i "!choice!"=="6" goto :build
if /i "!choice!"=="7" goto :test
if /i "!choice!"=="q" exit /b 0
goto :menu


REM ============================================== prerequisites =====
REM Verifies Node and dependencies. Sets ERRORLEVEL 1 if it cannot fix.
:prereq
where node >nul 2>&1
if errorlevel 1 (
  echo   %ERR%Node.js is not installed.%R%
  echo.
  echo   Download the LTS installer from https://nodejs.org
  echo   then run this file again.
  echo.
  exit /b 1
)

for /f "tokens=* delims=v" %%v in ('node --version') do set "NODEVER=%%v"
for /f "tokens=1 delims=." %%v in ("!NODEVER!") do set "NODEMAJOR=%%v"
if !NODEMAJOR! LSS 20 (
  echo   %ERR%Node.js !NODEVER! is too old - this app needs v20 or newer.%R%
  echo   Update from https://nodejs.org and run this file again.
  echo.
  exit /b 1
)
echo   %OK%Node.js v!NODEVER!%R%

if not exist "node_modules\" (
  echo   %WARN%Installing dependencies - this takes a minute the first time.%R%
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   %ERR%npm install failed. Check your internet connection.%R%
    echo.
    exit /b 1
  )
  echo.
  echo   %OK%Dependencies installed%R%
) else (
  echo   %OK%Dependencies present%R%
)

if not exist ".env.local" (
  if exist ".env.example" (
    copy /y ".env.example" ".env.local" >nul
    echo   %WARN%Created .env.local from the example.%R%
  )
)
exit /b 0


REM ===================================================== check ======
:check
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail
call :restorecp
echo.
call npm run --silent doctor
set "DOCTOR=!errorlevel!"
call :explain !DOCTOR!
goto :done


REM Turns a doctor exit code into a next step.
:explain
if "%~1"=="0" exit /b 0
if "%~1"=="4" (
  echo   %WARN%Next step:%R% open .env.local and paste your Neon connection string.
  echo.
  choice /c YN /n /m "  Open .env.local now? [Y/N] "
  if !errorlevel!==1 start "" notepad ".env.local"
)
if "%~1"=="5" (
  echo   %WARN%Next step:%R% check the connection string, or wake the Neon project.
)
if "%~1"=="3" (
  echo   %WARN%Next step:%R% run option 3, "Set up database".
)
if "%~1"=="2" (
  echo   %WARN%Next step:%R% run option 4, "Import workbook".
)
exit /b 0


REM ===================================================== setup ======
:setup
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

echo.
echo   %HEAD%Creating the database schema...%R%
echo.
call npx drizzle-kit push --force
if errorlevel 1 (
  echo.
  echo   %ERR%Could not create the schema.%R%
  echo   Run "start.bat check" to see what is wrong.
  goto :fail
)

echo.
echo   %HEAD%Creating accounts...%R%
echo.
call npm run --silent db:seed
if errorlevel 1 (
  echo.
  echo   %ERR%Seeding failed.%R%
  goto :fail
)

echo.
echo   %OK%Database ready.%R%
echo   %DIM%Write down the admin password printed above.%R%
goto :done


REM ==================================================== import ======
:import
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

set "FILE="
if exist "%WORKBOOK%" (
  set "FILE=%WORKBOOK%"
  echo   Found workbook in Downloads:
  echo   %DIM%%WORKBOOK%%R%
) else (
  echo   %WARN%Could not find the workbook in your Downloads folder.%R%
  echo.
  echo   Drag the .xlsx file onto this window, or paste its full path,
  echo   then press Enter.
  echo.
  set /p "FILE=  Path: "
  REM Strip quotes a drag-and-drop adds.
  set "FILE=!FILE:"=!"
)

if not exist "!FILE!" (
  echo.
  echo   %ERR%That file does not exist:%R% !FILE!
  goto :fail
)

echo.
echo   %HEAD%Checking the workbook before importing...%R%
echo.
call npm run --silent db:verify -- --file "!FILE!"
echo.
choice /c YN /n /m "  Import this workbook now? [Y/N] "
if not !errorlevel!==1 (
  echo.
  echo   %DIM%Cancelled - nothing was written.%R%
  goto :done
)

echo.
call npm run --silent db:import -- --file "!FILE!"
if errorlevel 1 (
  echo.
  echo   %ERR%Import failed.%R%
  goto :fail
)
goto :done


REM ==================================================== parity ======
:parity
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

set "FILE=%WORKBOOK%"
if not exist "!FILE!" (
  echo   Paste the full path to the workbook, then press Enter.
  echo.
  set /p "FILE=  Path: "
  set "FILE=!FILE:"=!"
)
if not exist "!FILE!" (
  echo.
  echo   %ERR%That file does not exist.%R%
  goto :fail
)

echo.
call npm run --silent db:parity -- --file "!FILE!"
goto :done


REM ====================================================== test ======
:test
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

echo.
echo   %HEAD%Typechecking...%R%
call npm run --silent typecheck
if errorlevel 1 (
  echo   %ERR%Typecheck failed.%R%
  goto :fail
)
echo   %OK%Types are clean%R%
echo.
echo   %HEAD%Running tests...%R%
echo.
call npm test
goto :done


REM ======================================================= dev ======
:dev
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

echo.
call npm run --silent doctor
set "DOCTOR=!errorlevel!"

if "!DOCTOR!"=="4" (
  call :explain 4
  goto :fail
)
if "!DOCTOR!"=="5" (
  call :explain 5
  goto :fail
)

if "!DOCTOR!"=="3" (
  echo   %WARN%The database has no tables yet.%R%
  echo.
  choice /c YN /n /m "  Set it up now? [Y/N] "
  if not !errorlevel!==1 goto :fail
  echo.
  call npx drizzle-kit push --force
  if errorlevel 1 goto :fail
  call npm run --silent db:seed
  if errorlevel 1 goto :fail
  set "DOCTOR=2"
)

if "!DOCTOR!"=="2" (
  echo.
  echo   %WARN%No project data yet.%R%
  if exist "%WORKBOOK%" (
    choice /c YN /n /m "  Import the workbook from Downloads? [Y/N] "
    if !errorlevel!==1 (
      echo.
      call npm run --silent db:import -- --file "%WORKBOOK%"
    )
  ) else (
    echo   %DIM%Run "start.bat import" when you are ready to load it.%R%
  )
)

echo.
echo   %DIM%---------------------------------------------------------%R%
echo   %OK%%BOLD%Starting the app%R%
echo.
echo     Address    %BOLD%http://localhost:3000%R%
echo     Sign in    admin@mindcob.com
echo.
echo   %DIM%Leave this window open. Press Ctrl+C to stop.%R%
echo   %DIM%---------------------------------------------------------%R%
echo.

REM Give the dev server a moment to bind before the browser opens.
start "" /b cmd /c "timeout /t 5 /nobreak >nul & start """" http://localhost:3000/login"

call npm run dev
goto :done


REM ===================================================== build ======
:build
call :banner
echo.
call :prereq
if errorlevel 1 goto :fail

echo.
echo   %HEAD%Building for production - this takes a minute.%R%
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo   %ERR%Build failed.%R%
  goto :fail
)

echo.
echo   %OK%Build complete.%R%
echo.
echo     Address    %BOLD%http://localhost:3000%R%
echo.
echo   %DIM%Leave this window open. Press Ctrl+C to stop.%R%
echo.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start """" http://localhost:3000/login"
call npm start
goto :done


REM ===================================================== reset ======
:reset
call :banner
echo.
echo   %ERR%%BOLD%This deletes every table and all data in the database.%R%
echo.
set "CONFIRM="
set /p "CONFIRM=  Type DELETE to confirm: "
if /i not "!CONFIRM!"=="DELETE" (
  echo.
  echo   %DIM%Cancelled - nothing was changed.%R%
  goto :done
)
echo.
call npm run --silent db:reset -- --yes
goto :done


:restorecp
if defined OLDCP chcp %OLDCP% >nul 2>&1
exit /b 0

REM ====================================================== exits =====
:fail
echo.
echo   %DIM%---------------------------------------------------------%R%
echo.
if "%~1"=="" pause
exit /b 1

:done
call :restorecp
echo.
if "%~1"=="" (
  echo   %DIM%---------------------------------------------------------%R%
  pause
)
exit /b 0
