@echo off
echo Installing ADHD Command Center dependencies...
echo This may take 2-3 minutes.
echo.
cd /d "%~dp0"
npm install
echo.
echo Done! Run start.bat to launch the app.
pause
