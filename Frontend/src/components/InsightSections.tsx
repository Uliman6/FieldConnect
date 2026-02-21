import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Plus, Trash2, ChevronDown, ChevronUp, ClipboardCheck, FileWarning } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  InspectionNote,
  AdditionalWorkEntry,
  InspectionResult,
  AdditionalWorkTag,
  createEmptyInspectionNote,
  createEmptyAdditionalWork,
} from '@/lib/types';
import { VoiceInputField } from './VoiceRecorder';
import { Button, Chip, Toggle } from './ui';
import { cn } from '@/lib/cn';

// ============================================
// INSPECTION NOTES SECTION
// ============================================

const INSPECTION_RESULTS: { label: string; value: InspectionResult; color: string }[] = [
  { label: 'Pass', value: 'Pass', color: '#22C55E' },
  { label: 'Partial', value: 'Partial', color: '#F59E0B' },
  { label: 'Fail', value: 'Fail', color: '#EF4444' },
];

interface InspectionNoteCardProps {
  note: InspectionNote;
  onUpdate: (updates: Partial<InspectionNote>) => void;
  onDelete: () => void;
  expanded: boolean;
  onToggle: () => void;
}

function InspectionNoteCard({ note, onUpdate, onDelete, expanded, onToggle }: InspectionNoteCardProps) {
  const resultInfo = INSPECTION_RESULTS.find((r) => r.value === note.result);

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-3 overflow-hidden border border-gray-200 dark:border-gray-700">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-1 flex-row items-center">
          <View
            className="w-3 h-3 rounded-full mr-3"
            style={{ backgroundColor: resultInfo?.color ?? '#9CA3AF' }}
          />
          <View className="flex-1">
            <Text className="text-base font-medium text-gray-900 dark:text-white" numberOfLines={1}>
              {note.inspection_type || 'New Inspection'}
            </Text>
            {note.inspector_name && (
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                by {note.inspector_name}
              </Text>
            )}
          </View>
        </View>
        <View className="flex-row items-center">
          <View
            className="px-2 py-1 rounded mr-2"
            style={{ backgroundColor: (resultInfo?.color ?? '#9CA3AF') + '20' }}
          >
            <Text style={{ color: resultInfo?.color }} className="text-xs font-medium">
              {note.result}
            </Text>
          </View>
          {expanded ? <ChevronUp size={20} color="#9CA3AF" /> : <ChevronDown size={20} color="#9CA3AF" />}
        </View>
      </Pressable>

      {expanded && (
        <View className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">
              Inspection Type
            </Text>
            <TextInput
              value={note.inspection_type}
              onChangeText={(text) => onUpdate({ inspection_type: text })}
              placeholder="e.g., Electrical, Plumbing, Fire..."
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          <View className="flex-row mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">
                Inspector Name
              </Text>
              <TextInput
                value={note.inspector_name}
                onChangeText={(text) => onUpdate({ inspector_name: text })}
                placeholder="Name"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
              />
            </View>
            <View className="flex-1 ml-2">
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">
                AHJ
              </Text>
              <TextInput
                value={note.ahj}
                onChangeText={(text) => onUpdate({ ahj: text })}
                placeholder="Authority"
                placeholderTextColor="#9CA3AF"
                className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
              />
            </View>
          </View>

          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase">
              Result
            </Text>
            <View className="flex-row">
              {INSPECTION_RESULTS.map((result) => (
                <Pressable
                  key={result.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onUpdate({ result: result.value });
                  }}
                  className={cn(
                    'flex-1 py-3 rounded-xl mr-2 items-center',
                    note.result === result.value ? 'border-2' : 'bg-gray-100 dark:bg-gray-700'
                  )}
                  style={
                    note.result === result.value
                      ? { backgroundColor: result.color + '20', borderColor: result.color }
                      : undefined
                  }
                >
                  <Text
                    className={cn(
                      'font-medium',
                      note.result === result.value ? '' : 'text-gray-600 dark:text-gray-400'
                    )}
                    style={note.result === result.value ? { color: result.color } : undefined}
                  >
                    {result.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <VoiceInputField
            label="Notes"
            value={note.notes}
            onChangeText={(text) => onUpdate({ notes: text })}
            onAudioRecorded={(uri) => onUpdate({ audio_uri: uri })}
            placeholder="Inspection notes and findings..."
          />

          <Toggle
            label="Follow-up Needed"
            value={note.follow_up_needed}
            onChange={(value) => onUpdate({ follow_up_needed: value })}
          />

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            className="flex-row items-center justify-center py-3 mt-2"
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="ml-2 text-red-500 font-medium">Delete Inspection</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

interface InspectionNotesSectionProps {
  notes: InspectionNote[];
  onAdd: (note: InspectionNote) => void;
  onUpdate: (noteId: string, updates: Partial<InspectionNote>) => void;
  onRemove: (noteId: string) => void;
}

export function InspectionNotesSection({ notes, onAdd, onUpdate, onRemove }: InspectionNotesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newNote = createEmptyInspectionNote();
    onAdd(newNote);
    setExpandedId(newNote.id);
  };

  const failCount = notes.filter((n) => n.result === 'Fail').length;
  const followUpCount = notes.filter((n) => n.follow_up_needed).length;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <ClipboardCheck size={20} color="#1F5C1A" />
          <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
            Inspection Notes
          </Text>
          {notes.length > 0 && (
            <View className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-full">
              <Text className="text-xs text-gray-600 dark:text-gray-400">{notes.length}</Text>
            </View>
          )}
        </View>
        <View className="flex-row">
          {failCount > 0 && (
            <View className="px-2 py-0.5 bg-red-100 dark:bg-red-900 rounded-full mr-1">
              <Text className="text-xs font-medium text-red-600 dark:text-red-400">{failCount} Failed</Text>
            </View>
          )}
          {followUpCount > 0 && (
            <View className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 rounded-full">
              <Text className="text-xs font-medium text-yellow-600 dark:text-yellow-400">{followUpCount} Follow-up</Text>
            </View>
          )}
        </View>
      </View>

      {notes.map((note) => (
        <InspectionNoteCard
          key={note.id}
          note={note}
          onUpdate={(updates) => onUpdate(note.id, updates)}
          onDelete={() => onRemove(note.id)}
          expanded={expandedId === note.id}
          onToggle={() => setExpandedId(expandedId === note.id ? null : note.id)}
        />
      ))}

      <Button
        title="Add Inspection"
        onPress={handleAdd}
        variant="secondary"
        icon={<Plus size={20} color="#1F5C1A" />}
      />
    </View>
  );
}

// ============================================
// ADDITIONAL WORK SECTION
// ============================================

const WORK_TAGS: { label: string; value: AdditionalWorkTag }[] = [
  { label: 'Owner Request', value: 'owner_request' },
  { label: 'Design Ambiguity', value: 'design_ambiguity' },
  { label: 'Vendor Issue', value: 'vendor_issue' },
  { label: 'Field Condition', value: 'field_condition' },
  { label: 'Other', value: 'other' },
];

interface AdditionalWorkCardProps {
  work: AdditionalWorkEntry;
  onUpdate: (updates: Partial<AdditionalWorkEntry>) => void;
  onDelete: () => void;
}

function AdditionalWorkCard({ work, onUpdate, onDelete }: AdditionalWorkCardProps) {
  const tagLabel = WORK_TAGS.find((t) => t.value === work.tag)?.label ?? 'Other';

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-3 p-4 border border-gray-200 dark:border-gray-700">
      <View className="flex-row items-start justify-between mb-3">
        <View className="px-2 py-1 bg-purple-100 dark:bg-purple-900 rounded">
          <Text className="text-xs font-medium text-purple-600 dark:text-purple-400">{tagLabel}</Text>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete();
          }}
          className="p-1"
        >
          <Trash2 size={18} color="#EF4444" />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row">
          {WORK_TAGS.map((tag) => (
            <Chip
              key={tag.value}
              label={tag.label}
              selected={work.tag === tag.value}
              onPress={() => onUpdate({ tag: tag.value })}
            />
          ))}
        </View>
      </ScrollView>

      <VoiceInputField
        value={work.description}
        onChangeText={(text) => onUpdate({ description: text })}
        onAudioRecorded={(uri) => onUpdate({ audio_uri: uri })}
        placeholder="Describe the additional work, out-of-scope item, or rework..."
      />
    </View>
  );
}

interface AdditionalWorkSectionProps {
  work: AdditionalWorkEntry[];
  onAdd: (work: AdditionalWorkEntry) => void;
  onUpdate: (workId: string, updates: Partial<AdditionalWorkEntry>) => void;
  onRemove: (workId: string) => void;
}

export function AdditionalWorkSection({ work, onAdd, onUpdate, onRemove }: AdditionalWorkSectionProps) {
  const handleAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdd(createEmptyAdditionalWork());
  };

  return (
    <View>
      <View className="flex-row items-center mb-3">
        <FileWarning size={20} color="#1F5C1A" />
        <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
          Additional Work / Rework
        </Text>
        {work.length > 0 && (
          <View className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900 rounded-full">
            <Text className="text-xs font-medium text-purple-600 dark:text-purple-400">{work.length}</Text>
          </View>
        )}
      </View>

      {work.map((w) => (
        <AdditionalWorkCard
          key={w.id}
          work={w}
          onUpdate={(updates) => onUpdate(w.id, updates)}
          onDelete={() => onRemove(w.id)}
        />
      ))}

      <Button
        title="Add Entry"
        onPress={handleAdd}
        variant="secondary"
        icon={<Plus size={20} color="#1F5C1A" />}
      />

      {work.length === 0 && (
        <Text className="text-center text-gray-400 dark:text-gray-500 mt-3 text-sm">
          Record out-of-scope work, rework, or change orders here.
        </Text>
      )}
    </View>
  );
}
