import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFormInstance,
  updateFormInstance,
  deleteFormInstance,
  downloadFormPdf,
  queryKeys,
  FormInstance,
  FormField,
  FormSection,
  FormStatus,
} from '@/lib/api';
import {
  ArrowLeft,
  Check,
  X,
  Minus,
  Save,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  AlertCircle,
  Download,
  Plus,
  Trash2,
  Users,
  Camera,
  Image as ImageIcon,
  Calendar,
  Copy,
  Mic,
  Square as StopIcon,
} from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLanguage } from '@/i18n/LanguageProvider';
import { transcribeAudio } from '@/lib/transcription';

// Cross-platform confirm dialog
function showConfirm(title: string, message: string, onConfirm: () => void, onCancel?: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'OK', onPress: onConfirm },
    ]);
  }
}

// Cross-platform 3-option dialog (for unsaved changes)
function showThreeOptionDialog(
  title: string,
  message: string,
  options: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' | 'default' }[]
) {
  if (Platform.OS === 'web') {
    // On web, use simpler confirm for the most important action
    const result = window.confirm(`${title}\n\n${message}\n\nClick OK to save, Cancel to discard.`);
    if (result) {
      // Find the "Save" option
      const saveOption = options.find(o => o.text.toLowerCase().includes('save'));
      saveOption?.onPress();
    } else {
      // Find the "Discard" option
      const discardOption = options.find(o => o.style === 'destructive');
      discardOption?.onPress();
    }
  } else {
    Alert.alert(title, message, options);
  }
}

// Debounce hook for auto-save
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// YES/NO/NA Button Component
function YesNoNaField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const options = field.type === 'YES_NO'
    ? [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }]
    : [{ label: 'Yes', value: 'YES' }, { label: 'No', value: 'NO' }, { label: 'N/A', value: 'NA' }];

  return (
    <View className="flex-row gap-2">
      {options.map((option) => {
        const isSelected = value === option.value;
        const bgColor = isSelected
          ? option.value === 'YES'
            ? 'bg-green-500'
            : option.value === 'NO'
            ? 'bg-red-500'
            : 'bg-gray-500'
          : 'bg-gray-100 dark:bg-gray-700';
        const textColor = isSelected ? 'text-white' : 'text-gray-600 dark:text-gray-300';

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!disabled) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(option.value);
              }
            }}
            className={`flex-1 py-3 rounded-lg items-center justify-center ${bgColor}`}
          >
            <Text className={`font-semibold ${textColor}`}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Checkbox Field Component
function CheckboxField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const isChecked = value === true;

  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChange(!isChecked);
        }
      }}
      className="flex-row items-center"
    >
      <View className={`w-6 h-6 rounded border-2 mr-3 items-center justify-center ${
        isChecked ? 'bg-orange-500 border-orange-500' : 'border-gray-300 dark:border-gray-600'
      }`}>
        {isChecked && <Check size={16} color="white" />}
      </View>
      <Text className="flex-1 text-gray-700 dark:text-gray-300">{field.label}</Text>
    </Pressable>
  );
}

// Text Input Field Component
function TextFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <TextInput
      value={value || ''}
      onChangeText={onChange}
      editable={!disabled}
      placeholder={`Enter ${field.shortLabel || field.label}`}
      placeholderTextColor="#9CA3AF"
      multiline
      className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-gray-900 dark:text-white min-h-[80px]"
      style={{ textAlignVertical: 'top' }}
    />
  );
}

