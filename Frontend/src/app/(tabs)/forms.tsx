import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDailyLogStore } from '@/lib/store';
import {
  getFormTemplates,
  getFormInstances,
  createFormInstance,
  seedFormTemplates,
  queryKeys,
  FormTemplate,
  FormInstance,
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
} from 'lucide-react-native';
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

function FormCard({ form, onPress }: { form: FormInstance; onPress: () => void }) {
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
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
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
            {form.template?.name || 'Form'}
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
        </View>

        <View className="items-end justify-center">
          {form.status === 'COMPLETED' ? (
            <CheckCircle2 size={24} color="#10B981" />
          ) : (
            <ChevronRight size={24} color="#9CA3AF" />
          )}
        </View>
      </View>
    </Pressable>
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
        <ClipboardList size={20} color="#F97316" />
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
        <ActivityIndicator size="small" color="#F97316" />
      ) : (
        <View className="bg-orange-500 rounded-full p-2">
          <Plus size={16} color="white" />
        </View>
      )}
    </Pressable>
  );
}

export default function FormsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [startingTemplate, setStartingTemplate] = useState<string | null>(null);

  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Get backend project ID
  const backendProjectId = currentProjectId
    ? (getBackendId('projects', currentProjectId) || currentProjectId)
    : undefined;

  // Fetch templates
  const templatesQuery = useQuery({
    queryKey: queryKeys.formTemplates(backendProjectId),
    queryFn: () => getFormTemplates(backendProjectId),
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
    ]);
  }, [queryClient, backendProjectId]);

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
        {/* Project Banner */}
        {currentProject ? (
          <View className="mx-4 mt-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3">
            <View className="flex-row items-center">
              <Building2 size={18} color="#F97316" />
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
            {inProgressForms.map((form, index) => (
              <Animated.View key={form.id} entering={FadeInDown.delay(index * 50)}>
                <FormCard
                  form={form}
                  onPress={() => router.push(`/form-fill?id=${form.id}`)}
                />
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
              <ActivityIndicator size="small" color="#F97316" />
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

        {/* Completed Today Section */}
        {completedToday.length > 0 && (
          <Animated.View entering={FadeIn} className="px-4 mt-6">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Completed Today ({completedToday.length})
            </Text>
            {completedToday.map((form, index) => (
              <Animated.View key={form.id} entering={FadeInDown.delay(index * 50)}>
                <FormCard
                  form={form}
                  onPress={() => router.push(`/form-fill?id=${form.id}`)}
                />
              </Animated.View>
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}
