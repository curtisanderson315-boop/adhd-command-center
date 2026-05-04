import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import type { NavigationContainerRef } from '@react-navigation/native';

import { HomeScreen } from './src/screens/HomeScreen';
import { SuggestionsScreen } from './src/screens/SuggestionsScreen';
import { TriageScreen } from './src/screens/TriageScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useAppStore } from './src/store';
import { colors } from './src/theme';
import { registerShortcuts, onSiriShortcut } from './src/services/siri';
import {
  registerBackgroundPolling,
  NOTIFICATION_TAP_ROUTE,
} from './src/services/background';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Home',        component: HomeScreen,        icon: '🏠', label: 'Home'     },
  { name: 'Suggestions', component: SuggestionsScreen, icon: '✨', label: 'Smart'    },
  { name: 'Triage',      component: TriageScreen,      icon: '📥', label: 'Triage'   },
  { name: 'Tasks',       component: TasksScreen,       icon: '✅', label: 'Tasks'    },
  { name: 'Settings',    component: SettingsScreen,    icon: '⚙️', label: 'Settings' },
];

// Show banner + sound + badge when a notification arrives in the foreground
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
  const triageQueue = useAppStore((s) => s.triageQueue);
  const tasks = useAppStore((s) => s.tasks);
  const suggestions = useAppStore((s) => s.suggestions);
  const triageInterval = useAppStore((s) => s.settings.triageIntervalMinutes);
  const navRef = useRef<NavigationContainerRef<any>>(null);

  const pendingSuggestionsCount = suggestions.filter((s) => s.status === 'pending').length;

  // ── Bootstrap: hydrate, register Siri, wire notification taps ──────────
  useEffect(() => {
    hydrate();
    registerShortcuts();

    const unsubSiri = onSiriShortcut((action) => {
      if (!navRef.current) return;
      switch (action) {
        case 'log_thought':
        case 'add_task':
          navRef.current.navigate('Home');
          break;
        case 'triage':
          navRef.current.navigate('Triage');
          break;
      }
    });

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { type?: string; route?: string }
        | undefined;
      if (data?.type === NOTIFICATION_TAP_ROUTE && data.route && navRef.current) {
        navRef.current.navigate(data.route);
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
                  <Text
                    style={{
                      fontSize: 22,
                      opacity: focused ? 1 : 0.5,
                    }}
                  >
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
                  tab.name === 'Triage'
                    ? {
                        tabBarBadge: triageQueue.length > 0 ? triageQueue.length : undefined,
                        tabBarBadgeStyle: {
                          backgroundColor: colors.urgent,
                          color: '#fff',
                          fontSize: 11,
                        },
                      }
                    : tab.name === 'Tasks'
                    ? {
                        tabBarBadge:
                          tasks.filter((t) => !t.completed && t.bucket === 'today').length || undefined,
                        tabBarBadgeStyle: {
                          backgroundColor: colors.actionNeeded,
                          color: '#000',
                          fontSize: 11,
                        },
                      }
                    : tab.name === 'Suggestions'
                    ? {
                        tabBarBadge:
                          pendingSuggestionsCount > 0 ? pendingSuggestionsCount : undefined,
                        tabBarBadgeStyle: {
                          backgroundColor: colors.purple,
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
