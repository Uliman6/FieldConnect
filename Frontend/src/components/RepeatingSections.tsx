import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Plus, Trash2, ChevronDown, ChevronUp, Users, Wrench, Package, UserCheck, RotateCcw, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  TaskEntry,
  VisitorEntry,
  EquipmentEntry,
  MaterialEntry,
  createEmptyTask,
  createEmptyVisitor,
  createEmptyEquipment,
  createEmptyMaterial,
} from '@/lib/types';
import { useDailyLogStore } from '@/lib/store';
import { Button } from './ui';
import { VoiceInputField } from './VoiceRecorder';
import { cn } from '@/lib/cn';

// ============================================
// TASK ENTRY SECTION
// ============================================

interface TaskCardProps {
  task: TaskEntry;
  onUpdate: (updates: Partial<TaskEntry>) => void;
  onDelete: () => void;
  expanded: boolean;
  onToggle: () => void;
  onAudioRecorded?: (uri: string) => void;
}

function TaskCard({ task, onUpdate, onDelete, expanded, onToggle, onAudioRecorded }: TaskCardProps) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-3 overflow-hidden border border-gray-200 dark:border-gray-700">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-1">
          <Text className="text-base font-medium text-gray-900 dark:text-white" numberOfLines={1}>
            {task.company_name || 'New Company'}
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400">
            {task.workers} workers · {task.hours} hrs
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={20} color="#9CA3AF" />
        ) : (
          <ChevronDown size={20} color="#9CA3AF" />
        )}
      </Pressable>

      {expanded ? (
        <View className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Company</Text>
            <TextInput
              value={task.company_name}
              onChangeText={(text) => onUpdate({ company_name: text })}
              placeholder="Company name"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          <View className="flex-row mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Workers</Text>
              <TextInput
                value={task.workers.toString()}
                onChangeText={(text) => onUpdate({ workers: parseInt(text) || 0 })}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
              />
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Hours</Text>
              <TextInput
                value={task.hours.toString()}
                onChangeText={(text) => onUpdate({ hours: parseFloat(text) || 0 })}
                placeholder="0"
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
              />
            </View>
          </View>

          <VoiceInputField
            label="Task Description"
            value={task.task_description}
            onChangeText={(text) => onUpdate({ task_description: text })}
            onAudioRecorded={onAudioRecorded}
            placeholder="What work was performed?"
          />

          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Notes (Optional)</Text>
            <TextInput
              value={task.notes}
              onChangeText={(text) => onUpdate({ notes: text })}
              placeholder="Additional notes..."
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            className="flex-row items-center justify-center py-3"
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="ml-2 text-red-500 font-medium">Delete Task</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface TasksSectionProps {
  tasks: TaskEntry[];
  onAdd: (task: TaskEntry) => void;
  onUpdate: (taskId: string, updates: Partial<TaskEntry>) => void;
  onRemove: (taskId: string) => void;
  totalWorkers: number;
  totalHours: number;
  onAudioRecorded?: (taskId: string, uri: string) => void;
  currentLogId?: string;
}

interface RecallCompany {
  company_name: string;
  workers: number;
  hours: number;
  task_description: string;
}

export function TasksSection({ tasks, onAdd, onUpdate, onRemove, totalWorkers, totalHours, onAudioRecorded, currentLogId }: TasksSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRecallModal, setShowRecallModal] = useState(false);

  // Get previous day's companies from store
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);

  // Find previous day's log for the same project
  const previousCompanies = useMemo(() => {
    if (!currentProjectId || !currentLogId) return [];

    // Get all logs for this project, sorted by date descending
    const projectLogs = dailyLogs
      .filter((l) => l.project_id === currentProjectId && l.id !== currentLogId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (projectLogs.length === 0) return [];

    // Get the most recent log
    const previousLog = projectLogs[0];

    // Extract unique companies with their most recent data
    const companiesMap = new Map<string, RecallCompany>();

    for (const task of previousLog.tasks) {
      if (task.company_name && !companiesMap.has(task.company_name)) {
        companiesMap.set(task.company_name, {
          company_name: task.company_name,
          workers: task.workers,
          hours: task.hours,
          task_description: task.task_description,
        });
      }
    }

    return Array.from(companiesMap.values());
  }, [dailyLogs, currentProjectId, currentLogId]);

  // Get companies already added to current log
  const currentCompanyNames = useMemo(() => {
    return new Set(tasks.map((t) => t.company_name.toLowerCase()));
  }, [tasks]);

  const handleAdd = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const newTask = createEmptyTask();
    onAdd(newTask);
    setExpandedId(newTask.id);
  };

  const handleRecallCompany = (company: RecallCompany) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const newTask = createEmptyTask();
    newTask.company_name = company.company_name;
    newTask.workers = company.workers;
    newTask.hours = company.hours;
    // Don't copy task description - it's usually different each day
    onAdd(newTask);
    setExpandedId(newTask.id);
    setShowRecallModal(false);
  };

  const handleRecallAll = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Add all companies that aren't already in the current log
    for (const company of previousCompanies) {
      if (!currentCompanyNames.has(company.company_name.toLowerCase())) {
        const newTask = createEmptyTask();
        newTask.company_name = company.company_name;
        newTask.workers = company.workers;
        newTask.hours = company.hours;
        onAdd(newTask);
      }
    }

    setShowRecallModal(false);
  };

  // Filter out companies already added
  const availableCompanies = previousCompanies.filter(
    (c) => !currentCompanyNames.has(c.company_name.toLowerCase())
  );

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Users size={20} color="#1F5C1A" />
          <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">Activity / Tasks</Text>
        </View>
        <View className="flex-row">
          <View className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded mr-2">
            <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">{totalWorkers} workers</Text>
          </View>
          <View className="px-2 py-1 bg-green-100 dark:bg-green-900 rounded">
            <Text className="text-xs font-medium text-green-600 dark:text-green-400">{totalHours} hrs</Text>
          </View>
        </View>
      </View>

      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onUpdate={(updates) => onUpdate(task.id, updates)}
          onDelete={() => onRemove(task.id)}
          expanded={expandedId === task.id}
          onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
          onAudioRecorded={onAudioRecorded ? (uri) => onAudioRecorded(task.id, uri) : undefined}
        />
      ))}

      <View className="flex-row">
        <View className="flex-1 mr-2">
          <Button title="Add Company" onPress={handleAdd} variant="secondary" icon={<Plus size={20} color="#1F5C1A" />} />
        </View>
        {previousCompanies.length > 0 && (
          <Pressable
            onPress={() => setShowRecallModal(true)}
            className="flex-row items-center bg-blue-100 dark:bg-blue-900/30 rounded-xl px-4 py-3"
          >
            <RotateCcw size={18} color="#3B82F6" />
            <Text className="ml-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              Recall
            </Text>
          </Pressable>
        )}
      </View>

      {/* Recall Companies Modal */}
      <Modal
        visible={showRecallModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRecallModal(false)}
      >
        <View className="flex-1 bg-gray-50 dark:bg-black">
          <View className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
            <Pressable onPress={() => setShowRecallModal(false)} className="p-2">
              <X size={24} color="#6B7280" />
            </Pressable>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              Recall Companies
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-4 pt-4">
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Add companies from your previous day's log. Worker counts and hours are pre-filled but can be adjusted.
            </Text>

            {availableCompanies.length > 0 ? (
              <>
                {/* Recall All Button */}
                <Pressable
                  onPress={handleRecallAll}
                  className="flex-row items-center justify-center bg-blue-500 rounded-xl py-3 mb-4"
                >
                  <RotateCcw size={18} color="white" />
                  <Text className="ml-2 text-base font-semibold text-white">
                    Recall All ({availableCompanies.length})
                  </Text>
                </Pressable>

                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Or select individually
                </Text>

                {availableCompanies.map((company, index) => (
                  <Pressable
                    key={`${company.company_name}-${index}`}
                    onPress={() => handleRecallCompany(company)}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 flex-row items-center justify-between border border-gray-200 dark:border-gray-700"
                  >
                    <View className="flex-1">
                      <Text className="text-base font-medium text-gray-900 dark:text-white">
                        {company.company_name}
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {company.workers} workers · {company.hours} hrs
                      </Text>
                    </View>
                    <Plus size={20} color="#1F5C1A" />
                  </Pressable>
                ))}
              </>
            ) : (
              <View className="items-center py-8">
                <Check size={48} color="#10B981" />
                <Text className="text-base text-gray-600 dark:text-gray-400 mt-4 text-center">
                  All companies from yesterday have been added
                </Text>
              </View>
            )}

            {previousCompanies.length === 0 && (
              <View className="items-center py-8">
                <Users size={48} color="#9CA3AF" />
                <Text className="text-base text-gray-500 dark:text-gray-400 mt-4 text-center">
                  No previous log found for this project
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ============================================
// VISITOR ENTRY SECTION
// ============================================

interface VisitorCardProps {
  visitor: VisitorEntry;
  onUpdate: (updates: Partial<VisitorEntry>) => void;
  onDelete: () => void;
  onAudioRecorded?: (uri: string) => void;
}

function VisitorCard({ visitor, onUpdate, onDelete, onAudioRecorded }: VisitorCardProps) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-2 p-3 border border-gray-200 dark:border-gray-700">
      <View className="flex-row items-center">
        <TextInput
          value={visitor.time}
          onChangeText={(text) => onUpdate({ time: text })}
          placeholder="Time"
          placeholderTextColor="#9CA3AF"
          className="w-16 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <TextInput
          value={visitor.visitor_name}
          onChangeText={(text) => onUpdate({ visitor_name: text })}
          placeholder="Name"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <Pressable onPress={onDelete} className="p-2">
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>
      <View className="flex-row mt-2">
        <TextInput
          value={visitor.company_name}
          onChangeText={(text) => onUpdate({ company_name: text })}
          placeholder="Company"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
      </View>
      <View className="mt-2">
        <VoiceInputField
          value={visitor.notes}
          onChangeText={(text) => onUpdate({ notes: text })}
          onAudioRecorded={onAudioRecorded}
          placeholder="Notes about visit..."
        />
      </View>
    </View>
  );
}

