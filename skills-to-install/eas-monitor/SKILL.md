---
name: eas-monitor
description: Check EAS build status for the ADHD Command Center iOS app. Use this skill whenever the user asks anything about their Expo/EAS build — whether it finished, whether it passed or failed, what the IPA download link is, what error killed the build, how long it's been running, or how many builds are left in the session cap. Trigger on phrases like "check my build", "is the build done", "did it pass", "what's the build status", "what happened to the build", "get the IPA link", "build failed?", "EAS status", "check expo", "how's the build going", "any build errors". Always use this skill rather than asking the user to check expo.dev themselves.
---

# EAS Build Monitor

You are checking the status of EAS (Expo Application Services) iOS builds for the ADHD Command Center project.

## Project context

- **Expo account:** ander315
- **Project slug:** adhd-command-center
- **EAS Project ID:** 1af8df19-af7b-493c-ad94-7bb4b3d85075
- **Platform:** iOS only (development profile)
- **Build cap:** 3 EAS builds per Claude Code session — always show how many have been used
- **Build dashboard:** https://expo.dev/accounts/ander315/projects/adhd-command-center/builds

## How to check build status

Run this command to get the last 5 iOS builds as JSON:

```bash
cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
npx --yes eas-cli build:list --platform ios --limit 5 --non-interactive --json 2>/dev/null
```

In Claude Code (bash is native), this just works. In Cowork (bash sandbox), if it times out, fall back to telling the user to check the dashboard URL above and ask them to paste the build ID — then use `eas-cli build:view <id> --json` to get details.

## Parsing the output

The JSON is an array of build objects. For each build, the key fields are:

| Field | Meaning |
|-------|---------|
| `id` | Build UUID — use for `build:view` |
| `status` | `IN_QUEUE`, `IN_PROGRESS`, `FINISHED`, `ERRORED`, `CANCELED` |
| `createdAt` | ISO timestamp when submitted |
| `updatedAt` | ISO timestamp of last update |
| `artifacts.buildUrl` | IPA download URL (only present when `FINISHED`) |
| `error.message` | Error message (only present when `ERRORED`) |
| `error.errorCode` | Machine-readable error code |
| `buildProfile` | `development`, `preview`, or `production` |

## Output format

Always respond with a clean status block. Use these status badges:

- `🟡 IN QUEUE` — waiting for a builder
- `🔵 BUILDING` — actively running (~15-20 min total)
- `✅ FINISHED` — success, IPA ready
- `❌ FAILED` — errored out
- `⬜ CANCELED` — manually canceled

### Template for most recent build:

```
**Build #N** (of 3 this session)
[STATUS BADGE] — [profile] build | Started [relative time, e.g. "14 min ago"]

Build ID: [id]
Dashboard: https://expo.dev/accounts/ander315/projects/adhd-command-center/builds/[id]
```

If FINISHED, add:
```
📦 IPA: [artifacts.buildUrl]
```

If ERRORED, add:
```
💥 Error: [error.message]
Error code: [error.errorCode]

[Brief diagnosis of what likely caused it and what to try next, based on known failure patterns below]
```

If IN_PROGRESS, add:
```
⏱ Elapsed: [time since createdAt] (typically 15-20 min total)
```

Then show a summary table of all recent builds below.

## Known failure patterns and fixes

Use these to give actionable guidance when a build fails:

| Error pattern | Root cause | Fix |
|---------------|-----------|-----|
| `npm error Missing: X from lock file` | package.json has a dep not in package-lock.json (lockfile mismatch) | Revert the stray dep or run `npm install --legacy-peer-deps` to sync the lockfile, then resubmit |
| Build fails in < 60 seconds at "Install dependencies" | Almost always a lockfile mismatch or null bytes | Run null-byte pre-flight check, then check `git diff package.json` for unstaged additions |
| Build fails in < 60 seconds at "Run expo prebuild" | Null bytes in app.json, package.json, eas.json, or tsconfig.json | Run the null-byte fix from CLAUDE.md |
| `"newArchEnabled": true` conflict | react-native-siri-shortcut incompatible with New Architecture | Set `newArchEnabled: false` in app.json |
| Certificate / provisioning errors | EAS credentials need refresh | Run `npx eas-cli credentials` and follow prompts |
| `@config-plugins/react-native-siri-shortcut` not found | That plugin isn't on EAS — it was removed | Do NOT add it back to app.json plugins |

## Null-byte pre-flight check (run before any new build)

```bash
python3 -c "
for f in ['app.json', 'package.json', 'eas.json', 'tsconfig.json']:
    try:
        d = open(f,'rb').read()
        n = d.count(b'\x00')
        print(f'{f}: {n} null bytes' + (' <-- FIX' if n else ' OK'))
    except FileNotFoundError:
        print(f'{f}: NOT FOUND')
"
```

## Session build cap tracking

The cap is **3 EAS builds per Claude Code session**. When reporting status, always note:
- How many builds you can see in the list (as a proxy for session usage)
- Whether the cap has been reached
- If 2 consecutive builds failed on the same error, recommend stopping even before hitting 3

## Latest known good build

As of 2026-05-04: commit `edb3b6af` → IPA at https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa  
Most recent OAuth-fix build: commit `a1a883d7` — check current status before assuming this is available.
