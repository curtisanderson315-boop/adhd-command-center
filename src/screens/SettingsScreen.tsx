import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store';
import { useGoogleAuth, exchangeCodeForTokens, signOut, getSavedEmail, isSignedIn } from '../services/auth';
import { colors, spacing, radius, typography } from '../theme';

type TestResult = 'idle' | 'testing' | 'ok' | 'fail';

const TRIAGE_INTERVALS: Array<{ minutes: number; label: string }> = [
  { minutes: 5, label: '5m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 0, label: 'Manual' },
];

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { settings, updateSettings } = useAppStore();
  const [apiKey, setApiKey] = useState(settings.anthropicKey);
  const [editingKey, setEditingKey] = useState(!settings.anthropicKey);
  const [testStatus, setTestStatus] = useState<TestResult>('idle');
  const [openaiKey, setOpenaiKey] = useState(settings.openaiKey);
  const [editingOpenaiKey, setEditingOpenaiKey] = useState(!settings.openaiKey);
  const [openaiTestStatus, setOpenaiTestStatus] = useState<TestResult>('idle');
  const [signedIn, setSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const { request, response, promptAsync } = useGoogleAuth();
  console.log('[Settings] OAuth request ready:', !!request);

  useEffect(() => {
    (async () => {
      const signed = await isSignedIn();
      setSignedIn(signed);
      const email = await getSavedEmail();
      setUserEmail(email ?? '');
    })();
  }, []);

  // Handle OAuth response
  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const { code } = response.params;
      const verifier = request?.codeVerifier ?? '';
      exchangeCodeForTokens(code, verifier)
        .then(({ accessToken, refreshToken, email }) => {
          updateSettings({
            googleAccessToken: accessToken,
            googleRefreshToken: refreshToken,
            googleTokenExpiry: Date.now() + 3600 * 1000,
            userEmail: email,
          });
          setSignedIn(true);
          setUserEmail(email);
          Alert.alert('Connected!', `Signed in as ${email}`);
        })
        .catch((e) => {
          console.error('[Settings] Token exchange error:', e?.message ?? e);
          Alert.alert('Sign-in failed', e?.message ?? 'Unknown error. Check your network and try again.');
        });
    } else if (response.type === 'error') {
      // Capture the real Google error for diagnosis
      const code = (response as any).error?.code
        ?? (response as any).params?.error
        ?? 'unknown_error';
      const description = (response as any).params?.error_description
        ?? (response as any).error?.message
        ?? '';
      console.error('[Settings] OAuth error:', code, description);
      Alert.alert(
        'Sign-in failed',
        description || `Google returned an error: ${code}. Make sure you have a network connection and try again.`
      );
    } else if (response.type === 'dismiss') {
      // User cancelled -- no alert needed
      console.log('[Settings] OAuth dismissed by user');
    }
  }, [response]);

  const handleSaveApiKey = async () => {
    const trimmed = apiKey.trim();
    await updateSettings({ anthropicKey: trimmed });
    setApiKey(trimmed);
    setEditingKey(false);
    setTestStatus('idle');
  };

  const handleSaveOpenaiKey = async () => {
    const trimmed = openaiKey.trim();
    await updateSettings({ openaiKey: trimmed });
    setOpenaiKey(trimmed);
    setEditingOpenaiKey(false);
    setOpenaiTestStatus('idle');
  };

  const handleTestOpenaiKey = async () => {
    const key = openaiKey.trim();
    if (!key) {
      Alert.alert('Add a key first', 'Paste your OpenAI key, save, then test.');
      return;
    }
    setOpenaiTestStatus('testing');
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        setOpenaiTestStatus('ok');
        if (key !== settings.openaiKey) {
          await updateSettings({ openaiKey: key });
        }
      } else {
        setOpenaiTestStatus('fail');
      }
    } catch {
      setOpenaiTestStatus('fail');
    }
  };

  const handleTestApiKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      Alert.alert('Add a key first', 'Paste your Anthropic key, save, then test.');
      return;
    }
    setTestStatus('testing');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Say "ok".' }],
        }),
      });
      if (res.ok) {
        setTestStatus('ok');
        if (key !== settings.anthropicKey) {
          await updateSettings({ anthropicKey: key });
        }
      } else {
        setTestStatus('fail');
      }
    } catch {
      setTestStatus('fail');
    }
  };

  const handleNotificationsToggle = async (enabled: boolean) => {
    if (enabled) {
      const perm = await Notifications.getPermissionsAsync();
      if (!perm.granted) {
        const req = await Notifications.requestPermissionsAsync();
        if (!req.granted) {
          Alert.alert(
            'Notifications denied',
            'Open iOS Settings → ADHD Command Center → Notifications to enable them.'
          );
          return;
        }
      }
    }
    await updateSettings({ notificationsEnabled: enabled });
  };

  const handleSignOut = async () => {
    Alert.alert('Sign out of Google?', 'You will need to sign back in to access Gmail and Calendar.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setSignedIn(false);
          setUserEmail('');
          await updateSettings({ googleAccessToken: '', googleRefreshToken: '' });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        {/* ── Google Account ─────────────────────────────────────────── */}
        <Section title="GOOGLE ACCOUNT">
          {signedIn ? (
            <View style={styles.connectedRow}>
              <View>
                <Text style={styles.connectedLabel}>✅ Connected</Text>
                <Text style={styles.connectedEmail}>{userEmail}</Text>
              </View>
              <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={() => {
                console.log('[Settings] promptAsync called');
                promptAsync()
                  .then((result) => console.log('[Settings] promptAsync result:', JSON.stringify(result)))
                  .catch((e) => {
                    console.error('[Settings] promptAsync error:', e?.message ?? e);
                    Alert.alert('Sign-in error', e?.message ?? 'Unknown error');
                  });
              }}
              disabled={!request}
            >
              <Text style={styles.googleBtnText}>Connect Gmail + Calendar</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.hint}>
            Required for creating Gmail drafts and Calendar events. The app never sends emails without your approval.
          </Text>
        </Section>

        {/* ── AI / Anthropic ────────────────────────────────────────── */}
        <Section title="AI (CLAUDE / ANTHROPIC)">
          <Text style={styles.hint}>
            Get your API key at console.anthropic.com → API Keys. Claude Sonnet is used for voice capture, Claude Haiku for fast email triage.
          </Text>

          {!editingKey && settings.anthropicKey ? (
            <View style={styles.savedKeyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedKeyLabel}>Saved key</Text>
                <Text style={styles.savedKeyValue}>{maskKey(settings.anthropicKey)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setEditingKey(true);
                  setApiKey(settings.anthropicKey);
                }}
                style={styles.linkBtn}
              >
                <Text style={styles.linkBtnText}>Replace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="sk-ant-..."
                placeholderTextColor={colors.textMuted}
                value={apiKey}
                onChangeText={(v) => {
                  setApiKey(v);
                  setTestStatus('idle');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveApiKey}>
                <Text style={styles.saveBtnText}>Save API Key</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleTestApiKey}
            disabled={testStatus === 'testing'}
          >
            {testStatus === 'testing' ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.secondaryBtnText}>
                {testStatus === 'ok'
                  ? '✅ Connected'
                  : testStatus === 'fail'
                  ? '❌ Test failed — check the key'
                  : 'Test connection'}
              </Text>
            )}
          </TouchableOpacity>
        </Section>

        {/* ── OpenAI / Whisper ──────────────────────────────────────── */}
        <Section title="VOICE TRANSCRIPTION (OPENAI WHISPER)">
          <Text style={styles.hint}>
            Get your API key at platform.openai.com → API Keys. Used only for transcribing voice recordings (~$0.006/min). Leave blank to fall back to the iOS keyboard mic.
          </Text>

          {!editingOpenaiKey && settings.openaiKey ? (
            <View style={styles.savedKeyRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedKeyLabel}>Saved key</Text>
                <Text style={styles.savedKeyValue}>{maskKey(settings.openaiKey)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setEditingOpenaiKey(true);
                  setOpenaiKey(settings.openaiKey);
                }}
                style={styles.linkBtn}
              >
                <Text style={styles.linkBtnText}>Replace</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="sk-..."
                placeholderTextColor={colors.textMuted}
                value={openaiKey}
                onChangeText={(v) => {
                  setOpenaiKey(v);
                  setOpenaiTestStatus('idle');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveOpenaiKey}>
                <Text style={styles.saveBtnText}>Save API Key</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={handleTestOpenaiKey}
            disabled={openaiTestStatus === 'testing'}
          >
            {openaiTestStatus === 'testing' ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Text style={styles.secondaryBtnText}>
                {openaiTestStatus === 'ok'
                  ? '✅ Connected'
                  : openaiTestStatus === 'fail'
                  ? '❌ Test failed — check the key'
                  : 'Test connection'}
              </Text>
            )}
          </TouchableOpacity>
        </Section>

        {/* ── Triage settings ───────────────────────────────────────── */}
        <Section title="EMAIL TRIAGE">
          <View style={styles.intervalGroup}>
            <Text style={styles.rowLabel}>Auto-check interval</Text>
            <View style={styles.segmented}>
              {TRIAGE_INTERVALS.map(({ minutes, label }) => {
                const active = settings.triageIntervalMinutes === minutes;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.segment, active && styles.segmentActive]}
                    onPress={() => updateSettings({ triageIntervalMinutes: minutes })}
                  >
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <Row label="Push notifications">
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: colors.border, true: colors.purple }}
              thumbColor="#fff"
            />
          </Row>
        </Section>

        {/* ── Siri setup ────────────────────────────────────────────── */}
        <Section title="SIRI SHORTCUTS">
          <Text style={styles.hint}>
            After building the app with EAS Build, go to Settings → Siri & Search → ADHD Command Center to add Siri shortcuts. Suggested phrases:{'\n\n'}
            • "Log a thought"{'\n'}
            • "Add a task"{'\n'}
            • "Show my emails"
          </Text>
        </Section>

        <Text style={styles.version}>ADHD Command Center v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  title: { ...typography.h1, marginBottom: spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { ...typography.label, marginBottom: spacing.xs },
  sectionContent: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: { ...typography.bodyMuted, fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: 'monospace',
  },
  saveBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    minHeight: 48,
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  savedKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  savedKeyLabel: { ...typography.label, marginBottom: 2 },
  savedKeyValue: {
    fontFamily: 'monospace',
    fontSize: 16,
    color: colors.textPrimary,
  },
  linkBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkBtnText: {
    color: colors.purple,
    fontSize: 16,
    fontWeight: '600',
  },
  intervalGroup: { gap: spacing.sm },
  googleBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  googleBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  connectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectedLabel: { ...typography.body, fontWeight: '700' },
  connectedEmail: { ...typography.caption },
  signOutBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.error,
  },
  signOutText: { color: colors.error, fontWeight: '600', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { ...typography.body },
  segmented: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  segmentText: { color: colors.textMuted, fontWeight: '600', fontSize: 16 },
  segmentTextActive: { color: '#fff' },
  version: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
});
