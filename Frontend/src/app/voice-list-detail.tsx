import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getVoiceList,
  updateVoiceListItem,
  deleteVoiceListItem,
  addVoiceListSection,
  addVoiceListItem,
  deleteVoiceList,
  downloadVoiceListPdf,
  queryKeys,
  VoiceListItem,
  VoiceListSection,
} from '@/lib/api';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  Package,
  FolderOpen,
  Download,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface ItemRowProps {
  item: VoiceListItem;
  listId: string;
  onUpdate: () => void;
}

function ItemRow({ item, listId, onUpdate }: ItemRowProps) {
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [editedItem, setEditedItem] = useState({
    quantity: item.quantity?.toString() || '',
    unit: item.unit || '',
    description: item.description,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateVoiceListItem>[2]) =>
      updateVoiceListItem(listId, item.id, data),
    onSuccess: () => {
      setIsEditing(false);
      onUpdate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteVoiceListItem(listId, item.id),
    onSuccess: onUpdate,
  });

  const handleSave = () => {
    updateMutation.mutate({
      quantity: editedItem.quantity ? parseFloat(editedItem.quantity) : undefined,
      unit: editedItem.unit || undefined,
      description: editedItem.description,
    });
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (confirm(t('common.delete') + '?')) {
        deleteMutation.mutate();
      }
    } else {
      Alert.alert(t('common.delete'), t('common.confirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]);
    }
  };

  if (isEditing) {
    return (
      <View className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-2">
        <View className="flex-row mb-2 gap-2">
          <TextInput
            value={editedItem.quantity}
            onChangeText={(val) =>
              setEditedItem((e) => ({ ...e, quantity: val }))
            }
            placeholder={t('voiceLists.quantity')}
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            className="flex-1 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
          />
          <TextInput
            value={editedItem.unit}
            onChangeText={(val) => setEditedItem((e) => ({ ...e, unit: val }))}
            placeholder={t('voiceLists.unit')}
            placeholderTextColor="#9CA3AF"
            className="w-20 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
          />
        </View>
        <TextInput
          value={editedItem.description}
          onChangeText={(val) =>
            setEditedItem((e) => ({ ...e, description: val }))
          }
          placeholder={t('voiceLists.description')}
          placeholderTextColor="#9CA3AF"
          multiline
          className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600 mb-2"
        />
        <View className="flex-row justify-end gap-2">
          <Pressable
            onPress={() => setIsEditing(false)}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-600"
          >
            <X size={18} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={updateMutation.isPending}
            className="p-2 rounded-lg bg-orange-500"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size={18} color="white" />
            ) : (
              <Check size={18} color="white" />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-lg p-3 mb-2 border border-gray-100 dark:border-gray-700">
      {/* Quantity & Unit */}
      <View className="w-20 mr-3">
        {item.quantity !== null && item.quantity !== undefined ? (
          <Text className="text-base font-semibold text-orange-600 dark:text-orange-400">
            {item.quantity} {item.unit || ''}
          </Text>
        ) : (
          <Text className="text-sm text-gray-400">-</Text>
        )}
      </View>

      {/* Description */}
      <View className="flex-1">
        <Text className="text-sm text-gray-900 dark:text-white">
          {item.description}
        </Text>
        {item.category && (
          <Text className="text-xs text-gray-400 mt-0.5">{item.category}</Text>
        )}
      </View>

      {/* Actions */}
      <View className="flex-row gap-1">
        <Pressable
          onPress={() => setIsEditing(true)}
          className="p-2 rounded-lg"
        >
          <Edit3 size={16} color="#9CA3AF" />
        </Pressable>
        <Pressable
          onPress={handleDelete}
          disabled={deleteMutation.isPending}
          className="p-2 rounded-lg"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator size={16} color="#EF4444" />
          ) : (
            <Trash2 size={16} color="#EF4444" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

interface SectionCardProps {
  section: VoiceListSection;
  items: VoiceListItem[];
  listId: string;
  onUpdate: () => void;
}

function SectionCard({ section, items, listId, onUpdate }: SectionCardProps) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Animated.View
      entering={FadeInDown.delay(100)}
      className="mb-4"
    >
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        className="flex-row items-center bg-orange-100 dark:bg-orange-900/30 rounded-t-xl px-4 py-3"
      >
        <FolderOpen size={18} color="#F97316" />
        <Text className="flex-1 ml-2 font-semibold text-orange-800 dark:text-orange-300">
          {section.name}
        </Text>
        <Text className="text-sm text-orange-600 dark:text-orange-400 mr-2">
          {items.length} {t('voiceLists.items').toLowerCase()}
        </Text>
        {isExpanded ? (
          <ChevronUp size={18} color="#F97316" />
        ) : (
          <ChevronDown size={18} color="#F97316" />
        )}
      </Pressable>

      {isExpanded && (
        <View className="bg-white dark:bg-gray-800 rounded-b-xl p-3 border-x border-b border-gray-100 dark:border-gray-700">
          {items.length === 0 ? (
            <Text className="text-sm text-gray-400 text-center py-2">
              {t('voiceLists.noItems')}
            </Text>
          ) : (
            items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                listId={listId}
                onUpdate={onUpdate}
              />
            ))
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function VoiceListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ quantity: '', unit: '', description: '' });
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Fetch voice list
  const voiceListQuery = useQuery({
    queryKey: queryKeys.voiceList(id!),
    queryFn: () => getVoiceList(id!),
    enabled: !!id,
  });

  const voiceList = voiceListQuery.data;

  // Refresh data
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.voiceList(id!) });
  }, [id, queryClient]);

  // Delete list mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteVoiceList(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.voiceLists() });
      router.back();
    },
  });

  // Add item mutation
  const addItemMutation = useMutation({
    mutationFn: (data: Parameters<typeof addVoiceListItem>[1]) =>
      addVoiceListItem(id!, data),
    onSuccess: () => {
      setNewItem({ quantity: '', unit: '', description: '' });
      setShowAddItem(false);
      handleRefresh();
    },
  });

  const handleDeleteList = () => {
    if (Platform.OS === 'web') {
      if (confirm(t('voiceLists.deleteConfirm'))) {
        deleteMutation.mutate();
      }
    } else {
      Alert.alert(t('voiceLists.delete'), t('voiceLists.deleteConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ]);
    }
  };

  const handleAddItem = () => {
    if (!newItem.description.trim()) return;
    addItemMutation.mutate({
      description: newItem.description.trim(),
      quantity: newItem.quantity ? parseFloat(newItem.quantity) : undefined,
      unit: newItem.unit || undefined,
    });
  };

  // Group items by section
  const groupedItems = React.useMemo(() => {
    if (!voiceList?.items) return { unsectioned: [], sectioned: {} };

    const sectioned: Record<string, VoiceListItem[]> = {};
    const unsectioned: VoiceListItem[] = [];

    voiceList.items.forEach((item) => {
      if (item.sectionId) {
        if (!sectioned[item.sectionId]) {
          sectioned[item.sectionId] = [];
        }
        sectioned[item.sectionId].push(item);
      } else {
        unsectioned.push(item);
      }
    });

    return { unsectioned, sectioned };
  }, [voiceList?.items]);

  if (!id) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Text className="text-gray-500">Invalid voice list ID</Text>
      </View>
    );
  }

  if (voiceListQuery.isLoading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!voiceList) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Text className="text-gray-500">{t('errors.notFound')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <View className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="p-2 -ml-2 rounded-lg"
            hitSlop={8}
          >
            <ChevronLeft size={24} color="#6B7280" />
          </Pressable>
          <View className="flex-1 ml-2">
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              {voiceList.name}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {voiceList.items?.length || 0} {t('voiceLists.items').toLowerCase()} •{' '}
              {voiceList.sections?.length || 0} {t('voiceLists.sections').toLowerCase()}
            </Text>
          </View>
          <Pressable
            onPress={handleDeleteList}
            disabled={deleteMutation.isPending}
            className="p-2 rounded-lg"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size={20} color="#EF4444" />
            ) : (
              <Trash2 size={20} color="#EF4444" />
            )}
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Sections */}
        {voiceList.sections?.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            items={groupedItems.sectioned[section.id] || []}
            listId={id}
            onUpdate={handleRefresh}
          />
        ))}

        {/* Unsectioned Items */}
        {groupedItems.unsectioned.length > 0 && (
          <Animated.View entering={FadeInDown} className="mb-4">
            <Text className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 px-1">
              {t('voiceLists.unsectioned')}
            </Text>
            {groupedItems.unsectioned.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                listId={id}
                onUpdate={handleRefresh}
              />
            ))}
          </Animated.View>
        )}

        {/* Empty State */}
        {!voiceList.items?.length && (
          <View className="items-center py-12">
            <Package size={48} color="#9CA3AF" />
            <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
              {t('voiceLists.noItems')}
            </Text>
          </View>
        )}

        {/* Add Item Form */}
        {showAddItem && (
          <Animated.View
            entering={FadeIn}
            className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4 border border-gray-200 dark:border-gray-700"
          >
            <Text className="font-medium text-gray-900 dark:text-white mb-3">
              {t('voiceLists.addItem')}
            </Text>
            <View className="flex-row mb-2 gap-2">
              <TextInput
                value={newItem.quantity}
                onChangeText={(val) => setNewItem((n) => ({ ...n, quantity: val }))}
                placeholder={t('voiceLists.quantity')}
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                className="flex-1 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
              />
              <TextInput
                value={newItem.unit}
                onChangeText={(val) => setNewItem((n) => ({ ...n, unit: val }))}
                placeholder={t('voiceLists.unit')}
                placeholderTextColor="#9CA3AF"
                className="w-20 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
              />
            </View>
            <TextInput
              value={newItem.description}
              onChangeText={(val) => setNewItem((n) => ({ ...n, description: val }))}
              placeholder={t('voiceLists.description')}
              placeholderTextColor="#9CA3AF"
              className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white mb-3"
            />
            <View className="flex-row justify-end gap-2">
              <Pressable
                onPress={() => setShowAddItem(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-600"
              >
                <Text className="text-gray-700 dark:text-gray-300">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAddItem}
                disabled={addItemMutation.isPending || !newItem.description.trim()}
                className="px-4 py-2 rounded-lg bg-orange-500"
              >
                {addItemMutation.isPending ? (
                  <ActivityIndicator size={16} color="white" />
                ) : (
                  <Text className="text-white font-medium">{t('common.save')}</Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-row gap-3">
        <Pressable
          onPress={() => setShowAddItem(!showAddItem)}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl bg-gray-100 dark:bg-gray-700"
        >
          <Plus size={20} color="#6B7280" />
          <Text className="ml-2 font-medium text-gray-700 dark:text-gray-300">
            {t('voiceLists.addItem')}
          </Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            if (!id) return;
            setIsDownloadingPdf(true);
            try {
              const pdfUrl = await downloadVoiceListPdf(id);
              if (Platform.OS === 'web') {
                // Open in new tab or trigger download
                const link = document.createElement('a');
                link.href = pdfUrl;
                link.download = `${voiceList?.name || 'voice-list'}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                // Revoke the object URL after download
                setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
              }
            } catch (error: any) {
              console.error('[voice-list] PDF download error:', error);
              Alert.alert(t('common.error'), error.message || 'Failed to download PDF');
            } finally {
              setIsDownloadingPdf(false);
            }
          }}
          disabled={isDownloadingPdf}
          className="flex-1 flex-row items-center justify-center py-3 rounded-xl bg-orange-500"
        >
          {isDownloadingPdf ? (
            <ActivityIndicator size={20} color="white" />
          ) : (
            <Download size={20} color="white" />
          )}
          <Text className="ml-2 font-medium text-white">
            {t('voiceLists.exportPdf')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
