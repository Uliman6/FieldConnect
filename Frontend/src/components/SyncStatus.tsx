import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Cloud, CloudOff, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { SyncStatus } from '@/lib/types';
import { syncDailyLogs, getSyncStatusSummary } from '@/lib/sync';
import { cn } from '@/lib/cn';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncedAt?: string | null;
  onSync?: () => void;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  SyncStatus,
  { icon: React.ReactNode; label: string; color: string; bgColor: string }
> = {
  pending: {
    icon: <Cloud size={14} color="#6B7280" />,
    label: 'Not synced',
    color: '#6B7280',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  syncing: {
    icon: <ActivityIndicator size="small" color="#F97316" />,
    label: 'Syncing...',
    color: '#F97316',
    bgColor: 'bg-orange-100 dark:bg-orange-900',
  },
  synced: {
    icon: <CheckCircle size={14} color="#22C55E" />,
    label: 'Synced',
    color: '#22C55E',
    bgColor: 'bg-green-100 dark:bg-green-900',
  },
  error: {
    icon: <AlertCircle size={14} color="#EF4444" />,
    label: 'Sync failed',
    color: '#EF4444',
    bgColor: 'bg-red-100 dark:bg-red-900',
  },
};

export function SyncStatusBadge({ status, lastSyncedAt, onSync, compact }: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  const handlePress = () => {
    if (status !== 'syncing' && onSync) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSync();
    }
  };

  const formatLastSynced = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return d.toLocaleDateString();
  };

  if (compact) {
    return (
      <View className={cn('flex-row items-center px-2 py-1 rounded-full', config.bgColor)}>
        {config.icon}
      </View>
    );
  }

  const showLastSynced = status === 'synced' && lastSyncedAt;
  const showRefresh = (status === 'pending' || status === 'error') && onSync;

  return (
    <Pressable
      onPress={handlePress}
      disabled={status === 'syncing'}
      className={cn('flex-row items-center px-3 py-1.5 rounded-full', config.bgColor)}
    >
      {config.icon}
      <Text className="ml-1.5 text-xs font-medium" style={{ color: config.color }}>
        {config.label}
      </Text>
      {showLastSynced ? (
        <Text className="ml-1 text-xs text-gray-400">
          {`\u00B7 ${formatLastSynced(lastSyncedAt)}`}
        </Text>
      ) : null}
      {showRefresh ? (
        <View className="ml-1">
          <RefreshCw size={12} color={config.color} />
        </View>
      ) : null}
    </Pressable>
  );
}

interface SyncStatusSummaryProps {
  onSyncAll?: () => void;
}

export function SyncStatusSummary({ onSyncAll }: SyncStatusSummaryProps) {
  const summary = getSyncStatusSummary();
  const [isSyncing, setIsSyncing] = React.useState(false);

  const hasUnsyncedLogs = summary.pending > 0 || summary.error > 0;
  const totalLogs = summary.pending + summary.syncing + summary.synced + summary.error;

  const handleSyncAll = async () => {
    if (isSyncing) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSyncing(true);

    try {
      await syncDailyLogs();
      onSyncAll?.();
    } finally {
      setIsSyncing(false);
    }
  };

  if (totalLogs === 0) {
    return null;
  }

  return (
    <View className="flex-row items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-900">
      <View className="flex-row items-center">
        <Cloud size={16} color="#9CA3AF" />
        <Text className="ml-2 text-sm text-gray-500 dark:text-gray-400">
          {summary.synced}/{totalLogs} synced
        </Text>
      </View>

      {hasUnsyncedLogs && (
        <Pressable
          onPress={handleSyncAll}
          disabled={isSyncing}
          className="flex-row items-center bg-orange-500 px-3 py-1.5 rounded-full"
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <RefreshCw size={14} color="white" />
              <Text className="ml-1 text-xs font-medium text-white">
                Sync {summary.pending + summary.error}
              </Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

interface OfflineIndicatorProps {
  isOnline: boolean;
}

export function OfflineIndicator({ isOnline }: OfflineIndicatorProps) {
  if (isOnline) return null;

  return (
    <View className="flex-row items-center justify-center bg-yellow-500 py-1">
      <CloudOff size={14} color="white" />
      <Text className="ml-1.5 text-xs font-medium text-white">
        Offline - changes saved locally
      </Text>
    </View>
  );
}
