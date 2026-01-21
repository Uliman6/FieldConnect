import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDailyLogStore } from '@/lib/store';
import { EventType, EventSeverity, Event, PdfTemplate, FormFieldDefinition, DocumentSchema, SchemaField, EventSchemaData } from '@/lib/types';
import { audioFileExists } from '@/lib/audio-storage';
import { generateTitleFromTranscript } from '@/lib/transcription';
import { cn } from '@/lib/cn';
import { getBackendId } from '@/lib/data-provider';
import {
  getEvent,
  queryKeys,
  IndexedEvent,
  getTemplates,
  getEventTemplateData,
  attachTemplateToEvent,
  updateEventTemplateData,
  fetchFilledPdf,
  deleteEventApi,
  getDocumentSchemas,
  applySchemaToEvent,
  updateEventSchemaData,
  removeEventSchemaData,
  reExtractSchemaData,
} from '@/lib/api';
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  ClipboardPlus,
  Trash2,
  MapPin,
  HardHat,
  Save,
  AlertTriangle,
  FileText,
  Copy,
  Sparkles,
  Building2,
  Calendar,
  Download,
  ChevronDown,
  X,
  Wand2,
  RefreshCw,
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/lib/useColorScheme';
import { format } from 'date-fns';

const EVENT_TYPES: EventType[] = [
  'Delay',
  'Quality',
  'Safety',
  'Inspection',
  'Material',
  'Equipment',
  'Coordination',
  'Other',
];

const SEVERITIES: EventSeverity[] = ['Low', 'Medium', 'High'];

const EVENT_TYPE_COLORS: Record<EventType, string> = {
  Delay: '#EF4444',
  Quality: '#F59E0B',
  Safety: '#DC2626',
  Inspection: '#8B5CF6',
  Material: '#3B82F6',
  Equipment: '#6B7280',
  Coordination: '#10B981',
  Other: '#6B7280',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  Low: '#10B981',
  Medium: '#F59E0B',
  High: '#EF4444',
};

const TEMPLATE_TYPE_COLORS: Record<string, string> = {
  PUNCH_LIST: '#F59E0B',
  RFI: '#3B82F6',
  CUSTOM: '#8B5CF6',
};

const SCHEMA_TYPE_COLORS: Record<string, string> = {
  PUNCH_LIST: '#F59E0B',
  RFI: '#3B82F6',
  DAILY_REPORT: '#10B981',
  SAFETY_REPORT: '#EF4444',
  INSPECTION: '#8B5CF6',
  CUSTOM: '#6B7280',
};

