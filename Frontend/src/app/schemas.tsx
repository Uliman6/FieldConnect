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
  FileSearch,
  Upload,
  Trash2,
  ChevronRight,
  ArrowLeft,
  Plus,
  AlertCircle,
  CheckCircle2,
  X,
  Building2,
  Shield,
  Brain,
  FileText,
  Sparkles,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { cn } from '@/lib/cn';
import {
  getDocumentSchemas,
  getProjects,
  learnDocumentSchema,
  analyzeDocument,
  deleteDocumentSchema,
  queryKeys,
  type ProjectSummary,
  type AnalyzeDocumentResult,
} from '@/lib/api';
import type { DocumentSchema, SchemaDocumentType, SchemaField } from '@/lib/types';

const DOCUMENT_TYPE_LABELS: Record<SchemaDocumentType, string> = {
  PUNCH_LIST: 'Punch List',
  RFI: 'RFI',
  DAILY_REPORT: 'Daily Report',
  SAFETY_REPORT: 'Safety Report',
  INSPECTION: 'Inspection',
  CUSTOM: 'Custom',
};

const DOCUMENT_TYPE_COLORS: Record<SchemaDocumentType, string> = {
  PUNCH_LIST: '#F59E0B',
  RFI: '#3B82F6',
  DAILY_REPORT: '#10B981',
  SAFETY_REPORT: '#EF4444',
  INSPECTION: '#8B5CF6',
  CUSTOM: '#6B7280',
};

const FIELD_TYPE_ICONS: Record<string, string> = {
  text: 'Aa',
  number: '#',
  date: 'D',
  datetime: 'DT',
  boolean: '?',
  select: '[]',
  multiline: '....',
  person: 'P',
  company: 'C',
  location: 'L',
  attachment: 'A',
};

