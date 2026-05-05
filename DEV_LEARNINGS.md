# ADHD Command Center — Dev Path Learnings

> Updated 2026-05-04. Captures every approach tried, every failure, every fix,
> and the recommended path forward. Read this before starting any new build session.

---

## Quick Summary

**Goal:** Get a native iOS development build running on Curtis's iPhone (Windows 11 machine, no Mac).

**Root cause of most failures:** NTFS file corruption — Windows was padding JSON files with null bytes, causing `expo prebuild` to fail instantly. Every tool was in place; the files were silently broken.

**Current status (2026-05-04):** Build #6 queued on EAS after fixing file corruption. First successful build expected.

---

## Approaches Tried

### 1. Expo Go — NOT viable for this app

**What it is:** Scan a QR code, run your JS bundle in the Expo Go app. No build required.

**Why we can't use it:**
- `react-native-siri-shortcut` requires native iOS entitlements not in Expo Go's sandbox
- `expo-dev-client` is by definition a replacement for Expo Go
- Siri, background fetch, and push notifications require native compilation

**Verdict:** Skip entirely. Not an option for this app.

---

### 2. Android Emulator — NOT viable for this app

**What it is:** Run the app on a virtual Android device on Windows.

**Why we can't use it:**
- The app is iOS-only (Siri, iOS notifications, Apple credential flows)
- Android can't test any of the core features
- `app.json` has iOS-only entitlements that would cause Android build errors

**Verdict:** Not useful. If Android support is added later, revisit.

---

### 3. Expo Metro Dev Server (JS-only hot reload)

**What it is:** `expo start --tunnel` serves the JS bundle locally. Changes reload in <2 seconds.

**Status:** Available but not yet useful — you need a native dev client app installed on the device first (from EAS build).

**When to use:** After the first EAS build is installed on the iPhone. For ALL UI and logic changes, this is the fast path. You never need to rebuild for JS-only changes.

---

### 4. Local iOS Prebuild on Windows — IMPOSSIBLE

**What it is:** `npx expo prebuild --platform ios` generates the native Xcode project.

**What happened:**
```
Skipping generating the iOS native project files.
Run npx expo prebuild again from macOS or Linux.
```

**Why it fails:** Expo explicitly blocks iOS prebuild on Windows. The generated files contain Mac-specific paths.

**Also tried:**
- `prebuild_test.bat` and `prebuild_local.bat` — same Windows block
- Both scripts also had PowerShell escaping bugs (`$LASTEXITCODE` and `$null` need backtick escaping in heredoc strings inside .bat files)

**Verdict:** Impossible on Windows. Don't waste time on this.

---

### 5. Local Prebuild in Linux Bash Sandbox — PARTIALLY USEFUL

**What it is:** The Cowork bash sandbox is Ubuntu Linux. iOS prebuild CAN run on Linux in theory.

**What worked:**
- JSON validation (instant) — this is how we found the null-byte corruption
- TypeScript syntax checks across all 16 source files — all clean
- Package version/peer-dep audits
- Null-byte detection and file repair
- Writing fixed files directly to the mounted Windows path

**What didn't work:**
- `npm install` — times out at the 45-second bash call limit for a project this size (~800 packages)
- `npx expo prebuild` — npx package download also exceeds 45-second limit
- Using Windows-installed `node_modules` on Linux — binary shims are Windows-format, crash on Linux

**Key limitation:** Each bash call is a fresh container. Background jobs don't persist. Only the mounted filesystem (`mnt/`) survives between calls.

**Verdict:** Excellent for static analysis and file repair. Use it as a pre-flight check before every EAS build.

---

### 6. EAS Cloud Build — iOS Development Profile (MAIN APPROACH)

**What it is:** `npx eas-cli build --platform ios --profile development` uploads your project to Expo's macOS build servers, runs prebuild + Xcode compilation, returns an `.ipa` install link.

**Build timeline:** ~15–20 minutes per attempt.

**Builds submitted:**

| # | Result | Phase | Root cause | Fix |
|---|--------|-------|-----------|-----|
| 1 | ✗ | Install dependencies | npm peer dep conflicts | Created `.npmrc` with `legacy-peer-deps=true` |
| 2 | ✗ | Prebuild | Missing `assets/` folder — all PNG refs broken | Created all 5 placeholder PNG files |
| 3 | ✗ | Prebuild (639ms) | `@config-plugins/react-native-siri-shortcut` in plugins but not installed on EAS | Removed from `app.json` plugins |
| 4 | ✗ | Prebuild (639ms) | `react-native-siri-shortcut` not New Architecture compatible | Added `"newArchEnabled": false` to `app.json` |
| 5 | ✗ | Prebuild (639ms) | **Root cause:** `package.json` truncated + `app.json` had 42 null bytes — JSON parse crash | Stripped null bytes from both files; re-validated |
| 6 | ⏳ | Queued | — | Fixed files uploaded, 77.3 MB, credentials valid |

---

## Errors & Fixes Reference

### "Unknown error. See logs of the Install dependencies build phase"
**Cause:** EAS runs plain `npm install` with no flags. Peer dep conflicts from `react-native-worklets` and `react-native-gifted-chat`.
**Fix:** `.npmrc` in project root:
```
legacy-peer-deps=true
```
This is permanent. Never delete `.npmrc`.

---

### Prebuild fails instantly (639ms) — "exited with non-zero code: 1"
This was the hardest problem because EAS only showed the exit code, not the actual error.

**Real cause: JSON file corruption.** Both `package.json` and `app.json` had null bytes (`\x00`) appended by Windows/NTFS file allocation. Files look fine in Windows editors, but Linux JSON parsers reject them. `expo prebuild` reads both files immediately on startup and crashed in under a second.

