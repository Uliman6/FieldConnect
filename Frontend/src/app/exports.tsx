import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDailyLogStore } from '@/lib/store';
import {
  exportAllDataPayload,
  generateExportFilename,
  saveExportToFile,
  getDateRange,
} from '@/lib/sync';
import {
  createAudioPackZip,
  generateAudioPackFilename,
  downloadZipOnWeb,
  shareZipOnNative,
  downloadIndividualFiles,
} from '@/lib/audio-export';
import { cn } from '@/lib/cn';
import {
  ArrowLeft,
  Download,
  Calendar,
  Building2,
  Database,
  FileAudio,
  Share2,
  Check,
  Copy,
  ClipboardList,
  Archive,
  Music,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColorScheme } from '@/lib/useColorScheme';

interface ExportButtonProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onPress: () => void;
  loading?: boolean;
  success?: boolean;
  delay?: number;
}

function ExportButton({
  title,
  description,
  icon,
  onPress,
  loading,
  success,
  delay = 0,
}: ExportButtonProps) {
  return (
    <Animated.View entering={FadeInDown.delay(delay)}>
      <Pressable
        onPress={onPress}
        disabled={loading}
        className={cn(
          'bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700',
          loading && 'opacity-70'
        )}
      >
        <View className="flex-row items-center">
          <View className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 items-center justify-center">
            {loading ? (
              <ActivityIndicator color="#F97316" />
            ) : success ? (
              <Check size={24} color="#10B981" />
            ) : (
              icon
            )}
          </View>
          <View className="flex-1 ml-4">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {description}
            </Text>
          </View>
          <Download size={20} color="#9CA3AF" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ExportsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);

  const projects = useDailyLogStore((s) => s.projects);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const events = useDailyLogStore((s) => s.events);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  const triggerWebDownload = (jsonData: object, filename: string) => {
    try {
      const jsonString = JSON.stringify(jsonData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);

      // Open in new tab as fallback for iframe restrictions
      const newWindow = window.open(url, '_blank');
      if (newWindow) {
        // If popup worked, also try to trigger download
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      } else {
        // Popup blocked, copy to clipboard instead
        window.URL.revokeObjectURL(url);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[export] Web download failed:', error);
      return false;
    }
  };

  const handleExport = async (
    key: string,
    options: {
      date_from?: string;
      date_to?: string;
      project_id?: string;
      include_audio_manifest?: boolean;
    },
    scope: string
  ) => {
    try {
      setLoadingKey(key);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const data = await exportAllDataPayload(options);
      const filename = generateExportFilename(scope);

      if (Platform.OS === 'web') {
        // On web, try to open in new tab or copy to clipboard
        const downloadSuccess = triggerWebDownload(data, filename);
        if (downloadSuccess) {
          showAlert('Export Ready', 'Your export has opened in a new tab. Right-click and "Save As" to download.');
        } else {
          // Fallback to clipboard
          await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
          showAlert('Copied to Clipboard', 'The export data has been copied to your clipboard. Paste it into a text file and save as .json');
        }
      } else {
        // Try to save to file system
        const fileUri = await saveExportToFile(data, filename);

        if (fileUri) {
          // On native, try to share the file
          const sharingAvailable = await Sharing.isAvailableAsync();
          if (sharingAvailable) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Export Data',
            });
          } else {
            // Fallback to clipboard
            await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
            showAlert('Copied to Clipboard', 'The export data has been copied to your clipboard.');
          }
        } else {
          // Fallback to clipboard
          await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
          showAlert('Copied to Clipboard', 'The export data has been copied to your clipboard.');
        }
      }

      setSuccessKey(key);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setSuccessKey(null), 2000);
    } catch (error) {
      console.error('[export] Error:', error);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      showAlert('Export Failed', 'An error occurred while exporting data.');
    } finally {
      setLoadingKey(null);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleExportLast7Days = () => {
    const range = getDateRange(7);
    handleExport('7days', range, 'last-7-days');
  };

  const handleExportLast30Days = () => {
    const range = getDateRange(30);
    handleExport('30days', range, 'last-30-days');
  };

  const handleExportCurrentProject = () => {
    if (!currentProjectId) {
      showAlert('No Project Selected', 'Please select a project first.');
      return;
    }
    handleExport('project', { project_id: currentProjectId }, `project-${currentProjectId.slice(0, 8)}`);
  };

  const handleExportAllData = () => {
    handleExport('all', {}, 'all-data');
  };

  const handleExportAudioManifest = () => {
    handleExport('audio', { include_audio_manifest: true }, 'audio-manifest');
  };

  const handleExportAudioPack = async () => {
    try {
      setLoadingKey('audio-pack');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      console.log('[export] Starting audio pack export...');
      const result = await createAudioPackZip();

      if (!result.success) {
        showAlert('Export Failed', result.error ?? 'No audio files found.');
        return;
      }

      if (result.filesIncluded === 0) {
        showAlert('No Audio Files', 'No audio recordings found to export. Record some audio first.');
        return;
      }

      const filename = generateAudioPackFilename();

      if (Platform.OS === 'web') {
        // On web, download the ZIP directly
        if (result.zipBlob) {
          const downloadSuccess = downloadZipOnWeb(result.zipBlob, filename);
          if (downloadSuccess) {
            showAlert(
              'Audio Pack Downloaded',
              `Successfully exported ${result.filesIncluded} audio file(s). Check your downloads folder for "${filename}".`
            );
          } else {
            // Fallback to individual files
            showAlert(
              'Downloading Files Individually',
              'ZIP download failed. Downloading individual audio files...'
            );
            await downloadIndividualFiles();
          }
        }
      } else {
        // On native, share the ZIP file
        if (result.zipUri) {
          const shared = await shareZipOnNative(result.zipUri);
          if (!shared) {
            showAlert(
              'Export Complete',
              `Audio pack saved. ${result.filesIncluded} file(s) exported.`
            );
          }
        }
      }

      setSuccessKey('audio-pack');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setSuccessKey(null), 2000);

    } catch (error) {
      console.error('[export] Audio pack export error:', error);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      showAlert('Export Failed', 'An error occurred while creating the audio pack.');
    } finally {
      setLoadingKey(null);
    }
  };

  const handleExportWithAudioLinkage = async () => {
    try {
      setLoadingKey('linked');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Generate audio pack filename for linkage
      const audioPackFilename = generateAudioPackFilename();

      const data = await exportAllDataPayload({
        include_audio_manifest: true,
        include_enhanced_audio_manifest: true,
        audio_pack_filename: audioPackFilename,
      });

      const filename = generateExportFilename('with-audio-linkage');

      if (Platform.OS === 'web') {
        // On web, trigger download
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showAlert(
          'Export Ready',
          `JSON export includes enhanced audio manifest. Audio files can be exported separately using "Export Audio Pack (ZIP)".`
        );
      } else {
        const fileUri = await saveExportToFile(data, filename);
        if (fileUri) {
          const sharingAvailable = await Sharing.isAvailableAsync();
          if (sharingAvailable) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/json',
              dialogTitle: 'Export Data with Audio Linkage',
            });
          } else {
            await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
            showAlert('Copied to Clipboard', 'The export data has been copied.');
          }
        }
      }

      setSuccessKey('linked');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setTimeout(() => setSuccessKey(null), 2000);

    } catch (error) {
      console.error('[export] Error:', error);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      showAlert('Export Failed', 'An error occurred while exporting data.');
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Exports',
          headerStyle: { backgroundColor: isDark ? '#111' : '#FFF' },
          headerTintColor: isDark ? '#FFF' : '#111',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="p-2">
              <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
          ),
        }}
      />

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Stats */}
        <Animated.View
          entering={FadeInDown}
          className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-6"
        >
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Data Summary
          </Text>
          <View className="flex-row justify-around">
            <View className="items-center">
              <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 items-center justify-center mb-2">
                <Building2 size={20} color="#3B82F6" />
              </View>
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {projects.length}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">Projects</Text>
            </View>
            <View className="items-center">
              <View className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center mb-2">
                <ClipboardList size={20} color="#10B981" />
              </View>
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {dailyLogs.length}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">Daily Logs</Text>
            </View>
            <View className="items-center">
              <View className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 items-center justify-center mb-2">
                <Database size={20} color="#F97316" />
              </View>
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {events.length}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400">Events</Text>
            </View>
          </View>
        </Animated.View>

        {/* Export Options */}
        <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 px-1">
          Export Options
        </Text>

        <ExportButton
          title="Export Last 7 Days"
          description="All data from the past week"
          icon={<Calendar size={24} color="#F97316" />}
          onPress={handleExportLast7Days}
          loading={loadingKey === '7days'}
          success={successKey === '7days'}
          delay={50}
        />

        <ExportButton
          title="Export Last 30 Days"
          description="All data from the past month"
          icon={<Calendar size={24} color="#F97316" />}
          onPress={handleExportLast30Days}
          loading={loadingKey === '30days'}
          success={successKey === '30days'}
          delay={100}
        />

        <ExportButton
          title="Export This Project"
          description={currentProject ? currentProject.name : 'Select a project first'}
          icon={<Building2 size={24} color="#F97316" />}
          onPress={handleExportCurrentProject}
          loading={loadingKey === 'project'}
          success={successKey === 'project'}
          delay={150}
        />

        <ExportButton
          title="Export All Data"
          description="Complete backup of all projects, logs, and events"
          icon={<Database size={24} color="#F97316" />}
          onPress={handleExportAllData}
          loading={loadingKey === 'all'}
          success={successKey === 'all'}
          delay={200}
        />

        <ExportButton
          title="Export Audio Manifest"
          description="All data with audio file references"
          icon={<FileAudio size={24} color="#F97316" />}
          onPress={handleExportAudioManifest}
          loading={loadingKey === 'audio'}
          success={successKey === 'audio'}
          delay={250}
        />

        {/* Audio Export Section */}
        <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 mt-6 px-1">
          Audio Export
        </Text>

        <ExportButton
          title="Export Audio Pack (ZIP)"
          description="Download all audio recordings as a ZIP file with manifest"
          icon={<Archive size={24} color="#8B5CF6" />}
          onPress={handleExportAudioPack}
          loading={loadingKey === 'audio-pack'}
          success={successKey === 'audio-pack'}
          delay={300}
        />

        <ExportButton
          title="Export JSON + Audio Linkage"
          description="JSON export with audio file IDs for offline transcription"
          icon={<Music size={24} color="#8B5CF6" />}
          onPress={handleExportWithAudioLinkage}
          loading={loadingKey === 'linked'}
          success={successKey === 'linked'}
          delay={350}
        />

        {/* Info */}
        <Animated.View
          entering={FadeInDown.delay(400)}
          className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 mt-4"
        >
          <View className="flex-row items-start">
            <Archive size={18} color="#8B5CF6" />
            <View className="flex-1 ml-3">
              <Text className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Audio Pack Export
              </Text>
              <Text className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                Creates a ZIP file containing all your audio recordings and a manifest.json for offline transcription.
                Use "JSON + Audio Linkage" to get structured data that maps to the audio files.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Info */}
        <Animated.View
          entering={FadeInDown.delay(300)}
          className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mt-4"
        >
          <View className="flex-row items-start">
            <Share2 size={18} color="#3B82F6" />
            <View className="flex-1 ml-3">
              <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Export Format
              </Text>
              <Text className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                Exports are saved as JSON files that can be shared via AirDrop, email, or saved to Files.
                This data can be used for offline analysis or imported into other systems.
              </Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
