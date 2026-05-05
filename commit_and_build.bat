@echo off
cd /d "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
echo === Git Status ===
git status
echo.
echo === Staging auth fixes ===
git add src/services/auth.ts src/screens/SettingsScreen.tsx app.json
git status
echo.
echo === Committing ===
git commit -m "fix: Switch Google OAuth to iOS native client -- fixes Gmail Connect button

- auth.ts: Use iOS client ID + reversed-client-ID redirect URI (com.googleusercontent.apps...)
- auth.ts: Add PKCE, access_type=offline, prompt=consent for refresh tokens
- auth.ts: Better error messages in exchangeCodeForTokens
- SettingsScreen.tsx: Handle OAuth error + dismiss response types (were silently dropped)
- app.json: Add CFBundleURLTypes so iOS routes Google OAuth callback back to app
- app.json: Set newArchEnabled=false (fixes future EAS build compatibility)"
echo.
echo === Submitting EAS Build ===
npx --yes eas-cli build --platform ios --profile development --non-interactive
pause
