import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  PendingIssue,
  IssueCategory,
  Severity,
  createEmptyIssue,
} from '@/lib/types';
import { VoiceInputField } from './VoiceRecorder';
import { Button, Chip, SelectField } from './ui';
import { cn } from '@/lib/cn';

const CATEGORIES: { label: string; value: IssueCategory }[] = [
  { label: 'Coordination', value: 'Coordination' },
  { label: 'Design', value: 'Design' },
  { label: 'QA/QC', value: 'QAQC' },
  { label: 'Safety', value: 'Safety' },
  { label: 'Schedule', value: 'Schedule' },
  { label: 'Procurement', value: 'Procurement' },
  { label: 'Inspection', value: 'Inspection' },
  { label: 'Other', value: 'Other' },
];

const SEVERITIES: { label: string; value: Severity; color: string }[] = [
  { label: 'Low', value: 'Low', color: '#22C55E' },
  { label: 'Medium', value: 'Medium', color: '#F59E0B' },
  { label: 'High', value: 'High', color: '#EF4444' },
];

const EXTERNAL_ENTITIES = ['AHJ', 'Inspector', 'Owner', 'Architect', 'Vendor/Sub'];

interface PendingIssueCardProps {
  issue: PendingIssue;
  onUpdate: (updates: Partial<PendingIssue>) => void;
  onDelete: () => void;
  expanded: boolean;
  onToggle: () => void;
}

function PendingIssueCard({ issue, onUpdate, onDelete, expanded, onToggle }: PendingIssueCardProps) {
  const severityColor = SEVERITIES.find((s) => s.value === issue.severity)?.color ?? '#F59E0B';

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl mb-3 overflow-hidden border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between px-4 py-3"
      >
        <View className="flex-1 flex-row items-center">
          <View
            className="w-3 h-3 rounded-full mr-3"
            style={{ backgroundColor: severityColor }}
          />
          <Text
            className="text-base font-medium text-gray-900 dark:text-white flex-1"
            numberOfLines={expanded ? undefined : 1}
          >
            {issue.title || 'New Issue'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded mr-2">
            <Text className="text-xs text-gray-600 dark:text-gray-400">{issue.category}</Text>
          </View>
          {expanded ? (
            <ChevronUp size={20} color="#9CA3AF" />
          ) : (
            <ChevronDown size={20} color="#9CA3AF" />
          )}
        </View>
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          {/* Title */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Title
            </Text>
            <TextInput
              value={issue.title}
              onChangeText={(text) => onUpdate({ title: text })}
              placeholder="Issue title (auto-generated from description if blank)"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          {/* Description with Voice */}
          <VoiceInputField
            label="Description"
            value={issue.description}
            onChangeText={(text) => {
              onUpdate({ description: text });
              // Auto-generate title from first sentence if title is empty
              if (!issue.title && text.length > 0) {
                const firstSentence = text.split(/[.!?]/)[0].trim();
                if (firstSentence.length > 0) {
                  onUpdate({ title: firstSentence.substring(0, 50) });
                }
              }
            }}
            onAudioRecorded={(uri) => onUpdate({ audio_uri: uri })}
            placeholder="Describe the issue..."
          />

          {/* Category */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Category
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row">
                {CATEGORIES.map((cat) => (
                  <Chip
                    key={cat.value}
                    label={cat.label}
                    selected={issue.category === cat.value}
                    onPress={() => onUpdate({ category: cat.value })}
                  />
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Severity */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Severity
            </Text>
            <View className="flex-row">
              {SEVERITIES.map((sev) => (
                <Pressable
                  key={sev.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onUpdate({ severity: sev.value });
                  }}
                  className={cn(
                    'flex-1 py-3 rounded-xl mr-2 items-center',
                    issue.severity === sev.value
                      ? 'border-2'
                      : 'bg-gray-100 dark:bg-gray-700'
                  )}
                  style={
                    issue.severity === sev.value
                      ? { backgroundColor: sev.color + '20', borderColor: sev.color }
                      : undefined
                  }
                >
                  <Text
                    className={cn(
                      'font-medium',
                      issue.severity === sev.value
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-600 dark:text-gray-400'
                    )}
                    style={issue.severity === sev.value ? { color: sev.color } : undefined}
                  >
                    {sev.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* External Entity Tags */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              External Entity (Optional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row">
                {EXTERNAL_ENTITIES.map((entity) => (
                  <Chip
                    key={entity}
                    label={entity}
                    selected={issue.external_entity === entity}
                    onPress={() =>
                      onUpdate({
                        external_entity: issue.external_entity === entity ? '' : entity,
                      })
                    }
                  />
                ))}
              </View>
            </ScrollView>
            <TextInput
              value={issue.external_entity}
              onChangeText={(text) => onUpdate({ external_entity: text })}
              placeholder="Or type custom entity..."
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-2 text-sm text-gray-900 dark:text-white mt-2"
            />
          </View>

          {/* Location */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Location (Optional)
            </Text>
            <TextInput
              value={issue.location}
              onChangeText={(text) => onUpdate({ location: text })}
              placeholder="Area / Room / Level"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          {/* Assignee */}
          <View className="mb-3">
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Assignee (Optional)
            </Text>
            <TextInput
              value={issue.assignee}
              onChangeText={(text) => onUpdate({ assignee: text })}
              placeholder="Who is responsible?"
              placeholderTextColor="#9CA3AF"
              className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white"
            />
          </View>

          {/* Delete Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDelete();
            }}
            className="flex-row items-center justify-center py-3 mt-2"
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="ml-2 text-red-500 font-medium">Delete Issue</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

interface PendingIssuesSectionProps {
  issues: PendingIssue[];
  onAdd: (issue: PendingIssue) => void;
  onUpdate: (issueId: string, updates: Partial<PendingIssue>) => void;
  onRemove: (issueId: string) => void;
}

export function PendingIssuesSection({
  issues,
  onAdd,
  onUpdate,
  onRemove,
}: PendingIssuesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAddIssue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newIssue = createEmptyIssue();
    onAdd(newIssue);
    setExpandedId(newIssue.id);
  };

  const highSeverityCount = issues.filter((i) => i.severity === 'High').length;

  return (
    <View>
      {/* Header with count */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <AlertTriangle size={20} color="#1F5C1A" />
          <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
            Pending Issues
          </Text>
          {issues.length > 0 && (
            <View className="ml-2 px-2 py-0.5 bg-orange-100 dark:bg-orange-900 rounded-full">
              <Text className="text-xs font-medium text-orange-600 dark:text-orange-400">
                {issues.length}
              </Text>
            </View>
          )}
          {highSeverityCount > 0 && (
            <View className="ml-1 px-2 py-0.5 bg-red-100 dark:bg-red-900 rounded-full">
              <Text className="text-xs font-medium text-red-600 dark:text-red-400">
                {highSeverityCount} High
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Issues List */}
      {issues.map((issue) => (
        <PendingIssueCard
          key={issue.id}
          issue={issue}
          onUpdate={(updates) => onUpdate(issue.id, updates)}
          onDelete={() => onRemove(issue.id)}
          expanded={expandedId === issue.id}
          onToggle={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
        />
      ))}

      {/* Add Button */}
      <Button
        title="Add Issue"
        onPress={handleAddIssue}
        variant="secondary"
        icon={<Plus size={20} color="#1F5C1A" />}
        className="mt-2"
      />

      {issues.length === 0 && (
        <Text className="text-center text-gray-400 dark:text-gray-500 mt-4 text-sm">
          No issues recorded. Tap "Add Issue" or use voice to quickly capture problems.
        </Text>
      )}
    </View>
  );
}
