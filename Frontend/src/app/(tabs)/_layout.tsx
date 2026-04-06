import React from 'react';
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Building2, History, Lightbulb, Settings, LayoutGrid } from 'lucide-react-native';

import { useColorScheme } from '@/lib/useColorScheme';
import { useClientOnlyValue } from '@/lib/useClientOnlyValue';
import { useLanguage } from '@/i18n/LanguageProvider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1F5C1A',
        tabBarInactiveTintColor: isDark ? '#6B7280' : '#9CA3AF',
        tabBarStyle: {
          backgroundColor: isDark ? '#111' : '#FFF',
          borderTopColor: isDark ? '#1F2937' : '#E5E7EB',
        },
        headerStyle: {
          backgroundColor: isDark ? '#111' : '#FFF',
        },
        headerTintColor: isDark ? '#FFF' : '#111',
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      {/* ── Tab 1: Work (Daily Log + Observations + Forms) ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.work'),
          headerShown: false,
          tabBarIcon: ({ color, size }) => <LayoutGrid size={size} color={color} />,
        }}
      />

      {/* ── Tab 2: History (+ Insights button) ── */}
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/insights')}
              className="mr-4 p-2"
            >
              <Lightbulb size={22} color="#1F5C1A" />
            </Pressable>
          ),
        }}
      />

      {/* ── Tab 3: Projects (+ Settings gear) ── */}
      <Tabs.Screen
        name="projects"
        options={{
          title: t('tabs.projects'),
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(tabs)/settings')}
              className="mr-4 p-2"
            >
              <Settings size={22} color={isDark ? '#9CA3AF' : '#6B7280'} />
            </Pressable>
          ),
        }}
      />

      {/* ── Hidden screens (navigable but not in tab bar) ── */}
      <Tabs.Screen
        name="events"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="forms"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}
