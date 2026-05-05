---
name: adhd-app-rn
description: Project-specific reference skill for the ADHD Command Center React Native / Expo iOS app. Use this skill whenever working on this app's codebase — before making any code changes, before submitting an EAS build, when hitting a build error, when choosing which Claude model to use, when deciding EAS vs Metro, when adding npm packages, or when touching app.json. This skill contains hard-won gotchas that have caused real build failures. Trigger on any task involving: EAS build, expo prebuild, app.json, package.json, Google OAuth, Siri shortcuts, background tasks, audio recording, or the ADHD Command Center project.
---

# ADHD Command Center — React Native Reference

This skill encodes every hard-won lesson from building this app. Read it at the start of any session before touching code or submitting a build.

## The #1 rule: Two-speed development

**Ask yourself: does this change touch native code?**

| Change type | Requires EAS build? | How to test |
|-------------|-------------------|-------------|
| UI, business logic, API calls, navigation | ❌ No | `npx expo start --clear --tunnel` → dev client on iPhone |
| New npm package with `ios/` or `android/` folder | ✅ Yes | EAS build required |
| Changes to `app.json` plugins, entitlements, permissions | ✅ Yes | EAS build required |
| Expo SDK version bump | ✅ Yes | EAS build required |
| The entire PIE feature (smartScan, SuggestionsScreen, etc.) | ❌ No | Pure JS — Metro only |

**EAS builds take 15-20 min and have a 3-per-session cap. Never waste one on a JS-only change.**

---

## Critical constraints — violating these breaks the build

### 1. Null bytes in JSON files (the #1 build killer)

Windows/NTFS silently pads JSON files with `\x00` null bytes. Linux JSON parsers on EAS reject them, causing prebuild to fail in < 1 second with a cryptic "exit code 1". **Run this before every EAS build:**

```bash
python3 -c "
for f in ['app.json', 'package.json', 'eas.json', 'tsconfig.json']:
    d = open(f,'rb').read()
    n = d.count(b'\x00')
    print(f'{f}: {n} null bytes' + (' <-- FIX' if n else ' OK'))
"
```

Fix (if any file shows > 0):
```bash
python3 -c "
import json
for fname in ['app.json', 'package.json', 'eas.json', 'tsconfig.json']:
    raw = open(fname,'rb').read().rstrip(b'\x00')
    parsed = json.loads(raw)
    open(fname,'w').write(json.dumps(parsed, indent=2) + '\n')
    print(f'Fixed: {fname}')
"
```

### 2. newArchEnabled must be false

```json
// app.json — DO NOT CHANGE THIS
{ "expo": { "newArchEnabled": false } }
```

`react-native-siri-shortcut ^1.4.0` is incompatible with React Native New Architecture. Setting this to `true` will cause every EAS build to fail.

### 3. npm install — always use legacy-peer-deps

`.npmrc` in the project root contains `legacy-peer-deps=true` (EAS reads this automatically). For any manual CLI installs:

```bash
npm install [package] --legacy-peer-deps
```

Never delete `.npmrc`. Never run `npm install` without this flag.

### 4. Lockfile sync — check before building

If `package.json` has a dep that `package-lock.json` doesn't know about, EAS's `npm ci` will hard-fail at "Install dependencies". Before every build:

```bash
git diff package.json
```

If you see any additions that weren't followed by `npm install`, either revert them or run `npm install --legacy-peer-deps` to sync the lockfile.

### 5. Do NOT add @config-plugins/react-native-siri-shortcut back

This plugin was removed from `app.json` plugins because it's not available in the EAS build environment. The Siri entitlement is handled directly via `ios.entitlements` in app.json. Do not re-add it.

### 6. iOS prebuild on Windows is impossible

`npx expo prebuild --platform ios` on Windows exits immediately. All iOS native compilation MUST go through EAS cloud build. Never try to prebuild locally.

### 7. node_modules is symlinked — don't delete it

`node_modules` is symlinked to `C:\Dev\adhd-app-node-modules` via Windows junction. Do NOT run `rm -rf node_modules`. Do NOT move or recreate the junction.

---

## Google OAuth — how it works in this app

This app uses an **iOS-native OAuth client** (not the Expo auth proxy). This is critical to get right.

```typescript
// The iOS client validates by bundle ID — no Google Cloud Console redirect URI config needed
export const GOOGLE_CLIENT_ID = '82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g.apps.googleusercontent.com';
export const REDIRECT_URI = 'com.googleusercontent.apps.82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g:/';
```

The reversed-client-ID URL scheme must be registered in `app.json`:
```json
"ios": {
  "infoPlist": {
    "CFBundleURLTypes": [{
      "CFBundleTypeRole": "Editor",
      "CFBundleURLSchemes": [
        "adhdcommandcenter",
        "com.googleusercontent.apps.82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g"
      ]
    }]
  }
}
```

**Do NOT switch to the Expo proxy (`useProxy: true`) or the web client ID.** The web client requires registering redirect URIs in Google Cloud Console, which Curtis can't do without browser access.

---

## AI model selection

| Task | Model | Why |
|------|-------|-----|
| Voice transcription + routing | `claude-sonnet-4-6` | Needs reasoning to parse intent |
| Smart scan (PIE) | `claude-sonnet-4-6` | Multi-document cross-referencing |
| Email triage | `claude-haiku-4-5-20251001` | Speed matters, high volume |

Always use raw `fetch` to the Anthropic API — do NOT import `@anthropic-ai/sdk` (it's not in package.json and causes build failures).

```typescript
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({ model, max_tokens, messages }),
});
```

---

## Project identifiers (copy-paste ready)

```
Bundle ID:      com.curtisanderson.adhdcommandcenter
Expo slug:      adhd-command-center
EAS project ID: 1af8df19-af7b-493c-ad94-7bb4b3d85075
Expo account:   ander315
Apple account:  curtisanderson315@gmail.com
Google client:  82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g.apps.googleusercontent.com
```

---

## EAS build command (copy-paste ready)

```bash
cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"

# Pre-flight first
python3 -c "
for f in ['app.json','package.json','eas.json','tsconfig.json']:
    d=open(f,'rb').read(); n=d.count(b'\x00')
    print(f'{f}: {n} null bytes' + (' <-- FIX' if n else ' OK'))
"

# Then build
npx --yes eas-cli build --platform ios --profile development --non-interactive
```

---

## Metro dev server (JS-only changes)

```bash
cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
npx expo start --clear --tunnel
```

Then open the Expo dev client on the iPhone and scan the QR code. Reloads in < 2 seconds.

---

## App architecture summary

5 tabs: Home → Smart (PIE) → Triage → Tasks → Settings

- **Home:** Voice capture (hold-to-record via expo-audio) + text fallback → AI routing → creates Gmail draft / Calendar event / task / note
- **Smart:** Proactive Intelligence Engine — scans Gmail + Calendar, surfaces gaps, one-tap actions
- **Triage:** Gmail inbox swipeable cards — archive, snooze, draft reply, add task
- **Tasks:** Today / Upcoming / Someday buckets — swipe to complete/delete
- **Settings:** Google OAuth, Anthropic key, triage interval, notifications

All types live in `src/types/index.ts`. All colors/spacing in `src/theme.ts`. Never define styles inline — always `StyleSheet.create()`.

---

## Build history (for context)

| Commit | Result | Key change |
|--------|--------|-----------|
| edb3b6af | ✅ SUCCESS | First working IPA |
| b633cdfc | JS only | PIE feature (no EAS needed) |
| a1a883d7 | In progress | Gmail OAuth fix + CFBundleURLTypes |

Latest known good IPA: https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa
