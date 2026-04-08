import React from 'react';
import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Mic, LayoutDashboard, ArrowLeft } from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';

export default function VoiceDiaryLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1F5C1A',
        tabBarInactiveTintColor: isDark ? '#6B7280' : '#9CA3AF',
        tabBarStyle: {
          backgroundColor: isDark ? '#111' : '#FFF',
          borderTopColor: isDark ? '#1F2937' : '#E5E7EB',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: isDark ? '#111' : '#FFF',
        },
        headerTintColor: isDark ? '#FFF' : '#111',
        headerTitleStyle: {
          fontWeight: '700',
        },
        // Add back button to return to main app
        headerLeft: () => (
          <Pressable
            onPress={() => router.push('/(tabs)')}
            style={{ marginLeft: 16, padding: 4 }}
          >
            <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Record',
          headerTitle: 'Voice Diary',
          tabBarIcon: ({ color, size }) => <Mic size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          headerTitle: 'Daily Summary',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
