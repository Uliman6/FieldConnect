import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFormInstance,
  updateFormInstance,
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
  Send,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useLanguage } from '@/i18n/LanguageProvider';

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

// Section Component
function FormSectionComponent({
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Calculate section completion
  const completionInfo = useMemo(() => {
    let total = 0;
    let filled = 0;
    section.fields.forEach(field => {
      if (field.type !== 'SIGNATURE') {
        total++;
        const val = formData[field.id];
        if (val !== undefined && val !== null && val !== '') {
          filled++;
        }
      }
    });
    return { total, filled, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [section.fields, formData]);

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
                  value={formData[field.id]}
                  onChange={(val) => onFieldChange(field.id, val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'CHECKBOX' && (
                <CheckboxField
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => onFieldChange(field.id, val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'TEXT' && (
                <TextFieldInput
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => onFieldChange(field.id, val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'NUMBER' && (
                <NumberFieldInput
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => onFieldChange(field.id, val)}
                  disabled={disabled}
                />
              )}
              {field.type === 'SIGNATURE' && (
                <SignatureField
                  field={field}
                  value={formData[field.id]}
                  onChange={(val) => onFieldChange(field.id, val)}
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

  // Calculate overall completion
  const completionInfo = useMemo(() => {
    if (!formQuery.data?.template?.schema?.sections) return { total: 0, filled: 0, percent: 0 };

    let total = 0;
    let filled = 0;
    formQuery.data.template.schema.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.type !== 'SIGNATURE') {
          total++;
          const val = formData[field.id];
          if (val !== undefined && val !== null && val !== '') {
            filled++;
          }
        }
      });
    });
    return { total, filled, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [formQuery.data?.template?.schema?.sections, formData]);

  // Check if all required fields are filled
  const canSubmit = useMemo(() => {
    if (!formQuery.data?.template?.schema?.sections) return false;

    for (const section of formQuery.data.template.schema.sections) {
      for (const field of section.fields) {
        if (field.required) {
          const val = formData[field.id];
          if (val === undefined || val === null || val === '') {
            return false;
          }
          // For signatures, check if signed
          if (field.type === 'SIGNATURE' && !val?.signed) {
            return false;
          }
        }
      }
    }
    return true;
  }, [formQuery.data?.template?.schema?.sections, formData]);

  // Handle submit
  const handleSubmit = () => {
    if (!canSubmit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (Platform.OS === 'web') {
        window.alert('Please fill in all required fields before submitting.');
      } else {
        Alert.alert('Incomplete Form', 'Please fill in all required fields before submitting.');
      }
      return;
    }

    showConfirm(
      'Submit Form',
      'Are you sure you want to submit this form? You will not be able to edit it after submission.',
      () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        updateMutation.mutate(
          { data: formData, status: 'COMPLETED' },
          {
            onSuccess: () => {
              router.back();
            },
          }
        );
      }
    );
  };

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
  const isCompleted = form.status === 'COMPLETED';

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
            {!isCompleted && (
              <Pressable
                onPress={handleSave}
                disabled={!hasChanges || isSaving}
                className={`p-2 ${hasChanges ? 'opacity-100' : 'opacity-50'}`}
              >
                <Save size={22} color={hasChanges ? '#F97316' : '#9CA3AF'} />
              </Pressable>
            )}
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
        {!isCompleted && (
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
        )}

        {/* Completed Banner */}
        {isCompleted && (
          <View className="mt-4 bg-green-50 dark:bg-green-900/30 rounded-lg p-3 flex-row items-center">
            <Check size={20} color="#10B981" />
            <Text className="ml-2 text-green-700 dark:text-green-300 font-medium">
              Form Completed
            </Text>
            {form.completedAt && (
              <Text className="ml-auto text-xs text-green-600 dark:text-green-400">
                {new Date(form.completedAt).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Form Content */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {sections.map((section, index) => (
          <FormSectionComponent
            key={section.id}
            section={section}
            formData={formData}
            onFieldChange={handleFieldChange}
            disabled={isCompleted}
            defaultExpanded={index === 0}
          />
        ))}
      </ScrollView>

      {/* Submit Button */}
      {!isCompleted && (
        <View className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || updateMutation.isPending}
            className={`flex-row items-center justify-center py-4 rounded-xl ${
              canSubmit ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Send size={20} color="white" />
                <Text className="ml-2 text-white font-semibold text-base">
                  Submit Form
                </Text>
              </>
            )}
          </Pressable>
          {!canSubmit && (
            <Text className="text-center text-xs text-gray-400 mt-2">
              Complete all required fields to submit
            </Text>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
