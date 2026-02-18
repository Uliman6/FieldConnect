import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  Mail,
  CheckCircle2,
  XCircle,
  Building2,
  ChevronRight,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, SlideInRight } from 'react-native-reanimated';
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
  queryKeys,
  ProjectInvitation,
} from '@/lib/api';
import { useDataProvider } from '@/lib/data-provider';

function InvitationItem({
  invitation,
  onAccepted,
  onRefreshData,
}: {
  invitation: ProjectInvitation;
  onAccepted?: () => void;
  onRefreshData: () => Promise<void>;
}) {
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitation(invitation.id),
    onSuccess: async (data) => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });

      // Refresh from backend to sync the new project to local store
      await onRefreshData();

      onAccepted?.();

      if (Platform.OS === 'web') {
        window.alert(data.message || 'You have joined the project!');
      } else {
        Alert.alert('Welcome!', data.message);
      }
    },
    onError: (error: any) => {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      if (Platform.OS === 'web') {
        window.alert(error.message || 'Failed to accept invitation');
      } else {
        Alert.alert('Error', error.message || 'Failed to accept invitation');
      }
    },
  });

  const declineMutation = useMutation({
    mutationFn: () => declineInvitation(invitation.id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.invalidateQueries({ queryKey: queryKeys.myInvitations });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to decline invitation');
    },
  });

  const isPending = acceptMutation.isPending || declineMutation.isPending;

  return (
    <Animated.View
      entering={SlideInRight.duration(300)}
      exiting={FadeOut.duration(200)}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-blue-200 dark:border-blue-800"
    >
      <View className="flex-row items-start">
        <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 items-center justify-center">
          <Building2 size={20} color="#3B82F6" />
        </View>

        <View className="flex-1 ml-3">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {invitation.project?.name || 'Project Invitation'}
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Invited by {invitation.invitedBy?.name || invitation.invitedBy?.email || 'Unknown'}
          </Text>
          {invitation.message && (
            <Text className="text-sm text-gray-600 dark:text-gray-300 mt-2 italic">
              "{invitation.message}"
            </Text>
          )}
          <Text className="text-xs text-gray-400 mt-1">
            Role: {invitation.role}
          </Text>
        </View>
      </View>

      <View className="flex-row gap-3 mt-4">
        <Pressable
          onPress={() => {
            if (isPending) return;
            declineMutation.mutate();
          }}
          disabled={isPending}
          className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg border border-gray-300 dark:border-gray-600"
        >
          {declineMutation.isPending ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <>
              <XCircle size={16} color="#6B7280" />
              <Text className="ml-1.5 text-sm font-medium text-gray-600 dark:text-gray-400">
                Decline
              </Text>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            if (isPending) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            acceptMutation.mutate();
          }}
          disabled={isPending}
          className="flex-1 flex-row items-center justify-center py-2.5 rounded-lg bg-blue-500"
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <>
              <CheckCircle2 size={16} color="white" />
              <Text className="ml-1.5 text-sm font-medium text-white">
                Accept
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

export function PendingInvitations({ onAccepted }: { onAccepted?: () => void }) {
  const { refresh } = useDataProvider();

  const invitationsQuery = useQuery({
    queryKey: queryKeys.myInvitations,
    queryFn: getMyInvitations,
    staleTime: 30 * 1000, // 30 seconds
  });

  const invitations = invitationsQuery.data || [];

  if (invitationsQuery.isLoading) {
    return null; // Don't show loading state to avoid layout shift
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn} className="px-4 mt-4">
      <View className="flex-row items-center mb-3">
        <Mail size={18} color="#3B82F6" />
        <Text className="ml-2 text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
          Project Invitations ({invitations.length})
        </Text>
      </View>

      <View className="gap-3">
        {invitations.map((invitation) => (
          <InvitationItem
            key={invitation.id}
            invitation={invitation}
            onAccepted={onAccepted}
            onRefreshData={refresh}
          />
        ))}
      </View>
    </Animated.View>
  );
}

export default PendingInvitations;
