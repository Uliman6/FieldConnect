import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Shield,
  Truck,
  Settings2,
  CheckCircle2,
  ListTodo,
  AlertTriangle,
  Users,
  Package,
  ArrowRight,
  FileText,
  X,
  Building2,
  User,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { useVoiceDiaryStore, VOICE_DIARY_CATEGORIES, VoiceDiaryCategory } from '@/lib/voice-diary-store';
import { useDailyLogStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import {
  getVoiceDiaryNotes,
  getVoiceDiarySummary,
  matchVoiceDiaryForms,
  updateVoiceDiarySnippet,
  deleteVoiceDiarySnippet,
  queryKeys,
  VoiceDiaryPersistedSnippet,
  VoiceDiaryFormSuggestion,
} from '@/lib/api';

// LEARNING: We map categories to icons for visual recognition
// This pattern is common in React - creating a lookup object for configuration
const CATEGORY_ICONS: Record<VoiceDiaryCategory, React.ReactNode> = {
  'Safety': <Shield size={20} color="#EF4444" />,
  'Logistics': <Truck size={20} color="#3B82F6" />,
  'Process': <Settings2 size={20} color="#8B5CF6" />,
  'Work Completed': <CheckCircle2 size={20} color="#10B981" />,
  'Work To Be Done': <ListTodo size={20} color="#F59E0B" />,
  'Follow-up Items': <ArrowRight size={20} color="#EC4899" />,
  'Issues': <AlertTriangle size={20} color="#EF4444" />,
  'Team': <Users size={20} color="#06B6D4" />,
  'Materials': <Package size={20} color="#78716C" />,
};

const CATEGORY_COLORS: Record<VoiceDiaryCategory, string> = {
  'Safety': '#FEE2E2',
  'Logistics': '#DBEAFE',
  'Process': '#EDE9FE',
  'Work Completed': '#D1FAE5',
  'Work To Be Done': '#FEF3C7',
  'Follow-up Items': '#FCE7F3',
  'Issues': '#FEE2E2',
  'Team': '#CFFAFE',
  'Materials': '#F5F5F4',
};

// Type for a form suggestion together with the actual snippets it matched
interface ValidFormSuggestion extends VoiceDiaryFormSuggestion {
  snippets: VoiceDiaryPersistedSnippet[];
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState<VoiceDiaryCategory | null>(null);
  const [selectedForm, setSelectedForm] = useState<ValidFormSuggestion | null>(null);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // Get project and user context
  const { projects } = useDailyLogStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { getTodayDate, currentProjectId } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // Notes (with their categorized snippets) and the daily summary both come
  // from the backend, scoped strictly to the selected project. With no
  // project selected these queries never run, so there is nothing to leak.
  const notesQuery = useQuery({
    queryKey: queryKeys.voiceDiaryNotes(currentProjectId || '', today),
    queryFn: () => getVoiceDiaryNotes(currentProjectId!, today),
    enabled: !!currentProjectId,
  });
  const todayNotes = notesQuery.data?.notes ?? [];

  const todaySnippets = useMemo<VoiceDiaryPersistedSnippet[]>(
    () => todayNotes.flatMap((n) => n.snippets),
    [todayNotes]
  );

  const summaryQuery = useQuery({
    queryKey: queryKeys.voiceDiarySummary(currentProjectId || '', today, user?.id),
    queryFn: () => getVoiceDiarySummary(currentProjectId!, today, user?.id),
    enabled: !!currentProjectId,
  });
  const displaySummary = summaryQuery.data;

  // Form suggestions are recomputed from the live snippet list rather than
  // stored, so they can never go stale as items are edited/deleted.
  const formsQuery = useQuery({
    queryKey: [
      'voice-diary',
      'match-forms',
      currentProjectId,
      today,
      // Include content, not just ids, so an edit (same id, new text)
      // actually triggers a recomputed set of suggestions.
      todaySnippets.map((s) => `${s.id}:${s.content}`).join('|'),
    ],
    queryFn: () =>
      matchVoiceDiaryForms(
        todaySnippets.map((s) => ({
          id: s.id,
          category: s.category,
          content: s.content,
          scope: s.scope ?? undefined,
        }))
      ),
    enabled: !!currentProjectId && todaySnippets.length > 0,
  });

  const validFormSuggestions = useMemo<ValidFormSuggestion[]>(() => {
    const suggestions = formsQuery.data?.suggestions ?? [];
    return suggestions.map((s) => ({
      ...s,
      snippets: todaySnippets.filter((sn) => s.snippetIds.includes(sn.id)),
    }));
  }, [formsQuery.data, todaySnippets]);

  // Count snippets per category
  const categoryCounts = useMemo(() => {
    const counts: Record<VoiceDiaryCategory, number> = {} as any;
    VOICE_DIARY_CATEGORIES.forEach((cat) => {
      counts[cat] = todaySnippets.filter((s) => s.category === cat).length;
    });
    return counts;
  }, [todaySnippets]);

  const selectedSnippets = selectedCategory
    ? todaySnippets.filter((s) => s.category === selectedCategory)
    : [];

  const updateSnippetMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => updateVoiceDiarySnippet(id, content),
    onSuccess: () => {
      if (currentProjectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.voiceDiaryNotes(currentProjectId, today) });
      }
    },
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: (id: string) => deleteVoiceDiarySnippet(id),
    onSuccess: () => {
      if (currentProjectId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.voiceDiaryNotes(currentProjectId, today) });
      }
    },
  });

  const startEditingSnippet = (snippet: VoiceDiaryPersistedSnippet) => {
    setEditingSnippetId(snippet.id);
    setEditingText(snippet.content);
  };

  const cancelEditingSnippet = () => {
    setEditingSnippetId(null);
    setEditingText('');
  };

  const saveEditingSnippet = () => {
    if (editingSnippetId && editingText.trim().length > 0) {
      updateSnippetMutation.mutate({ id: editingSnippetId, content: editingText.trim() });
    }
    setEditingSnippetId(null);
    setEditingText('');
  };

  const closeCategoryModal = () => {
    setSelectedCategory(null);
    setEditingSnippetId(null);
    setEditingText('');
  };

  const handleDeleteSnippet = (snippetId: string) => {
    const doDelete = () => {
      if (editingSnippetId === snippetId) {
        setEditingSnippetId(null);
        setEditingText('');
      }
      deleteSnippetMutation.mutate(snippetId);
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Remove this item?')) {
        doDelete();
      }
    } else {
      Alert.alert('Remove Item', 'Are you sure you want to remove this item?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  // If no project selected, show message. No voice-diary query above ever
  // runs without a projectId, so this guard is defense in depth, not the
  // only thing preventing cross-project data from showing.
  if (!currentProjectId) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}
        edges={['bottom']}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Building2 size={64} color={isDark ? '#374151' : '#D1D5DB'} />
          <Text
            style={{
              marginTop: 20,
              fontSize: 18,
              fontWeight: '600',
              color: isDark ? '#FFF' : '#111',
              textAlign: 'center',
            }}
          >
            No Project Selected
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 15,
              color: isDark ? '#6B7280' : '#9CA3AF',
              textAlign: 'center',
            }}
          >
            Select a project on the Record tab to see your dashboard
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}
      edges={['bottom']}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {/* Project Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
            paddingHorizontal: 4,
          }}
        >
          <Building2 size={18} color="#1F5C1A" />
          <Text
            style={{
              marginLeft: 8,
              fontSize: 15,
              fontWeight: '600',
              color: isDark ? '#FFF' : '#111',
            }}
          >
            {currentProject?.name || 'Project'}
          </Text>
        </View>

        {/* Daily Summary Card */}
        <View
          style={{
            backgroundColor: isDark ? '#1F2937' : '#FFF',
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <User size={18} color="#1F5C1A" />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#1F5C1A',
                marginLeft: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Your Summary
            </Text>
          </View>

          {todayNotes.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Text
                style={{
                  fontSize: 15,
                  color: isDark ? '#6B7280' : '#9CA3AF',
                  textAlign: 'center',
                }}
              >
                No voice notes recorded yet today.{'\n'}
                Start recording to build your summary!
              </Text>
            </View>
          ) : displaySummary?.hasMinimumInfo ? (
            <View>
              {/* Render bullet points - clean, no section headers */}
              {displaySummary.summary.split('\n').filter(line => line.trim() && !line.startsWith('**')).map((line, index) => (
                <Text
                  key={index}
                  style={{
                    fontSize: 15,
                    color: isDark ? '#E5E7EB' : '#374151',
                    lineHeight: 24,
                    marginBottom: 8,
                  }}
                >
                  {line}
                </Text>
              ))}
            </View>
          ) : (
            <View>
              <Text
                style={{
                  fontSize: 14,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  marginBottom: 12,
                }}
              >
                {todayNotes.length} note{todayNotes.length !== 1 ? 's' : ''} recorded
              </Text>
              {displaySummary?.summary && (
                <View>
                  {/* Render bullet points even for partial summaries */}
                  {displaySummary.summary.split('\n').filter(line => line.trim()).map((line, index) => (
                    <Text
                      key={index}
                      style={{
                        fontSize: 14,
                        color: isDark ? '#E5E7EB' : '#374151',
                        lineHeight: 22,
                        marginBottom: 4,
                      }}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {displaySummary?.updatedAt && (
            <Text
              style={{
                fontSize: 12,
                color: isDark ? '#6B7280' : '#9CA3AF',
                marginTop: 12,
              }}
            >
              Last updated:{' '}
              {new Date(displaySummary.updatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* Form Suggestions */}
        {validFormSuggestions.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: isDark ? '#9CA3AF' : '#6B7280',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Suggested Forms
            </Text>
            {validFormSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.formType}
                onPress={() => setSelectedForm(suggestion)}
                style={{
                  backgroundColor: '#EBF5FF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <FileText size={24} color="#3B82F6" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#1E40AF' }}>
                    {suggestion.formName}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#3B82F6', marginTop: 2 }}>
                    Based on {suggestion.snippets.length} related {suggestion.snippets.length === 1 ? 'note' : 'notes'}
                  </Text>
                </View>
                <ChevronRight size={20} color="#3B82F6" />
              </Pressable>
            ))}
          </View>
        )}

        {/* Categories Grid - Always show all categories */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: isDark ? '#9CA3AF' : '#6B7280',
            marginBottom: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Categories ({todaySnippets.length} items)
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {VOICE_DIARY_CATEGORIES.map((category) => {
            const count = categoryCounts[category];
            const hasItems = count > 0;

            return (
              <Pressable
                key={category}
                onPress={() => hasItems && setSelectedCategory(category)}
                style={{
                  backgroundColor: hasItems
                    ? (isDark ? '#1F2937' : CATEGORY_COLORS[category])
                    : (isDark ? '#111827' : '#F9FAFB'),
                  borderRadius: 12,
                  padding: 14,
                  width: '48%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  opacity: hasItems ? 1 : 0.6,
                  borderWidth: hasItems ? 0 : 1,
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                }}
              >
                {CATEGORY_ICONS[category]}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: hasItems ? (isDark ? '#FFF' : '#111') : (isDark ? '#6B7280' : '#9CA3AF'),
                    }}
                    numberOfLines={1}
                  >
                    {category}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: hasItems ? (isDark ? '#9CA3AF' : '#6B7280') : (isDark ? '#4B5563' : '#D1D5DB'),
                      marginTop: 2,
                    }}
                  >
                    {count} item{count !== 1 ? 's' : ''}
                  </Text>
                </View>
                {hasItems && <ChevronRight size={16} color={isDark ? '#6B7280' : '#9CA3AF'} />}
              </Pressable>
            );
          })}
        </View>

        {/* Recent Items - Show all snippets for quick reference */}
        {todaySnippets.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: isDark ? '#9CA3AF' : '#6B7280',
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Recent Items
            </Text>
            {todaySnippets.slice(0, 5).map((snippet) => (
              <View
                key={snippet.id}
                style={{
                  backgroundColor: isDark ? '#1F2937' : '#FFF',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    backgroundColor: CATEGORY_COLORS[snippet.category as VoiceDiaryCategory] || '#E5E7EB',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    alignSelf: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }}>
                    {snippet.category}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    color: isDark ? '#E5E7EB' : '#374151',
                    lineHeight: 20,
                  }}
                  numberOfLines={2}
                >
                  {snippet.content}
                </Text>
              </View>
            ))}
            {todaySnippets.length > 5 && (
              <Text
                style={{
                  fontSize: 13,
                  color: isDark ? '#6B7280' : '#9CA3AF',
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                +{todaySnippets.length - 5} more items
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Category Detail Modal */}
      <Modal
        visible={selectedCategory !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeCategoryModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#1F2937' : '#E5E7EB',
            }}
          >
            <Pressable onPress={closeCategoryModal} style={{ padding: 4 }}>
              <X size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: isDark ? '#FFF' : '#111',
                }}
              >
                {selectedCategory}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                }}
              >
                {selectedSnippets.length} item{selectedSnippets.length !== 1 ? 's' : ''} today
              </Text>
            </View>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {selectedSnippets.length === 0 ? (
              <Text style={{ color: isDark ? '#6B7280' : '#9CA3AF', textAlign: 'center', marginTop: 40 }}>
                No items in this category yet
              </Text>
            ) : (
              selectedSnippets.map((snippet) => {
                const isEditing = editingSnippetId === snippet.id;
                return (
                  <View
                    key={snippet.id}
                    style={{
                      backgroundColor: isDark ? '#1F2937' : '#FFF',
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    {snippet.scope && snippet.scope !== 'General' && (
                      <View
                        style={{
                          backgroundColor: isDark ? '#111827' : '#F3F4F6',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          alignSelf: 'flex-start',
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#9CA3AF' : '#6B7280' }}>
                          {snippet.scope}
                        </Text>
                      </View>
                    )}

                    {isEditing ? (
                      <View>
                        <TextInput
                          value={editingText}
                          onChangeText={setEditingText}
                          multiline
                          autoFocus
                          style={{
                            fontSize: 15,
                            color: isDark ? '#E5E7EB' : '#374151',
                            lineHeight: 22,
                            borderWidth: 1,
                            borderColor: isDark ? '#374151' : '#D1D5DB',
                            borderRadius: 8,
                            padding: 10,
                            minHeight: 60,
                            textAlignVertical: 'top',
                          }}
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 12 }}>
                          <Pressable onPress={cancelEditingSnippet} style={{ paddingVertical: 6, paddingHorizontal: 10 }}>
                            <Text style={{ fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', fontWeight: '600' }}>
                              Cancel
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={saveEditingSnippet}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              backgroundColor: '#1F5C1A',
                              paddingVertical: 6,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                            }}
                          >
                            <Check size={14} color="#FFF" />
                            <Text style={{ fontSize: 14, color: '#FFF', fontWeight: '600', marginLeft: 4 }}>
                              Save
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View>
                        <Text
                          style={{
                            fontSize: 15,
                            color: isDark ? '#E5E7EB' : '#374151',
                            lineHeight: 22,
                          }}
                        >
                          {snippet.content}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginTop: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: isDark ? '#6B7280' : '#9CA3AF',
                            }}
                          >
                            {new Date(snippet.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {snippet.edited ? ' · edited' : ''}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 16 }}>
                            <Pressable onPress={() => startEditingSnippet(snippet)} hitSlop={8}>
                              <Pencil size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                            </Pressable>
                            <Pressable onPress={() => handleDeleteSnippet(snippet.id)} hitSlop={8}>
                              <Trash2 size={16} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Form Detail Modal - shows related entries */}
      <Modal
        visible={selectedForm !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedForm(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#F9FAFB' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: isDark ? '#1F2937' : '#E5E7EB',
            }}
          >
            <Pressable onPress={() => setSelectedForm(null)} style={{ padding: 4 }}>
              <X size={24} color={isDark ? '#FFF' : '#111'} />
            </Pressable>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: isDark ? '#FFF' : '#111',
                }}
              >
                {selectedForm?.formName}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: isDark ? '#9CA3AF' : '#6B7280',
                  marginTop: 2,
                }}
              >
                {selectedForm?.snippets.length} related {selectedForm?.snippets.length === 1 ? 'entry' : 'entries'}
              </Text>
            </View>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            <Text
              style={{
                fontSize: 14,
                color: isDark ? '#9CA3AF' : '#6B7280',
                marginBottom: 16,
              }}
            >
              These items from your voice notes may be relevant for a {selectedForm?.formName}:
            </Text>
            {selectedForm?.snippets.map((snippet) => (
              <View
                key={snippet.id}
                style={{
                  backgroundColor: isDark ? '#1F2937' : '#FFF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    backgroundColor: CATEGORY_COLORS[snippet.category as VoiceDiaryCategory] || '#E5E7EB',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    alignSelf: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }}>
                    {snippet.category}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    color: isDark ? '#E5E7EB' : '#374151',
                    lineHeight: 22,
                  }}
                >
                  {snippet.content}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? '#6B7280' : '#9CA3AF',
                    marginTop: 8,
                  }}
                >
                  {new Date(snippet.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
