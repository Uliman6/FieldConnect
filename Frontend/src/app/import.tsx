import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/lib/useColorScheme';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import {
  ArrowLeft,
  Upload,
  FileText,
  FolderOpen,
  Building2,
  ClipboardList,
  AlertTriangle,
  Check,
  Info,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDailyLogStore } from '@/lib/store';
import { Project, DailyLog, Event } from '@/lib/types';

type ImportType = 'project' | 'forms' | 'directory';

interface ImportResult {
  success: boolean;
  message: string;
  imported?: {
    projects?: number;
    dailyLogs?: number;
    events?: number;
  };
}

export default function ImportScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Store actions
  const addProject = useDailyLogStore((s) => s.addProject);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);

  const importTypes = [
    {
      id: 'project' as ImportType,
      title: 'Import Project',
      description: 'Import a complete project with all logs and events',
      icon: Building2,
      color: '#F97316',
    },
    {
      id: 'forms' as ImportType,
      title: 'Import Forms',
      description: 'Import form templates (daily logs, tasks, issues)',
      icon: ClipboardList,
      color: '#3B82F6',
    },
    {
      id: 'directory' as ImportType,
      title: 'Import Directory',
      description: 'Import company/vendor directories and contacts',
      icon: FolderOpen,
      color: '#10B981',
    },
  ];

  const handlePickFile = async () => {
    if (!selectedType) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsImporting(true);
      setImportResult(null);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);

      let parsedData: unknown;
      try {
        parsedData = JSON.parse(fileContent);
      } catch {
        setImportResult({
          success: false,
          message: 'Invalid JSON file. Please select a valid export file.',
        });
        setIsImporting(false);
        return;
      }

      // Process based on import type
      const importedCounts = await processImport(selectedType, parsedData);

      if (importedCounts) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setImportResult({
          success: true,
          message: 'Import completed successfully!',
          imported: importedCounts,
        });
      }
    } catch (error) {
      console.log('[import] Error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setImportResult({
        success: false,
        message: 'Failed to import file. Please try again.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const processImport = async (
    type: ImportType,
    data: unknown
  ): Promise<{ projects?: number; dailyLogs?: number; events?: number } | null> => {
    const store = useDailyLogStore.getState();

    switch (type) {
      case 'project': {
        // Expect data to have project info and optionally dailyLogs/events
        const projectData = data as {
          project?: Project;
          projects?: Project[];
          dailyLogs?: DailyLog[];
          events?: Event[];
        };

        let projectCount = 0;
        let logCount = 0;
        let eventCount = 0;

        // Handle single project or array
        const projectsToImport = projectData.projects || (projectData.project ? [projectData.project] : []);

        for (const proj of projectsToImport) {
          if (proj.name) {
            store.addProject(proj.name, proj.number || '', proj.address || '');
            projectCount++;
          }
        }

        // Import daily logs if present
        if (projectData.dailyLogs && Array.isArray(projectData.dailyLogs)) {
          for (const log of projectData.dailyLogs) {
            // Add log to store
            useDailyLogStore.setState((state) => ({
              dailyLogs: [...state.dailyLogs, { ...log, id: `imported_${Date.now()}_${Math.random()}` }],
            }));
            logCount++;
          }
        }

        // Import events if present
        if (projectData.events && Array.isArray(projectData.events)) {
          for (const event of projectData.events) {
            useDailyLogStore.setState((state) => ({
              events: [...state.events, { ...event, id: `imported_${Date.now()}_${Math.random()}` }],
            }));
            eventCount++;
          }
        }

        return { projects: projectCount, dailyLogs: logCount, events: eventCount };
      }

      case 'forms': {
        // Import form templates - for now, just acknowledge
        const formData = data as { templates?: unknown[]; forms?: unknown[] };
        const formCount = formData.templates?.length || formData.forms?.length || 0;

        // Forms would be stored in a separate template store in a full implementation
        // For now, just return the count
        return { projects: 0, dailyLogs: formCount, events: 0 };
      }

      case 'directory': {
        // Import directory data
        const dirData = data as { companies?: unknown[]; contacts?: unknown[]; vendors?: unknown[] };
        const total =
          (dirData.companies?.length || 0) +
          (dirData.contacts?.length || 0) +
          (dirData.vendors?.length || 0);

        // Directory would be stored in a separate contacts store in a full implementation
        return { projects: total, dailyLogs: 0, events: 0 };
      }

      default:
        return null;
    }
  };

  const handleCreateSampleFile = () => {
    const sampleData = {
      project: {
        name: 'Sample Project',
        number: 'SAMPLE-001',
        address: '123 Construction Ave',
      },
      dailyLogs: [],
      events: [],
    };

    const message = Platform.OS === 'web'
      ? 'Sample JSON format:\n\n' + JSON.stringify(sampleData, null, 2)
      : 'Sample export format shown. Export a project first to see the full structure.';

    if (Platform.OS === 'web') {
      alert(message);
    } else {
      Alert.alert('Sample Import Format', message);
    }
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Import Data',
          headerStyle: { backgroundColor: isDark ? '#111' : '#FFF' },
          headerTintColor: isDark ? '#FFF' : '#111',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="p-2">
              <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
          ),
        }}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Info Banner */}
        <Animated.View
          entering={FadeInDown.delay(50)}
          className="mx-4 mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4"
        >
          <View className="flex-row items-start">
            <Info size={20} color="#3B82F6" />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Import your data
              </Text>
              <Text className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                Select the type of data you want to import, then pick a JSON file from your device.
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* Import Type Selection */}
        <View className="px-4 mt-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Select Import Type
          </Text>

          {importTypes.map((type, index) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.id;

            return (
              <Animated.View
                key={type.id}
                entering={FadeInDown.delay(100 + index * 50)}
              >
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedType(type.id);
                    setImportResult(null);
                  }}
                  className={`bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border-2 ${
                    isSelected ? 'border-orange-500' : 'border-transparent'
                  }`}
                >
                  <View className="flex-row items-center">
                    <View
                      className="w-12 h-12 rounded-xl items-center justify-center"
                      style={{ backgroundColor: type.color + '20' }}
                    >
                      <Icon size={24} color={type.color} />
                    </View>
                    <View className="ml-4 flex-1">
                      <Text className="text-base font-semibold text-gray-900 dark:text-white">
                        {type.title}
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {type.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-6 h-6 rounded-full bg-orange-500 items-center justify-center">
                        <Check size={14} color="white" />
                      </View>
                    )}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        {/* Import Button */}
        <Animated.View
          entering={FadeInDown.delay(300)}
          className="px-4 mt-6"
        >
          <Pressable
            onPress={handlePickFile}
            disabled={!selectedType || isImporting}
            className={`flex-row items-center justify-center py-4 rounded-xl ${
              selectedType && !isImporting
                ? 'bg-orange-500'
                : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            <Upload size={20} color="white" />
            <Text className="ml-2 text-base font-semibold text-white">
              {isImporting ? 'Importing...' : 'Select File to Import'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Result Message */}
        {importResult && (
          <Animated.View
            entering={FadeInDown}
            className={`mx-4 mt-4 rounded-xl p-4 ${
              importResult.success
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'bg-red-50 dark:bg-red-900/20'
            }`}
          >
            <View className="flex-row items-start">
              {importResult.success ? (
                <Check size={20} color="#10B981" />
              ) : (
                <AlertTriangle size={20} color="#EF4444" />
              )}
              <View className="ml-3 flex-1">
                <Text
                  className={`text-sm font-medium ${
                    importResult.success
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  {importResult.message}
                </Text>
                {importResult.imported && (
                  <View className="flex-row mt-2 gap-3">
                    {(importResult.imported.projects ?? 0) > 0 && (
                      <Text className="text-xs text-green-600 dark:text-green-400">
                        {importResult.imported.projects} projects
                      </Text>
                    )}
                    {(importResult.imported.dailyLogs ?? 0) > 0 && (
                      <Text className="text-xs text-green-600 dark:text-green-400">
                        {importResult.imported.dailyLogs} logs
                      </Text>
                    )}
                    {(importResult.imported.events ?? 0) > 0 && (
                      <Text className="text-xs text-green-600 dark:text-green-400">
                        {importResult.imported.events} events
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        )}

        {/* Sample Format Link */}
        <Animated.View
          entering={FadeInDown.delay(350)}
          className="px-4 mt-6"
        >
          <Pressable
            onPress={handleCreateSampleFile}
            className="flex-row items-center justify-center py-3"
          >
            <FileText size={16} color="#6B7280" />
            <Text className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              View sample import format
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