function SchemaCard({
  schema,
  onDelete,
  onView,
}: {
  schema: DocumentSchema;
  onDelete: () => void;
  onView: () => void;
}) {
  const color = DOCUMENT_TYPE_COLORS[schema.documentType];
  const typeLabel = DOCUMENT_TYPE_LABELS[schema.documentType];
  const confidencePercent = schema.confidence ? Math.round(schema.confidence * 100) : null;

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <Pressable
        onPress={onView}
        className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700 active:opacity-80"
      >
        <View className="flex-row items-start justify-between mb-3">
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <View
                className="w-10 h-10 rounded-lg items-center justify-center mr-3"
                style={{ backgroundColor: color + '20' }}
              >
                <Brain size={20} color={color} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900 dark:text-white">
                  {schema.name}
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
                    v{schema.version}
                  </Text>
                  {confidencePercent !== null && (
                    <View className="flex-row items-center ml-2 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30">
                      <Sparkles size={10} color="#10B981" />
                      <Text className="text-xs font-medium text-green-600 dark:text-green-400 ml-1">
                        {confidencePercent}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </View>

        {schema.description && (
          <Text className="text-sm text-gray-600 dark:text-gray-300 mb-3" numberOfLines={2}>
            {schema.description}
          </Text>
        )}

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {schema.fields.length} fields detected
            </Text>
            {schema.sourceFileName && (
              <>
                <Text className="text-xs text-gray-400 mx-2">|</Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
                  {schema.sourceFileName}
                </Text>
              </>
            )}
          </View>

          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20"
          >
            <Trash2 size={16} color="#EF4444" />
          </Pressable>
        </View>

        {schema.fields.length > 0 && (
          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              Detected Fields
            </Text>
            <View className="flex-row flex-wrap gap-1">
              {schema.fields.slice(0, 6).map((field, idx) => (
                <View
                  key={idx}
                  className="flex-row items-center px-2 py-1 rounded bg-gray-100 dark:bg-gray-700"
                >
                  <Text className="text-[10px] font-mono text-gray-400 mr-1">
                    {FIELD_TYPE_ICONS[field.type] || 'T'}
                  </Text>
                  <Text className="text-xs text-gray-600 dark:text-gray-300">
                    {field.label}
                  </Text>
                </View>
              ))}
              {schema.fields.length > 6 && (
                <View className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                  <Text className="text-xs text-gray-500">
                    +{schema.fields.length - 6} more
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function AnalyzeModal({
  visible,
  onClose,
  onSave,
  isSaving,
  result,
  projects,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, projectId?: string) => void;
  isSaving: boolean;
  result: AnalyzeDocumentResult | null;
  projects?: ProjectSummary[];
}) {
  const [name, setName] = useState(result?.schema.documentName || '');
  const [projectId, setProjectId] = useState<string | undefined>();

  React.useEffect(() => {
    if (result?.schema.documentName) {
      setName(result.schema.documentName);
    }
  }, [result]);

  if (!visible || !result) return null;

  return (
    <View className="absolute inset-0 bg-black/50 items-center justify-center p-4 z-50">
      <View className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[80%]">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Sparkles size={24} color="#10B981" />
            <Text className="text-xl font-bold text-gray-900 dark:text-white ml-2">
              Schema Detected
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            className="p-2 rounded-full bg-gray-100 dark:bg-gray-700"
          >
            <X size={20} color="#6B7280" />
          </Pressable>
        </View>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          <View className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg mb-4">
            <Text className="text-sm text-green-700 dark:text-green-300">
              AI detected {result.schema.fields.length} fields from "{result.fileName}"
            </Text>
            {result.schema.confidence && (
              <Text className="text-xs text-green-600 dark:text-green-400 mt-1">
                Confidence: {Math.round(result.schema.confidence * 100)}%
              </Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Schema Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Enter schema name"
              className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3 text-gray-900 dark:text-white"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {projects && projects.length > 0 && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project (optional)
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
                      Global
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
            </View>
          )}

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Detected Fields ({result.schema.fields.length})
            </Text>
            <View className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 max-h-48">
              <ScrollView showsVerticalScrollIndicator={false}>
                {result.schema.fields.map((field, idx) => (
                  <View
                    key={idx}
                    className="flex-row items-center py-2 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                  >
                    <View className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-600 items-center justify-center mr-3">
                      <Text className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        {FIELD_TYPE_ICONS[field.type] || 'T'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {field.label}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        {field.type} {field.required && '(required)'}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>

          {result.schema.description && (
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                {result.schema.description}
              </Text>
            </View>
          )}
        </ScrollView>

        <View className="flex-row gap-3 mt-4">
          <Pressable
            onPress={onClose}
            className="flex-1 py-3 rounded-xl items-center bg-gray-100 dark:bg-gray-700"
          >
            <Text className="text-gray-700 dark:text-gray-300 font-semibold">Discard</Text>
          </Pressable>
          <Pressable
            onPress={() => onSave(name.trim() || result.schema.documentName, projectId)}
            disabled={isSaving}
            className={cn(
              'flex-1 py-3 rounded-xl items-center',
              isSaving ? 'bg-green-400' : 'bg-green-600'
            )}
          >
            {isSaving ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-semibold">Save Schema</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function UploadModal({
  visible,
  onClose,
  onAnalyze,
  isAnalyzing,
}: {
  visible: boolean;
  onClose: () => void;
  onAnalyze: (file: any, documentType: SchemaDocumentType) => void;
  isAnalyzing: boolean;
}) {
  const [documentType, setDocumentType] = useState<SchemaDocumentType>('PUNCH_LIST');
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setSelectedFile(result.assets[0]);
        setError(null);
      }
    } catch (err) {
      setError('Failed to pick file');
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      setError('Please select a document file');
      return;
    }
    onAnalyze(selectedFile, documentType);
  };

  const resetForm = () => {
    setDocumentType('PUNCH_LIST');
    setSelectedFile(null);
    setError(null);
  };

  if (!visible) return null;

  return (
    <View className="absolute inset-0 bg-black/50 items-center justify-center p-4 z-50">
      <View className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
        <View className="flex-row items-center justify-between mb-6">
          <View className="flex-row items-center">
            <Brain size={24} color="#3B82F6" />
            <Text className="text-xl font-bold text-gray-900 dark:text-white ml-2">
              Learn Schema
            </Text>
          </View>
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

        <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Upload a sample document and AI will detect its field structure.
        </Text>

        {error && (
          <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 p-3 rounded-lg mb-4">
            <AlertCircle size={16} color="#EF4444" />
            <Text className="text-red-600 dark:text-red-400 text-sm ml-2 flex-1">
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
              <FileSearch size={32} color="#6B7280" />
              <Text className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-center">
                Tap to select PDF, DOCX, or TXT
              </Text>
            </View>
          )}
        </Pressable>

        <View className="mb-6">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Document Type
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {(['PUNCH_LIST', 'RFI', 'DAILY_REPORT', 'SAFETY_REPORT', 'INSPECTION', 'CUSTOM'] as SchemaDocumentType[]).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setDocumentType(type)}
                  className={cn(
                    'py-2 px-3 rounded-lg border-2',
                    documentType === type
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600'
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      documentType === type
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    {DOCUMENT_TYPE_LABELS[type]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={isAnalyzing}
          className={cn(
            'py-3 rounded-xl items-center flex-row justify-center',
            isAnalyzing ? 'bg-blue-400' : 'bg-blue-600'
          )}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-semibold ml-2">Analyzing...</Text>
            </>
          ) : (
            <>
              <Sparkles size={18} color="white" />
              <Text className="text-white font-semibold ml-2">Analyze with AI</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function SchemasScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeDocumentResult | null>(null);
  const [pendingFile, setPendingFile] = useState<any>(null);
  const [pendingDocType, setPendingDocType] = useState<SchemaDocumentType>('PUNCH_LIST');
  const [refreshing, setRefreshing] = useState(false);

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => getProjects(),
  });

  const {
    data: schemas,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.documentSchemas({}),
    queryFn: () => getDocumentSchemas(),
  });

  const analyzeMutation = useMutation({
    mutationFn: async ({ file, documentType }: { file: any; documentType: SchemaDocumentType }) => {
      let fileToUpload: File;
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: file.mimeType || 'application/pdf' });
      } else {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], file.name, { type: file.mimeType || 'application/pdf' });
      }
      return analyzeDocument(fileToUpload, documentType);
    },
    onSuccess: (result, variables) => {
      setAnalyzeResult(result);
      setPendingFile(variables.file);
      setPendingDocType(variables.documentType);
      setShowUploadModal(false);
      setShowAnalyzeModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert(`Analysis failed: ${err.message}`);
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ name, projectId }: { name: string; projectId?: string }) => {
      if (!pendingFile) throw new Error('No file selected');

      let fileToUpload: File;
      if (Platform.OS === 'web') {
        const response = await fetch(pendingFile.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], pendingFile.name, { type: pendingFile.mimeType || 'application/pdf' });
      } else {
        const response = await fetch(pendingFile.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], pendingFile.name, { type: pendingFile.mimeType || 'application/pdf' });
      }

      return learnDocumentSchema(fileToUpload, {
        name,
        documentType: pendingDocType,
        projectId,
        description: analyzeResult?.schema.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-schemas'] });
      setShowAnalyzeModal(false);
      setAnalyzeResult(null);
      setPendingFile(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert(`Save failed: ${err.message}`);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDocumentSchema,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-schemas'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = (schema: DocumentSchema) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete schema "${schema.name}"?`)) {
        deleteMutation.mutate(schema.id);
      }
    } else {
      deleteMutation.mutate(schema.id);
    }
  };

  const handleAnalyze = (file: any, documentType: SchemaDocumentType) => {
    analyzeMutation.mutate({ file, documentType });
  };

  const handleSave = (name: string, projectId?: string) => {
    saveMutation.mutate({ name, projectId });
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Document Schemas',
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
              <Brain size={18} color="white" />
              <Text className="text-white font-medium ml-1">Learn</Text>
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
        {/* Info Banner */}
        <View className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mb-4 flex-row">
          <Sparkles size={20} color="#3B82F6" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-medium text-blue-700 dark:text-blue-300">
              AI-Powered Schema Learning
            </Text>
            <Text className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              Upload sample documents (Punch Lists, RFIs, etc.) and AI will automatically detect their field structure for future use.
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View className="py-20 items-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-gray-500 mt-4">Loading schemas...</Text>
          </View>
        ) : error ? (
          <View className="py-20 items-center">
            <AlertCircle size={48} color="#EF4444" />
            <Text className="text-red-500 mt-4 text-center">
              Failed to load schemas
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-4 bg-blue-600 px-6 py-2 rounded-lg"
            >
              <Text className="text-white font-medium">Retry</Text>
            </Pressable>
          </View>
        ) : schemas?.length === 0 ? (
          <View className="py-20 items-center">
            <Brain size={48} color="#9CA3AF" />
            <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
              No schemas learned yet
            </Text>
            <Text className="text-gray-400 dark:text-gray-500 mt-1 text-center text-sm px-8">
              Upload a sample document to teach the system its field structure
            </Text>
            <Pressable
              onPress={() => setShowUploadModal(true)}
              className="mt-6 bg-blue-600 px-6 py-3 rounded-xl flex-row items-center"
            >
              <FileSearch size={18} color="white" />
              <Text className="text-white font-semibold ml-2">
                Analyze Document
              </Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {schemas?.length} schema{schemas?.length !== 1 ? 's' : ''} learned
            </Text>
            {schemas?.map((schema) => (
              <SchemaCard
                key={schema.id}
                schema={schema}
                onDelete={() => handleDelete(schema)}
                onView={() => {
                  // TODO: Navigate to schema detail page
                  Haptics.selectionAsync();
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <UploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onAnalyze={handleAnalyze}
        isAnalyzing={analyzeMutation.isPending}
      />

      <AnalyzeModal
        visible={showAnalyzeModal}
        onClose={() => {
          setShowAnalyzeModal(false);
          setAnalyzeResult(null);
          setPendingFile(null);
        }}
        onSave={handleSave}
        isSaving={saveMutation.isPending}
        result={analyzeResult}
        projects={projects}
      />
    </View>
  );
}
