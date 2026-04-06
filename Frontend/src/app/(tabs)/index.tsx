import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Radio, FileText } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/lib/useColorScheme';
import { useLanguage } from '@/i18n/LanguageProvider';
import DailyLogContent from '@/components/DailyLogContent';
import EventsScreen from './events';
import FormsScreen from './forms';

type WorkSegment = 'daily_log' | 'observations' | 'forms';

const SEGMENTS: { key: WorkSegment; labelKey: string; Icon: any }[] = [
  { key: 'daily_log', labelKey: 'tabs.dailyLog', Icon: ClipboardList },
  { key: 'observations', labelKey: 'tabs.events', Icon: Radio },
  { key: 'forms', labelKey: 'tabs.forms', Icon: FileText },
];

export default function WorkScreen() {
  const insets = useSafeAreaInsets();
  const [activeSegment, setActiveSegment] = useState<WorkSegment>('daily_log');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useLanguage();

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Custom sticky header with segment control */}
      <View
        className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-3 py-2 gap-2">
          {SEGMENTS.map(({ key, labelKey, Icon }) => {
            const isActive = activeSegment === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveSegment(key);
                }}
                className="flex-1 flex-row items-center justify-center py-2 rounded-xl"
                style={{
                  backgroundColor: isActive
                    ? '#F97316'
                    : isDark
                    ? '#1F2937'
                    : '#F3F4F6',
                }}
              >
                <Icon size={15} color={isActive ? '#FFFFFF' : isDark ? '#9CA3AF' : '#6B7280'} />
                <Text
                  className="ml-1.5 text-xs font-semibold"
                  style={{ color: isActive ? '#FFFFFF' : isDark ? '#9CA3AF' : '#6B7280' }}
                  numberOfLines={1}
                >
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Content — mount all, show active */}
      <View className="flex-1" style={{ display: activeSegment === 'daily_log' ? 'flex' : 'none' }}>
        <DailyLogContent />
      </View>
      <View className="flex-1" style={{ display: activeSegment === 'observations' ? 'flex' : 'none' }}>
        <EventsScreen />
      </View>
      <View className="flex-1" style={{ display: activeSegment === 'forms' ? 'flex' : 'none' }}>
        <FormsScreen />
      </View>
    </View>
  );
}
