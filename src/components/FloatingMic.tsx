/**
 * FloatingMic — persistent voice capture FAB rendered at the App.tsx level.
 *
 * Replaces the per-screen CaptureBar. Curtis can hold the mic from any tab to
 * speak; voice flows through the same processing pipeline (Whisper transcribe
 * → Claude voice processing → routing). A modal Type fallback drops down when
 * native audio isn't available or the user explicitly taps "Type."
 *
 * Recording behavior is preserved verbatim from CaptureBar — same shim hook,
 * same permission flow, same error handling.
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
  Keyboard,
  Modal,
  KeyboardAvoidingView,
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
  isAudioAvailable,
  useSafeAudioRecorder,
  safeRequestPermissions,
  safeSetAudioMode,
} from '../services/audioShim';
import * as Speech from 'expo-speech';
import { colors, spacing, radius } from '../theme';
import { processVoiceInput, transcribeAudio } from '../services/ai';
import { useAppStore } from '../store';
import { createDraft, getRecentInboxCached } from '../services/gmail';
import { createEvent } from '../services/calendar';
import { getSavedEmail, isSignedIn } from '../services/auth';
import { nanoid } from '../services/utils';
import { isContextHinted, mineContextForUtterance } from '../services/contextMiner';
import { onVoiceCaptureRequest } from '../services/voiceTrigger';
import type { ActionCard, CapturedAction, Task, Note } from '../types';

// Drive Mode auto-stops the recording after this many ms if the user
// doesn't tap the mic to stop early. Long enough for a real brain dump,
// short enough that a forgotten session doesn't drain the mic forever.
const DRIVE_MODE_AUTO_STOP_MS = 30 * 1000;

const ORDINAL_WORDS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

function buildDriveModeConfirmation(titles: string[]): string {
  const real = titles.filter(Boolean).slice(0, 8);
  if (real.length === 0) return 'Got nothing usable. Try again.';
  if (real.length === 1) return `Got it. ${real[0]}.`;
  const enumerated = real.map((t, i) => `${ORDINAL_WORDS[i] ?? `Item ${i + 1}`}: ${t}.`).join(' ');
  return `Got ${real.length} things. ${enumerated}`;
}

export function FloatingMic() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [textHint, setTextHint] = useState<string | null>(null);
  const driveModeRef = React.useRef(false);
  const driveAutoStopTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const recorder = useSafeAudioRecorder();
  const pulse = useSharedValue(0);
  const micScale = useSharedValue(1);

  const { settings, addCapture, updateCapture, addTask, addNote, upsertCard } = useAppStore();

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

  // ── Routing (preserved from CaptureBar) ─────────────────────────────────

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
        await createDraft({
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

  // ── Memory-Augmented Action: try contextMiner before falling through to
  //    the generic CapturedAction path. Returns the rich card if matched.

  const tryContextMine = async (transcript: string): Promise<ActionCard | null> => {
    if (!isContextHinted(transcript)) return null;
    if (!(await isSignedIn())) return null;
    try {
      const recent = await getRecentInboxCached(30, 50);
      if (recent.length === 0) return null;
      const result = await mineContextForUtterance(
        transcript,
        recent,
        settings.anthropicKey
      );
      if (result.matched && result.card) {
        await upsertCard(result.card);
        return result.card;
      }
    } catch (e: any) {
      console.warn('[FloatingMic] contextMine failed, falling through:', e?.message ?? e);
    }
    return null;
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

    const wasDriveMode = driveModeRef.current;
    setIsProcessing(true);
    try {
      // Memory-augmented path first — if matched, skip the generic flow.
      const minedCard = await tryContextMine(text);
      if (minedCard) {
        Speech.speak(`Got it. ${minedCard.title}`, { language: 'en-US', rate: 1.0 });
      } else {
        const actions = await processVoiceInput(text, settings.anthropicKey);

        for (const action of actions) {
          await addCapture(action);
          await routeAction(action);
        }

        const confirmation = wasDriveMode
          ? buildDriveModeConfirmation(actions.map((a) => a.title))
          : actions
              .map((a) => a.confirmationText)
              .filter(Boolean)
              .join('. ');
        if (confirmation) {
          Speech.speak(confirmation, { language: 'en-US', rate: 1.0 });
        }
      }
    } catch (e: any) {
      Alert.alert("Couldn't quite catch that", e?.message ?? 'Try again or rephrase.');
    } finally {
      driveModeRef.current = false;
      Keyboard.dismiss();
      setIsProcessing(false);
      setTextInput('');
      setShowTextInput(false);
      setTextHint(null);
    }
  };

  // ── Recording lifecycle (preserved from CaptureBar) ────────────────────

  const startRecording = async () => {
    if (isRecording || isProcessing) return;
    try {
      const perm = await safeRequestPermissions();
      if (!perm.granted) {
        Alert.alert(
          'Microphone access needed',
          'Open Settings → ADHD Command Center → Microphone to allow voice capture.'
        );
        return;
      }
      await safeSetAudioMode({
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
      await safeSetAudioMode({ allowsRecording: false });
      return recorder.uri ?? null;
    } catch (e: any) {
      console.warn('Recording stop failed:', e?.message ?? e);
      return null;
    }
  };

  const onMicPressIn = () => {
    // Drive Mode case: tap-to-stop instead of press-and-hold.
    if (driveModeRef.current && isRecording) {
      void handleRecordingComplete();
      return;
    }
    if (!isAudioAvailable) {
      // Native audio module not in this build — fall through to text input
      setTextHint('Voice recording needs a new app build. Type or use the keyboard mic 🎙');
      setShowTextInput(true);
      return;
    }
    void startRecording();
  };

  const onMicPressOut = async () => {
    if (driveModeRef.current) return; // tap-to-stop, not release-to-stop
    if (!isRecording) return;
    void handleRecordingComplete();
  };

  // Pulled the post-stop processing into its own helper so Drive Mode (tap-
  // to-stop) and Manual Mode (release-to-stop) share identical handling.
  const handleRecordingComplete = async () => {

    if (driveAutoStopTimerRef.current) {
      clearTimeout(driveAutoStopTimerRef.current);
      driveAutoStopTimerRef.current = null;
    }

    const uri = await stopRecording();
    if (!uri) {
      Alert.alert(
        "Voice didn't save",
        'Try holding the mic again, or tap "Type" to enter it manually.'
      );
      return;
    }

    setIsProcessing(true);
    try {
      const transcript = await transcribeAudio(uri, settings.openaiKey);
      if (transcript) {
        await processTranscript(transcript);
      } else {
        // No OpenAI key configured.
        Alert.alert(
          'Add your OpenAI key',
          'Open Settings → Voice Transcription and paste a key from platform.openai.com to enable voice transcription.'
        );
      }
    } catch (e: any) {
      Alert.alert("Couldn't transcribe", e?.message ?? 'Try again in a moment.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Drive Mode trigger (Siri shortcut → auto-record) ───────────────────

  useEffect(() => {
    return onVoiceCaptureRequest(() => {
      if (isRecording || isProcessing) return;
      if (!isAudioAvailable) return;
      driveModeRef.current = true;
      // Speak before starting the recording so we don't capture the prompt.
      Speech.speak("Drive mode. Speak now. I'll catch every thought.", {
        language: 'en-US',
        rate: 1.05,
      });
      void startRecording();
      driveAutoStopTimerRef.current = setTimeout(() => {
        if (isRecording) void handleRecordingComplete();
      }, DRIVE_MODE_AUTO_STOP_MS);
    });
  }, [isRecording, isProcessing]);

  // ── Render: floating FAB + modal text input ────────────────────────────

  return (
    <>
      <View style={styles.fabWrap} pointerEvents="box-none">
        <View style={styles.micWrap}>
          {isRecording ? (
            <Animated.View style={[styles.recordingRing, pulseStyle]} pointerEvents="none" />
          ) : null}
          <Pressable
            onPressIn={onMicPressIn}
            onPressOut={onMicPressOut}
            onLongPress={() => setShowTextInput(true)}
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
        </View>
      </View>

      <Modal
        visible={showTextInput}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTextInput(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setShowTextInput(false)} />
          <View style={styles.sheet}>
            {textHint ? <Text style={styles.hint}>{textHint}</Text> : null}
            <View style={styles.textRow}>
              <TextInput
                style={styles.input}
                placeholder="What's on your mind?"
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
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowTextInput(false);
                setTextInput('');
                setTextHint(null);
              }}
              style={styles.cancelLink}
            >
              <Text style={styles.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 82 : 60;

const styles = StyleSheet.create({
  fabWrap: {
    position: 'absolute',
    right: spacing.md,
    bottom: TAB_BAR_HEIGHT + 12,
    zIndex: 999,
  },
  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  micBtnRecording: {
    backgroundColor: colors.urgent,
    shadowColor: colors.urgent,
  },
  recordingRing: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: radius.full,
    backgroundColor: colors.urgent,
    opacity: 0.3,
  },
  micIcon: {
    fontSize: 26,
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#13132a',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    maxHeight: 140,
    minHeight: 56,
  },
  sendBtn: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  cancelLink: {
    alignSelf: 'center',
    marginTop: spacing.md,
    paddingVertical: 8,
  },
  cancelLinkText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
