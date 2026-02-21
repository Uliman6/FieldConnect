import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Image,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { PDFViewerModal } from '@/components/PDFViewerModal';
import {
  Sun,
  Cloud,
  CloudRain,
  ThermometerSun,
  FileText,
  Copy,
  Check,
  ArrowLeft,
  Eye,
  Download,
  Users,
  Clock,
  AlertTriangle,
  ClipboardList,
  Truck,
  Package,
  UserCheck,
  Building2,
  Wind,
  Droplets,
  Plus,
  X,
  Trash2,
  Edit3,
  Save,
  ChevronDown,
  Camera,
  Image as ImageIcon,
} from 'lucide-react-native';
import {
  getDailyLog,
  fetchDailyLogPdf,
  updateDailyLogApi,
  addTaskApi,
  updateTaskApi,
  deleteTaskApi,
  addPendingIssueApi,
  updatePendingIssueApi,
  deletePendingIssueApi,
  addVisitorApi,
  updateVisitorApi,
  deleteVisitorApi,
  addEquipmentApi,
  updateEquipmentApi,
  deleteEquipmentApi,
  addMaterialApi,
  updateMaterialApi,
  deleteMaterialApi,
  addInspectionNoteApi,
  updateInspectionNoteApi,
  deleteInspectionNoteApi,
  getDailyLogPhotos,
  uploadPhoto,
  deletePhoto,
  fetchPhotoFile,
  DailyLogDetail,
  queryKeys,
} from '@/lib/api';
import { getBackendId } from '@/lib/data-provider';
import type { Photo } from '@/lib/types';
import { cn } from '@/lib/cn';

// ============================================
// TYPES
// ============================================

type SectionType = 'tasks' | 'issues' | 'visitors' | 'equipment' | 'materials' | 'inspections';

interface SectionConfig {
  key: SectionType;
  title: string;
  icon: React.ReactNode;
  color: string;
}

const SECTION_CONFIGS: SectionConfig[] = [
  { key: 'tasks', title: 'Tasks', icon: <ClipboardList size={20} color="#1F5C1A" />, color: '#1F5C1A' },
  { key: 'issues', title: 'Pending Issues', icon: <AlertTriangle size={20} color="#EF4444" />, color: '#EF4444' },
  { key: 'visitors', title: 'Visitors', icon: <UserCheck size={20} color="#10B981" />, color: '#10B981' },
  { key: 'equipment', title: 'Equipment', icon: <Truck size={20} color="#6B7280" />, color: '#6B7280' },
  { key: 'materials', title: 'Materials', icon: <Package size={20} color="#3B82F6" />, color: '#3B82F6' },
  { key: 'inspections', title: 'Inspections', icon: <ClipboardList size={20} color="#8B5CF6" />, color: '#8B5CF6' },
];

// ============================================
// HELPERS
// ============================================

function parseLocalDate(dateString: string): Date {
  if (dateString && dateString.length === 10) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(dateString);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

// ============================================
// COMPONENTS
// ============================================

function SectionHeader({
  title,
  icon,
  count,
  onAdd,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  onAdd?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between mb-3">
      <View className="flex-row items-center">
        {icon}
        <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">{title}</Text>
        {count !== undefined && count > 0 && (
          <View className="ml-2 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded-full">
            <Text className="text-xs font-medium text-orange-600 dark:text-orange-400">{count}</Text>
          </View>
        )}
      </View>
      {onAdd && (
        <Pressable
          onPress={onAdd}
          className="flex-row items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg"
        >
          <Plus size={16} color="#1F5C1A" />
          <Text className="ml-1 text-sm font-medium text-orange-500">Add</Text>
        </Pressable>
      )}
    </View>
  );
}

function EditableField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        multiline={multiline}
        className={cn(
          'bg-gray-100 dark:bg-gray-800 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white',
          multiline && 'min-h-[80px] text-base'
        )}
        style={multiline ? { textAlignVertical: 'top' } : undefined}
      />
    </View>
  );
}