// Voice-enabled Text Input Component
function VoiceTextInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    if (disabled || isRecording) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);
        stream.getTracks().forEach(track => track.stop());

        // Transcribe the audio
        setIsTranscribing(true);
        try {
          const result = await transcribeAudio(audioUrl);
          if (result.success && result.text) {
            // Append transcribed text to existing value
            const newValue = value ? `${value}\n${result.text}` : result.text;
            onChange(newValue);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            if (Platform.OS === 'web') {
              window.alert('Transcription failed: ' + (result.error || 'Unknown error'));
            }
          }
        } catch (error) {
          console.error('[VoiceTextInput] Transcription error:', error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
          setIsTranscribing(false);
          URL.revokeObjectURL(audioUrl);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('[VoiceTextInput] Recording error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert('Could not access microphone. Please check permissions.');
      }
    }
  }, [disabled, isRecording, value, onChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <View>
      <View className="flex-row items-start">
        <TextInput
          value={value || ''}
          onChangeText={onChange}
          editable={!disabled && !isRecording && !isTranscribing}
          placeholder={`Enter ${field.shortLabel || field.label} or use voice`}
          placeholderTextColor="#9CA3AF"
          multiline
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-gray-900 dark:text-white min-h-[80px]"
          style={{ textAlignVertical: 'top' }}
        />
        <Pressable
          onPress={isRecording ? stopRecording : startRecording}
          disabled={disabled || isTranscribing}
          className={`ml-2 p-3 rounded-full ${
            isRecording
              ? 'bg-red-500'
              : isTranscribing
              ? 'bg-gray-400'
              : 'bg-orange-500'
          }`}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color="white" />
          ) : isRecording ? (
            <StopIcon size={20} color="white" fill="white" />
          ) : (
            <Mic size={20} color="white" />
          )}
        </Pressable>
      </View>
      {isRecording && (
        <Text className="text-xs text-red-500 mt-1">Recording... tap stop when done</Text>
      )}
      {isTranscribing && (
        <Text className="text-xs text-orange-500 mt-1">Transcribing...</Text>
      )}
    </View>
  );
}

// Number Input Field Component
function NumberFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: number | string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center">
      <TextInput
        value={value?.toString() || ''}
        onChangeText={onChange}
        editable={!disabled}
        placeholder="0"
        placeholderTextColor="#9CA3AF"
        keyboardType="numeric"
        className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-gray-900 dark:text-white"
      />
      {field.unit && (
        <Text className="ml-2 text-gray-500 dark:text-gray-400">{field.unit}</Text>
      )}
    </View>
  );
}

// Signature Field Component (placeholder for now)
function SignatureField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}) {
  const hasSigned = value?.signed === true;

  const handleSign = () => {
    if (disabled) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    showConfirm(
      'Sign Form',
      `Confirm your signature as ${field.label}?`,
      () => {
        onChange({
          signed: true,
          name: 'Current User', // TODO: Get actual user name
          signedAt: new Date().toISOString(),
        });
      }
    );
  };

  return (
    <View className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 items-center">
      {hasSigned ? (
        <View className="items-center">
          <Check size={32} color="#10B981" />
          <Text className="mt-2 text-green-600 dark:text-green-400 font-medium">
            Signed by {value?.name || 'Unknown'}
          </Text>
          <Text className="text-xs text-gray-400 mt-1">
            {value?.signedAt ? new Date(value.signedAt).toLocaleString() : ''}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={handleSign}
          className="items-center py-4"
        >
          <Text className="text-gray-500 dark:text-gray-400 text-sm mb-2">
            Tap to sign as {field.label}
          </Text>
          <View className="bg-orange-500 rounded-full px-4 py-2">
            <Text className="text-white font-medium">Add Signature</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// Table Field Component (for work steps, hand at risk, etc.)
function TableField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string[][] | undefined;
  onChange: (value: string[][]) => void;
  disabled?: boolean;
}) {
  const columns = field.tableColumns || ['Column 1', 'Column 2', 'Column 3'];
  const maxRows = field.maxRows || 5;

  // Use defaultRows if provided and no value exists
  const getInitialRows = () => {
    if (value) return value;
    if (field.defaultRows && field.defaultRows.length > 0) {
      return field.defaultRows;
    }
    return [new Array(columns.length).fill('')];
  };
  const rows = getInitialRows();

  const addRow = () => {
    if (rows.length < maxRows) {
      const newRow = new Array(columns.length).fill('');
      onChange([...rows, newRow]);
    }
  };

  const updateCell = (rowIndex: number, colIndex: number, text: string) => {
    const newRows = rows.map((row, rIdx) =>
      rIdx === rowIndex
        ? row.map((cell, cIdx) => (cIdx === colIndex ? text : cell))
        : row
    );
    onChange(newRows);
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length > 1) {
      onChange(rows.filter((_, idx) => idx !== rowIndex));
    }
  };

  return (
    <View className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <View className="flex-row bg-orange-100 dark:bg-orange-900/30">
        {columns.map((col, idx) => (
          <View
            key={idx}
            className="flex-1 p-2 border-r border-gray-200 dark:border-gray-700"
            style={idx === columns.length - 1 ? { borderRightWidth: 0 } : {}}
          >
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {col}
            </Text>
          </View>
        ))}
        <View className="w-10" />
      </View>

      {/* Rows */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} className="flex-row border-t border-gray-200 dark:border-gray-700">
          {columns.map((_, colIdx) => (
            <View
              key={colIdx}
              className="flex-1 border-r border-gray-200 dark:border-gray-700"
              style={colIdx === columns.length - 1 ? { borderRightWidth: 0 } : {}}
            >
              <TextInput
                value={row[colIdx] || ''}
                onChangeText={(text) => updateCell(rowIdx, colIdx, text)}
                editable={!disabled}
                placeholder="..."
                placeholderTextColor="#9CA3AF"
                multiline
                className="p-2 text-sm text-gray-900 dark:text-white min-h-[50px]"
                style={{ textAlignVertical: 'top' }}
              />
            </View>
          ))}
          <Pressable
            onPress={() => removeRow(rowIdx)}
            disabled={disabled || rows.length <= 1}
            className="w-10 items-center justify-center"
          >
            <Trash2 size={16} color={rows.length <= 1 ? '#D1D5DB' : '#EF4444'} />
          </Pressable>
        </View>
      ))}

      {/* Add Row Button */}
      {!disabled && rows.length < maxRows && (
        <Pressable
          onPress={addRow}
          className="flex-row items-center justify-center p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
        >
          <Plus size={16} color="#F97316" />
          <Text className="ml-2 text-sm text-orange-500 font-medium">Add Row</Text>
        </Pressable>
      )}
    </View>
  );
}

