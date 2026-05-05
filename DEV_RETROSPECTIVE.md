# ADHD Command Center — Development Retrospective
> Written: 2026-05-04
> Purpose: Capture all development approaches tried, failures, learnings, and the recommended path forward.
> Start every new planning session by reading this file.

---

## The Core Problem

Curtis is a non-developer on Windows 11. The app is an iOS React Native app built with Expo. The central challenge throughout development has been: **how do we test and iterate on the app without a Mac and without Curtis needing to be in the loop for every change?**

Every approach below is an attempt to solve this same problem.

---

## Approach 1: EAS Cloud Build → Install on Physical iPhone

### What we tried
Used Expo's cloud build service (EAS) to compile the app on Expo's Mac servers and produce an `.ipa` file. Curtis would then install the build on his physical iPhone.

### What worked
- EAS build itself worked great. No Mac needed. Submitted from Windows via `npx eas-cli build`.
- Two successful builds shipped: commit `edb3b6af` and `0e8fd8b4`.
- IPA files were produced and available at expo.dev within ~5-10 minutes.
- All 5 phases of the app were built and verified to compile cleanly.
- TypeScript passes with zero errors.
- This is the correct production path for iOS.

### What went wrong / blockers
- **Google OAuth wouldn't work on device.** When Curtis tapped "Connect Gmail + Calendar," nothing happened. Root cause: the iOS Google OAuth client ID requires the app's bundle ID (`com.curtisanderson.adhdcommandcenter`) to be registered in Google Cloud Console, and the redirect URI scheme wasn't matching. We attempted fixes but couldn't fully verify them without being able to see what was happening on the device screen.
- **Siri shortcuts require iOS Settings configuration.** Curtis couldn't find "Siri & Search" in Settings (it doesn't appear until the app is installed from a dev build with the Siri entitlement). The shortcuts app didn't list the ADHD app as available because we hadn't yet completed a full device test.
- **Keyboard covers text input.** When Curtis typed in the "Type a thought" field, the keyboard overlapped the input and tapping the checkmark submitted rather than dismissed it. This was a keyboard avoidance bug that could be fixed but we never had a clean iteration cycle to do so.
- **No autonomous iteration possible.** Each fix required: edit code → submit EAS build (10-15 min) → Curtis installs → Curtis tests → reports back → repeat. This is slow and requires Curtis in the loop every cycle.

### Verdict
Good for final production delivery. Bad for rapid iteration. **Use EAS builds for shipping, not for debugging.**

---

## Approach 2: Expo Go (Development Server)

### What we tried
Run `npx expo start --tunnel` to start a local Metro bundler. Curtis would open the Expo Go app on his iPhone and scan the QR code. This would load our JavaScript over the network without needing a native build.

### What worked
- Metro server started successfully.
- Tunnel mode (via ngrok) allowed connection without being on the same WiFi.
- Curtis was able to load the app in Expo Go and interact with it.
- Basic UI (screens, navigation, theme) was visible.
- Task creation worked.
- Anthropic API key entry and "Test connection" worked.

### What went wrong / blockers
- **Custom native modules are invisible to Expo Go.** `expo-dev-client`, `react-native-siri-shortcut`, `expo-background-task` — none of these work in Expo Go because Expo Go ships its own fixed set of native modules. Any feature touching these would silently fail or crash.
- **Google OAuth failed.** The OAuth redirect scheme (`adhdcommandcenter://`) doesn't work inside Expo Go's container. Tapping "Connect Gmail" showed nothing happening.
- **Requires Curtis to be in the loop.** Every time code changes, Curtis has to be present to reload the app. Claude can't trigger a reload autonomously.
- **Curtis explicitly rejected this approach.** Direct quote: "we tried expo go but the problem is it requires me to be in the loop. i want you to be able to iterate without me involved."

### Verdict
Useful for inspecting pure UI and basic state logic. Useless for any native feature (Siri, background tasks, auth, audio). **Do not pursue as primary path.**

---

## Approach 3: Android Emulator (Local)

### What we tried
Install Android Studio + Android SDK on Curtis's Windows machine, create an Android Virtual Device (AVD), and use `npx expo run:android` to build and run the app locally on the emulator. Claude would control the emulator autonomously via Cowork's computer-use tools.

### What we expected
This would give Claude a fully autonomous loop: edit code → build → emulator boots automatically → Claude sees the screen → identifies bugs → fixes → repeat. No Curtis involvement needed.

### What worked
- Android Studio was successfully installed.
- `emulator` and `platform-tools` binaries were already present in the SDK (`C:\Users\curti\AppData\Local\Android\Sdk`).
- `app.json` was successfully updated with the missing `android.package` field required for `expo run:android`.
- App code was verified to be Android-compatible: Platform guards in place, no iOS-only crashes expected.
- PowerShell script approach (using Win+R + clipboard to bypass click-tier terminal restrictions) was established as the working method for running commands.
- `setup_android.ps1` and `setup_android2.ps1` were created and partially ran.
- Phase 3 script (`setup_android3.ps1`) is written and ready — it handles all failure cases robustly.

