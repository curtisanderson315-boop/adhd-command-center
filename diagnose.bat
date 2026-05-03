@echo off
cd /d "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
echo === ADHD App Diagnostics === > diag_output.txt
echo. >> diag_output.txt
echo Node version: >> diag_output.txt
node --version >> diag_output.txt 2>&1
echo. >> diag_output.txt
echo npm version: >> diag_output.txt
npm --version >> diag_output.txt 2>&1
echo. >> diag_output.txt
echo npx version: >> diag_output.txt
npx --version >> diag_output.txt 2>&1
echo. >> diag_output.txt
echo expo version: >> diag_output.txt
npx expo --version >> diag_output.txt 2>&1
echo. >> diag_output.txt
echo node_modules exists: >> diag_output.txt
if exist node_modules (echo YES) else (echo NO) >> diag_output.txt
echo. >> diag_output.txt
echo === Done === >> diag_output.txt
