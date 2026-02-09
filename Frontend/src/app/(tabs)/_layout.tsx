import React from 'react';
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { ClipboardList, Building2, History, Radio, Lightbulb, Settings } from 'lucide-react-native';

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
        tabBarActiveTintColor: '#F97316',
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
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.dailyLog'),
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('tabs.events'),
          tabBarIcon: ({ color, size }) => <Radio size={size} color={color} />,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/insights')}
              className="mr-4 p-2"
            >
              <Lightbulb size={22} color="#F97316" />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: t('tabs.projects'),
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