// Crew Signatures Field Component
function CrewSignaturesField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: Array<{ name: string; signed: boolean; signedAt?: string }> | undefined;
  onChange: (value: Array<{ name: string; signed: boolean; signedAt?: string }>) => void;
  disabled?: boolean;
}) {
  const maxSignatures = field.maxSignatures || 12;
  const signatures = value || [];

  const addCrewMember = () => {
    if (signatures.length < maxSignatures) {
      const name = Platform.OS === 'web'
        ? window.prompt('Enter crew member name:')
        : null; // TODO: Modal for native

      if (name && name.trim()) {
        onChange([
          ...signatures,
          { name: name.trim(), signed: true, signedAt: new Date().toISOString() }
        ]);
      }
    }
  };

  const removeCrewMember = (index: number) => {
    onChange(signatures.filter((_, idx) => idx !== index));
  };

  return (
    <View>
      {/* Existing Signatures */}
      <View className="flex-row flex-wrap gap-2 mb-3">
        {signatures.map((sig, idx) => (
          <View
            key={idx}
            className="flex-row items-center bg-green-100 dark:bg-green-900/30 rounded-full px-3 py-1"
          >
            <Users size={14} color="#10B981" />
            <Text className="ml-2 text-sm text-green-700 dark:text-green-300">
              {sig.name}
            </Text>
            {!disabled && (
              <Pressable onPress={() => removeCrewMember(idx)} className="ml-2">
                <X size={14} color="#10B981" />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {/* Add Button */}
      {!disabled && signatures.length < maxSignatures && (
        <Pressable
          onPress={addCrewMember}
          className="flex-row items-center justify-center p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <Plus size={20} color="#9CA3AF" />
          <Text className="ml-2 text-gray-500 dark:text-gray-400">
            Add Crew Member ({signatures.length}/{maxSignatures})
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Date Field Component
function DateField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const handleDatePicker = () => {
    if (disabled) return;

    if (Platform.OS === 'web') {
      // On web, create a temporary date input
      const input = document.createElement('input');
      input.type = 'date';
      input.value = value || new Date().toISOString().split('T')[0];
      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value) {
          onChange(target.value);
        }
      };
      input.click();
    } else {
      // TODO: Use native date picker for mobile
      const today = new Date().toISOString().split('T')[0];
      onChange(today);
    }
  };

  return (
    <Pressable
      onPress={handleDatePicker}
      disabled={disabled}
      className="flex-row items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-3"
    >
      <Calendar size={20} color="#9CA3AF" />
      <Text className={`ml-3 flex-1 ${value ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
        {value ? formatDate(value) : 'Select date...'}
      </Text>
    </Pressable>
  );
}

// Photo Field Component
function PhotoField({
  field,
  value,
  onChange,
  disabled,
  sectionId,
  instanceIndex,
  onOcrComplete,
}: {
  field: FormField;
  value: { uri: string; ocrData?: Record<string, string> } | undefined;
  onChange: (value: any) => void;
  disabled?: boolean;
  sectionId?: string;
  instanceIndex?: number;
  onOcrComplete?: (formFields: Record<string, string>) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');

  const runOcr = async (imageBase64: string) => {
    if (!field.ocrEnabled) return null;

    try {
      setOcrStatus('processing');

      // Dynamically import to avoid issues
      const { extractNameplateOcr } = await import('@/lib/api');

      // Determine equipment type from field/section
      let equipmentType = 'equipment';
      if (field.id.includes('pump') || sectionId?.includes('pump')) {
        equipmentType = 'fire pump';
      } else if (field.id.includes('engine') || sectionId?.includes('engine')) {
        equipmentType = 'diesel engine';
      } else if (field.id.includes('controller') || sectionId?.includes('controller')) {
        equipmentType = 'fire pump controller';
      } else if (field.id.includes('gauge')) {
        equipmentType = 'pressure gauge';
      }

      const result = await extractNameplateOcr({
        imageBase64,
        equipmentType,
        fieldsToExtract: field.ocrFields || [],
        sectionId,
        instanceIndex,
      });

      if (result.success && result.extractedData) {
        setOcrStatus('done');

        // Call callback to auto-fill related form fields
        if (onOcrComplete && result.formFields) {
          onOcrComplete(result.formFields);
        }

        return result.extractedData;
      } else {
        setOcrStatus('error');
        return null;
      }
    } catch (error) {
      console.error('[PhotoField] OCR error:', error);
      setOcrStatus('error');
      return null;
    }
  };

  const handleTakePhoto = async () => {
    if (disabled) return;

    if (Platform.OS === 'web') {
      // Web: Use file input for camera/gallery
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Use rear camera
      input.onchange = async (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          setIsLoading(true);
          const reader = new FileReader();
          reader.onload = async (event) => {
            const uri = event.target?.result as string;

            // Save photo immediately
            onChange({ uri, ocrData: null });

            // Run OCR if enabled
            if (field.ocrEnabled) {
              const ocrData = await runOcr(uri);
              if (ocrData) {
                onChange({ uri, ocrData });
              }
            }

            setIsLoading(false);
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      // TODO: Use expo-image-picker for native
      console.log('[PhotoField] Native camera not yet implemented');
    }
  };

  const handleRemovePhoto = () => {
    if (disabled) return;
    showConfirm('Remove Photo', 'Are you sure you want to remove this photo?', () => {
      onChange(undefined);
    });
  };

  return (
    <View className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      {value?.uri ? (
        <View>
          <Image
            source={{ uri: value.uri }}
            style={{ width: '100%', height: 200, resizeMode: 'cover' }}
          />
          {/* OCR Status Indicator */}
          {field.ocrEnabled && (
            <View className={`absolute top-2 right-2 px-2 py-1 rounded-full flex-row items-center ${
              ocrStatus === 'processing' ? 'bg-blue-500' :
              ocrStatus === 'done' ? 'bg-green-500' :
              ocrStatus === 'error' ? 'bg-red-500' :
              'bg-orange-500'
            }`}>
              {ocrStatus === 'processing' ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Copy size={12} color="white" />
              )}
              <Text className="ml-1 text-white text-xs">
                {ocrStatus === 'processing' ? 'Reading...' :
                 ocrStatus === 'done' ? 'Done' :
                 ocrStatus === 'error' ? 'Error' :
                 'OCR'}
              </Text>
            </View>
          )}
          {/* OCR Data Display */}
          {value.ocrData && Object.keys(value.ocrData).length > 0 && (
            <View className="p-2 bg-green-50 dark:bg-green-900/30">
              <Text className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                Extracted Data:
              </Text>
              {Object.entries(value.ocrData).map(([key, val]) => (
                <Text key={key} className="text-xs text-gray-600 dark:text-gray-400">
                  {key}: {val}
                </Text>
              ))}
            </View>
          )}
          {!disabled && (
            <Pressable
              onPress={handleRemovePhoto}
              className="absolute top-2 left-2 bg-red-500 p-2 rounded-full"
            >
              <Trash2 size={16} color="white" />
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          onPress={handleTakePhoto}
          disabled={disabled || isLoading}
          className="items-center justify-center py-8"
        >
          {isLoading ? (
            <ActivityIndicator size="large" color="#F97316" />
          ) : (
            <>
              <Camera size={40} color="#9CA3AF" />
              <Text className="mt-2 text-gray-500 dark:text-gray-400">
                Tap to take photo
              </Text>
              {field.ocrEnabled && (
                <Text className="mt-1 text-xs text-orange-500">
                  OCR enabled - will extract text
                </Text>
              )}
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

// Photo Gallery Field Component
function PhotoGalleryField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: Array<{ uri: string }> | undefined;
  onChange: (value: Array<{ uri: string }>) => void;
  disabled?: boolean;
}) {
  const photos = value || [];
  const maxPhotos = field.maxPhotos || 10;

  const handleAddPhoto = async () => {
    if (disabled || photos.length >= maxPhotos) return;

    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        const target = e.target as HTMLInputElement;
        const files = target.files;
        if (files) {
          Array.from(files).slice(0, maxPhotos - photos.length).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const uri = event.target?.result as string;
              onChange([...photos, { uri }]);
            };
            reader.readAsDataURL(file);
          });
        }
      };
      input.click();
    }
  };

  const handleRemovePhoto = (index: number) => {
    if (disabled) return;
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <View>
      {/* Photo Grid */}
      <View className="flex-row flex-wrap gap-2 mb-3">
        {photos.map((photo, idx) => (
          <View key={idx} className="relative">
            <Image
              source={{ uri: photo.uri }}
              style={{ width: 80, height: 80, borderRadius: 8 }}
            />
            {!disabled && (
              <Pressable
                onPress={() => handleRemovePhoto(idx)}
                className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
              >
                <X size={12} color="white" />
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {/* Add Button */}
      {!disabled && photos.length < maxPhotos && (
        <Pressable
          onPress={handleAddPhoto}
          className="flex-row items-center justify-center p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg"
        >
          <ImageIcon size={20} color="#9CA3AF" />
          <Text className="ml-2 text-gray-500 dark:text-gray-400">
            Add Photo ({photos.length}/{maxPhotos})
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Repeatable Section Wrapper Component
function RepeatableSectionWrapper({
  section,
  formData,
  onFieldChange,
  disabled,
  defaultExpanded = true,
}: {
  section: FormSection;
  formData: Record<string, any>;
  onFieldChange: (fieldId: string, value: any) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}) {
  const maxRepeats = section.maxRepeats || 10;
  const repeatLabel = section.repeatLabel || 'Item';
  const countKey = `__${section.id}_count`;

  // Get count from formData, default to 1
  const instanceCount = formData[countKey] || 1;

  const addInstance = () => {
    if (instanceCount < maxRepeats && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onFieldChange(countKey, instanceCount + 1);
    }
  };

  const removeInstance = (index: number) => {
    if (instanceCount > 1 && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Shift all data from higher indices down
      const newFormData: Record<string, any> = {};
      for (let i = index + 1; i < instanceCount; i++) {
        section.fields.forEach(field => {
          const oldKey = `${section.id}_${i}_${field.id}`;
          const newKey = `${section.id}_${i - 1}_${field.id}`;
          if (formData[oldKey] !== undefined) {
            newFormData[newKey] = formData[oldKey];
          }
        });
      }

      // Clear the last instance data
      section.fields.forEach(field => {
        const lastKey = `${section.id}_${instanceCount - 1}_${field.id}`;
        onFieldChange(lastKey, undefined);
      });

      // Apply shifted data
      Object.entries(newFormData).forEach(([key, value]) => {
        onFieldChange(key, value);
      });

      // Update count
      onFieldChange(countKey, instanceCount - 1);
    }
  };

  return (
    <View className="mb-4">
      {/* Render each instance */}
      {Array.from({ length: instanceCount }, (_, index) => (
        <View key={`${section.id}_instance_${index}`} className="relative">
          <FormSectionComponent
            section={{
              ...section,
              name: `${section.name} - ${repeatLabel} ${index + 1}`,
            }}
            formData={formData}
            onFieldChange={onFieldChange}
            disabled={disabled}
            defaultExpanded={defaultExpanded && index === 0}
            instanceIndex={index}
            instancePrefix={`${section.id}_${index}_`}
          />
          {/* Remove button for non-first instances */}
          {instanceCount > 1 && !disabled && (
            <Pressable
              onPress={() => removeInstance(index)}
              className="absolute top-4 right-12 bg-red-100 dark:bg-red-900/30 p-2 rounded-lg"
            >
              <Trash2 size={16} color="#EF4444" />
            </Pressable>
          )}
        </View>
      ))}

      {/* Add button */}
      {!disabled && instanceCount < maxRepeats && (
        <Pressable
          onPress={addInstance}
          className="flex-row items-center justify-center py-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl border-2 border-dashed border-orange-300 dark:border-orange-700"
        >
          <Plus size={20} color="#F97316" />
          <Text className="ml-2 text-orange-500 font-medium">
            Add {repeatLabel} ({instanceCount}/{maxRepeats})
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Section Component
function FormSectionComponent({
  section,
  formData,
  onFieldChange,
  disabled,
  defaultExpanded = true,
  instanceIndex,
  instancePrefix = '',
}: {
  section: FormSection;
  formData: Record<string, any>;
  onFieldChange: (fieldId: string, value: any) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
  instanceIndex?: number;
  instancePrefix?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Helper to get the full field ID (with prefix for repeatable sections)
  const getFieldKey = (fieldId: string) => instancePrefix + fieldId;

  // Calculate section completion
  const completionInfo = useMemo(() => {
    let total = 0;
    let filled = 0;
    section.fields.forEach(field => {
      if (field.type !== 'SIGNATURE') {
        total++;
        const val = formData[getFieldKey(field.id)];
        if (val !== undefined && val !== null && val !== '') {
          filled++;
        }
      }
    });
    return { total, filled, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [section.fields, formData, instancePrefix]);

  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl mb-4 overflow-hidden border border-gray-100 dark:border-gray-700">
      {/* Section Header */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsExpanded(!isExpanded);
        }}
        className="flex-row items-center justify-between p-4 bg-gray-50 dark:bg-gray-750"
      >
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {section.name}
          </Text>
          {section.description && (
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {section.description}
            </Text>
          )}
        </View>
        <View className="flex-row items-center">
          {completionInfo.total > 0 && (
            <View className="mr-3 px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-600">
              <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {completionInfo.filled}/{completionInfo.total}
              </Text>
            </View>
          )}
          {isExpanded ? (
            <ChevronUp size={20} color="#9CA3AF" />
          ) : (
            <ChevronDown size={20} color="#9CA3AF" />
          )}
        </View>
      </Pressable>

      {/* Section Fields */}
      {isExpanded && (
        <View className="p-4 gap-4">
          {section.fields.map((field, index) => (
            <Animated.View
              key={field.id}
              entering={FadeInDown.delay(index * 30).duration(200)}
            >
              {/* Field Label (for non-checkbox fields) */}
              {field.type !== 'CHECKBOX' && (
                <View className="mb-2">
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {field.label}
                    {field.required && <Text className="text-red-500"> *</Text>}
                  </Text>
                </View>
              )}

              {/* Field Input */}
              {(field.type === 'YES_NO' || field.type === 'YES_NO_NA') && (
                <YesNoNaField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'CHECKBOX' && (
                <CheckboxField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'TEXT' && (
                section.voiceEnabled ? (
                  <VoiceTextInput
                    field={field}
                    value={formData[getFieldKey(field.id)]}
                    onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                    disabled={disabled}
                  />
                ) : (
                  <TextFieldInput
                    field={field}
                    value={formData[getFieldKey(field.id)]}
                    onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                    disabled={disabled}
                  />
                )
              )}
              {field.type === 'NUMBER' && (
                <NumberFieldInput
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'SIGNATURE' && (
                <SignatureField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'TABLE' && (
                <TableField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'CREW_SIGNATURES' && (
                <CrewSignaturesField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'DATE' && (
                <DateField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'PHOTO' && (
                <PhotoField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                  sectionId={section.id}
                  instanceIndex={instanceIndex}
                  onOcrComplete={(ocrFields) => {
                    // Auto-fill related form fields with OCR data
                    Object.entries(ocrFields).forEach(([fieldId, value]) => {
                      if (value) {
                        onFieldChange(fieldId, value);
                      }
                    });
                  }}
                />
              )}
              {field.type === 'PHOTO_GALLERY' && (
                <PhotoGalleryField
                  field={field}
                  value={formData[getFieldKey(field.id)]}
                  onChange={(val) => onFieldChange(getFieldKey(field.id), val)}
                  disabled={disabled}
                />
              )}
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function FormFillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const formId = params.id;

  // Local form data state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch form instance
  const formQuery = useQuery({
    queryKey: queryKeys.formInstance(formId || ''),
    queryFn: () => getFormInstance(formId!),
    enabled: !!formId,
  });

  // Initialize form data when loaded
  useEffect(() => {
    if (formQuery.data?.data) {
      setFormData(formQuery.data.data);
    }
  }, [formQuery.data?.data]);

  // Debounced form data for auto-save
  const debouncedFormData = useDebounce(formData, 2000);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { data?: Record<string, any>; status?: FormStatus }) => {
      console.log('[form-fill] Mutation called with:', data);
      return updateFormInstance(formId!, data);
    },
    onSuccess: (result) => {
      console.log('[form-fill] Save successful:', result);
      queryClient.invalidateQueries({ queryKey: queryKeys.formInstance(formId!) });
      queryClient.invalidateQueries({ queryKey: ['formInstances'] });
      setHasChanges(false);
      setIsSaving(false);
    },
    onError: (error) => {
      console.error('[form-fill] Save error:', error);
      setIsSaving(false);
      if (Platform.OS === 'web') {
        window.alert('Failed to save form. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to save form. Please try again.');
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteFormInstance(formId!),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['formInstances'] });
      router.back();
    },
    onError: (error) => {
      console.error('[form-fill] Delete error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert('Failed to delete form. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to delete form. Please try again.');
      }
    },
  });

  // Handle delete
  const handleDelete = useCallback(() => {
    showConfirm(
      'Delete Form',
      'Are you sure you want to delete this form? This action cannot be undone.',
      () => deleteMutation.mutate()
    );
  }, [deleteMutation]);

  // Auto-save effect
  useEffect(() => {
    if (hasChanges && formId && Object.keys(debouncedFormData).length > 0) {
      setIsSaving(true);
      updateMutation.mutate({ data: debouncedFormData, status: 'IN_PROGRESS' });
    }
  }, [debouncedFormData]);

  // Handle field change
  const handleFieldChange = useCallback((fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    setHasChanges(true);
  }, []);

  // Calculate overall completion (including repeatable sections)
  const completionInfo = useMemo(() => {
    if (!formQuery.data?.template?.schema?.sections) return { total: 0, filled: 0, percent: 0 };

    let total = 0;
    let filled = 0;
    formQuery.data.template.schema.sections.forEach(section => {
      if (section.repeatable) {
        // For repeatable sections, count all instances
        const countKey = `__${section.id}_count`;
        const instanceCount = formData[countKey] || 1;
        for (let i = 0; i < instanceCount; i++) {
          section.fields.forEach(field => {
            if (field.type !== 'SIGNATURE') {
              total++;
              const val = formData[`${section.id}_${i}_${field.id}`];
              if (val !== undefined && val !== null && val !== '') {
                filled++;
              }
            }
          });
        }
      } else {
        section.fields.forEach(field => {
          if (field.type !== 'SIGNATURE') {
            total++;
            const val = formData[field.id];
            if (val !== undefined && val !== null && val !== '') {
              filled++;
            }
          }
        });
      }
    });
    return { total, filled, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [formQuery.data?.template?.schema?.sections, formData]);

  // Check if all required fields are filled (including repeatable sections)
  const canSubmit = useMemo(() => {
    if (!formQuery.data?.template?.schema?.sections) return false;

    for (const section of formQuery.data.template.schema.sections) {
      if (section.repeatable) {
        // For repeatable sections, check all instances
        const countKey = `__${section.id}_count`;
        const instanceCount = formData[countKey] || 1;
        for (let i = 0; i < instanceCount; i++) {
          for (const field of section.fields) {
            if (field.required) {
              const val = formData[`${section.id}_${i}_${field.id}`];
              if (val === undefined || val === null || val === '') {
                return false;
              }
              if (field.type === 'SIGNATURE' && !val?.signed) {
                return false;
              }
            }
          }
        }
      } else {
        for (const field of section.fields) {
          if (field.required) {
            const val = formData[field.id];
            if (val === undefined || val === null || val === '') {
              return false;
            }
            if (field.type === 'SIGNATURE' && !val?.signed) {
              return false;
            }
          }
        }
      }
    }
    return true;
  }, [formQuery.data?.template?.schema?.sections, formData]);

  // Handle manual save
  const handleSave = () => {
    console.log('[form-fill] handleSave called, hasChanges:', hasChanges, 'formData:', formData);
    if (hasChanges && formId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsSaving(true);
      console.log('[form-fill] Saving form...', { formId, data: formData });
      updateMutation.mutate({ data: formData, status: 'IN_PROGRESS' });
    }
  };

  // Handle PDF download
  const handleDownloadPdf = async () => {
    if (!formId) return;

    setIsDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const blob = await downloadFormPdf(formId);

      if (Platform.OS === 'web') {
        // Web: Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Pre-Task-Plan_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Native: Use sharing
        // TODO: Save to file system and share
        console.log('[form-fill] Native PDF download not yet implemented');
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('[form-fill] PDF download error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (Platform.OS === 'web') {
        window.alert('Failed to download PDF. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to download PDF. Please try again.');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Loading state
  if (formQuery.isLoading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="mt-4 text-gray-500">Loading form...</Text>
      </View>
    );
  }

  // Error state
  if (formQuery.error || !formQuery.data) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-4">
        <Stack.Screen options={{ headerShown: false }} />
        <AlertCircle size={48} color="#EF4444" />
        <Text className="mt-4 text-gray-700 dark:text-gray-300 text-center">
          Failed to load form
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg"
        >
          <Text className="text-gray-700 dark:text-gray-300">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const form = formQuery.data;
  const template = form.template;
  const sections = template?.schema?.sections || [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-50 dark:bg-gray-900"
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="bg-white dark:bg-gray-800 px-4 pt-12 pb-4 border-b border-gray-100 dark:border-gray-700">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              if (hasChanges) {
                showThreeOptionDialog(
                  'Unsaved Changes',
                  'You have unsaved changes. Save before leaving?',
                  [
                    { text: 'Discard', style: 'destructive', onPress: () => router.back() },
                    { text: 'Cancel', style: 'cancel', onPress: () => {} },
                    {
                      text: 'Save',
                      onPress: () => {
                        updateMutation.mutate(
                          { data: formData, status: 'IN_PROGRESS' },
                          { onSuccess: () => router.back() }
                        );
                      },
                    },
                  ]
                );
              } else {
                router.back();
              }
            }}
            className="p-2 -ml-2"
          >
            <ArrowLeft size={24} color="#6B7280" />
          </Pressable>

          <View className="flex-row items-center">
            {isSaving && (
              <View className="flex-row items-center mr-3">
                <ActivityIndicator size="small" color="#F97316" />
                <Text className="ml-1 text-xs text-gray-400">Saving...</Text>
              </View>
            )}
            <Pressable
              onPress={handleSave}
              disabled={!hasChanges || isSaving}
              className={`p-2 ${hasChanges ? 'opacity-100' : 'opacity-50'}`}
            >
              <Save size={22} color={hasChanges ? '#F97316' : '#9CA3AF'} />
            </Pressable>
          </View>
        </View>

        <Text className="text-xl font-bold text-gray-900 dark:text-white mt-3">
          {template?.name || 'Form'}
        </Text>
        {form.location && (
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {form.location}
          </Text>
        )}

        {/* Progress Bar */}
        <View className="mt-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Progress
            </Text>
            <Text className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {completionInfo.percent}%
            </Text>
          </View>
          <View className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <View
              className="h-full bg-orange-500 rounded-full"
              style={{ width: `${completionInfo.percent}%` }}
            />
          </View>
        </View>
      </View>

      {/* Form Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {sections.map((section, index) =>
          section.repeatable ? (
            <RepeatableSectionWrapper
              key={section.id}
              section={section}
              formData={formData}
              onFieldChange={handleFieldChange}
              disabled={false}
              defaultExpanded={index === 0}
            />
          ) : (
            <FormSectionComponent
              key={section.id}
              section={section}
              formData={formData}
              onFieldChange={handleFieldChange}
              disabled={false}
              defaultExpanded={index === 0}
            />
          )
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <View className="flex-row gap-3">
          {/* Delete Button */}
          <Pressable
            onPress={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex-row items-center justify-center py-4 px-4 rounded-xl bg-red-500"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Trash2 size={20} color="white" />
            )}
          </Pressable>

          {/* Export PDF Button */}
          <Pressable
            onPress={handleDownloadPdf}
            disabled={!canSubmit || isDownloading}
            className={`flex-1 flex-row items-center justify-center py-4 rounded-xl ${
              canSubmit ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            {isDownloading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Download size={20} color="white" />
                <Text className="ml-2 text-white font-semibold text-base">
                  Export PDF
                </Text>
              </>
            )}
          </Pressable>
        </View>
        {!canSubmit && (
          <Text className="text-center text-xs text-gray-400 mt-2">
            Complete all required fields to export PDF
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
