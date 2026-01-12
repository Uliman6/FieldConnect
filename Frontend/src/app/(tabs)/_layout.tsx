import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { ClipboardList, Building2, History, Radio, Download, Lightbulb } from 'lucide-react-native';

import { useColorScheme } from '@/lib/useColorScheme';
import { useClientOnlyValue } from '@/lib/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

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
          title: 'Daily Log',
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <Radio size={size} color={color} />,
          headerRight: () => (
            <View className="flex-row items-center">
              <Pressable
                onPress={() => router.push('/insights')}
                className="mr-2 p-2"
              >
                <Lightbulb size={22} color="#F97316" />
              </Pressable>
              <Pressable
                onPress={() => router.push('/exports')}
                className="mr-4 p-2"
              >
                <Download size={22} color="#F97316" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <History size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarIcon: ({ color, size }) => <Building2 size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
