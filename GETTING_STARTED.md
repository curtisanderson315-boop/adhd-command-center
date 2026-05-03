# Getting Started — ADHD Command Center

## Prerequisites

Install these on your Windows machine first:

- **Node.js 20+** — https://nodejs.org
- **VS Code** — https://code.visualstudio.com
- **Expo CLI** — `npm install -g expo-cli eas-cli`
- **iPhone** with the **Expo Go** app installed (for quick preview)

---

## Step 1 — Install dependencies

Open this folder in VS Code, then open a terminal (Ctrl+`) and run:

```bash
npm install
```

---

## Step 2 — Get your API keys

### OpenAI API Key
1. Go to https://platform.openai.com/api-keys
2. Create a key — copy it
3. You'll paste it in the app's Settings screen

### Google Cloud Project (for Gmail + Calendar)
1. Go to https://console.cloud.google.com/
2. Create a new project named "ADHD Command Center"
3. Enable these two APIs:
   - Gmail API
   - Google Calendar API
4. Go to Credentials → Create → OAuth 2.0 Client ID
   - Application type: **iOS**
   - Bundle ID: `com.curtisanderson.adhdcommandcenter`
5. Copy the Client ID
6. Open `src/services/auth.ts` and paste it where it says `YOUR_GOOGLE_IOS_CLIENT_ID`

---

## Step 3 — Run on your iPhone (quick preview)

```bash
npx expo start
```

Scan the QR code with the **Expo Go** app on your iPhone.

> ⚠️ Some features (Siri, background refresh, push notifications) require a full build — see Step 4.

---

## Step 4 — Build a full iOS app (no Mac needed)

EAS Build lets you build a real iOS app from Windows using Anthropic's cloud builders.

```bash
# Login to Expo
npx eas-cli login

# Configure build (first time only)
npx eas-cli build:configure

# Build for iOS
npx eas-cli build --platform ios --profile development
```

You'll get a link to download the `.ipa` — install it on your phone via TestFlight.

---

## Step 5 — Configure the app

1. Open the app → tap **Settings** (⚙️)
2. Tap **Connect Gmail + Calendar** → sign in with your Google account
3. Paste your **OpenAI API key**
4. Done — try the mic button!

---

## How to use it

### Capture a thought
- Tap the 🎙 button (or say "Hey Siri, log a thought")
- Say whatever's on your mind — rambling is fine
- The AI figures out if it's a task, calendar event, or email draft

### Triage your inbox
- Tap 📥 Triage tab
- Tap **Check now** to load your unread emails
- For each email: one summary, one tap to act

### Tasks
- Voice captures that become tasks appear here automatically
- Today / Upcoming / Someday buckets
- Tap to complete, long-press to delete

---

## Project structure

```
ADHD App/
├── App.tsx                     ← Root navigation
├── app.json                    ← Expo config + permissions
├── package.json
├── src/
│   ├── types/index.ts          ← All TypeScript types
│   ├── store/index.ts          ← Zustand state (persisted)
│   ├── theme.ts                ← Colors, spacing, typography
│   ├── services/
│   │   ├── ai.ts               ← AI engine (voice + email triage)
│   │   ├── auth.ts             ← Google OAuth2
│   │   ├── gmail.ts            ← Gmail API
│   │   ├── calendar.ts         ← Google Calendar API
│   │   ├── siri.ts             ← Siri shortcuts bridge
│   │   └── utils.ts            ← Helpers
│   ├── screens/
│   │   ├── HomeScreen.tsx      ← Capture feed
│   │   ├── TriageScreen.tsx    ← Email triage cards
│   │   ├── TasksScreen.tsx     ← Task list
│   │   └── SettingsScreen.tsx  ← Configuration
│   └── components/
│       ├── CaptureBar.tsx      ← Mic + text input strip
│       └── PriorityBadge.tsx   ← Email priority label
└── siri/
    └── README.md               ← Siri native setup guide
```
