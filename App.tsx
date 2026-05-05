import React, { useEffect, useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import type { NavigationContainerRef } from '@react-navigation/native';

import { HomeScreen } from './src/screens/HomeScreen';
import { TriageScreen } from './src/screens/TriageScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { FloatingMic } from './src/components/FloatingMic';
import { UndoBanner } from './src/components/UndoBanner';
import { useAppStore } from './src/store';
import { colors } from './src/theme';
import { registerShortcuts, onSiriShortcut } from './src/services/siri';
import { requestVoiceCapture } from './src/services/voiceTrigger';
import {
  registerBackgroundPolling,
  NOTIFICATION_TAP_ROUTE,
} from './src/services/background';
import {
  compareCards,
  mergeStoredOverlays,
  projectAllSources,
} from './src/services/actionCards';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Now',      component: HomeScreen,     icon: '✨', label: 'Now'      },
  { name: 'All',      component: TasksScreen,    icon: '✅', label: 'All'      },
  { name: 'Inbox',    component: TriageScreen,   icon: '📥', label: 'Inbox'    },
  { name: 'Settings', component: SettingsScreen, icon: '⚙️', label: 'Settings' },
];

// Show banner + sound + badge when a notification arrives in the foreground.
// Phase D's FocusMode temporarily overrides this to silence; it restores on exit.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const hydrate = useAppStore((s) => s.hydrate);
  const captures = useAppStore((s) => s.captures);
  const tasks = useAppStore((s) => s.tasks);
  const triageQueue = useAppStore((s) => s.triageQueue);
  const suggestions = useAppStore((s) => s.suggestions);
  const storedCards = useAppStore((s) => s.actionCards);
  const triageInterval = useAppStore((s) => s.settings.triageIntervalMinutes);
  const navRef = useRef<NavigationContainerRef<any>>(null);

  // Open ActionCard count for the Now tab badge — same projection the screen uses.
  const openCount = useMemo(() => {
    const projected = projectAllSources({ captures, tasks, triageQueue, suggestions });
    const merged = mergeStoredOverlays(projected, storedCards);
    return merged
      .filter((c) => c.status === 'pending')
      .sort(compareCards).length;
  }, [captures, tasks, triageQueue, suggestions, storedCards]);

  // ── Bootstrap: hydrate, register Siri, wire notification taps ──────────
  useEffect(() => {
    hydrate();
    registerShortcuts();

    const unsubSiri = onSiriShortcut((action) => {
      if (!navRef.current) return;
      switch (action) {
        case 'log_thought':
        case 'add_task':
          navRef.current.navigate('Now');
          break;
        case 'drive_brain_dump':
          navRef.current.navigate('Now');
          // Give the screen a moment to mount before kicking off recording.
          setTimeout(() => requestVoiceCapture(), 250);
          break;
        case 'triage':
          navRef.current.navigate('Inbox');
          break;
      }
    });

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; route?: string }
        | undefined;
      if (data?.type === NOTIFICATION_TAP_ROUTE && data.route && navRef.current) {
        // Map legacy notification routes (Triage/Suggestions) to current tabs.
        const route =
          data.route === 'Triage'
            ? 'Inbox'
            : data.route === 'Suggestions'
            ? 'Now'
            : data.route;
        navRef.current.navigate(route);
      }
    });

    return () => {
      unsubSiri();
      tapSub.remove();
    };
  }, []);

  // ── Re-register background polling whenever the interval changes ───────
  useEffect(() => {
    void registerBackgroundPolling(triageInterval);
  }, [triageInterval]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          <NavigationContainer ref={navRef}>
            <Tab.Navigator
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                  backgroundColor: '#13132a',
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                  paddingBottom: Platform.OS === 'ios' ? 20 : 8,
                  paddingTop: 8,
                  height: Platform.OS === 'ios' ? 82 : 60,
                },
                tabBarActiveTintColor: colors.purple,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarIcon: ({ focused }) => {
                  const tab = TABS.find((t) => t.name === route.name);
                  return (
                    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>
                      {tab?.icon}
                    </Text>
                  );
                },
                tabBarLabel: ({ focused, color }) => {
                  const tab = TABS.find((t) => t.name === route.name);
                  return (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: focused ? '700' : '400',
                        color,
                      }}
                    >
                      {tab?.label}
                    </Text>
                  );
                },
              })}
            >
              {TABS.map((tab) => (
                <Tab.Screen
                  key={tab.name}
                  name={tab.name}
                  component={tab.component}
                  options={
                    tab.name === 'Now' && openCount > 0
                      ? {
                          tabBarBadge: openCount,
                          tabBarBadgeStyle: {
                            backgroundColor: colors.purple,
                            color: '#fff',
                            fontSize: 11,
                          },
                        }
                      : tab.name === 'Inbox' && triageQueue.length > 0
                      ? {
                          tabBarBadge: triageQueue.length,
                          tabBarBadgeStyle: {
                            backgroundColor: colors.urgent,
                            color: '#fff',
                            fontSize: 11,
                          },
                        }
                      : undefined
                  }
                />
              ))}
            </Tab.Navigator>
          </NavigationContainer>

          {/* Persistent floating mic — accessible from any tab. */}
          <FloatingMic />

          {/* Global Undo banner for archive/restore from anywhere. */}
          <UndoBanner />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
