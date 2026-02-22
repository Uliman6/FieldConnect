import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDailyLogStore } from '@/lib/store';
import {
  getFormTemplates,
  getFormInstances,
  createFormInstance,
  deleteFormInstance,
  seedFormTemplates,
  getVoiceLists,
  deleteVoiceList,
  fetchBulkExportByIds,
  fetchBulkExport,
  queryKeys,
  FormTemplate,
  FormInstance,
  VoiceList,
} from '@/lib/api';
import { getBackendId } from '@/lib/data-provider';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  FileText,
  Plus,
  Clock,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Building2,
  Upload,
  ClipboardList,
  Trash2,
  Mic,
  Package,
  Archive,
  Square,
  CheckSquare,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { cn } from '@/lib/cn';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { format } from 'date-fns';

const STATUS_COLORS = {
  DRAFT: '#6B7280',
  IN_PROGRESS: '#F59E0B',
  PENDING_SIGNATURES: '#3B82F6',
  COMPLETED: '#10B981',
};

const STATUS_LABELS = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  PENDING_SIGNATURES: 'Pending Signatures',
  COMPLETED: 'Completed',
};

function FormCard({
  form,
  onPress,
  onDelete,
  isDeleting
}: {
  form: FormInstance;
  onPress: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const statusColor = STATUS_COLORS[form.status] || STATUS_COLORS.DRAFT;
  const statusLabel = STATUS_LABELS[form.status] || 'Draft';

  const timeAgo = React.useMemo(() => {
    const now = new Date();
    const created = new Date(form.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return format(created, 'MMM d, h:mm a');
  }, [form.createdAt]);

  // Calculate completion percentage
  const completionPercent = React.useMemo(() => {
    if (!form.template?.schema?.sections) return 0;
    let total = 0;
    let filled = 0;
    form.template.schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type !== 'SIGNATURE') {
          total++;
          if (form.data[field.id] !== undefined && form.data[field.id] !== null && form.data[field.id] !== '') {
            filled++;
          }
        }
      });
    });
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  }, [form]);

  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
      <View className="flex-row items-start justify-between">
        <Pressable onPress={onPress} className="flex-1 mr-3">
          <View className="flex-row items-center mb-2">
            <View
              className="px-2 py-0.5 rounded-full mr-2"
              style={{ backgroundColor: statusColor + '20' }}
            >
              <Text className="text-xs font-semibold" style={{ color: statusColor }}>
                {statusLabel}
              </Text>
            </View>
            {form.status !== 'COMPLETED' && (
              <Text className="text-xs text-gray-400">{completionPercent}% complete</Text>
            )}
          </View>

          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            {form.name || form.template?.name || 'Form'}
          </Text>

          {form.location && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              {form.location}
            </Text>
          )}

          <View className="flex-row items-center">
            <Clock size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-400 ml-1">{timeAgo}</Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2">
          {/* Delete Button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            disabled={isDeleting}
            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30"
          >
            {isDeleting ? (
              <ActivityIndicator size={20} color="#EF4444" />
            ) : (
              <Trash2 size={20} color="#EF4444" />
            )}
          </Pressable>

          {/* Status Icon */}
          <Pressable onPress={onPress}>
            {form.status === 'COMPLETED' ? (
              <CheckCircle2 size={24} color="#10B981" />
            ) : (
              <ChevronRight size={24} color="#9CA3AF" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TemplateCard({
  template,
  onStart,
  isLoading
}: {
  template: FormTemplate;
  onStart: () => void;
  isLoading: boolean;
}) {
  const fieldCount = React.useMemo(() => {
    if (!template.schema?.sections) return 0;
    return template.schema.sections.reduce((acc, section) => acc + section.fields.length, 0);
  }, [template]);

  return (
    <Pressable
      onPress={onStart}
      disabled={isLoading}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex-row items-center"
    >
      <View className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 items-center justify-center mr-3">
        <ClipboardList size={20} color="#1F5C1A" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 dark:text-white">
          {template.name}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {fieldCount} fields • {template.category || 'General'}
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color="#1F5C1A" />
      ) : (
        <View className="bg-orange-500 rounded-full p-2">
          <Plus size={16} color="white" />
        </View>
      )}
    </Pressable>
  );
}