function ItemCard({
  children,
  onEdit,
  onDelete,
  isEditing,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
}) {
  return (
    <View
      className={cn(
        'bg-gray-50 dark:bg-gray-900 rounded-xl p-3 mb-2',
        isEditing && 'border-2 border-orange-300 dark:border-orange-700'
      )}
    >
      <View className="flex-row items-start">
        <View className="flex-1">{children}</View>
        <View className="flex-row ml-2">
          {onEdit && (
            <Pressable onPress={onEdit} className="p-2">
              <Edit3 size={16} color="#6B7280" />
            </Pressable>
          )}
          {onDelete && (
            <Pressable onPress={onDelete} className="p-2">
              <Trash2 size={16} color="#EF4444" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ============================================
// ADD SECTION MODAL
// ============================================

function AddSectionModal({
  visible,
  onClose,
  onSelectSection,
  existingSections,
}: {
  visible: boolean;
  onClose: () => void;
  onSelectSection: (section: SectionType) => void;
  existingSections: Set<SectionType>;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
        <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl" onPress={(e) => e.stopPropagation()}>
          <View className="p-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">Add Section</Text>
              <Pressable onPress={onClose} className="p-2">
                <X size={24} color="#6B7280" />
              </Pressable>
            </View>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Select a section to add to this daily log
            </Text>
            {SECTION_CONFIGS.map((config) => {
              const hasItems = existingSections.has(config.key);
              return (
                <Pressable
                  key={config.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelectSection(config.key);
                  }}
                  className="flex-row items-center p-4 bg-gray-50 dark:bg-gray-900 rounded-xl mb-2"
                >
                  {config.icon}
                  <Text className="ml-3 text-base font-medium text-gray-900 dark:text-white flex-1">
                    {config.title}
                  </Text>
                  {hasItems && (
                    <View className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded">
                      <Text className="text-xs text-green-600 dark:text-green-400">Has items</Text>
                    </View>
                  )}
                  <Plus size={20} color={config.color} className="ml-2" />
                </Pressable>
              );
            })}
          </View>
          <View className="h-8" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ============================================
// EDIT ITEM MODALS
// ============================================

function EditTaskModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [companyName, setCompanyName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [workers, setWorkers] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');

  // Sync state when initialData changes (when modal opens with different task)
  React.useEffect(() => {
    if (visible && initialData) {
      setCompanyName(initialData.companyName || '');
      setTaskDescription(initialData.taskDescription || '');
      setWorkers(initialData.workers?.toString() || '');
      setHours(initialData.hours?.toString() || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      // Reset for new task
      setCompanyName('');
      setTaskDescription('');
      setWorkers('');
      setHours('');
      setNotes('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({
      companyName,
      taskDescription,
      workers: workers ? parseInt(workers) : undefined,
      hours: hours ? parseFloat(hours) : undefined,
      notes,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl max-h-[80%]" onPress={(e) => e.stopPropagation()}>
            <ScrollView className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Task' : 'Edit Task'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Company/Trade" value={companyName} onChangeText={setCompanyName} placeholder="e.g., ABC Electric" />
              <EditableField label="Task Description" value={taskDescription} onChangeText={setTaskDescription} placeholder="What was done?" multiline />
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  <EditableField label="Workers" value={workers} onChangeText={setWorkers} placeholder="0" keyboardType="numeric" />
                </View>
                <View className="flex-1 ml-2">
                  <EditableField label="Hours" value={hours} onChangeText={setHours} placeholder="0" keyboardType="numeric" />
                </View>
              </View>
              <EditableField label="Notes" value={notes} onChangeText={setNotes} placeholder="Additional notes..." multiline />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Task' : 'Save Changes'}
                </Text>
              </Pressable>
            </ScrollView>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditIssueModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [assignee, setAssignee] = useState('');
  const [location, setLocation] = useState('');

  React.useEffect(() => {
    if (visible && initialData) {
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setCategory(initialData.category || '');
      setSeverity(initialData.severity || 'Medium');
      setAssignee(initialData.assignee || '');
      setLocation(initialData.location || '');
    } else if (visible && !initialData) {
      setTitle('');
      setDescription('');
      setCategory('');
      setSeverity('Medium');
      setAssignee('');
      setLocation('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({ title, description, category, severity, assignee, location });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl max-h-[80%]" onPress={(e) => e.stopPropagation()}>
            <ScrollView className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Issue' : 'Edit Issue'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Title" value={title} onChangeText={setTitle} placeholder="Issue title" />
              <EditableField label="Description" value={description} onChangeText={setDescription} placeholder="Describe the issue..." multiline />
              <EditableField label="Category" value={category} onChangeText={setCategory} placeholder="e.g., Safety, Quality" />
              <View className="mb-3">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">Severity</Text>
                <View className="flex-row">
                  {['Low', 'Medium', 'High'].map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setSeverity(s)}
                      className={cn(
                        'flex-1 py-2 rounded-lg mr-2',
                        severity === s
                          ? s === 'High' ? 'bg-red-500' : s === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      )}
                    >
                      <Text className={cn('text-center font-medium', severity === s ? 'text-white' : 'text-gray-600 dark:text-gray-400')}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <EditableField label="Assignee" value={assignee} onChangeText={setAssignee} placeholder="Who is responsible?" />
              <EditableField label="Location" value={location} onChangeText={setLocation} placeholder="Where is this issue?" />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Issue' : 'Save Changes'}
                </Text>
              </Pressable>
            </ScrollView>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditVisitorModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [visitorName, setVisitorName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (visible && initialData) {
      setVisitorName(initialData.visitorName || '');
      setCompanyName(initialData.companyName || '');
      setTime(initialData.time || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setVisitorName('');
      setCompanyName('');
      setTime('');
      setNotes('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({ visitorName, companyName, time, notes });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl" onPress={(e) => e.stopPropagation()}>
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Visitor' : 'Edit Visitor'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Visitor Name" value={visitorName} onChangeText={setVisitorName} placeholder="Name" />
              <EditableField label="Company" value={companyName} onChangeText={setCompanyName} placeholder="Company name" />
              <EditableField label="Time" value={time} onChangeText={setTime} placeholder="e.g., 10:00 AM" />
              <EditableField label="Notes" value={notes} onChangeText={setNotes} placeholder="Purpose of visit..." multiline />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Visitor' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditEquipmentModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [equipmentType, setEquipmentType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (visible && initialData) {
      setEquipmentType(initialData.equipmentType || '');
      setQuantity(initialData.quantity?.toString() || '');
      setHours(initialData.hours?.toString() || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setEquipmentType('');
      setQuantity('');
      setHours('');
      setNotes('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({
      equipmentType,
      quantity: quantity ? parseInt(quantity) : undefined,
      hours: hours ? parseFloat(hours) : undefined,
      notes,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl" onPress={(e) => e.stopPropagation()}>
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Equipment' : 'Edit Equipment'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Equipment Type" value={equipmentType} onChangeText={setEquipmentType} placeholder="e.g., Crane, Forklift" />
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  <EditableField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="0" keyboardType="numeric" />
                </View>
                <View className="flex-1 ml-2">
                  <EditableField label="Hours" value={hours} onChangeText={setHours} placeholder="0" keyboardType="numeric" />
                </View>
              </View>
              <EditableField label="Notes" value={notes} onChangeText={setNotes} placeholder="Additional notes..." multiline />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Equipment' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditMaterialModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [material, setMaterial] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (visible && initialData) {
      setMaterial(initialData.material || '');
      setQuantity(initialData.quantity?.toString() || '');
      setUnit(initialData.unit || '');
      setSupplier(initialData.supplier || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setMaterial('');
      setQuantity('');
      setUnit('');
      setSupplier('');
      setNotes('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({
      material,
      quantity: quantity ? parseFloat(quantity) : undefined,
      unit,
      supplier,
      notes,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl" onPress={(e) => e.stopPropagation()}>
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Material' : 'Edit Material'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Material" value={material} onChangeText={setMaterial} placeholder="e.g., Concrete, Rebar" />
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  <EditableField label="Quantity" value={quantity} onChangeText={setQuantity} placeholder="0" keyboardType="numeric" />
                </View>
                <View className="flex-1 ml-2">
                  <EditableField label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g., yards, lbs" />
                </View>
              </View>
              <EditableField label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Supplier name" />
              <EditableField label="Notes" value={notes} onChangeText={setNotes} placeholder="Additional notes..." multiline />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Material' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EditInspectionModal({
  visible,
  onClose,
  onSave,
  initialData,
  isNew,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  isNew?: boolean;
}) {
  const [inspectorName, setInspectorName] = useState('');
  const [ahj, setAhj] = useState('');
  const [inspectionType, setInspectionType] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (visible && initialData) {
      setInspectorName(initialData.inspectorName || '');
      setAhj(initialData.ahj || '');
      setInspectionType(initialData.inspectionType || '');
      setResult(initialData.result || '');
      setNotes(initialData.notes || '');
    } else if (visible && !initialData) {
      setInspectorName('');
      setAhj('');
      setInspectionType('');
      setResult('');
      setNotes('');
    }
  }, [visible, initialData]);

  const handleSave = () => {
    onSave({ inspectorName, ahj, inspectionType, result, notes });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <Pressable className="flex-1 bg-black/50 justify-end" onPress={onClose}>
          <Pressable className="bg-white dark:bg-gray-800 rounded-t-3xl" onPress={(e) => e.stopPropagation()}>
            <View className="p-6">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {isNew ? 'Add Inspection' : 'Edit Inspection'}
                </Text>
                <Pressable onPress={onClose} className="p-2">
                  <X size={24} color="#6B7280" />
                </Pressable>
              </View>
              <EditableField label="Inspection Type" value={inspectionType} onChangeText={setInspectionType} placeholder="e.g., Electrical, Plumbing" />
              <EditableField label="Inspector Name" value={inspectorName} onChangeText={setInspectorName} placeholder="Inspector's name" />
              <EditableField label="AHJ (Authority)" value={ahj} onChangeText={setAhj} placeholder="e.g., City of..." />
              <View className="mb-3">
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">Result</Text>
                <View className="flex-row">
                  {['Pass', 'Fail', 'Pending'].map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setResult(r)}
                      className={cn(
                        'flex-1 py-2 rounded-lg mr-2',
                        result === r
                          ? r === 'Pass' ? 'bg-green-500' : r === 'Fail' ? 'bg-red-500' : 'bg-yellow-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      )}
                    >
                      <Text className={cn('text-center font-medium', result === r ? 'text-white' : 'text-gray-600 dark:text-gray-400')}>{r}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <EditableField label="Notes" value={notes} onChangeText={setNotes} placeholder="Inspection notes..." multiline />
              <Pressable onPress={handleSave} className="bg-orange-500 py-4 rounded-xl mt-4">
                <Text className="text-center text-white font-semibold text-base">
                  {isNew ? 'Add Inspection' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
            <View className="h-8" />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================
// DAILY LOG PHOTO SECTION
// ============================================

function DailyLogPhotoSection({
  dailyLogId,
  photos,
  isLoading,
  onPhotoUploaded,
  onPhotoDeleted,
}: {
  dailyLogId: string;
  photos: Photo[];
  isLoading: boolean;
  onPhotoUploaded: () => void;
  onPhotoDeleted: (photoId: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Import PhotoPicker
  const PhotoPicker = require('@/components/PhotoPicker').default;

  // Load photo URLs with auth
  useEffect(() => {
    const loadPhotoUrls = async () => {
      const urls: Record<string, string> = {};
      for (const photo of photos) {
        try {
          const url = await fetchPhotoFile(photo.id);
          urls[photo.id] = url;
        } catch (err) {
          console.error('Failed to load photo:', photo.id, err);
        }
      }
      setPhotoUrls(urls);
    };
    if (photos.length > 0) {
      loadPhotoUrls();
    }
  }, [photos]);

  const handlePhotoPicked = async (file: File | Blob) => {
    setIsUploading(true);
    try {
      await uploadPhoto(file, { dailyLogId });
      onPhotoUploaded();
    } catch (error) {
      console.error('Failed to upload photo:', error);
      throw error; // Let PhotoPicker handle the error feedback
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePhoto = (photo: Photo) => {
    const doDelete = async () => {
      try {
        await deletePhoto(photo.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onPhotoDeleted(photo.id);
        setSelectedPhoto(null);
      } catch (error) {
        console.error('Failed to delete photo:', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete this photo?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Photo', 'Are you sure you want to delete this photo?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Camera size={20} color="#10B981" />
          <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">Photos</Text>
          {photos.length > 0 && (
            <View className="ml-2 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded-full">
              <Text className="text-xs font-medium text-green-600 dark:text-green-400">{photos.length}</Text>
            </View>
          )}
        </View>
        <PhotoPicker onPhotoPicked={handlePhotoPicked} disabled={isUploading}>
          <View className="flex-row items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
            {isUploading ? (
              <ActivityIndicator size="small" color="#10B981" />
            ) : (
              <>
                <Plus size={16} color="#10B981" />
                <Text className="ml-1 text-sm font-medium text-green-600">Add</Text>
              </>
            )}
          </View>
        </PhotoPicker>
      </View>

      {isLoading ? (
        <View className="items-center py-4">
          <ActivityIndicator size="small" color="#9CA3AF" />
        </View>
      ) : photos.length === 0 ? (
        <PhotoPicker onPhotoPicked={handlePhotoPicked} disabled={isUploading}>
          <View className="flex-row items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-xl py-8 border-2 border-dashed border-gray-200 dark:border-gray-600">
            <ImageIcon size={24} color="#9CA3AF" />
            <Text className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Tap to add photos
            </Text>
          </View>
        </PhotoPicker>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={() => setSelectedPhoto(photo)}
              className="relative"
            >
              {photoUrls[photo.id] ? (
                <Image
                  source={{ uri: photoUrls[photo.id] }}
                  style={{ width: 80, height: 80, borderRadius: 8 }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{ width: 80, height: 80, borderRadius: 8 }}
                  className="bg-gray-200 dark:bg-gray-600 items-center justify-center"
                >
                  <ActivityIndicator size="small" color="#9CA3AF" />
                </View>
              )}
            </Pressable>
          ))}
          <PhotoPicker onPhotoPicked={handlePhotoPicked} disabled={isUploading}>
            <View className="w-20 h-20 rounded-lg bg-gray-100 dark:bg-gray-700 items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-500">
              {isUploading ? (
                <ActivityIndicator size="small" color="#9CA3AF" />
              ) : (
                <Plus size={24} color="#9CA3AF" />
              )}
            </View>
          </PhotoPicker>
        </View>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && photoUrls[selectedPhoto.id] && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
          <Pressable
            onPress={() => setSelectedPhoto(null)}
            className="flex-1 bg-black/80 items-center justify-center"
          >
            <Pressable onPress={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl p-4 mx-4 max-w-lg w-full">
              <Image
                source={{ uri: photoUrls[selectedPhoto.id] }}
                style={{ width: '100%', height: 300, borderRadius: 12 }}
                resizeMode="contain"
              />
              {selectedPhoto.caption && (
                <Text className="mt-3 text-sm text-gray-700 dark:text-gray-300 text-center">
                  {selectedPhoto.caption}
                </Text>
              )}
              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={() => setSelectedPhoto(null)}
                  className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 items-center"
                >
                  <Text className="text-gray-700 dark:text-gray-300 font-medium">Close</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeletePhoto(selectedPhoto)}
                  className="flex-1 py-3 rounded-xl bg-red-500 items-center"
                >
                  <Text className="text-white font-medium">Delete</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function DailyLogDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  // UI State
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfViewerVisible, setPdfViewerVisible] = useState(false);
  const [pdfViewerUri, setPdfViewerUri] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);

  // Edit modals
  const [editingTask, setEditingTask] = useState<any>(null);
  const [editingIssue, setEditingIssue] = useState<any>(null);
  const [editingVisitor, setEditingVisitor] = useState<any>(null);
  const [editingEquipment, setEditingEquipment] = useState<any>(null);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [editingInspection, setEditingInspection] = useState<any>(null);

  // Get backend ID (daily logs may have local IDs that differ from backend IDs)
  const backendDailyLogId = id ? (getBackendId('dailyLogs', id) || id) : '';

  // Fetch daily log from backend using the mapped backend ID
  const { data: log, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.dailyLog(backendDailyLogId),
    queryFn: () => getDailyLog(backendDailyLogId),
    enabled: !!backendDailyLogId,
  });

  // Fetch photos for the daily log
  const photosQuery = useQuery({
    queryKey: queryKeys.dailyLogPhotos(backendDailyLogId),
    queryFn: () => getDailyLogPhotos(backendDailyLogId),
    enabled: !!backendDailyLogId && !!id,
  });

  // Mutations - use backendDailyLogId for all API calls
  const invalidateLog = () => queryClient.invalidateQueries({ queryKey: queryKeys.dailyLog(backendDailyLogId) });

  const addTaskMutation = useMutation({
    mutationFn: (data: any) => addTaskApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingTask(null); },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: any }) => updateTaskApi(backendDailyLogId, taskId, data),
    onSuccess: () => { invalidateLog(); setEditingTask(null); },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => deleteTaskApi(backendDailyLogId, taskId),
    onSuccess: invalidateLog,
  });

  const addIssueMutation = useMutation({
    mutationFn: (data: any) => addPendingIssueApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingIssue(null); },
  });

  const updateIssueMutation = useMutation({
    mutationFn: ({ issueId, data }: { issueId: string; data: any }) => updatePendingIssueApi(backendDailyLogId, issueId, data),
    onSuccess: () => { invalidateLog(); setEditingIssue(null); },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: (issueId: string) => deletePendingIssueApi(backendDailyLogId, issueId),
    onSuccess: invalidateLog,
  });

  const addVisitorMutation = useMutation({
    mutationFn: (data: any) => addVisitorApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingVisitor(null); },
  });

  const updateVisitorMutation = useMutation({
    mutationFn: ({ visitorId, data }: { visitorId: string; data: any }) => updateVisitorApi(backendDailyLogId, visitorId, data),
    onSuccess: () => { invalidateLog(); setEditingVisitor(null); },
  });

  const deleteVisitorMutation = useMutation({
    mutationFn: (visitorId: string) => deleteVisitorApi(backendDailyLogId, visitorId),
    onSuccess: invalidateLog,
  });

  const addEquipmentMutation = useMutation({
    mutationFn: (data: any) => addEquipmentApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingEquipment(null); },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: ({ equipmentId, data }: { equipmentId: string; data: any }) => updateEquipmentApi(backendDailyLogId, equipmentId, data),
    onSuccess: () => { invalidateLog(); setEditingEquipment(null); },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => deleteEquipmentApi(backendDailyLogId, equipmentId),
    onSuccess: invalidateLog,
  });

  const addMaterialMutation = useMutation({
    mutationFn: (data: any) => addMaterialApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingMaterial(null); },
  });

  const updateMaterialMutation = useMutation({
    mutationFn: ({ materialId, data }: { materialId: string; data: any }) => updateMaterialApi(backendDailyLogId, materialId, data),
    onSuccess: () => { invalidateLog(); setEditingMaterial(null); },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: (materialId: string) => deleteMaterialApi(backendDailyLogId, materialId),
    onSuccess: invalidateLog,
  });

  const addInspectionMutation = useMutation({
    mutationFn: (data: any) => addInspectionNoteApi(backendDailyLogId, data),
    onSuccess: () => { invalidateLog(); setEditingInspection(null); },
  });

  const updateInspectionMutation = useMutation({
    mutationFn: ({ noteId, data }: { noteId: string; data: any }) => updateInspectionNoteApi(backendDailyLogId, noteId, data),
    onSuccess: () => { invalidateLog(); setEditingInspection(null); },
  });

  const deleteInspectionMutation = useMutation({
    mutationFn: (noteId: string) => deleteInspectionNoteApi(backendDailyLogId, noteId),
    onSuccess: invalidateLog,
  });

  // Handlers
  const handleViewPdf = useCallback(async () => {
    if (!backendDailyLogId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingPdf(true);
    try {
      const pdfUri = await fetchDailyLogPdf(backendDailyLogId, true);
      if (Platform.OS === 'web') {
        window.open(pdfUri, '_blank');
      } else {
        // Open in-app PDF viewer
        setPdfViewerUri(pdfUri);
        setPdfViewerVisible(true);
      }
    } catch (err) {
      console.error('[pdf] Failed to fetch PDF:', err);
      Alert.alert('Error', 'Failed to load PDF. Please try again.');
    } finally {
      setIsLoadingPdf(false);
    }
  }, [backendDailyLogId]);

  const handleCopySummary = useCallback(async () => {
    if (!log) return;
    const logDate = parseLocalDate(log.date);
    const summary = `Daily Log - ${format(logDate, 'MMM d, yyyy')}
Project: ${log.project?.name || 'Unknown'}
Tasks: ${log.tasks?.length || 0}
Issues: ${log.pendingIssues?.length || 0}
Workers: ${log.dailyTotalsWorkers || 0}
Hours: ${log.dailyTotalsHours || 0}`;

    await Clipboard.setStringAsync(summary);
    setCopiedSummary(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedSummary(false), 2000);
  }, [log]);

  const handleSelectSection = (section: SectionType) => {
    setShowAddSection(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    switch (section) {
      case 'tasks':
        setEditingTask({ isNew: true });
        break;
      case 'issues':
        setEditingIssue({ isNew: true });
        break;
      case 'visitors':
        setEditingVisitor({ isNew: true });
        break;
      case 'equipment':
        setEditingEquipment({ isNew: true });
        break;
      case 'materials':
        setEditingMaterial({ isNew: true });
        break;
      case 'inspections':
        setEditingInspection({ isNew: true });
        break;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#1F5C1A" />
        <Text className="mt-4 text-gray-500 dark:text-gray-400">Loading daily log...</Text>
      </View>
    );
  }

  // Error state
  if (isError || !log) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-8">
        <FileText size={48} color="#9CA3AF" />
        <Text className="mt-4 text-lg text-gray-500 dark:text-gray-400 text-center">
          {isError ? 'Failed to load daily log' : 'Daily log not found'}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4 bg-orange-500 px-6 py-3 rounded-xl">
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const logDate = parseLocalDate(log.date);
  const existingSections = new Set<SectionType>();
  if (log.tasks?.length) existingSections.add('tasks');
  if (log.pendingIssues?.length) existingSections.add('issues');
  if (log.visitors?.length) existingSections.add('visitors');
  if (log.equipment?.length) existingSections.add('equipment');
  if (log.materials?.length) existingSections.add('materials');
  if (log.inspectionNotes?.length) existingSections.add('inspections');

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View className="bg-white dark:bg-gray-800 px-4 pb-4" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center mb-3">
            <Pressable onPress={() => router.back()} className="p-2 -ml-2 mr-2">
              <ArrowLeft size={24} color="#6B7280" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">Edit Daily Log</Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {format(logDate, 'EEEE, MMMM d, yyyy')}
              </Text>
            </View>
          </View>

          {log.project && (
            <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 mb-3">
              <View className="flex-row items-center">
                <Building2 size={18} color="#1F5C1A" />
                <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">
                  {log.project.name}
                </Text>
              </View>
            </View>
          )}

          {/* Quick Actions */}
          <View className="flex-row">
            <Pressable
              onPress={handleViewPdf}
              disabled={isLoadingPdf}
              className="flex-1 flex-row items-center justify-center py-3 bg-orange-500 rounded-xl"
            >
              {isLoadingPdf ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Eye size={18} color="white" />
                  <Text className="ml-2 text-white font-semibold">View PDF</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleCopySummary}
              className="flex-1 flex-row items-center justify-center py-3 bg-gray-200 dark:bg-gray-700 rounded-xl ml-2"
            >
              {copiedSummary ? (
                <>
                  <Check size={18} color="#22C55E" />
                  <Text className="ml-2 text-green-600 font-semibold">Copied!</Text>
                </>
              ) : (
                <>
                  <Copy size={18} color="#6B7280" />
                  <Text className="ml-2 text-gray-700 dark:text-gray-300 font-semibold">Copy</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Daily Totals */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-3">Daily Totals</Text>
            <View className="flex-row">
              <View className="flex-1 items-center">
                <View className="flex-row items-center">
                  <Users size={20} color="#1F5C1A" />
                  <Text className="ml-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {log.dailyTotalsWorkers || 0}
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">Workers</Text>
              </View>
              <View className="w-px bg-gray-200 dark:bg-gray-700" />
              <View className="flex-1 items-center">
                <View className="flex-row items-center">
                  <Clock size={20} color="#1F5C1A" />
                  <Text className="ml-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {log.dailyTotalsHours || 0}
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">Hours</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Photos Section */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
            <DailyLogPhotoSection
              dailyLogId={backendDailyLogId}
              photos={photosQuery.data || []}
              isLoading={photosQuery.isLoading}
              onPhotoUploaded={() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogPhotos(backendDailyLogId) });
              }}
              onPhotoDeleted={() => {
                queryClient.invalidateQueries({ queryKey: queryKeys.dailyLogPhotos(backendDailyLogId) });
              }}
            />
          </View>
        </View>

        {/* Tasks Section */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
            <SectionHeader
              title="Tasks"
              icon={<ClipboardList size={20} color="#1F5C1A" />}
              count={log.tasks?.length}
              onAdd={() => setEditingTask({ isNew: true })}
            />
            {log.tasks?.map((task) => (
              <ItemCard
                key={task.id}
                onEdit={() => setEditingTask(task)}
                onDelete={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  deleteTaskMutation.mutate(task.id);
                }}
              >
                {task.companyName && (
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">{task.companyName}</Text>
                )}
                {task.taskDescription && (
                  <Text className="text-sm text-gray-600 dark:text-gray-400">{task.taskDescription}</Text>
                )}
                <View className="flex-row mt-1">
                  {task.workers != null && (
                    <Text className="text-xs text-gray-500 mr-3">{task.workers} workers</Text>
                  )}
                  {task.hours != null && <Text className="text-xs text-gray-500">{task.hours} hrs</Text>}
                </View>
              </ItemCard>
            ))}
            {(!log.tasks || log.tasks.length === 0) && (
              <Text className="text-sm text-gray-400 italic">No tasks recorded</Text>
            )}
          </View>
        </View>

        {/* Issues Section */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 border-2 border-orange-200 dark:border-orange-800">
            <SectionHeader
              title="Pending Issues"
              icon={<AlertTriangle size={20} color="#EF4444" />}
              count={log.pendingIssues?.length}
              onAdd={() => setEditingIssue({ isNew: true })}
            />
            {log.pendingIssues?.map((issue) => (
              <ItemCard
                key={issue.id}
                onEdit={() => setEditingIssue(issue)}
                onDelete={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  deleteIssueMutation.mutate(issue.id);
                }}
              >
                {issue.title && (
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">{issue.title}</Text>
                )}
                {issue.description && (
                  <Text className="text-sm text-gray-600 dark:text-gray-400">{issue.description}</Text>
                )}
                <View className="flex-row mt-1">
                  {issue.severity && (
                    <View
                      className={cn(
                        'px-2 py-0.5 rounded mr-2',
                        issue.severity === 'High'
                          ? 'bg-red-100'
                          : issue.severity === 'Medium'
                          ? 'bg-yellow-100'
                          : 'bg-green-100'
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs',
                          issue.severity === 'High'
                            ? 'text-red-600'
                            : issue.severity === 'Medium'
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        )}
                      >
                        {issue.severity}
                      </Text>
                    </View>
                  )}
                  {issue.assignee && <Text className="text-xs text-gray-500">{issue.assignee}</Text>}
                </View>
              </ItemCard>
            ))}
            {(!log.pendingIssues || log.pendingIssues.length === 0) && (
              <Text className="text-sm text-gray-400 italic">No pending issues</Text>
            )}
          </View>
        </View>

        {/* Visitors Section */}
        {(log.visitors?.length || 0) > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Visitors"
                icon={<UserCheck size={20} color="#10B981" />}
                count={log.visitors?.length}
                onAdd={() => setEditingVisitor({ isNew: true })}
              />
              {log.visitors?.map((visitor) => (
                <ItemCard
                  key={visitor.id}
                  onEdit={() => setEditingVisitor(visitor)}
                  onDelete={() => deleteVisitorMutation.mutate(visitor.id)}
                >
                  {visitor.visitorName && (
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">{visitor.visitorName}</Text>
                  )}
                  {visitor.companyName && (
                    <Text className="text-sm text-gray-600 dark:text-gray-400">{visitor.companyName}</Text>
                  )}
                  {visitor.time && <Text className="text-xs text-gray-500">{visitor.time}</Text>}
                </ItemCard>
              ))}
            </View>
          </View>
        )}

        {/* Equipment Section */}
        {(log.equipment?.length || 0) > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Equipment"
                icon={<Truck size={20} color="#6B7280" />}
                count={log.equipment?.length}
                onAdd={() => setEditingEquipment({ isNew: true })}
              />
              {log.equipment?.map((eq) => (
                <ItemCard
                  key={eq.id}
                  onEdit={() => setEditingEquipment(eq)}
                  onDelete={() => deleteEquipmentMutation.mutate(eq.id)}
                >
                  {eq.equipmentType && (
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">{eq.equipmentType}</Text>
                  )}
                  <View className="flex-row mt-1">
                    {eq.quantity != null && <Text className="text-xs text-gray-500 mr-3">Qty: {eq.quantity}</Text>}
                    {eq.hours != null && <Text className="text-xs text-gray-500">{eq.hours} hrs</Text>}
                  </View>
                </ItemCard>
              ))}
            </View>
          </View>
        )}

        {/* Materials Section */}
        {(log.materials?.length || 0) > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Materials"
                icon={<Package size={20} color="#3B82F6" />}
                count={log.materials?.length}
                onAdd={() => setEditingMaterial({ isNew: true })}
              />
              {log.materials?.map((mat) => (
                <ItemCard
                  key={mat.id}
                  onEdit={() => setEditingMaterial(mat)}
                  onDelete={() => deleteMaterialMutation.mutate(mat.id)}
                >
                  {mat.material && (
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">{mat.material}</Text>
                  )}
                  <View className="flex-row mt-1">
                    {mat.quantity != null && (
                      <Text className="text-xs text-gray-500">
                        {mat.quantity} {mat.unit || ''}
                      </Text>
                    )}
                    {mat.supplier && <Text className="text-xs text-gray-500 ml-3">from {mat.supplier}</Text>}
                  </View>
                </ItemCard>
              ))}
            </View>
          </View>
        )}

        {/* Inspections Section */}
        {(log.inspectionNotes?.length || 0) > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Inspections"
                icon={<ClipboardList size={20} color="#8B5CF6" />}
                count={log.inspectionNotes?.length}
                onAdd={() => setEditingInspection({ isNew: true })}
              />
              {log.inspectionNotes?.map((note) => (
                <ItemCard
                  key={note.id}
                  onEdit={() => setEditingInspection(note)}
                  onDelete={() => deleteInspectionMutation.mutate(note.id)}
                >
                  {note.inspectionType && (
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">{note.inspectionType}</Text>
                  )}
                  {note.inspectorName && (
                    <Text className="text-sm text-gray-600 dark:text-gray-400">By: {note.inspectorName}</Text>
                  )}
                  {note.result && (
                    <View
                      className={cn(
                        'px-2 py-0.5 rounded mt-1 self-start',
                        note.result.toLowerCase().includes('pass')
                          ? 'bg-green-100'
                          : note.result.toLowerCase().includes('fail')
                          ? 'bg-red-100'
                          : 'bg-gray-100'
                      )}
                    >
                      <Text
                        className={cn(
                          'text-xs',
                          note.result.toLowerCase().includes('pass')
                            ? 'text-green-600'
                            : note.result.toLowerCase().includes('fail')
                            ? 'text-red-600'
                            : 'text-gray-600'
                        )}
                      >
                        {note.result}
                      </Text>
                    </View>
                  )}
                </ItemCard>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Floating Add Section Button */}
      <View className="absolute bottom-6 left-4 right-4" style={{ marginBottom: insets.bottom }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowAddSection(true);
          }}
          className="bg-orange-500 flex-row items-center justify-center py-4 rounded-2xl shadow-lg"
        >
          <Plus size={24} color="white" />
          <Text className="ml-2 text-white font-bold text-base">Add Section</Text>
        </Pressable>
      </View>

      {/* Modals */}
      <AddSectionModal
        visible={showAddSection}
        onClose={() => setShowAddSection(false)}
        onSelectSection={handleSelectSection}
        existingSections={existingSections}
      />

      <EditTaskModal
        visible={!!editingTask}
        onClose={() => setEditingTask(null)}
        onSave={(data) => {
          if (editingTask?.isNew) {
            addTaskMutation.mutate(data);
          } else {
            updateTaskMutation.mutate({ taskId: editingTask.id, data });
          }
        }}
        initialData={editingTask}
        isNew={editingTask?.isNew}
      />

      <EditIssueModal
        visible={!!editingIssue}
        onClose={() => setEditingIssue(null)}
        onSave={(data) => {
          if (editingIssue?.isNew) {
            addIssueMutation.mutate(data);
          } else {
            updateIssueMutation.mutate({ issueId: editingIssue.id, data });
          }
        }}
        initialData={editingIssue}
        isNew={editingIssue?.isNew}
      />

      <EditVisitorModal
        visible={!!editingVisitor}
        onClose={() => setEditingVisitor(null)}
        onSave={(data) => {
          if (editingVisitor?.isNew) {
            addVisitorMutation.mutate(data);
          } else {
            updateVisitorMutation.mutate({ visitorId: editingVisitor.id, data });
          }
        }}
        initialData={editingVisitor}
        isNew={editingVisitor?.isNew}
      />

      <EditEquipmentModal
        visible={!!editingEquipment}
        onClose={() => setEditingEquipment(null)}
        onSave={(data) => {
          if (editingEquipment?.isNew) {
            addEquipmentMutation.mutate(data);
          } else {
            updateEquipmentMutation.mutate({ equipmentId: editingEquipment.id, data });
          }
        }}
        initialData={editingEquipment}
        isNew={editingEquipment?.isNew}
      />

      <EditMaterialModal
        visible={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        onSave={(data) => {
          if (editingMaterial?.isNew) {
            addMaterialMutation.mutate(data);
          } else {
            updateMaterialMutation.mutate({ materialId: editingMaterial.id, data });
          }
        }}
        initialData={editingMaterial}
        isNew={editingMaterial?.isNew}
      />

      <EditInspectionModal
        visible={!!editingInspection}
        onClose={() => setEditingInspection(null)}
        onSave={(data) => {
          if (editingInspection?.isNew) {
            addInspectionMutation.mutate(data);
          } else {
            updateInspectionMutation.mutate({ noteId: editingInspection.id, data });
          }
        }}
        initialData={editingInspection}
        isNew={editingInspection?.isNew}
      />

      {/* PDF Viewer Modal */}
      <PDFViewerModal
        visible={pdfViewerVisible}
        pdfUri={pdfViewerUri}
        title={log ? `Daily Log - ${format(parseLocalDate(log.date), 'MMM d, yyyy')}` : 'Daily Log PDF'}
        onClose={() => {
          setPdfViewerVisible(false);
          setPdfViewerUri(null);
        }}
      />
    </View>
  );
}
