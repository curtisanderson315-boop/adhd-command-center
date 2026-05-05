@echo off
cd /d "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
echo === ADHD App EAS Build ===
echo Submitting iOS development build...
npx --yes eas-cli build --platform ios --profile development --non-interactive
echo.
echo Build submitted. Check https://expo.dev/accounts/ander315 for status.
pause