const LIST_TYPE_LABELS: Record<string, string> = {
  material_list: 'Material List',
  inventory: 'Inventory',
  punch_list: 'Punch List',
  action_items: 'Action Items',
};

function VoiceListCard({
  voiceList,
  onPress,
  onDelete,
  isDeleting,
  t,
}: {
  voiceList: VoiceList;
  onPress: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  t: (key: string) => string;
}) {
  const timeAgo = React.useMemo(() => {
    const now = new Date();
    const created = new Date(voiceList.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return format(created, 'MMM d, h:mm a');
  }, [voiceList.createdAt]);

  const itemCount = voiceList._count?.items || 0;
  const typeLabel = LIST_TYPE_LABELS[voiceList.listType] || voiceList.listType;

  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
      <View className="flex-row items-start justify-between">
        <Pressable onPress={onPress} className="flex-1 mr-3">
          <View className="flex-row items-center mb-2">
            <View
              className="px-2 py-0.5 rounded-full mr-2"
              style={{ backgroundColor: voiceList.status === 'completed' ? '#10B98120' : '#6B728020' }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: voiceList.status === 'completed' ? '#10B981' : '#6B7280' }}
              >
                {voiceList.status === 'completed' ? t('voiceLists.completed') : t('voiceLists.draft')}
              </Text>
            </View>
            <Text className="text-xs text-gray-400">{itemCount} items</Text>
          </View>

          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            {voiceList.name}
          </Text>

          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {typeLabel}
          </Text>

          <View className="flex-row items-center">
            <Clock size={12} color="#9CA3AF" />
            <Text className="text-xs text-gray-400 ml-1">{timeAgo}</Text>
          </View>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            disabled={isDeleting}
            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30"
          >
            {isDeleting ? (
              <ActivityIndicator size={20} color="#EF4444" />
            ) : (
              <Trash2 size={20} color="#EF4444" />
            )}
          </Pressable>

          <Pressable onPress={onPress}>
            {voiceList.status === 'completed' ? (
              <CheckCircle2 size={24} color="#10B981" />
            ) : (
              <ChevronRight size={24} color="#9CA3AF" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function FormsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [startingTemplate, setStartingTemplate] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [deletingVoiceListId, setDeletingVoiceListId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Get backend project ID
  const backendProjectId = currentProjectId
    ? (getBackendId('projects', currentProjectId) || currentProjectId)
    : undefined;

  // Get current language from i18n
  const { language: currentLanguage } = useLanguage();

  // Fetch templates (filtered by language)
  const templatesQuery = useQuery({
    queryKey: [...queryKeys.formTemplates(backendProjectId), currentLanguage],
    queryFn: () => getFormTemplates(backendProjectId, currentLanguage),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Seed templates if none exist
  useEffect(() => {
    if (templatesQuery.data && templatesQuery.data.length === 0) {
      console.log('[forms] No templates found, seeding defaults...');
      seedFormTemplates().then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.formTemplates(backendProjectId) });
      }).catch(err => {
        console.error('[forms] Error seeding templates:', err);
      });
    }
  }, [templatesQuery.data]);

  // Fetch form instances
  const formsQuery = useQuery({
    queryKey: queryKeys.formInstances({ projectId: backendProjectId }),
    queryFn: () => getFormInstances({ projectId: backendProjectId, limit: 50 }),
    enabled: !!backendProjectId,
  });

  // Fetch voice lists for current project
  const voiceListsQuery = useQuery({
    queryKey: queryKeys.voiceLists({ projectId: backendProjectId }),
    queryFn: () => getVoiceLists({ projectId: backendProjectId, limit: 50 }),
    enabled: !!backendProjectId,
  });

  // Create form mutation
  const createFormMutation = useMutation({
    mutationFn: (templateId: string) => createFormInstance({
      templateId,
      projectId: backendProjectId!,
    }),
    onSuccess: (newForm) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.formInstances({ projectId: backendProjectId }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/form-fill?id=${newForm.id}`);
    },
    onError: (error) => {
      console.error('[forms] Error creating form:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      setStartingTemplate(null);
    },
  });

  const handleStartForm = (templateId: string) => {
    // Prevent double submissions
    if (createFormMutation.isPending || startingTemplate) {
      return;
    }
    if (!backendProjectId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/(tabs)/projects');
      return;
    }
    setStartingTemplate(templateId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createFormMutation.mutate(templateId);
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.formTemplates(backendProjectId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.formInstances({ projectId: backendProjectId }) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLists({ projectId: backendProjectId }) }),
    ]);
  }, [queryClient, backendProjectId]);

  // Delete form handler
  const handleDeleteForm = useCallback(async (formId: string) => {
    const confirmDelete = (): Promise<boolean> => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm('Are you sure you want to delete this form? This action cannot be undone.'));
        } else {
          Alert.alert(
            'Delete Form',
            'Are you sure you want to delete this form? This action cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDeletingFormId(formId);

    try {
      await deleteFormInstance(formId);
      queryClient.invalidateQueries({ queryKey: queryKeys.formInstances({ projectId: backendProjectId }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[forms] Failed to delete form:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert('Failed to delete form. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete form. Please try again.');
      }
    } finally {
      setDeletingFormId(null);
    }
  }, [queryClient, backendProjectId]);

  // Delete voice list handler
  const handleDeleteVoiceList = useCallback(async (listId: string) => {
    const confirmDelete = (): Promise<boolean> => {
      return new Promise((resolve) => {
        if (Platform.OS === 'web') {
          resolve(window.confirm(t('voiceLists.deleteConfirm')));
        } else {
          Alert.alert(
            t('voiceLists.deleteList'),
            t('voiceLists.deleteConfirm'),
            [
              { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
              { text: t('common.delete'), style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        }
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDeletingVoiceListId(listId);

    try {
      await deleteVoiceList(listId);
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLists({ projectId: backendProjectId }) });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[forms] Failed to delete voice list:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert(t('voiceLists.deleteError'));
      } else {
        Alert.alert(t('common.error'), t('voiceLists.deleteError'));
      }
    } finally {
      setDeletingVoiceListId(null);
    }
  }, [queryClient, backendProjectId, t]);

  // Selection mode handlers
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      } else {
        return new Set(ids);
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkExport = useCallback(async () => {
    // If in selection mode, require selected items
    if (selectionMode && selectedIds.size === 0) {
      Alert.alert('No Selection', 'Please select forms to export');
      return;
    }

    // If not in selection mode, require project
    if (!selectionMode && !backendProjectId) {
      Alert.alert('No Project', 'Please select a project first');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
      // Use selected IDs if in selection mode, otherwise export entire project
      const zipUri = selectionMode && selectedIds.size > 0
        ? await fetchBulkExportByIds('form', Array.from(selectedIds))
        : await fetchBulkExport(backendProjectId!, 'form');

      if (Platform.OS === 'web') {
        // Trigger download
        const a = document.createElement('a');
        a.href = zipUri;
        a.download = 'forms-export.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(zipUri);
      } else {
        // Share the ZIP file on native
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(zipUri, {
            mimeType: 'application/zip',
            dialogTitle: 'Export Forms',
          });
        } else {
          Alert.alert('Error', 'Sharing is not available on this device');
        }
      }
    } catch (error: any) {
      console.error('[bulk-export] Failed:', error);
      Alert.alert('Export Failed', error?.message || 'Failed to export forms');
    } finally {
      setIsExporting(false);
      // Clear selection after export
      if (selectionMode) {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    }
  }, [backendProjectId, selectionMode, selectedIds]);

  // Separate forms by status
  const inProgressForms = React.useMemo(() => {
    if (!formsQuery.data) return [];
    return formsQuery.data.filter(f => f.status === 'DRAFT' || f.status === 'IN_PROGRESS' || f.status === 'PENDING_SIGNATURES');
  }, [formsQuery.data]);

  const completedToday = React.useMemo(() => {
    if (!formsQuery.data) return [];
    const today = new Date().toISOString().split('T')[0];
    return formsQuery.data.filter(f =>
      f.status === 'COMPLETED' &&
      f.completedAt?.startsWith(today)
    );
  }, [formsQuery.data]);

  const templates = templatesQuery.data || [];
  const voiceLists = voiceListsQuery.data || [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={templatesQuery.isFetching || formsQuery.isFetching}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Header with Export Actions */}
        <View className="px-4 pt-4 pb-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('forms.title')}
            </Text>
            <View className="flex-row items-center">
              {selectionMode ? (
                <>
                  <Pressable
                    onPress={clearSelection}
                    className="bg-gray-200 dark:bg-gray-700 px-3 py-2 rounded-lg mr-2"
                  >
                    <Text className="text-gray-700 dark:text-gray-300 text-sm font-medium">
                      {t('common.cancel')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleBulkExport}
                    disabled={isExporting || selectedIds.size === 0}
                    className={cn(
                      "flex-row items-center px-3 py-2 rounded-lg",
                      selectedIds.size > 0 ? "bg-orange-500" : "bg-gray-300 dark:bg-gray-600"
                    )}
                  >
                    {isExporting ? (
                      <ActivityIndicator size={16} color="#FFF" />
                    ) : (
                      <Archive size={16} color="#FFF" />
                    )}
                    <Text className="text-white text-sm font-medium ml-2">
                      {t('export.title')} ({selectedIds.size})
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    onPress={() => setSelectionMode(true)}
                    className="bg-gray-200 dark:bg-gray-700 p-2 rounded-lg mr-2"
                  >
                    <CheckSquare size={18} color="#6B7280" />
                  </Pressable>
                  {backendProjectId && (
                    <Pressable
                      onPress={handleBulkExport}
                      disabled={isExporting}
                      className="flex-row items-center bg-orange-500 px-3 py-2 rounded-lg"
                    >
                      {isExporting ? (
                        <ActivityIndicator size={16} color="#FFF" />
                      ) : (
                        <Archive size={16} color="#FFF" />
                      )}
                      <Text className="text-white text-sm font-medium ml-2">
                        {t('export.title')}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </View>
        </View>

        {/* Project Banner */}
        {currentProject ? (
          <View className="mx-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3">
            <View className="flex-row items-center">
              <Building2 size={18} color="#1F5C1A" />
              <Text className="ml-2 text-sm font-medium text-orange-700 dark:text-orange-300">
                {currentProject.name}
              </Text>
            </View>
          </View>
        ) : projects.length > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/projects')}
            className="mx-4 mt-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3"
          >
            <View className="flex-row items-center">
              <AlertTriangle size={18} color="#F59E0B" />
              <Text className="ml-2 text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Select a project to use forms
              </Text>
            </View>
          </Pressable>
        ) : null}

        {/* In Progress Section */}
        {inProgressForms.length > 0 && (
          <Animated.View entering={FadeIn} className="px-4 mt-6">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              In Progress ({inProgressForms.length})
            </Text>
            {selectionMode && inProgressForms.length > 0 && (
              <Pressable
                onPress={() => toggleSelectAll(inProgressForms.map(f => f.id))}
                className="flex-row items-center mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                {inProgressForms.every(f => selectedIds.has(f.id)) ? (
                  <CheckSquare size={20} color="#1F5C1A" />
                ) : (
                  <Square size={20} color="#9CA3AF" />
                )}
                <Text className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  Select All In Progress ({inProgressForms.length})
                </Text>
              </Pressable>
            )}
            {inProgressForms.map((form, index) => (
              <Animated.View key={form.id} entering={FadeInDown.delay(index * 50)}>
                <View className="flex-row items-center">
                  {selectionMode && (
                    <Pressable
                      onPress={() => toggleSelection(form.id)}
                      className="mr-3 p-1"
                    >
                      {selectedIds.has(form.id) ? (
                        <CheckSquare size={24} color="#1F5C1A" />
                      ) : (
                        <Square size={24} color="#9CA3AF" />
                      )}
                    </Pressable>
                  )}
                  <View className="flex-1">
                    <FormCard
                      form={form}
                      onPress={() => selectionMode ? toggleSelection(form.id) : router.push(`/form-fill?id=${form.id}`)}
                      onDelete={() => handleDeleteForm(form.id)}
                      isDeleting={deletingFormId === form.id}
                    />
                  </View>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* Templates Section */}
        <Animated.View entering={FadeIn} className="px-4 mt-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Start New Form
          </Text>

          {templatesQuery.isLoading ? (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
              <ActivityIndicator size="small" color="#1F5C1A" />
              <Text className="mt-2 text-gray-500">Loading templates...</Text>
            </View>
          ) : templates.length === 0 ? (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
              <FileText size={32} color="#9CA3AF" />
              <Text className="mt-3 text-gray-500 dark:text-gray-400 text-center">
                No templates available yet
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {templates.map((template, index) => (
                <Animated.View key={template.id} entering={FadeInDown.delay(index * 50)}>
                  <TemplateCard
                    template={template}
                    onStart={() => handleStartForm(template.id)}
                    isLoading={startingTemplate === template.id}
                  />
                </Animated.View>
              ))}
            </View>
          )}

          {/* Upload Template Button (for future) */}
          <Pressable
            className="mt-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-4 items-center"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // TODO: Implement template upload
              alert('Template upload coming soon!');
            }}
          >
            <Upload size={24} color="#9CA3AF" />
            <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Upload Custom Template
            </Text>
          </Pressable>
        </Animated.View>

        {/* Voice Lists Section */}
        <Animated.View entering={FadeIn} className="px-4 mt-6">
          <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            {t('voiceLists.title')}
          </Text>

          {/* New Voice List Button */}
          <Pressable
            onPress={() => {
              if (!backendProjectId) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                router.push('/(tabs)/projects');
                return;
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/voice-list-create');
            }}
            className="bg-gradient-to-r bg-orange-500 rounded-xl p-4 flex-row items-center mb-4"
            style={{
              shadowColor: '#1F5C1A',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <View className="w-12 h-12 rounded-full bg-white/20 items-center justify-center mr-4">
              <Mic size={24} color="white" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-white">
                {t('voiceLists.newList')}
              </Text>
              <Text className="text-sm text-white/80">
                {t('voiceLists.tapToRecord')}
              </Text>
            </View>
            <Package size={24} color="white" />
          </Pressable>

          {/* Existing Voice Lists */}
          {voiceListsQuery.isLoading ? (
            <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
              <ActivityIndicator size="small" color="#1F5C1A" />
              <Text className="mt-2 text-gray-500">{t('common.loading')}</Text>
            </View>
          ) : voiceLists.length > 0 ? (
            <View>
              {voiceLists.map((list, index) => (
                <Animated.View key={list.id} entering={FadeInDown.delay(index * 50)}>
                  <VoiceListCard
                    voiceList={list}
                    onPress={() => router.push(`/voice-list-detail?id=${list.id}`)}
                    onDelete={() => handleDeleteVoiceList(list.id)}
                    isDeleting={deletingVoiceListId === list.id}
                    t={t}
                  />
                </Animated.View>
              ))}
            </View>
          ) : null}
        </Animated.View>

        {/* Completed Today Section */}
        {completedToday.length > 0 && (
          <Animated.View entering={FadeIn} className="px-4 mt-6">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Completed Today ({completedToday.length})
            </Text>
            {selectionMode && completedToday.length > 0 && (
              <Pressable
                onPress={() => toggleSelectAll(completedToday.map(f => f.id))}
                className="flex-row items-center mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                {completedToday.every(f => selectedIds.has(f.id)) ? (
                  <CheckSquare size={20} color="#1F5C1A" />
                ) : (
                  <Square size={20} color="#9CA3AF" />
                )}
                <Text className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  Select All Completed ({completedToday.length})
                </Text>
              </Pressable>
            )}
            {completedToday.map((form, index) => (
              <Animated.View key={form.id} entering={FadeInDown.delay(index * 50)}>
                <View className="flex-row items-center">
                  {selectionMode && (
                    <Pressable
                      onPress={() => toggleSelection(form.id)}
                      className="mr-3 p-1"
                    >
                      {selectedIds.has(form.id) ? (
                        <CheckSquare size={24} color="#1F5C1A" />
                      ) : (
                        <Square size={24} color="#9CA3AF" />
                      )}
                    </Pressable>
                  )}
                  <View className="flex-1">
                    <FormCard
                      form={form}
                      onPress={() => selectionMode ? toggleSelection(form.id) : router.push(`/form-fill?id=${form.id}`)}
                      onDelete={() => handleDeleteForm(form.id)}
                      isDeleting={deletingFormId === form.id}
                    />
                  </View>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
