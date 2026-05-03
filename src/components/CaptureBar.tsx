/**
 * CaptureBar — the persistent bottom voice/text input strip.
 * Voice recognition requires a dev build; text input works in Expo Go.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as Speech from 'expo-speech';
import { colors, spacing, radius } from '../theme';
import { processVoiceInput } from '../services/ai';
import { useAppStore } from '../store';
import { createDraft } from '../services/gmail';
import { createEvent } from '../services/calendar';
import { getSavedEmail } from '../services/auth';
import type { CapturedAction } from '../types';

export function CaptureBar() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);

  const { settings, addCapture, updateCapture } = useAppStore();

  // ── Process transcript / text ────────────────────────────────────────────

  const processTranscript = async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);

    try {
      const actions = await processVoiceInput(text, settings.anthropicKey);

      for (const action of actions) {
        await addCapture(action);
        await routeAction(action);
      }

      // Read back confirmation
      const confirmation = actions.map((a) => a.confirmationText).join('. ');
      Speech.speak(confirmation, { language: 'en-US', rate: 1.0 });
    } catch (e: any) {
      Alert.alert('AI Error', e.message ?? 'Failed to process input.');
    } finally {
      setIsProcessing(false);
      setTextInput('');
      setShowTextInput(false);
    }
  };

  // ── Route action to Gmail / Calendar / Tasks ─────────────────────────────

  const routeAction = async (action: CapturedAction) => {
    try {
      if (action.type === 'gmail_draft' && action.title) {
        const fromEmail = (await getSavedEmail()) ?? '';
        const result = await createDraft({
          to: action.recipientEmail ?? undefined,
          subject: action.title,
          body: action.body ?? '',
          fromEmail,
        });
        await updateCapture(action.id, {
          routedTo: `Gmail draft (${result.draftId})`,
          status: 'routed',
        });
      }

      if (action.type === 'calendar_event' && action.date) {
        const result = await createEvent({
          title: action.title,
          startDate: new Date(action.date),
          durationMinutes: action.durationMinutes ?? 60,
          notes: action.body,
        });
        await updateCapture(action.id, {
          routedTo: `Calendar: ${result.eventId}`,
          status: 'routed',
        });
      }

      if (action.type === 'task' || action.type === 'note') {
        await updateCapture(action.id, { routedTo: 'In-app', status: 'routed' });
      }
    } catch (e: any) {
      console.warn('Routing error:', e.message);
    }
  };

  const onMicPress = useCallback(() => {
    Alert.alert(
      'Voice Input',
      'Voice recognition requires a development build. Use the "Type" button to capture thoughts via text — it works the same way!',
      [
        { text: 'Got it', style: 'cancel' },
        { text: 'Type instead', onPress: () => setShowTextInput(true) },
      ]
    );
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {showTextInput ? (
        <View style={styles.textRow}>
          <TextInput
            style={styles.input}
            placeholder="Type anything on your mind…"
            placeholderTextColor={colors.textMuted}
            value={textInput}
            onChangeText={setTextInput}
            onSubmitEditing={() => processTranscript(textInput)}
            returnKeyType="done"
            autoFocus
            multiline
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={() => processTranscript(textInput)}
            disabled={!textInput.trim() || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendIcon}>→</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => setShowTextInput(false)}
          >
            <Text style={styles.cancelIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.typeBtn}
            onPress={() => setShowTextInput(true)}
          >
            <Text style={styles.typeBtnText}>Type</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.micBtn}
            onPress={onMicPress}
            disabled={isProcessing}
          >
            <Text style={styles.micIcon}>🎙</Text>
          </TouchableOpacity>

          <View style={styles.typeBtn} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13132a',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingTop: 12,
    paddingHorizontal: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  micIcon: {
    fontSize: 28,
  },
  typeBtn: {
    width: 60,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIcon: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