interface VisitorsSectionProps {
  visitors: VisitorEntry[];
  onAdd: (visitor: VisitorEntry) => void;
  onUpdate: (visitorId: string, updates: Partial<VisitorEntry>) => void;
  onRemove: (visitorId: string) => void;
  onAudioRecorded?: (visitorId: string, uri: string) => void;
}

export function VisitorsSection({ visitors, onAdd, onUpdate, onRemove, onAudioRecorded }: VisitorsSectionProps) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(createEmptyVisitor());
  };

  return (
    <View>
      <View className="flex-row items-center mb-3">
        <UserCheck size={20} color="#1F5C1A" />
        <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">Visitors</Text>
        {visitors.length > 0 ? (
          <View className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full">
            <Text className="text-xs text-gray-600 dark:text-gray-400">{visitors.length}</Text>
          </View>
        ) : null}
      </View>

      {visitors.map((visitor) => (
        <VisitorCard
          key={visitor.id}
          visitor={visitor}
          onUpdate={(updates) => onUpdate(visitor.id, updates)}
          onDelete={() => onRemove(visitor.id)}
          onAudioRecorded={onAudioRecorded ? (uri) => onAudioRecorded(visitor.id, uri) : undefined}
        />
      ))}

      <Button title="Add Visitor" onPress={handleAdd} variant="secondary" size="sm" icon={<Plus size={18} color="#1F5C1A" />} />
    </View>
  );
}

