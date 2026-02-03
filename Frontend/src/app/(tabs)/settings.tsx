import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronRight, Globe, Mic, LogOut, Info } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/lib/useColorScheme';
import { useAuthStore } from '@/lib/auth-store';
import { useLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n/LanguageProvider';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { logout } = useAuthStore();
  const {
    language,
    setLanguage,
    transcriptionLanguage,
    setTranscriptionLanguage,
    t,
    supportedLanguages,
  } = useLanguage();

  const [showLanguageSelector, setShowLanguageSelector] = React.useState(false);
  const [showTranscriptionSelector, setShowTranscriptionSelector] = React.useState(false);

  const handleLanguageChange = async (lang: LanguageCode) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    await setLanguage(lang);
    setShowLanguageSelector(false);
  };

  const handleTranscriptionLanguageChange = async (lang: LanguageCode) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    await setTranscriptionLanguage(lang);
    setShowTranscriptionSelector(false);
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            await logout();
          },
        },
      ]
    );
  };

  const currentLang = supportedLanguages.find(l => l.code === language);
  const currentTranscriptionLang = supportedLanguages.find(l => l.code === transcriptionLanguage);

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-black' : 'bg-gray-50'}`}
      edges={['top']}
    >
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="px-4 py-4">
          <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {t('settings.title')}
          </Text>
        </View>

        {/* Language Section */}
        <View className="px-4 mt-4">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.language').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            {/* UI Language */}
            <Pressable
              onPress={() => {
                setShowLanguageSelector(!showLanguageSelector);
                setShowTranscriptionSelector(false);
              }}
              className={`flex-row items-center justify-between p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <View className="flex-row items-center flex-1">
                <Globe size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <View className="ml-3 flex-1">
                  <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {t('settings.language')}
                  </Text>
                  <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('settings.languageDescription')}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className={`mr-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {currentLang?.flag} {currentLang?.nativeName}
                </Text>
                <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </View>
            </Pressable>

            {/* Language Selector */}
            {showLanguageSelector && (
              <View className={`border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                {supportedLanguages.map((lang, index) => (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleLanguageChange(lang.code)}
                    className={`flex-row items-center justify-between p-4 ${
                      index < supportedLanguages.length - 1
                        ? isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'
                        : ''
                    } ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{lang.flag}</Text>
                      <View>
                        <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lang.nativeName}
                        </Text>
                        <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {lang.name}
                        </Text>
                      </View>
                    </View>
                    {language === lang.code && (
                      <Check size={20} color="#F97316" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <View className={`h-px ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

            {/* Transcription Language */}
            <Pressable
              onPress={() => {
                setShowTranscriptionSelector(!showTranscriptionSelector);
                setShowLanguageSelector(false);
              }}
              className={`flex-row items-center justify-between p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <View className="flex-row items-center flex-1">
                <Mic size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <View className="ml-3 flex-1">
                  <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {t('settings.transcriptionLanguage')}
                  </Text>
                  <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('settings.transcriptionDescription')}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className={`mr-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {currentTranscriptionLang?.flag} {currentTranscriptionLang?.nativeName}
                </Text>
                <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </View>
            </Pressable>

            {/* Transcription Language Selector */}
            {showTranscriptionSelector && (
              <View className={`border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                {supportedLanguages.map((lang, index) => (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleTranscriptionLanguageChange(lang.code)}
                    className={`flex-row items-center justify-between p-4 ${
                      index < supportedLanguages.length - 1
                        ? isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'
                        : ''
                    } ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{lang.flag}</Text>
                      <View>
                        <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lang.nativeName}
                        </Text>
                        <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {lang.name}
                        </Text>
                      </View>
                    </View>
                    {transcriptionLanguage === lang.code && (
                      <Check size={20} color="#F97316" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Account Section */}
        <View className="px-4 mt-6">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.account').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <Pressable
              onPress={handleLogout}
              className={`flex-row items-center p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <LogOut size={20} color="#EF4444" />
              <Text className="ml-3 font-medium text-red-500">
                {t('settings.logout')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* About Section */}
        <View className="px-4 mt-6 mb-8">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.about').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <Info size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <Text className={`ml-3 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {t('settings.version')}
                </Text>
              </View>
              <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                1.0.0
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
