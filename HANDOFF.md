# ADHD Command Center — Session Handoff
*Last updated: 2026-05-03*

## Where We Are Right Now

The EAS cloud build was just submitted. The terminal is running `eas_build.bat` and the build is queued on Expo's servers.

**Check build status at:** https://expo.dev/accounts/ander315

---

## What Was Built (Complete)

A full React Native iOS app called **ADHD Command Center** with:
- 4 screens: Home (capture), Triage (inbox), Tasks (buckets), Settings
- Zustand state management with AsyncStorage persistence
- Anthropic Claude AI integration (AI service in `src/services/ai.ts`)
- Real Siri Shortcut support (`react-native-siri-shortcut` native module)
- Expo Dev Client for native module support
- EAS Build configured for cloud compilation (no Mac needed)

---

## Immediate Next Steps

### 1. Wait for EAS Build (~15-20 min)
- Go to https://expo.dev/accounts/ander315 → Projects → adhd-command-center → Builds
- When complete, you'll get a QR code / install link

### 2. Install on iPhone
- Open the install link on your iPhone
- You may need to register your device UDID first if prompted
- This installs a **development build** (has the Expo dev menu + real Siri support)

### 3. Test Siri
- On iPhone: Settings → Siri & Search → ADHD Command Center
- Add shortcuts for "Log a thought", "Add a task", "Start triage"
- Test with "Hey Siri, log a thought"

### 4. Set Up Google Cloud (for Gmail + Calendar)
*This is the next major task.*
- Go to https://console.cloud.google.com
- Create a new project called "ADHD Command Center"
- Enable: Gmail API + Google Calendar API
- Create OAuth 2.0 credentials (iOS app type)
- Add the client ID to `src/services/auth.ts` (replace the placeholder)

### 5. Add Anthropic API Key
- In the app: Settings screen → enter your Anthropic API key
- Or hardcode in `src/services/ai.ts` for testing

---

## Project Location
`C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App`

## Key Files
| File | Purpose |
|------|---------|
| `App.tsx` | Root navigator, Siri event handler |
| `index.js` | Entry point (`registerRootComponent`) |
| `app.json` | Expo config, Siri entitlement, bundle ID |
| `eas.json` | EAS build profiles |
| `src/store/index.ts` | All app state (Zustand) |
| `src/services/ai.ts` | Anthropic Claude integration |
| `src/services/siri.ts` | Siri shortcuts registration + events |
| `src/services/auth.ts` | Google OAuth (needs client ID) |
| `eas_build.bat` | Launch EAS cloud build |
| `eas_login.bat` | Log into Expo account |

## Accounts
| Service | Account |
|---------|---------|
| Expo | ander315 / curtisanderson315@gmail.com |
| Apple Developer | curtisanderson315@gmail.com ($99/year enrolled) |
| Google Cloud | (need to set up) |

---

## Technical Notes for Next Session

- **npm install:** always use `--legacy-peer-deps`
- **Terminal:** click-tier in Cowork — use Win+R + clipboard to run bat files
- **PowerShell:** ASCII only — no em dashes or special Unicode chars
- **node_modules:** symlinked to `C:\Dev\adhd-app-node-modules` (outside OneDrive)
- **EAS login:** `npx --yes eas-cli login` (browser OAuth opens Edge)