// Schema Fields Form Component (for AI-extracted document schemas)
function SchemaFieldsForm({
  schema,
  fieldValues,
  onChange,
  disabled,
  confidence,
}: {
  schema: DocumentSchema;
  fieldValues: Record<string, string | null>;
  onChange: (name: string, value: string | null) => void;
  disabled?: boolean;
  confidence?: number | null;
}) {
  return (
    <View className="mt-4">
      {confidence !== undefined && confidence !== null && (
        <View className="flex-row items-center mb-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <Wand2 size={16} color="#8B5CF6" />
          <Text className="ml-2 text-sm text-gray-600 dark:text-gray-300">
            AI Confidence: {Math.round(confidence * 100)}%
          </Text>
        </View>
      )}
      {schema.fields.map((field) => (
        <View key={field.name} className="mb-4">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
            {field.label}
            {field.required && <Text className="text-red-500"> *</Text>}
          </Text>
          {field.description && (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1">
              {field.description}
            </Text>
          )}

          {field.type === 'multiline' ? (
            <TextInput
              value={fieldValues[field.name] || ''}
              onChangeText={(text) => onChange(field.name, text || null)}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              placeholderTextColor="#9CA3AF"
              editable={!disabled}
              multiline
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white min-h-[80px]"
              textAlignVertical="top"
            />
          ) : field.type === 'date' ? (
            <TextInput
              value={fieldValues[field.name] || ''}
              onChangeText={(text) => onChange(field.name, text || null)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              editable={!disabled}
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          ) : (
            <TextInput
              value={fieldValues[field.name] || ''}
              onChangeText={(text) => onChange(field.name, text || null)}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              placeholderTextColor="#9CA3AF"
              editable={!disabled}
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          )}
        </View>
      ))}
    </View>
  );
}

// Template Fields Form Component
function TemplateFieldsForm({
  template,
  fieldValues,
  onChange,
  disabled,
}: {
  template: PdfTemplate;
  fieldValues: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mt-4">
      {template.formFields.map((field) => (
        <View key={field.name} className="mb-4">
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
            {field.label}
            {field.required && <Text className="text-red-500"> *</Text>}
          </Text>

          {field.type === 'checkbox' ? (
            <View className="flex-row items-center">
              <Switch
                value={!!fieldValues[field.name]}
                onValueChange={(val) => onChange(field.name, val)}
                disabled={disabled}
                trackColor={{ false: '#E5E7EB', true: '#3B82F6' }}
                thumbColor={fieldValues[field.name] ? '#FFFFFF' : '#9CA3AF'}
              />
              <Text className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                {fieldValues[field.name] ? 'Yes' : 'No'}
              </Text>
            </View>
          ) : field.type === 'dropdown' && field.options ? (
            <View className="flex-row flex-wrap gap-2">
              {field.options.map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => !disabled && onChange(field.name, opt)}
                  className={cn(
                    'px-3 py-2 rounded-lg border',
                    fieldValues[field.name] === opt
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600'
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm',
                      fieldValues[field.name] === opt
                        ? 'text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-gray-600 dark:text-gray-300'
                    )}
                  >
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <TextInput
              value={String(fieldValues[field.name] || '')}
              onChangeText={(text) => onChange(field.name, text)}
              placeholder={`Enter ${field.label.toLowerCase()}...`}
              placeholderTextColor="#9CA3AF"
              editable={!disabled}
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          )}
        </View>
      ))}
    </View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // First try local store
  const localEvent = useDailyLogStore((s) => s.events.find((e) => e.id === id));
  const projects = useDailyLogStore((s) => s.projects);
  const updateEvent = useDailyLogStore((s) => s.updateEvent);
  const deleteEvent = useDailyLogStore((s) => s.deleteEvent);
  const addEventToDailyLog = useDailyLogStore((s) => s.addEventToDailyLog);
  const toggleEventResolved = useDailyLogStore((s) => s.toggleEventResolved);

  // If not in local store, fetch from backend
  const backendEventQuery = useQuery({
    queryKey: queryKeys.event(id || ''),
    queryFn: () => getEvent(id || ''),
    enabled: !!id && !localEvent, // Only fetch if not found locally
    retry: 1,
  });

  const backendEvent = backendEventQuery.data;
  const isLoadingBackend = backendEventQuery.isLoading && !localEvent;
  const backendError = backendEventQuery.isError && !localEvent;

  // Determine if we're viewing a local or backend event
  const isLocalEvent = !!localEvent;
  const event = localEvent;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [eventType, setEventType] = useState<EventType>('Other');
  const [severity, setSeverity] = useState<EventSeverity>('Medium');
  const [location, setLocation] = useState('');
  const [tradeVendor, setTradeVendor] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [audioExists, setAudioExists] = useState(true);

  // Template state
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string | boolean>>({});
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Document Schema state (Apply to Document)
  const [showSchemaSelector, setShowSchemaSelector] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [schemaFieldValues, setSchemaFieldValues] = useState<Record<string, string | null>>({});
  const [schemaConfidence, setSchemaConfidence] = useState<number | null>(null);
  const [schemaHasChanges, setSchemaHasChanges] = useState(false);

  // Fetch available templates
  const templatesQuery = useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => getTemplates(),
  });

  // Get selected template
  const selectedTemplate = templatesQuery.data?.find((t) => t.id === selectedTemplateId);

  // Attach template mutation
  const attachTemplateMutation = useMutation({
    mutationFn: async ({ eventId, templateId }: { eventId: string; templateId: string }) => {
      return attachTemplateToEvent(eventId, templateId);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Save template data mutation
  const saveTemplateDataMutation = useMutation({
    mutationFn: async ({
      eventId,
      templateId,
      fieldValues,
    }: {
      eventId: string;
      templateId: string;
      fieldValues: Record<string, string | boolean>;
    }) => {
      return updateEventTemplateData(eventId, templateId, fieldValues);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Fetch available document schemas
  const schemasQuery = useQuery({
    queryKey: queryKeys.documentSchemas({}),
    queryFn: () => getDocumentSchemas(),
  });

  // Get selected schema
  const selectedSchema = schemasQuery.data?.find((s) => s.id === selectedSchemaId);

  // Apply schema mutation (AI extracts fields from transcript)
  const applySchemaDataMutation = useMutation({
    mutationFn: async ({ eventId, schemaId }: { eventId: string; schemaId: string }) => {
      return applySchemaToEvent(eventId, schemaId);
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Populate field values from extraction
      setSchemaFieldValues(data.schemaData.fieldValues as Record<string, string | null>);
      setSchemaConfidence(data.schemaData.extractionConfidence);
      setSchemaHasChanges(false);
      // Invalidate event query to refresh schemaData
      queryClient.invalidateQueries({ queryKey: queryKeys.event(id || '') });
    },
  });

  // Update schema data mutation (manual edits)
  const saveSchemaDataMutation = useMutation({
    mutationFn: async ({ eventId, fieldValues }: { eventId: string; fieldValues: Record<string, string | null> }) => {
      return updateEventSchemaData(eventId, fieldValues);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSchemaHasChanges(false);
    },
  });

  // Re-extract mutation
  const reExtractMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return reExtractSchemaData(eventId);
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSchemaFieldValues(data.schemaData.fieldValues as Record<string, string | null>);
      setSchemaConfidence(data.schemaData.extractionConfidence);
      setSchemaHasChanges(false);
    },
  });

  // Remove schema data mutation
  const removeSchemaDataMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return removeEventSchemaData(eventId);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedSchemaId(null);
      setSchemaFieldValues({});
      setSchemaConfidence(null);
      setSchemaHasChanges(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.event(id || '') });
    },
  });

  const project = localEvent
    ? projects.find((p) => p.id === localEvent.project_id)
    : backendEvent?.project;

  useEffect(() => {
    if (localEvent) {
      setTitle(localEvent.title);
      setNotes(localEvent.notes);
      setEventType(localEvent.event_type);
      setSeverity(localEvent.severity);
      setLocation(localEvent.location);
      setTradeVendor(localEvent.trade_vendor);

      // Check if audio file exists
      if (localEvent.local_audio_uri) {
        audioFileExists(localEvent.local_audio_uri).then((exists) => {
          setAudioExists(exists);
          if (!exists) {
            console.log('[event-detail] Audio file not found:', localEvent.local_audio_uri);
          }
        });
      }
    } else if (backendEvent) {
      setTitle(backendEvent.title || '');
      setNotes('');
      setEventType((backendEvent.eventType as EventType) || 'Other');
      setSeverity((backendEvent.severity as EventSeverity) || 'Medium');
      setLocation('');
      setTradeVendor('');
    }
  }, [localEvent, backendEvent]);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  // Loading state for backend fetch
  if (isLoadingBackend) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="mt-3 text-gray-500">Loading event...</Text>
      </SafeAreaView>
    );
  }

  // Show backend event in read-only mode if not found locally
  if (!localEvent && backendEvent) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900">
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Event Details',
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
          <Animated.View
            entering={FadeIn}
            className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
          >
            {/* Header badges */}
            <View className="flex-row items-center mb-3">
              {backendEvent.eventType && (
                <View
                  className="px-2 py-0.5 rounded-full mr-2"
                  style={{ backgroundColor: EVENT_TYPE_COLORS[backendEvent.eventType as EventType] + '20' }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: EVENT_TYPE_COLORS[backendEvent.eventType as EventType] }}
                  >
                    {backendEvent.eventType}
                  </Text>
                </View>
              )}
              {backendEvent.severity && (
                <View
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLORS[backendEvent.severity as EventSeverity] + '20' }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: SEVERITY_COLORS[backendEvent.severity as EventSeverity] }}
                  >
                    {backendEvent.severity}
                  </Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              {backendEvent.title || 'Untitled Event'}
            </Text>

            {/* Project & Date */}
            <View className="flex-row items-center mb-3">
              {backendEvent.project && (
                <View className="flex-row items-center mr-4">
                  <Building2 size={14} color="#9CA3AF" />
                  <Text className="text-sm text-gray-500 ml-1">
                    {backendEvent.project.name}
                  </Text>
                </View>
              )}
              <View className="flex-row items-center">
                <Calendar size={14} color="#9CA3AF" />
                <Text className="text-sm text-gray-500 ml-1">
                  {format(new Date(backendEvent.createdAt), 'MMM d, yyyy')}
                </Text>
              </View>
            </View>

            {/* Transcript */}
            {backendEvent.transcriptText && (
              <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mt-2">
                <View className="flex-row items-center mb-2">
                  <FileText size={16} color="#3B82F6" />
                  <Text className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                    Transcript
                  </Text>
                </View>
                <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">
                  {backendEvent.transcriptText}
                </Text>
              </View>
            )}

            {/* Index data */}
            {backendEvent.index && (
              <View className="mt-4">
                {/* Trades */}
                {backendEvent.index.trades && backendEvent.index.trades.length > 0 && (
                  <View className="flex-row flex-wrap mb-2">
                    {backendEvent.index.trades.map((trade) => (
                      <View key={trade} className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full mr-1 mb-1">
                        <Text className="text-xs text-blue-700 dark:text-blue-300">{trade}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {/* Cost Impact */}
                {backendEvent.index.costImpact && (
                  <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mt-2">
                    <Text className="text-sm text-red-600 font-semibold">
                      Cost Impact: ${backendEvent.index.costImpact.toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Resolved status */}
            {backendEvent.isResolved && (
              <View className="flex-row items-center mt-4">
                <CheckCircle2 size={16} color="#10B981" />
                <Text className="ml-1 text-sm text-green-600">Resolved</Text>
              </View>
            )}
          </Animated.View>

          {/* Info banner */}
          <View className="mx-4 mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
            <Text className="text-sm text-blue-700 dark:text-blue-300 text-center">
              This event is stored on the server. To edit, record a new event locally.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Event not found in either place
  if (!localEvent && backendError) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <AlertTriangle size={48} color="#EF4444" />
        <Text className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">
          Event Not Found
        </Text>
        <Text className="mt-2 text-sm text-gray-500 text-center px-6">
          This event may have been deleted or doesn't exist.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="mt-3 text-gray-500">Loading...</Text>
      </SafeAreaView>
    );
  }

  const handlePlayAudio = async () => {
    if (!event.local_audio_uri) return;

    try {
      if (isPlaying && sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        if (sound) {
          await sound.playAsync();
        } else {
          const { sound: newSound } = await Audio.Sound.createAsync(
            { uri: event.local_audio_uri },
            { shouldPlay: true }
          );
          setSound(newSound);
          newSound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
            }
          });
        }
        setIsPlaying(true);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.log('Audio playback error:', error);
    }
  };

  const handleSave = () => {
    updateEvent(event.id, {
      title: title || 'Untitled Event',
      notes,
      event_type: eventType,
      severity,
      location,
      trade_vendor: tradeVendor,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHasChanges(false);
  };

  // Template handlers
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setShowTemplateSelector(false);
    setTemplateFieldValues({});

    // Attach template to event (backend)
    attachTemplateMutation.mutate({ eventId: event.id, templateId });
  };

  const handleClearTemplate = () => {
    setSelectedTemplateId(null);
    setTemplateFieldValues({});
  };

  const handleTemplateFieldChange = (name: string, value: string | boolean) => {
    setTemplateFieldValues((prev) => ({ ...prev, [name]: value }));
    markChanged();
  };

  const handleSaveTemplateData = async () => {
    if (!selectedTemplateId) return;

    await saveTemplateDataMutation.mutateAsync({
      eventId: event.id,
      templateId: selectedTemplateId,
      fieldValues: templateFieldValues,
    });
  };

  const handleDownloadFilledPdf = async () => {
    if (!selectedTemplateId) return;

    setIsDownloadingPdf(true);
    try {
      // First save current template data
      await handleSaveTemplateData();

      // Then download the filled PDF
      const blobUrl = await fetchFilledPdf(event.id);

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${selectedTemplate?.name || 'filled'}-${event.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to download PDF:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Document Schema handlers (Apply to Document)
  const handleApplySchema = (schemaId: string) => {
    const backendId = getBackendId('events', event.id) || event.id;
    setSelectedSchemaId(schemaId);
    setShowSchemaSelector(false);
    // Trigger AI extraction
    applySchemaDataMutation.mutate({ eventId: backendId, schemaId });
  };

  const handleSchemaFieldChange = (name: string, value: string | null) => {
    setSchemaFieldValues((prev) => ({ ...prev, [name]: value }));
    setSchemaHasChanges(true);
  };

  const handleSaveSchemaData = async () => {
    if (!selectedSchemaId) return;
    const backendId = getBackendId('events', event.id) || event.id;
    await saveSchemaDataMutation.mutateAsync({
      eventId: backendId,
      fieldValues: schemaFieldValues,
    });
  };

  const handleReExtract = () => {
    const backendId = getBackendId('events', event.id) || event.id;
    reExtractMutation.mutate(backendId);
  };

  const handleRemoveSchema = () => {
    const backendId = getBackendId('events', event.id) || event.id;
    const doRemove = () => {
      removeSchemaDataMutation.mutate(backendId);
    };

    if (Platform.OS === 'web') {
      if (confirm('Remove document association? This will delete extracted data.')) {
        doRemove();
      }
    } else {
      Alert.alert(
        'Remove Document',
        'This will delete the extracted document data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]
      );
    }
  };

  const handleAddToDailyLog = () => {
    // Save any pending changes first
    if (hasChanges) {
      handleSave();
    }

    const result = addEventToDailyLog(event.id);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (Platform.OS === 'web') {
        alert('Event added to today\'s Daily Log!');
      } else {
        Alert.alert('Success', 'Event added to today\'s Daily Log as a Pending Issue.', [
          { text: 'OK' },
        ]);
      }
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDelete = () => {
    const doDelete = async () => {
      try {
        // Try to delete from backend first
        const backendId = getBackendId('events', event.id) || event.id;
        await deleteEventApi(backendId);
        console.log('[event] Deleted from backend:', backendId);

        // Invalidate queries to refresh lists
        queryClient.invalidateQueries({ queryKey: queryKeys.events });
      } catch (error) {
        console.error('[event] Failed to delete from backend:', error);
        // Continue with local delete even if backend fails
      }

      // Delete from local store
      deleteEvent(event.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this event?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Event', 'Are you sure you want to delete this event?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleToggleResolved = () => {
    toggleEventResolved(event.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const markChanged = () => {
    if (!hasChanges) setHasChanges(true);
  };

  const createdDate = new Date(event.created_at);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Event Details',
          headerStyle: { backgroundColor: isDark ? '#111' : '#FFF' },
          headerTintColor: isDark ? '#FFF' : '#111',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} className="p-2">
              <ArrowLeft size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges}
              className={cn('p-2', !hasChanges && 'opacity-50')}
            >
              <Save size={24} color={hasChanges ? '#F97316' : '#9CA3AF'} />
            </Pressable>
          ),
        }}
      />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header Info */}
        <Animated.View
          entering={FadeIn}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {createdDate.toLocaleDateString()} at{' '}
              {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {project && (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {project.name}
              </Text>
            )}
          </View>

          {/* Audio Player */}
          {event.local_audio_uri && audioExists && (
            <Pressable
              onPress={handlePlayAudio}
              className="flex-row items-center bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 mb-4"
            >
              <View className="w-12 h-12 rounded-full bg-orange-500 items-center justify-center">
                {isPlaying ? (
                  <Pause size={24} color="white" />
                ) : (
                  <Play size={24} color="white" style={{ marginLeft: 2 }} />
                )}
              </View>
              <View className="ml-4">
                <Text className="text-base font-medium text-gray-900 dark:text-white">
                  {isPlaying ? 'Playing...' : 'Play Recording'}
                </Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Tap to {isPlaying ? 'pause' : 'listen'}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Audio Missing Warning */}
          {event.local_audio_uri && !audioExists && (
            <View className="flex-row items-center bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-4">
              <View className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center">
                <AlertTriangle size={24} color="#EF4444" />
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-base font-medium text-red-600 dark:text-red-400">
                  Audio Not Available
                </Text>
                <Text className="text-sm text-red-500/70 dark:text-red-400/70">
                  The recording file was lost (older recording)
                </Text>
              </View>
            </View>
          )}

          {/* Transcription Display */}
          {event.transcript_text && (
            <View className="mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center">
                  <FileText size={16} color="#3B82F6" />
                  <Text className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                    Transcription
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (!notes.trim() && event.transcript_text) {
                      setNotes(event.transcript_text);
                      markChanged();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    } else if (event.transcript_text) {
                      setNotes((prev) => prev + '\n\n' + event.transcript_text);
                      markChanged();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  className="flex-row items-center bg-blue-100 dark:bg-blue-800/50 px-3 py-1.5 rounded-lg"
                >
                  <Copy size={14} color="#3B82F6" />
                  <Text className="ml-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                    Copy to Notes
                  </Text>
                </Pressable>
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-300 leading-5">
                {event.transcript_text}
              </Text>
            </View>
          )}

          {/* Action Items Display */}
          {event.action_items && event.action_items.length > 0 && (
            <View className="mb-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700">
              <View className="flex-row items-center mb-3">
                <AlertTriangle size={18} color="#F59E0B" />
                <Text className="ml-2 text-base font-semibold text-amber-700 dark:text-amber-400">
                  Action Items
                </Text>
                <View className="ml-auto bg-amber-200 dark:bg-amber-700 px-2 py-0.5 rounded-full">
                  <Text className="text-xs font-bold text-amber-800 dark:text-amber-200">
                    {event.action_items.length}
                  </Text>
                </View>
              </View>
              {event.action_items.map((item, idx) => (
                <View key={idx} className="flex-row items-start mb-2">
                  <View className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-700 items-center justify-center mr-3 mt-0.5">
                    <Text className="text-xs font-bold text-amber-800 dark:text-amber-200">
                      {idx + 1}
                    </Text>
                  </View>
                  <Text className="flex-1 text-sm text-amber-900 dark:text-amber-100 leading-5">
                    {item}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Title Input */}
          <View className="mb-4">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Title
              </Text>
              {event.transcript_text && (
                <Pressable
                  onPress={() => {
                    const autoTitle = generateTitleFromTranscript(event.transcript_text ?? '');
                    setTitle(autoTitle);
                    markChanged();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  className="flex-row items-center bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded-lg"
                >
                  <Sparkles size={12} color="#8B5CF6" />
                  <Text className="ml-1 text-xs font-medium text-purple-600 dark:text-purple-400">
                    Auto-generate
                  </Text>
                </Pressable>
              )}
            </View>
            <TextInput
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                markChanged();
              }}
              placeholder="Event title..."
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          {/* Notes Input */}
          <View className="mb-4">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Notes
            </Text>
            <TextInput
              value={notes}
              onChangeText={(text) => {
                setNotes(text);
                markChanged();
              }}
              placeholder="Add notes..."
              placeholderTextColor="#9CA3AF"
              multiline
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white min-h-[100px]"
              textAlignVertical="top"
            />
          </View>
        </Animated.View>

        {/* Event Type Selection */}
        <Animated.View
          entering={FadeInDown.delay(100)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Event Type
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => {
                  setEventType(type);
                  markChanged();
                  Haptics.selectionAsync();
                }}
                className={cn(
                  'px-4 py-2 rounded-full border-2',
                  eventType === type
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-600'
                )}
                style={
                  eventType === type
                    ? { backgroundColor: EVENT_TYPE_COLORS[type] }
                    : undefined
                }
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    eventType === type
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Severity Selection */}
        <Animated.View
          entering={FadeInDown.delay(150)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Severity
          </Text>
          <View className="flex-row gap-3">
            {SEVERITIES.map((sev) => (
              <Pressable
                key={sev}
                onPress={() => {
                  setSeverity(sev);
                  markChanged();
                  Haptics.selectionAsync();
                }}
                className={cn(
                  'flex-1 py-3 rounded-xl border-2 items-center',
                  severity === sev
                    ? 'border-transparent'
                    : 'border-gray-200 dark:border-gray-600'
                )}
                style={
                  severity === sev
                    ? { backgroundColor: SEVERITY_COLORS[sev] }
                    : undefined
                }
              >
                <Text
                  className={cn(
                    'text-base font-semibold',
                    severity === sev
                      ? 'text-white'
                      : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  {sev}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {/* Location & Trade */}
        <Animated.View
          entering={FadeInDown.delay(200)}
          className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
        >
          <View className="mb-4">
            <View className="flex-row items-center mb-1">
              <MapPin size={14} color="#9CA3AF" />
              <Text className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Location
              </Text>
            </View>
            <TextInput
              value={location}
              onChangeText={(text) => {
                setLocation(text);
                markChanged();
              }}
              placeholder="e.g., Level 3 / Grid D4"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          <View>
            <View className="flex-row items-center mb-1">
              <HardHat size={14} color="#9CA3AF" />
              <Text className="ml-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Trade / Vendor
              </Text>
            </View>
            <TextInput
              value={tradeVendor}
              onChangeText={(text) => {
                setTradeVendor(text);
                markChanged();
              }}
              placeholder="e.g., ABC Concrete / Rebar sub"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>
        </Animated.View>

        {/* Template Section */}
        {templatesQuery.data && templatesQuery.data.length > 0 && (
          <Animated.View
            entering={FadeInDown.delay(250)}
            className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <FileText size={16} color="#8B5CF6" />
                <Text className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Document Template
                </Text>
              </View>
              {selectedTemplate && (
                <Pressable
                  onPress={handleClearTemplate}
                  className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700"
                >
                  <X size={14} color="#6B7280" />
                </Pressable>
              )}
            </View>

            {!selectedTemplate ? (
              <View>
                {showTemplateSelector ? (
                  <View className="space-y-2">
                    {templatesQuery.data.map((template) => (
                      <Pressable
                        key={template.id}
                        onPress={() => handleSelectTemplate(template.id)}
                        className="flex-row items-center bg-gray-50 dark:bg-gray-700 rounded-xl p-3"
                      >
                        <View
                          className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                          style={{ backgroundColor: TEMPLATE_TYPE_COLORS[template.templateType] + '20' }}
                        >
                          <FileText size={16} color={TEMPLATE_TYPE_COLORS[template.templateType]} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {template.name}
                          </Text>
                          <Text className="text-xs text-gray-500">
                            {template.formFields.length} fields
                          </Text>
                        </View>
                        <ChevronDown size={18} color="#9CA3AF" style={{ transform: [{ rotate: '-90deg' }] }} />
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => setShowTemplateSelector(false)}
                      className="py-2"
                    >
                      <Text className="text-sm text-gray-500 text-center">Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowTemplateSelector(true)}
                    className="flex-row items-center justify-center bg-purple-50 dark:bg-purple-900/20 rounded-xl py-3 border border-purple-200 dark:border-purple-800"
                  >
                    <FileText size={18} color="#8B5CF6" />
                    <Text className="ml-2 text-sm font-medium text-purple-600 dark:text-purple-400">
                      Add Document Template
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View>
                {/* Selected template header */}
                <View className="flex-row items-center bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 mb-4">
                  <View
                    className="w-10 h-10 rounded-lg items-center justify-center mr-3"
                    style={{ backgroundColor: TEMPLATE_TYPE_COLORS[selectedTemplate.templateType] + '30' }}
                  >
                    <FileText size={20} color={TEMPLATE_TYPE_COLORS[selectedTemplate.templateType]} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                      {selectedTemplate.name}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {selectedTemplate.formFields.length} fields to fill
                    </Text>
                  </View>
                </View>

                {/* Template fields form */}
                <TemplateFieldsForm
                  template={selectedTemplate}
                  fieldValues={templateFieldValues}
                  onChange={handleTemplateFieldChange}
                />

                {/* Template actions */}
                <View className="flex-row gap-3 mt-4">
                  <Pressable
                    onPress={handleSaveTemplateData}
                    disabled={saveTemplateDataMutation.isPending}
                    className={cn(
                      'flex-1 flex-row items-center justify-center py-3 rounded-xl',
                      saveTemplateDataMutation.isPending ? 'bg-gray-300' : 'bg-purple-600'
                    )}
                  >
                    {saveTemplateDataMutation.isPending ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Save size={18} color="white" />
                        <Text className="ml-2 text-white font-semibold">Save</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={handleDownloadFilledPdf}
                    disabled={isDownloadingPdf}
                    className={cn(
                      'flex-1 flex-row items-center justify-center py-3 rounded-xl',
                      isDownloadingPdf ? 'bg-gray-300' : 'bg-green-600'
                    )}
                  >
                    {isDownloadingPdf ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <>
                        <Download size={18} color="white" />
                        <Text className="ml-2 text-white font-semibold">Export PDF</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>
        )}

        {/* Apply to Document Section (AI-powered extraction) */}
        {schemasQuery.data && schemasQuery.data.length > 0 && event.transcript_text && (
          <Animated.View
            entering={FadeInDown.delay(275)}
            className="mx-4 mt-4 bg-white dark:bg-gray-800 rounded-2xl p-4"
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Wand2 size={16} color="#F59E0B" />
                <Text className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Apply to Document
                </Text>
              </View>
              {selectedSchema && (
                <Pressable
                  onPress={handleRemoveSchema}
                  className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700"
                >
                  <X size={14} color="#6B7280" />
                </Pressable>
              )}
            </View>

            {!selectedSchema ? (
              <View>
                {showSchemaSelector ? (
                  <View className="space-y-2">
                    {schemasQuery.data.map((schema) => (
                      <Pressable
                        key={schema.id}
                        onPress={() => handleApplySchema(schema.id)}
                        disabled={applySchemaDataMutation.isPending}
                        className="flex-row items-center bg-gray-50 dark:bg-gray-700 rounded-xl p-3"
                      >
                        <View
                          className="w-8 h-8 rounded-lg items-center justify-center mr-3"
                          style={{ backgroundColor: SCHEMA_TYPE_COLORS[schema.documentType] + '20' }}
                        >
                          <Wand2 size={16} color={SCHEMA_TYPE_COLORS[schema.documentType]} />
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-900 dark:text-white">
                            {schema.name}
                          </Text>
                          <Text className="text-xs text-gray-500">
                            {schema.fields.length} fields • AI extracts from transcript
                          </Text>
                        </View>
                        <ChevronDown size={18} color="#9CA3AF" style={{ transform: [{ rotate: '-90deg' }] }} />
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => setShowSchemaSelector(false)}
                      className="py-2"
                    >
                      <Text className="text-sm text-gray-500 text-center">Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowSchemaSelector(true)}
                    className="flex-row items-center justify-center bg-amber-50 dark:bg-amber-900/20 rounded-xl py-3 border border-amber-200 dark:border-amber-800"
                  >
                    <Wand2 size={18} color="#F59E0B" />
                    <Text className="ml-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                      Apply to Punch List or RFI
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View>
                {/* Extracting indicator */}
                {applySchemaDataMutation.isPending && (
                  <View className="flex-row items-center justify-center bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mb-4">
                    <ActivityIndicator size="small" color="#F59E0B" />
                    <Text className="ml-3 text-sm text-amber-700 dark:text-amber-300">
                      AI is extracting fields from transcript...
                    </Text>
                  </View>
                )}

                {/* Error message */}
                {applySchemaDataMutation.isError && (
                  <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-4">
                    <Text className="text-sm text-red-600 dark:text-red-400">
                      Failed to extract fields. Please try again.
                    </Text>
                  </View>
                )}

                {/* Selected schema header */}
                {!applySchemaDataMutation.isPending && (
                  <>
                    <View className="flex-row items-center bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4">
                      <View
                        className="w-10 h-10 rounded-lg items-center justify-center mr-3"
                        style={{ backgroundColor: SCHEMA_TYPE_COLORS[selectedSchema.documentType] + '30' }}
                      >
                        <Wand2 size={20} color={SCHEMA_TYPE_COLORS[selectedSchema.documentType]} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {selectedSchema.name}
                        </Text>
                        <Text className="text-xs text-gray-500">
                          {Object.keys(schemaFieldValues).filter(k => schemaFieldValues[k]).length} of {selectedSchema.fields.length} fields extracted
                        </Text>
                      </View>
                    </View>

                    {/* Schema fields form */}
                    <SchemaFieldsForm
                      schema={selectedSchema}
                      fieldValues={schemaFieldValues}
                      onChange={handleSchemaFieldChange}
                      confidence={schemaConfidence}
                    />

                    {/* Schema actions */}
                    <View className="flex-row gap-3 mt-4">
                      <Pressable
                        onPress={handleSaveSchemaData}
                        disabled={saveSchemaDataMutation.isPending || !schemaHasChanges}
                        className={cn(
                          'flex-1 flex-row items-center justify-center py-3 rounded-xl',
                          saveSchemaDataMutation.isPending || !schemaHasChanges ? 'bg-gray-300 dark:bg-gray-600' : 'bg-amber-500'
                        )}
                      >
                        {saveSchemaDataMutation.isPending ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Save size={18} color="white" />
                            <Text className="ml-2 text-white font-semibold">Save</Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable
                        onPress={handleReExtract}
                        disabled={reExtractMutation.isPending}
                        className={cn(
                          'flex-row items-center justify-center py-3 px-4 rounded-xl border',
                          reExtractMutation.isPending ? 'border-gray-300 dark:border-gray-600' : 'border-amber-500'
                        )}
                      >
                        {reExtractMutation.isPending ? (
                          <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                          <>
                            <RefreshCw size={18} color="#F59E0B" />
                            <Text className="ml-2 text-amber-600 dark:text-amber-400 font-semibold">Re-extract</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
          </Animated.View>
        )}

        {/* Actions */}
        <Animated.View
          entering={FadeInDown.delay(300)}
          className="mx-4 mt-6"
        >
          {/* Add to Daily Log */}
          {!event.linked_daily_log_id && (
            <Pressable
              onPress={handleAddToDailyLog}
              className="flex-row items-center justify-center bg-blue-500 rounded-xl py-4 mb-3"
            >
              <ClipboardPlus size={20} color="white" />
              <Text className="ml-2 text-base font-semibold text-white">
                Add to Today's Daily Log
              </Text>
            </Pressable>
          )}

          {event.linked_daily_log_id && (
            <View className="flex-row items-center justify-center bg-blue-100 dark:bg-blue-900/30 rounded-xl py-4 mb-3">
              <ClipboardPlus size={20} color="#3B82F6" />
              <Text className="ml-2 text-base font-semibold text-blue-600 dark:text-blue-400">
                Added to Daily Log
              </Text>
            </View>
          )}

          {/* Mark Resolved */}
          <Pressable
            onPress={handleToggleResolved}
            className={cn(
              'flex-row items-center justify-center rounded-xl py-4 mb-3',
              event.is_resolved
                ? 'bg-green-500'
                : 'bg-gray-200 dark:bg-gray-700'
            )}
          >
            <CheckCircle2 size={20} color={event.is_resolved ? 'white' : '#6B7280'} />
            <Text
              className={cn(
                'ml-2 text-base font-semibold',
                event.is_resolved ? 'text-white' : 'text-gray-600 dark:text-gray-300'
              )}
            >
              {event.is_resolved ? 'Resolved' : 'Mark as Resolved'}
            </Text>
          </Pressable>

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            className="flex-row items-center justify-center py-4"
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="ml-2 text-base font-medium text-red-500">
              Delete Event
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
