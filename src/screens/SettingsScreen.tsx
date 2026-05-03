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
} from 'react-native';
import { useAppStore } from '../store';
import { useGoogleAuth, exchangeCodeForTokens, signOut, getSavedEmail, isSignedIn } from '../services/auth';
import { colors, spacing, radius, typography } from '../theme';

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
  const [signedIn, setSignedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const { request, response, promptAsync } = useGoogleAuth();

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
    if (response?.type === 'success') {
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
        .catch((e) => Alert.alert('Sign-in failed', e.message));
    }
  }, [response]);

  const handleSaveApiKey = async () => {
    await updateSettings({ anthropicKey: apiKey.trim() });
    Alert.alert('Saved', 'Anthropic API key saved.');
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
              onPress={() => promptAsync()}
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
          <TextInput
            style={styles.input}
            placeholder="sk-ant-..."
            placeholderTextColor={colors.textMuted}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveApiKey}>
            <Text style={styles.saveBtnText}>Save API Key</Text>
          </TouchableOpacity>
        </Section>

        {/* ── Triage settings ───────────────────────────────────────── */}
        <Section title="EMAIL TRIAGE">
          <Row label="Auto-check interval">
            <View style={styles.segmented}>
              {[15, 30, 60].map((min) => (
                <TouchableOpacity
                  key={min}
                  style={[
                    styles.segment,
                    settings.triageIntervalMinutes === min && styles.segmentActive,
                  ]}
                  onPress={() => updateSettings({ triageIntervalMinutes: min })}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      settings.triageIntervalMinutes === min && styles.segmentTextActive,
                    ]}
                  >
                    {min}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Row>
          <Row label="Push notifications">
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => updateSettings({ notificationsEnabled: v })}
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
  hint: { ...typography.caption, lineHeight: 18 },
  input: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  saveBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  googleBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  googleBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
  signOutText: { color: colors.error, fontWeight: '600', fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { ...typography.body },
  segmented: { flexDirection: 'row', gap: spacing.xs },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  segmentText: { color: colors.textMuted, fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#fff' },
  version: { ...typography.caption, textAlign: 'center', marginTop: spacing.xl },
});
