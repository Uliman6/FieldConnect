import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  ChevronRight,
  ArrowLeft,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  Building2,
  Shield,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { cn } from '@/lib/cn';
import {
  getTemplates,
  getProjectTemplates,
  getProjects,
  uploadTemplate,
  deleteTemplate,
  getTemplateDownloadUrl,
  queryKeys,
  type ProjectSummary,
} from '@/lib/api';
import type { PdfTemplate, TemplateType } from '@/lib/types';
import { getAuthToken } from '@/lib/auth-store';

const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  PUNCH_LIST: 'Punch List',
  RFI: 'RFI',
  CUSTOM: 'Custom',
};

const TEMPLATE_TYPE_COLORS: Record<TemplateType, string> = {
  PUNCH_LIST: '#F59E0B',
  RFI: '#3B82F6',
  CUSTOM: '#8B5CF6',
};

function TemplateCard({
  template,
  onDelete,
  onDownload,
  showProjectBadge = false,
}: {
  template: PdfTemplate;
  onDelete: () => void;
  onDownload: () => void;
  showProjectBadge?: boolean;
}) {
  const color = TEMPLATE_TYPE_COLORS[template.templateType];
  const typeLabel = TEMPLATE_TYPE_LABELS[template.templateType];
  const isAdminTemplate = !template.projectId;

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
        <View className="flex-row items-start justify-between mb-3">
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                style={{ backgroundColor: color + '20' }}
              >
                <FileText size={18} color={color} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900 dark:text-white">
                  {template.name}
                </Text>
                <View className="flex-row items-center mt-0.5 flex-wrap">
                  <View
                    className="px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: color + '20' }}
                  >
                    <Text className="text-xs font-medium" style={{ color }}>
                      {typeLabel}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    v{template.version}
                  </Text>
                  {showProjectBadge && isAdminTemplate && (
                    <View className="flex-row items-center ml-2 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30">
                      <Shield size={10} color="#8B5CF6" />
                      <Text className="text-xs font-medium text-purple-600 dark:text-purple-400 ml-1">
                        Default
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {template.description && (
          <Text className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            {template.description}
          </Text>
        )}

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {template.formFields.length} fields
            </Text>
            <Text className="text-xs text-gray-400 mx-2">|</Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {(template.fileSize / 1024).toFixed(1)} KB
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onDownload}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700"
            >
              <Download size={16} color="#6B7280" />
            </Pressable>
            <Pressable
              onPress={onDelete}
              className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20"
            >
              <Trash2 size={16} color="#EF4444" />
            </Pressable>
          </View>
        </View>

        {template.formFields.length > 0 && (
          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Form Fields
            </Text>
            <View className="flex-row flex-wrap gap-1">
              {template.formFields.slice(0, 6).map((field, idx) => (
                <View
                  key={idx}
                  className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700"
                >
                  <Text className="text-xs text-gray-600 dark:text-gray-300">
                    {field.label}
                  </Text>
                </View>
              ))}
              {template.formFields.length > 6 && (
                <View className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                  <Text className="text-xs text-gray-500">
                    +{template.formFields.length - 6} more
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function UploadModal({
  visible,
  onClose,
  onUpload,
  isUploading,
  selectedProjectId,
  projects,
}: {
  visible: boolean;
  onClose: () => void;
  onUpload: (file: any, name: string, type: TemplateType, description: string, projectId?: string) => void;
  isUploading: boolean;
  selectedProjectId?: string;
  projects?: ProjectSummary[];
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<TemplateType>('PUNCH_LIST');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | undefined>(selectedProjectId);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setSelectedFile(result.assets[0]);
        if (!name) {
          // Auto-fill name from filename
          const fileName = result.assets[0].name.replace(/\.pdf$/i, '');
          setName(fileName);
        }
        setError(null);
      }
    } catch (err) {
      setError('Failed to pick file');
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError('Please select a PDF file');
      return;
    }
    if (!name.trim()) {
      setError('Please enter a template name');
      return;
    }
    onUpload(selectedFile, name.trim(), templateType, description.trim(), projectId);
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setTemplateType('PUNCH_LIST');
    setSelectedFile(null);
    setError(null);
    setProjectId(selectedProjectId);
  };

  if (!visible) return null;

  return (
    <View className="absolute inset-0 bg-black/50 items-center justify-center p-4 z-50">
      <View className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-xl font-bold text-gray-900 dark:text-white">
            Upload Template
          </Text>
          <Pressable
            onPress={() => {
              resetForm();
              onClose();
            }}
            className="p-2 rounded-full bg-gray-100 dark:bg-gray-700"
          >
            <X size={20} color="#6B7280" />
          </Pressable>
        </View>

        {error && (
          <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-4">
            <AlertCircle size={16} color="#EF4444" />
            <Text className="text-red-600 dark:text-red-400 text-sm ml-2">
              {error}
            </Text>
          </View>
        )}

        <Pressable
          onPress={handlePickFile}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 items-center justify-center mb-4"
        >
          {selectedFile ? (
            <View className="items-center">
              <CheckCircle2 size={32} color="#10B981" />
              <Text className="text-sm text-gray-700 dark:text-gray-300 mt-2 text-center">
                {selectedFile.name}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Tap to change file
              </Text>
            </View>
          ) : (
            <View className="items-center">
              <Upload size={32} color="#6B7280" />
              <Text className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Tap to select PDF
              </Text>
            </View>
          )}
        </Pressable>

        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Template Name *
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g., Punch List Form"
            className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3 text-gray-900 dark:text-white"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Template Type
          </Text>
          <View className="flex-row gap-2">
            {(['PUNCH_LIST', 'RFI', 'CUSTOM'] as TemplateType[]).map((type) => (
              <Pressable
                key={type}
                onPress={() => setTemplateType(type)}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg border-2',
                  templateType === type
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-600'
                )}
              >
                <Text
                  className={cn(
                    'text-sm text-center font-medium',
                    templateType === type
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400'
                  )}
                >
                  {TEMPLATE_TYPE_LABELS[type]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Project Selector - only show if projects available */}
        {projects && projects.length > 0 && (
          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Template Scope
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setProjectId(undefined)}
                  className={cn(
                    'py-2 px-3 rounded-lg border-2 flex-row items-center',
                    !projectId
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : 'border-gray-200 dark:border-gray-600'
                  )}
                >
                  <Shield size={14} color={!projectId ? '#8B5CF6' : '#6B7280'} />
                  <Text
                    className={cn(
                      'text-sm font-medium ml-1',
                      !projectId
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    Default
                  </Text>
                </Pressable>
                {projects.map((project) => (
                  <Pressable
                    key={project.id}
                    onPress={() => setProjectId(project.id)}
                    className={cn(
                      'py-2 px-3 rounded-lg border-2 flex-row items-center',
                      projectId === project.id
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                        : 'border-gray-200 dark:border-gray-600'
                    )}
                  >
                    <Building2 size={14} color={projectId === project.id ? '#1F5C1A' : '#6B7280'} />
                    <Text
                      className={cn(
                        'text-sm font-medium ml-1',
                        projectId === project.id
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-600 dark:text-gray-400'
                      )}
                      numberOfLines={1}
                    >
                      {project.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {projectId ? 'Template will override default for this project' : 'Template available to all projects'}
            </Text>
          </View>
        )}

        <View className="mb-6">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description (optional)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description of the template"
            multiline
            numberOfLines={2}
            className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3 text-gray-900 dark:text-white"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={isUploading}
          className={cn(
            'py-3 rounded-xl items-center',
            isUploading ? 'bg-blue-400' : 'bg-blue-600'
          )}
        >
          {isUploading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-semibold">Upload Template</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type ViewMode = 'admin' | 'project';

export default function TemplatesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('admin');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  // Fetch projects for project selector
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => getProjects(),
  });

  const {
    data: templates,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: viewMode === 'admin'
      ? [...queryKeys.templates, 'admin']
      : [...queryKeys.templates, 'project', selectedProjectId],
    queryFn: () => viewMode === 'admin'
      ? getTemplates({ adminOnly: true })
      : selectedProjectId
        ? getTemplates({ projectId: selectedProjectId })
        : getTemplates({ adminOnly: true }),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      name,
      templateType,
      description,
      projectId,
    }: {
      file: any;
      name: string;
      templateType: TemplateType;
      description: string;
      projectId?: string;
    }) => {
      // For web, we need to create a File object from the document picker result
      let fileToUpload: File;

      if (Platform.OS === 'web') {
        // On web, fetch the file and create a proper File object
        const response = await fetch(file.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: 'application/pdf' });
      } else {
        // On native, we need to handle differently
        const response = await fetch(file.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: 'application/pdf' });
      }

      return uploadTemplate(fileToUpload, { name, templateType, description, projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      setShowUploadModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDownload = async (template: PdfTemplate) => {
    const url = getTemplateDownloadUrl(template.id);
    const token = getAuthToken();

    if (Platform.OS === 'web') {
      // Create a hidden anchor element to trigger download with auth
      const link = document.createElement('a');

      try {
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = template.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch (err) {
        console.error('Download failed:', err);
      }
    }
  };

  const handleDelete = (template: PdfTemplate) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete template "${template.name}"?`)) {
        deleteMutation.mutate(template.id);
      }
    } else {
      deleteMutation.mutate(template.id);
    }
  };

  const handleUpload = (
    file: any,
    name: string,
    templateType: TemplateType,
    description: string,
    projectId?: string
  ) => {
    uploadMutation.mutate({ file, name, templateType, description, projectId });
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'PDF Templates',
          headerTitleStyle: { fontWeight: '600' },
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              className="p-2 mr-2 rounded-full"
            >
              <ArrowLeft size={24} color="#1F2937" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => setShowUploadModal(true)}
              className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg mr-2"
            >
              <Plus size={18} color="white" />
              <Text className="text-white font-medium ml-1">Add</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Mode Selector */}
        <View className="mb-4">
          <View className="flex-row bg-gray-200 dark:bg-gray-700 rounded-xl p-1">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setViewMode('admin');
                setSelectedProjectId(undefined);
              }}
              className={cn(
                'flex-1 py-2 rounded-lg flex-row items-center justify-center',
                viewMode === 'admin' && 'bg-white dark:bg-gray-800'
              )}
            >
              <Shield size={16} color={viewMode === 'admin' ? '#8B5CF6' : '#6B7280'} />
              <Text
                className={cn(
                  'font-medium ml-1.5',
                  viewMode === 'admin'
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                Default Templates
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setViewMode('project');
                // Auto-select first project if available
                if (projects && projects.length > 0 && !selectedProjectId) {
                  setSelectedProjectId(projects[0].id);
                }
              }}
              className={cn(
                'flex-1 py-2 rounded-lg flex-row items-center justify-center',
                viewMode === 'project' && 'bg-white dark:bg-gray-800'
              )}
            >
              <Building2 size={16} color={viewMode === 'project' ? '#1F5C1A' : '#6B7280'} />
              <Text
                className={cn(
                  'font-medium ml-1.5',
                  viewMode === 'project'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-gray-500 dark:text-gray-400'
                )}
              >
                By Project
              </Text>
            </Pressable>
          </View>
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
            {viewMode === 'admin'
              ? 'Default templates are available to all projects'
              : 'Project templates override default templates'}
          </Text>
        </View>

        {/* Project Selector (when in project mode) */}
        {viewMode === 'project' && projects && projects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
          >
            <View className="flex-row gap-2">
              {projects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedProjectId(project.id);
                  }}
                  className={cn(
                    'px-4 py-2 rounded-xl',
                    selectedProjectId === project.id
                      ? 'bg-orange-500'
                      : 'bg-white dark:bg-gray-800'
                  )}
                >
                  <Text
                    className={cn(
                      'font-medium',
                      selectedProjectId === project.id
                        ? 'text-white'
                        : 'text-gray-600 dark:text-gray-300'
                    )}
                    numberOfLines={1}
                  >
                    {project.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {viewMode === 'project' && (!projects || projects.length === 0) && (
          <View className="py-8 items-center bg-yellow-50 dark:bg-yellow-900/20 rounded-xl mb-4">
            <AlertCircle size={32} color="#F59E0B" />
            <Text className="text-yellow-700 dark:text-yellow-300 mt-2 text-center">
              No projects available
            </Text>
            <Text className="text-yellow-600 dark:text-yellow-400 text-sm mt-1 text-center">
              Create a project first to add project-specific templates
            </Text>
          </View>
        )}

        {isLoading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-gray-500 mt-4">Loading templates...</Text>
          </View>
        ) : error ? (
          <View className="py-20 items-center">
            <AlertCircle size={48} color="#EF4444" />
            <Text className="text-red-500 mt-4 text-center">
              Failed to load templates
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-4 bg-blue-600 px-6 py-2 rounded-lg"
            >
              <Text className="text-white font-medium">Retry</Text>
            </Pressable>
          </View>
        ) : templates?.length === 0 ? (
          <View className="py-20 items-center">
            <FileText size={48} color="#9CA3AF" />
            <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
              No templates yet
            </Text>
            <Text className="text-gray-400 dark:text-gray-500 mt-1 text-center text-sm">
              Upload a fillable PDF to get started
            </Text>
            <Pressable
              onPress={() => setShowUploadModal(true)}
              className="mt-6 bg-blue-600 px-6 py-3 rounded-xl flex-row items-center"
            >
              <Upload size={18} color="white" />
              <Text className="text-white font-semibold ml-2">
                Upload Template
              </Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {templates?.length} template{templates?.length !== 1 ? 's' : ''} available
              {viewMode === 'project' && selectedProjectId && ' (including default templates)'}
            </Text>
            {templates?.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onDelete={() => handleDelete(template)}
                onDownload={() => handleDownload(template)}
                showProjectBadge={viewMode === 'project'}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUpload}
        isUploading={uploadMutation.isPending}
        selectedProjectId={viewMode === 'project' ? selectedProjectId : undefined}
        projects={projects}
      />
    </View>
  );
}
