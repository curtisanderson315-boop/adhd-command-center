/**
 * CaptureBar — the persistent bottom voice/text input strip.
 *
 * Voice flow:
 *   1. Press-and-hold the mic → expo-audio starts recording
 *   2. Release → attempt transcription via ai.transcribeAudio
 *   3. On null/error → fall back to the text input (iOS keyboard mic still works)
 *
 * Both paths converge on processVoiceInput → store + routing + spoken confirmation.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { colors, spacing, radius } from '../theme';
import { processVoiceInput, transcribeAudio } from '../services/ai';
import { useAppStore } from '../store';
import { createDraft } from '../services/gmail';
import { createEvent } from '../services/calendar';
import { getSavedEmail, isSignedIn } from '../services/auth';
import { nanoid } from '../services/utils';
import type { CapturedAction, Task, Note } from '../types';

export function CaptureBar() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textHint, setTextHint] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const pulse = useSharedValue(0);
  const micScale = useSharedValue(1);

  const { settings, addCapture, updateCapture, addTask, addNote } = useAppStore();

  // Keep pulse animating while recording
  useEffect(() => {
    if (isRecording) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + pulse.value * 0.6,
    transform: [{ scale: 1 + pulse.value * 0.4 }],
  }));

  const micScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micScale.value }],
  }));

  // ── Routing ─────────────────────────────────────────────────────────────

  const routeAction = async (action: CapturedAction) => {
    try {
      if (action.type === 'gmail_draft') {
        const fromEmail = (await getSavedEmail()) ?? '';
        if (!(await isSignedIn())) {
          await updateCapture(action.id, {
            routedTo: 'Saved (Google not connected)',
            status: 'pending',
          });
          return;
        }
        const result = await createDraft({
          to: action.recipientEmail ?? undefined,
          subject: action.title,
          body: action.body ?? '',
          fromEmail,
        });
        await updateCapture(action.id, {
          routedTo: `Gmail draft saved`,
          status: 'routed',
        });
        return;
      }

      if (action.type === 'calendar_event' && action.date) {
        if (!(await isSignedIn())) {
          await updateCapture(action.id, {
            routedTo: 'Saved (Google not connected)',
            status: 'pending',
          });
          return;
        }
        await createEvent({
          title: action.title,
          startDate: new Date(action.date),
          durationMinutes: action.durationMinutes ?? 60,
          notes: action.body,
        });
        await updateCapture(action.id, {
          routedTo: `Added to Calendar`,
          status: 'routed',
        });
        return;
      }

      if (action.type === 'task') {
        const task: Task = {
          id: nanoid(),
          title: action.title,
          notes: action.body ?? undefined,
          bucket: 'today',
          priority: action.priority,
          dueDate: action.date ?? null,
          completed: false,
          createdAt: action.createdAt,
        };
        await addTask(task);
        await updateCapture(action.id, {
          routedTo: 'Added to Today',
          status: 'routed',
        });
        return;
      }

      if (action.type === 'note') {
        const note: Note = {
          id: nanoid(),
          title: action.title,
          body: action.body ?? '',
          createdAt: action.createdAt,
        };
        await addNote(note);
        await updateCapture(action.id, {
          routedTo: 'Saved as note',
          status: 'routed',
        });
      }
    } catch (e: any) {
      console.warn('Routing error:', e?.message ?? e);
      await updateCapture(action.id, {
        routedTo: `Couldn't route — ${e?.message ?? 'unknown error'}`,
        status: 'pending',
      });
    }
  };

  // ── Process transcript / text ──────────────────────────────────────────

  const processTranscript = async (text: string) => {
    if (!text.trim()) return;
    if (!settings.anthropicKey) {
      Alert.alert(
        'Add your Claude API key',
        'Open Settings and paste a key from console.anthropic.com so I can understand your voice notes.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      const actions = await processVoiceInput(text, settings.anthropicKey);

      for (const action of actions) {
        await addCapture(action);
        await routeAction(action);
      }

      const confirmation = actions
        .map((a) => a.confirmationText)
        .filter(Boolean)
        .join('. ');
      if (confirmation) {
        Speech.speak(confirmation, { language: 'en-US', rate: 1.0 });
      }
    } catch (e: any) {
      Alert.alert('Could not understand that', e?.message ?? 'Try again or rephrase.');
    } finally {
      setIsProcessing(false);
      setTextInput('');
      setShowTextInput(false);
      setTextHint(null);
    }
  };

  // ── Recording lifecycle ────────────────────────────────────────────────

  const startRecording = async () => {
    if (isRecording || isProcessing) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone access needed',
          'Open Settings → ADHD Command Center → Microphone to allow voice capture.'
        );
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      micScale.value = withTiming(1.15, { duration: 150 });
      setIsRecording(true);
    } catch (e: any) {
      console.warn('Recording start failed:', e?.message ?? e);
      setIsRecording(false);
    }
  };

  const stopRecording = async (): Promise<string | null> => {
    micScale.value = withTiming(1, { duration: 150 });
    setIsRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      return recorder.uri ?? null;
    } catch (e: any) {
      console.warn('Recording stop failed:', e?.message ?? e);
      return null;
    }
  };

  const onMicPressIn = () => {
    void startRecording();
  };

  const onMicPressOut = async () => {
    if (!isRecording) return;

    const uri = await stopRecording();
    if (!uri) {
      // Permission denied or recorder failed — open text input instead
      setTextHint('Voice capture failed. Type or use the keyboard mic.');
      setShowTextInput(true);
      return;
    }

    setIsProcessing(true);
    try {
      const transcript = await transcribeAudio(uri, settings.anthropicKey);
      if (transcript && transcript.trim()) {
        await processTranscript(transcript);
      } else {
        // No transcription available — fall through to keyboard input.
        // iOS users can tap the keyboard's mic to dictate, which is excellent.
        setTextHint(
          'I recorded that. Tap the keyboard mic to dictate, or type what you said.'
        );
        setShowTextInput(true);
      }
    } catch (e: any) {
      setTextHint('Could not transcribe. Type what you said.');
      setShowTextInput(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {showTextInput ? (
        <View>
          {textHint ? <Text style={styles.hint}>{textHint}</Text> : null}
          <View style={styles.textRow}>
            <TextInput
              style={styles.input}
              placeholder="Type anything on your mind..."
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
              onPress={() => {
                setShowTextInput(false);
                setTextInput('');
                setTextHint(null);
              }}
            >
              <Text style={styles.cancelIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.typeBtn}
            onPress={() => setShowTextInput(true)}
            disabled={isProcessing}
          >
            <Text style={styles.typeBtnText}>Type</Text>
          </TouchableOpacity>

          <View style={styles.micWrap}>
            {isRecording ? (
              <Animated.View style={[styles.recordingRing, pulseStyle]} />
            ) : null}
            <Pressable
              onPressIn={onMicPressIn}
              onPressOut={onMicPressOut}
              disabled={isProcessing}
              hitSlop={12}
            >
              <Animated.View
                style={[
                  styles.micBtn,
                  isRecording && styles.micBtnRecording,
                  micScaleStyle,
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.micIcon}>{isRecording ? '●' : '🎙'}</Text>
                )}
              </Animated.View>
            </Pressable>
            <Text style={styles.micCaption}>
              {isProcessing
                ? 'Thinking...'
                : isRecording
                ? 'Listening...'
                : 'Hold to speak'}
            </Text>
          </View>

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
  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  micBtn: {
    width: 72,
    height: 72,
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
  micBtnRecording: {
    backgroundColor: colors.urgent,
    shadowColor: colors.urgent,
  },
  recordingRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: radius.full,
    backgroundColor: colors.urgent,
    opacity: 0.3,
  },
  micIcon: {
    fontSize: 28,
    color: '#fff',
  },
  micCaption: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  typeBtn: {
    width: 60,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
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
    fontSize: 16,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cancelBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIcon: {
    color: colors.textMuted,
    fontSize: 18,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