// ============================================
// EQUIPMENT ENTRY SECTION
// ============================================

interface EquipmentCardProps {
  equipment: EquipmentEntry;
  onUpdate: (updates: Partial<EquipmentEntry>) => void;
  onDelete: () => void;
  onAudioRecorded?: (uri: string) => void;
}

function EquipmentCard({ equipment, onUpdate, onDelete, onAudioRecorded }: EquipmentCardProps) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-2 p-3 border border-gray-200 dark:border-gray-700">
      <View className="flex-row items-center">
        <TextInput
          value={equipment.company}
          onChangeText={(text) => onUpdate({ company: text })}
          placeholder="Company"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <TextInput
          value={equipment.equipment}
          onChangeText={(text) => onUpdate({ equipment: text })}
          placeholder="Equipment"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <Pressable onPress={onDelete} className="p-2">
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>
      <View className="mt-2">
        <VoiceInputField
          value={equipment.notes}
          onChangeText={(text) => onUpdate({ notes: text })}
          onAudioRecorded={onAudioRecorded}
          placeholder="Notes about equipment..."
        />
      </View>
    </View>
  );
}

interface EquipmentSectionProps {
  equipment: EquipmentEntry[];
  onAdd: (equipment: EquipmentEntry) => void;
  onUpdate: (equipmentId: string, updates: Partial<EquipmentEntry>) => void;
  onRemove: (equipmentId: string) => void;
  onAudioRecorded?: (equipmentId: string, uri: string) => void;
}