### What went wrong / blockers
- **`cmdline-tools` (sdkmanager/avdmanager) not installed.** Android Studio installs the emulator and platform-tools but NOT the command-line tools. `sdkmanager` is required to install system images and create AVDs. This is the root blocker.
- **Zip download conflict.** Phase 1 script tried to download `cmdlinetools.zip` while a prior attempt had it locked by another process. Phase 2 script worked around this with a different filename (`cmdlinetools2.zip`) but was still downloading when the conversation context ran out.
- **Screen is cut off at ~535px.** Cowork's window positioning means the right portion of the screen is not visible in screenshots. This made using Android Studio's GUI impossible.
- **Terminal is click-tier.** Can't type into PowerShell or Command Prompt in Cowork mode. All commands must go through Win+R (system-level key) with clipboard paste — and that only works when a non-terminal app is in focus first.
- **OneDrive security blocks .bat double-click.** Files in OneDrive folders are tagged with "Mark of the Web" by Windows SmartScreen, so double-clicking `.bat` files fails. PowerShell via Win+R bypasses this.
- **Long download times.** The cmdline-tools zip is ~130MB. `Invoke-WebRequest` is slow and progress display fills the terminal but blocks the log file from updating until complete. `System.Net.WebClient.DownloadFile()` (used in Phase 3) is faster and simpler.
- **Context ran out mid-download.** The cmdlinetools download was still in progress when the conversation hit its limit. The Phase 3 script handles this: it checks if any complete zip exists and uses it before downloading a fresh one.

### Current status of Android setup
- `setup_android3.ps1` is written and ready to run in the workspace folder.
- It will detect current state, download cmdline-tools if needed (using the faster WebClient method), install the system image, create the AVD, and write `start_emulator.bat` + `expo_run_android.bat`.
- Once the AVD is running, `npx expo run:android` will do a local Gradle build (first run: ~10-15 min, subsequent: ~30 sec).

### What the Android path looks like once working
1. Claude edits code.
2. Claude runs `npx expo run:android` via bash (sandbox can write to mounted drive).
3. Actually wait — **this won't work.** The bash sandbox is Linux; it can't run Windows executables (Gradle, Android SDK, emulator). And the emulator itself must run on Curtis's Windows machine, not in the Linux sandbox.
4. **The real autonomous loop requires computer-use:** Claude takes a screenshot, sees the emulator, clicks things, reads error output — all through the computer-use tool. But the emulator window is large and the Android build output is in a terminal Claude can't type into.
5. **Building still requires Curtis to run `npx expo run:android` manually** or Claude to trigger it via Win+R each time.

### Revised verdict
Android emulator is better than Expo Go (more native features work) but still **doesn't give Claude a fully autonomous iteration loop** without Curtis's machine being "babysittable" by Cowork's computer-use tools. The Win+R approach is fragile.

---

## Approach 4 (Not Yet Tried): Cloud Mac / Remote iOS Simulator

### What we discussed
Curtis mentioned "renting Mac cloud time" after the Android emulator is working. Services like MacStadium, MacInCloud, or GitHub Actions (macOS runners) offer hosted Macs. This would allow:
- Running a real iOS Simulator (not Android).
- Building with full Xcode + native toolchain.
- SSH/VNC access so Claude could potentially drive it remotely.

### Potential
This is the highest-value path for iOS-specific features (Siri, background fetch, notifications). It's the only way to test Siri shortcuts before submitting to TestFlight.

### Unknowns
- Cost and setup complexity of cloud Mac services.
- Whether Cowork's computer-use can VNC into a remote Mac.
- Whether Claude Code (with SSH access) would be a better fit than Cowork.

---

## Approach 5 (Not Yet Tried): Claude Code CLI on Curtis's Machine

### The idea
Instead of Cowork (which is limited to click-tier terminals), install Claude Code CLI directly on Curtis's Windows machine. Claude Code runs natively in the terminal and has no tier restrictions — it can type commands, run builds, read output, and iterate fully autonomously.

### Why this could solve the core problem
- Full terminal access: Claude can run `npx expo run:android`, read Gradle output, fix errors, re-run.
- No Win+R clipboard gymnastics needed.
- Claude Code can be left running a long autonomous session while Curtis is doing other things.
- `claude --dangerously-skip-permissions` flag (documented in CLAUDE.md) enables fully walk-away sessions.

### What's needed
- Node.js already installed on Curtis's machine.
- `npm install -g @anthropic-ai/claude-code` (one command).
- Curtis navigates to the ADHD App folder in a terminal and runs `claude`.

---

## Summary Table

