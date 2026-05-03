# Siri Shortcuts Setup

Siri integration requires a one-time native module configuration after running `expo prebuild`.

## Step 1 — Prebuild (generates native iOS project)

```bash
npx expo prebuild --platform ios
```

This creates the `ios/` folder with the Xcode project.

## Step 2 — Install react-native-siri-shortcut

```bash
npm install react-native-siri-shortcut
cd ios && pod install && cd ..
```

## Step 3 — Add the intent definitions

In Xcode, open `ios/adhdcommandcenter.xcworkspace`.

1. File → New → File → SiriKit Intent Definition File
2. Name it `ADHDIntents.intentdefinition`
3. Add these three intents:

### Intent 1: Log a Thought
- **Class name:** LogThoughtIntent
- **Title:** Log a Thought
- **Description:** Capture anything on your mind
- **Parameter:** `thought` (String, required)
- **Suggested Invocation:** "Log a thought"

### Intent 2: Add a Task  
- **Class name:** AddTaskIntent
- **Title:** Add a Task
- **Parameter:** `task` (String, required)
- **Suggested Invocation:** "Add a task"

### Intent 3: Open Email Triage
- **Class name:** OpenTriageIntent
- **Title:** Open Email Triage
- **Suggested Invocation:** "Show my emails"

## Step 4 — Add entitlements

In Xcode → adhdcommandcenter target → Signing & Capabilities:
- Click + Capability → Add "Siri"
- This adds Siri entitlement to `adhdcommandcenter.entitlements`

## Step 5 — Wire up in AppDelegate

In `ios/adhdcommandcenter/AppDelegate.mm`, add:

```objc
#import <Intents/Intents.h>

- (BOOL)application:(UIApplication *)application 
  continueUserActivity:(NSUserActivity *)userActivity 
  restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *))restorationHandler {
  return [RCTLinkingManager application:application
                   continueUserActivity:userActivity
                     restorationHandler:restorationHandler];
}
```

## Step 6 — Register shortcuts in the app

In `src/services/siri.ts` (see the file), call `registerShortcuts()` on app launch.

## Step 7 — Build and test

```bash
npx expo run:ios
```

Or use EAS Build to build from Windows:
```bash
npx eas-cli build --platform ios --profile development
```

## Siri phrases to try on your phone

After adding shortcuts in Settings → Siri & Search → ADHD Command Center:

| Say... | Does... |
|--------|---------|
| "Hey Siri, log a thought" | Opens mic, captures your voice |
| "Hey Siri, add a task" | Quick task capture |
| "Hey Siri, show my emails" | Opens triage screen |
