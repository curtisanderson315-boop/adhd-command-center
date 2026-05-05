@echo off
echo ===== Android SDK Check =====
echo.

set ANDROID_HOME=C:\Users\curti\AppData\Local\Android\Sdk

if exist "%ANDROID_HOME%\platform-tools\adb.exe" (
    echo SDK found at: %ANDROID_HOME%
) else (
    echo SDK not found at %ANDROID_HOME%
    echo Searching...
    for /f "tokens=*" %%i in ('where adb 2^>nul') do echo adb at: %%i
)

echo.
echo ===== AVD List =====
if exist "%ANDROID_HOME%\cmdline-tools\latest\bin\avdmanager.bat" (
    "%ANDROID_HOME%\cmdline-tools\latest\bin\avdmanager.bat" list avd
) else (
    echo avdmanager not found at cmdline-tools\latest
    dir "%ANDROID_HOME%\cmdline-tools\" 2>nul
)

echo.
echo ===== Installed System Images =====
if exist "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" (
    "%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat" --list_installed 2>nul | findstr "system-images"
)

echo.
echo ===== Emulator check =====
if exist "%ANDROID_HOME%\emulator\emulator.exe" (
    echo Emulator found.
    "%ANDROID_HOME%\emulator\emulator.exe" -list-avds
) else (
    echo Emulator not found.
)

echo.
pause
