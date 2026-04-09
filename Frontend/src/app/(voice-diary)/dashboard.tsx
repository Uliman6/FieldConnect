import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  Clock,
  Building2,
  User,
} from 'lucide-react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  useVoiceDiaryStore,
  VOICE_DIARY_CATEGORIES,
  VoiceDiaryCategory,
  CategorizedSnippet,
} from '@/lib/voice-diary-store';
import { useDailyLogStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';

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

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedCategory, setSelectedCategory] = useState<VoiceDiaryCategory | null>(null);

  // Get project and user context
  const { projects } = useDailyLogStore();
  const { user } = useAuthStore();

  const {
    getDailySummary,
    getProjectSummary,
    getSnippetsForDate,
    getSnippetsForCategory,
    getVoiceNotesForDate,
    getActiveFormSuggestions,
    dismissFormSuggestion,
    getTodayDate,
    currentProjectId,
  } = useVoiceDiaryStore();

  const today = getTodayDate();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  // LEARNING: We now filter by project - each user sees their own summary
  // and there's also a project-level summary combining all users
  const userSummary = currentProjectId ? getDailySummary(today, currentProjectId, user?.id) : undefined;
  const projectSummary = currentProjectId ? getProjectSummary(today, currentProjectId) : undefined;
  const todaySnippets = getSnippetsForDate(today, currentProjectId || undefined);
  const todayNotes = getVoiceNotesForDate(today, currentProjectId || undefined);
  const formSuggestions = getActiveFormSuggestions();

  // Count snippets per category (filtered by project)
  const categoryCounts = useMemo(() => {
    const counts: Record<VoiceDiaryCategory, number> = {} as any;
    VOICE_DIARY_CATEGORIES.forEach((cat) => {
      counts[cat] = getSnippetsForCategory(cat, today, currentProjectId || undefined).length;
    });
    return counts;
  }, [todaySnippets, today, currentProjectId]);

  // Categories with content
  const activeCategories = VOICE_DIARY_CATEGORIES.filter(
    (cat) => categoryCounts[cat] > 0
  );

  const selectedSnippets = selectedCategory
    ? getSnippetsForCategory(selectedCategory, today, currentProjectId || undefined)
    : [];

  // Show appropriate summary (user's if available, otherwise project)
  const displaySummary = userSummary || projectSummary;

  // If no project selected, show message
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

          {displaySummary?.lastUpdatedAt && (
            <Text
              style={{
                fontSize: 12,
                color: isDark ? '#6B7280' : '#9CA3AF',
                marginTop: 12,
              }}
            >
              Last updated:{' '}
              {new Date(displaySummary.lastUpdatedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>

        {/* Form Suggestions */}
        {formSuggestions.length > 0 && (
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
            {formSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
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
                    {suggestion.reason}
                  </Text>
                </View>
                <Pressable
                  onPress={() => dismissFormSuggestion(suggestion.id)}
                  style={{ padding: 4 }}
                >
                  <X size={18} color="#6B7280" />
                </Pressable>
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
                    backgroundColor: CATEGORY_COLORS[snippet.category] || '#E5E7EB',
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
        onRequestClose={() => setSelectedCategory(null)}
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
            <Pressable onPress={() => setSelectedCategory(null)} style={{ padding: 4 }}>
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
              selectedSnippets.map((snippet, index) => (
                <View
                  key={snippet.id}
                  style={{
                    backgroundColor: isDark ? '#1F2937' : '#FFF',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
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
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