**How we found it:**
```bash
python3 -c "
with open('package.json', 'rb') as f:
    data = f.read()
print('Last 40 bytes:', repr(data[-40:]))
# Shows: b'\x00\x00\x00\x00\x00...'
"
```

**Fix:**
```bash
python3 -c "
import json
for fname in ['app.json', 'package.json']:
    with open(fname, 'rb') as f:
        raw = f.read().rstrip(b'\x00')
    parsed = json.loads(raw)
    with open(fname, 'w') as f:
        f.write(json.dumps(parsed, indent=2) + '\n')
    print(f'Fixed: {fname}')
"
```

**Why this happens:** NTFS allocates disk space in clusters. When a file is written, the allocated space may exceed the actual content, and the remainder is padded with nulls. The Linux mount reads the full allocated size.

---

### react-native-siri-shortcut New Architecture conflict
**Cause:** Expo SDK 54 enables New Architecture by default. `react-native-siri-shortcut` ^1.4.0 doesn't support it.
**Fix:** Add to `app.json` under the `expo` key:
```json
"newArchEnabled": false
```

---

### MODULE_NOT_FOUND: @config-plugins/react-native-siri-shortcut
**Cause:** Package listed in `app.json` plugins but EAS couldn't find it during prebuild.
**Fix:** Removed from `app.json` plugins array (kept in `package.json` dependencies for later).
**TODO:** Re-add to plugins after first successful build. The Siri entitlement in `app.json ios.entitlements` still enables Siri; the config plugin adds deeper native project integration.

---

### Interactive prompts blocking `--non-interactive` EAS builds
**Cause:** `eas-cli build` prompts for Apple ID, 2FA, device registration.
**Fix:** Added `--non-interactive` to build command. One-time Apple account setup is still manual; after that, stored credentials handle it.

---

### PowerShell escaping in .bat files
**Cause:** `$LASTEXITCODE` and `$null` inside PowerShell strings in .bat heredocs aren't escaped.
**Fix:** Use backtick: `` `$LASTEXITCODE ``, `` `$null ``

---

### Windows node_modules unusable on Linux
**Cause:** npm installs Windows-format binary shims (`.cmd` files). Linux throws syntax errors trying to run them.
**Fix:** Always do a fresh `npm install` in a Linux-native path when working in the bash sandbox.

---

## What Is Working

| Component | Status |
|-----------|--------|
| `.npmrc` — legacy-peer-deps | ✅ |
| All 5 PNG assets | ✅ Placeholders in place |
| `app.json` — valid JSON, no null bytes | ✅ |
| `package.json` — valid JSON, no null bytes | ✅ |
| `newArchEnabled: false` | ✅ |
| EAS credentials (cert + provisioning profile) | ✅ Active, iPhone provisioned |
| `--non-interactive` build flag | ✅ |
| TypeScript source files (16 files) | ✅ All clean |
| EAS upload (Build #6) | ✅ 77.3 MB uploaded, queued |

---

## Recommended Development Path Going Forward

### The two-speed loop

**Slow path (EAS, 15–20 min): Only for native changes**
- Adding a new npm package that has native code
- Changing `app.json` plugins, entitlements, or bundle ID
- Updating React Native or Expo SDK version
- Adding new iOS permissions

**Fast path (Metro, <2 sec): Everything else**
- All UI changes
- All business logic
- API integrations (Claude, Gmail, Calendar)
- State management (Zustand)
- Screens, components, navigation

Once the first EAS build is on your iPhone, ~95% of development is on the fast path.

---

### Pre-flight check (run before every EAS build)

Run this in the bash sandbox before submitting:
```bash
cd "/sessions/relaxed-awesome-planck/mnt/ADHD App"
python3 -m json.tool app.json > /dev/null && echo "✓ app.json" || echo "✗ app.json CORRUPT"
python3 -m json.tool package.json > /dev/null && echo "✓ package.json" || echo "✗ package.json CORRUPT"
# Check for null bytes
python3 -c "
for f in ['app.json', 'package.json']:
    d = open(f,'rb').read()
    n = d.count(b'\x00')
    print(f'  {f}: {n} null bytes' + (' ← FIX THIS' if n else ' ✓'))
"
```

---

## Environment Constraints

| Constraint | Workaround |
|-----------|-----------|
| No Mac — can't run iOS prebuild locally | EAS cloud build for all native compilation |
| Terminal is click-tier in Cowork (can't type) | Win+R + clipboard to launch .bat scripts |
| npm peer dep conflicts | `.npmrc` with `legacy-peer-deps=true` |
| node_modules symlinked to `C:\Dev\` | Don't move or delete the junction |
| NTFS null-byte file corruption | Validate JSON with python3 before every build |
| EAS = 15–20 min feedback cycle | Pre-flight bash checks catch most errors in seconds |
| OneDrive sync lag on Linux mount | Use bash to write directly to mounted path; verify with python3 |

---

## Key Files Reference

| File | Purpose | Notes |
|------|---------|-------|
| `.npmrc` | Forces `legacy-peer-deps` for all npm commands | Never delete |
| `app.json` | Expo config — plugins, permissions, entitlements | Validate JSON before every build |
| `eas.json` | EAS build profiles (development/preview/production) | Don't change `distribution: internal` |
| `eas_build.bat` | One-click EAS build launcher | Double-click or Win+R to run |
| `CLAUDE.md` | ARIA agent instructions | Read at start of every session |
| `DEV_LEARNINGS.md` | This file | Update after each session |
| `PROGRESS_LOG.md` | Session-by-session log | Append after each session |