export function EquipmentSection({ equipment, onAdd, onUpdate, onRemove, onAudioRecorded }: EquipmentSectionProps) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(createEmptyEquipment());
  };

  return (
    <View>
      <View className="flex-row items-center mb-3">
        <Wrench size={20} color="#1F5C1A" />
        <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">Equipment</Text>
        {equipment.length > 0 ? (
          <View className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full">
            <Text className="text-xs text-gray-600 dark:text-gray-400">{equipment.length}</Text>
          </View>
        ) : null}
      </View>

      {equipment.map((eq) => (
        <EquipmentCard
          key={eq.id}
          equipment={eq}
          onUpdate={(updates) => onUpdate(eq.id, updates)}
          onDelete={() => onRemove(eq.id)}
          onAudioRecorded={onAudioRecorded ? (uri) => onAudioRecorded(eq.id, uri) : undefined}
        />
      ))}

      <Button title="Add Equipment" onPress={handleAdd} variant="secondary" size="sm" icon={<Plus size={18} color="#1F5C1A" />} />
    </View>
  );
}

// ============================================
// MATERIAL ENTRY SECTION
// ============================================

interface MaterialCardProps {
  material: MaterialEntry;
  onUpdate: (updates: Partial<MaterialEntry>) => void;
  onDelete: () => void;
  onAudioRecorded?: (uri: string) => void;
}

function MaterialCard({ material, onUpdate, onDelete, onAudioRecorded }: MaterialCardProps) {
  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-2 p-3 border border-gray-200 dark:border-gray-700">
      <View className="flex-row items-center">
        <TextInput
          value={material.company}
          onChangeText={(text) => onUpdate({ company: text })}
          placeholder="Company"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <TextInput
          value={material.material_name}
          onChangeText={(text) => onUpdate({ material_name: text })}
          placeholder="Material"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <Pressable onPress={onDelete} className="p-2">
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>
      <View className="flex-row mt-2">
        <TextInput
          value={material.quantity}
          onChangeText={(text) => onUpdate({ quantity: text })}
          placeholder="Qty"
          placeholderTextColor="#9CA3AF"
          className="w-20 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white mr-2"
        />
        <TextInput
          value={material.phase_code}
          onChangeText={(text) => onUpdate({ phase_code: text })}
          placeholder="Phase Code"
          placeholderTextColor="#9CA3AF"
          className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white"
        />
      </View>
      <View className="mt-2">
        <VoiceInputField
          value={material.notes}
          onChangeText={(text) => onUpdate({ notes: text })}
          onAudioRecorded={onAudioRecorded}
          placeholder="Notes about material delivery..."
        />
      </View>
    </View>
  );
}

interface MaterialsSectionProps {
  materials: MaterialEntry[];
  onAdd: (material: MaterialEntry) => void;
  onUpdate: (materialId: string, updates: Partial<MaterialEntry>) => void;
  onRemove: (materialId: string) => void;
  onAudioRecorded?: (materialId: string, uri: string) => void;
}

export function MaterialsSection({ materials, onAdd, onUpdate, onRemove, onAudioRecorded }: MaterialsSectionProps) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd(createEmptyMaterial());
  };

  return (
    <View>
      <View className="flex-row items-center mb-3">
        <Package size={20} color="#1F5C1A" />
        <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">Materials</Text>
        {materials.length > 0 ? (
          <View className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full">
            <Text className="text-xs text-gray-600 dark:text-gray-400">{materials.length}</Text>
          </View>
        ) : null}
      </View>

      {materials.map((mat) => (
        <MaterialCard
          key={mat.id}
          material={mat}
          onUpdate={(updates) => onUpdate(mat.id, updates)}
          onDelete={() => onRemove(mat.id)}
          onAudioRecorded={onAudioRecorded ? (uri) => onAudioRecorded(mat.id, uri) : undefined}
        />
      ))}

      <Button title="Add Material" onPress={handleAdd} variant="secondary" size="sm" icon={<Plus size={18} color="#1F5C1A" />} />
    </View>
  );
}