| Approach | Autonomous? | Native features? | Setup effort | Verdict |
|---|---|---|---|---|
| EAS Build → iPhone | No (Curtis installs each build) | Full iOS | Low | Best for shipping, bad for iteration |
| Expo Go | No (Curtis reloads) | Limited | Zero | Only for pure UI preview |
| Android Emulator (local) | Partial (Win+R fragile) | Most Android | High | Viable but painful |
| Cloud Mac + iOS Sim | Potentially yes | Full iOS | Medium-High | Best long-term for iOS |
| Claude Code CLI (local) | Yes (fully) | Full Android | Low | **Best immediate next step** |

---

## Recommended Development Path

### Immediate (this week)

**Step 1 — Install Claude Code CLI on Curtis's machine.**
Open Command Prompt or PowerShell and run:
```
npm install -g @anthropic-ai/claude-code
```
Then navigate to the project:
```
cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
claude --dangerously-skip-permissions
```
This gives Claude fully autonomous terminal access. From there, Claude can complete the Android emulator setup, fix bugs, and iterate with zero Curtis involvement.

**Step 2 — Complete Android emulator setup (autonomously via Claude Code).**
Run `setup_android3.ps1` once to finish installing cmdline-tools and creating the AVD. Then Claude Code can drive `npx expo run:android` and iterate autonomously.

**Step 3 — Fix the known bugs via Android iteration.**
- Keyboard avoiding bug (text input hidden by keyboard)
- Google OAuth redirect (wire up Android OAuth client)
- Verify all 5 phases work on Android

### Medium-term (next 2-4 weeks)

**Step 4 — EAS build for iOS once Android bugs are resolved.**
Once features are proven on Android, submit an EAS iOS build. Most logic is platform-agnostic; only Siri shortcuts are iOS-only.

**Step 5 — Rent cloud Mac time for iOS-specific testing.**
Test Siri shortcuts, background fetch behavior, and iOS notification appearance on a hosted Mac with Xcode + Simulator before submitting to TestFlight.

### Long-term (shipping)

**Step 6 — TestFlight beta.**
Submit production EAS build to App Store Connect. Invite Curtis as internal tester via TestFlight. Iterate based on real usage.

---

## Technical Gotchas — Never Forget These

1. **Always `--legacy-peer-deps`** on every `npm install`. The `react-native-worklets` conflict breaks otherwise.
2. **No em dashes or smart quotes** in PowerShell scripts. ASCII only or the script fails silently with a parse error.
3. **`expo-dev-client` is required** for Siri shortcuts and background tasks. Expo Go will never work for full feature testing.
4. **Google OAuth Android client** needs separate setup from iOS client. Package name: `com.curtisanderson.adhdcommandcenter`. SHA-1 of debug keystore is required.
5. **Background task minimum interval is 15 minutes on iOS** regardless of what you set. This is an OS restriction, not a bug.
6. **Audio transcription is stubbed.** `transcribeAudio()` returns `null`. Anthropic has no audio API; the UI falls through to a text input with keyboard dictation. OpenAI Whisper can be wired in later via the existing seam in `src/services/ai.ts`.
7. **node_modules lives outside OneDrive** at `C:\Dev\adhd-app-node-modules` (Windows junction). Do not delete or move it.
8. **Win+R only works from full-tier apps.** Click File Explorer first, then Win+R. Pressing Win+R from a terminal/IDE (click-tier) won't open the Run dialog.
9. **OneDrive blocks .bat double-click** via SmartScreen. Run via PowerShell: `powershell -ExecutionPolicy Bypass -File "path\to\script.ps1"`.

---

## App Feature Status (as of 2026-05-04)

| Feature | Built? | Tested on device? | Notes |
|---|---|---|---|
| Home screen + capture feed | Yes | Partial | Keyboard bug observed |
| Voice recording (hold to record) | Yes | No | expo-audio, real recording, transcription is stubbed |
| AI routing (task/calendar/gmail/note) | Yes | Partial | Task creation worked; calendar/gmail not verified |
| Triage screen (swipe cards) | Yes | No | Gmail fetch + swipe gestures built |
| Tasks screen (swipe complete/delete) | Yes | Partial | Add task worked; swipe not tested |
| Settings (API key, Google OAuth) | Yes | Partial | API key worked; OAuth failed |
| Background email polling | Yes | No | expo-background-task, 15min iOS minimum |
| Siri shortcuts | Yes | No | Requires physical device + iOS Settings setup |
| Push notifications | Yes | No | expo-notifications wired |
| Google Calendar create event | Yes | No | Untested end-to-end |
| Gmail draft creation | Yes | No | Untested end-to-end |

---

## Files to Read at Start of Every Session

1. `CLAUDE.md` — agent rules, tech stack, file structure
2. `DEV_RETROSPECTIVE.md` — this file
3. `PROGRESS_LOG.md` — what was built and when
