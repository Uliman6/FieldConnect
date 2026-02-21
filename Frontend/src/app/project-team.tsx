import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  UserPlus,
  Users,
  Mail,
  Shield,
  Crown,
  User,
  Eye,
  X,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
} from 'lucide-react-native';
import { useLanguage } from '@/i18n/LanguageProvider';
import { Button } from '@/components/ui';
import {
  getProjectMembers,
  getProjectInvitations,
  sendProjectInvitation,
  cancelInvitation,
  removeProjectMember,
  queryKeys,
  ProjectMember,
  ProjectInvitation,
  ProjectRole,
} from '@/lib/api';
import { useDailyLogStore } from '@/lib/store';
import { getBackendId } from '@/lib/data-provider';

const ROLE_ICONS = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: User,
  VIEWER: Eye,
};

const ROLE_COLORS = {
  OWNER: '#F59E0B',
  ADMIN: '#3B82F6',
  MEMBER: '#10B981',
  VIEWER: '#6B7280',
};

const ROLE_LABELS = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

function MemberCard({
  member,
  canManage,
  currentUserId,
  onRemove,
}: {
  member: ProjectMember;
  canManage: boolean;
  currentUserId: string;
  onRemove: () => void;
}) {
  const RoleIcon = ROLE_ICONS[member.role] || User;
  const roleColor = ROLE_COLORS[member.role] || ROLE_COLORS.MEMBER;
  const isCurrentUser = member.userId === currentUserId;

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
      <View className="flex-row items-center">
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: roleColor + '20' }}
        >
          <RoleIcon size={20} color={roleColor} />
        </View>

        <View className="flex-1 ml-3">
          <View className="flex-row items-center">
            <Text className="text-base font-semibold text-gray-900 dark:text-white">
              {member.user.name || 'Unknown'}
            </Text>
            {isCurrentUser && (
              <View className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                <Text className="text-xs text-gray-500 dark:text-gray-400">You</Text>
              </View>
            )}
          </View>
          <Text className="text-sm text-gray-500 dark:text-gray-400">{member.user.email}</Text>
        </View>

        <View className="items-end">
          <View
            className="px-2 py-1 rounded-full"
            style={{ backgroundColor: roleColor + '20' }}
          >
            <Text className="text-xs font-medium" style={{ color: roleColor }}>
              {ROLE_LABELS[member.role]}
            </Text>
          </View>
        </View>
      </View>

      {canManage && !isCurrentUser && member.role !== 'OWNER' && (
        <Pressable
          onPress={onRemove}
          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex-row items-center justify-center"
        >
          <Trash2 size={14} color="#EF4444" />
          <Text className="ml-1 text-sm text-red-500">Remove from project</Text>
        </Pressable>
      )}
    </View>
  );
}

function InvitationCard({
  invitation,
  canManage,
  onCancel,
}: {
  invitation: ProjectInvitation;
  canManage: boolean;
  onCancel: () => void;
}) {
  const expiresAt = new Date(invitation.expiresAt);
  const isExpired = expiresAt < new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-700">
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 items-center justify-center">
          <Mail size={20} color="#3B82F6" />
        </View>

        <View className="flex-1 ml-3">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {invitation.email}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Invited as {ROLE_LABELS[invitation.role]}
            </Text>
            {!isExpired && (
              <View className="flex-row items-center ml-2">
                <Clock size={12} color="#9CA3AF" />
                <Text className="text-xs text-gray-400 ml-1">
                  {daysLeft > 0 ? `${daysLeft}d left` : 'Expires today'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View className="items-end">
          {isExpired ? (
            <View className="px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded-full">
              <Text className="text-xs font-medium text-red-600">Expired</Text>
            </View>
          ) : (
            <View className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
              <Text className="text-xs font-medium text-yellow-600">Pending</Text>
            </View>
          )}
        </View>
      </View>

      {canManage && !isExpired && (
        <Pressable
          onPress={onCancel}
          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex-row items-center justify-center"
        >
          <XCircle size={14} color="#EF4444" />
          <Text className="ml-1 text-sm text-red-500">Cancel invitation</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ProjectTeamScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { projectId: localProjectId } = useLocalSearchParams<{ projectId: string }>();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('MEMBER');
  const [inviteMessage, setInviteMessage] = useState('');

  // Get project info
  const projects = useDailyLogStore((s) => s.projects);
  const project = projects.find((p) => p.id === localProjectId);
  const backendProjectId = localProjectId
    ? (getBackendId('projects', localProjectId) || localProjectId)
    : undefined;

  // Fetch members
  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(backendProjectId!),
    queryFn: () => getProjectMembers(backendProjectId!),
    enabled: !!backendProjectId,
  });

  // Fetch invitations
  const invitationsQuery = useQuery({
    queryKey: queryKeys.projectInvitations(backendProjectId!),
    queryFn: () => getProjectInvitations(backendProjectId!),
    enabled: !!backendProjectId,
  });

  // Send invitation mutation
  const sendInviteMutation = useMutation({
    mutationFn: () =>
      sendProjectInvitation(backendProjectId!, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        message: inviteMessage.trim() || undefined,
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.projectInvitations(backendProjectId!) });
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      setInviteMessage('');
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.message || 'Failed to send invitation');
    },
  });

  // Cancel invitation mutation
  const cancelInviteMutation = useMutation({
    mutationFn: (invitationId: string) => cancelInvitation(invitationId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.projectInvitations(backendProjectId!) });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to cancel invitation');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeProjectMember(backendProjectId!, memberId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(backendProjectId!) });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to remove member');
    },
  });

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(backendProjectId!) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projectInvitations(backendProjectId!) }),
    ]);
  };

  // Check if current user can manage team (OWNER or ADMIN)
  // For now, assume they can if they have access to this page
  const canManage = true;
  const currentUserId = ''; // TODO: Get from auth store

  const members = membersQuery.data || [];
  const invitations = invitationsQuery.data?.filter((i) => i.status === 'PENDING') || [];

  const isLoading = membersQuery.isLoading || invitationsQuery.isLoading;
  const isRefreshing = membersQuery.isFetching || invitationsQuery.isFetching;

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <View
        className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 pb-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="p-2 -ml-2 rounded-lg"
          >
            <ArrowLeft size={24} color="#6B7280" />
          </Pressable>
          <View className="flex-1 ml-2">
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Team
            </Text>
            {project && (
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {project.name}
              </Text>
            )}
          </View>
          {canManage && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowInviteModal(true);
              }}
              className="bg-orange-500 rounded-full p-2"
            >
              <UserPlus size={20} color="white" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color="#4B6F44" />
            <Text className="mt-3 text-gray-500">Loading team...</Text>
          </View>
        ) : (
          <>
            {/* Members Section */}
            <View className="px-4 mt-4">
              <View className="flex-row items-center mb-3">
                <Users size={18} color="#6B7280" />
                <Text className="ml-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Members ({members.length})
                </Text>
              </View>

              {members.length === 0 ? (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-6 items-center">
                  <Users size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-gray-500 dark:text-gray-400 text-center">
                    No members yet
                  </Text>
                </View>
              ) : (
                members.map((member) => (
                  <MemberCard
                    key={member.userId}
                    member={member}
                    canManage={canManage}
                    currentUserId={currentUserId}
                    onRemove={() => {
                      Alert.alert(
                        'Remove Member',
                        `Remove ${member.user.name || member.user.email} from this project?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => removeMemberMutation.mutate(member.userId),
                          },
                        ]
                      );
                    }}
                  />
                ))
              )}
            </View>

            {/* Pending Invitations Section */}
            {invitations.length > 0 && (
              <View className="px-4 mt-6">
                <View className="flex-row items-center mb-3">
                  <Mail size={18} color="#6B7280" />
                  <Text className="ml-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Pending Invitations ({invitations.length})
                  </Text>
                </View>

                {invitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.id}
                    invitation={invitation}
                    canManage={canManage}
                    onCancel={() => {
                      Alert.alert(
                        'Cancel Invitation',
                        `Cancel the invitation to ${invitation.email}?`,
                        [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Cancel',
                            style: 'destructive',
                            onPress: () => cancelInviteMutation.mutate(invitation.id),
                          },
                        ]
                      );
                    }}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-gray-50 dark:bg-gray-900">
          <View
            className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800"
            style={{ paddingTop: insets.top + 16 }}
          >
            <Pressable onPress={() => setShowInviteModal(false)} className="p-2">
              <X size={24} color="#6B7280" />
            </Pressable>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              Invite Team Member
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-4 pt-4">
            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address *
              </Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="colleague@company.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white"
              />
            </View>

            {/* Role Selection */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </Text>
              <View className="flex-row gap-2">
                {(['ADMIN', 'MEMBER', 'VIEWER'] as ProjectRole[]).map((role) => {
                  const RoleIcon = ROLE_ICONS[role];
                  const roleColor = ROLE_COLORS[role];
                  const isSelected = inviteRole === role;

                  return (
                    <Pressable
                      key={role}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setInviteRole(role);
                      }}
                      className={`flex-1 py-3 rounded-xl border-2 items-center ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <RoleIcon size={20} color={isSelected ? '#4B6F44' : roleColor} />
                      <Text
                        className={`mt-1 text-sm font-medium ${
                          isSelected ? 'text-orange-600' : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {ROLE_LABELS[role]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Message Input */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Message (optional)
              </Text>
              <TextInput
                value={inviteMessage}
                onChangeText={setInviteMessage}
                placeholder="Add a personal message..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white"
                style={{ minHeight: 80, textAlignVertical: 'top' }}
              />
            </View>

            {/* Send Button */}
            <View className="mt-6">
              <Button
                title={sendInviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                onPress={() => sendInviteMutation.mutate()}
                variant="primary"
                disabled={!inviteEmail.trim() || sendInviteMutation.isPending}
                icon={
                  sendInviteMutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Send size={20} color="white" />
                  )
                }
              />
            </View>

            {/* Role Descriptions */}
            <View className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-xl">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role Permissions
              </Text>
              <View className="gap-2">
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  <Text className="font-medium">Admin:</Text> Full access, can invite others
                </Text>
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  <Text className="font-medium">Member:</Text> Can view and edit project data
                </Text>
                <Text className="text-sm text-gray-600 dark:text-gray-400">
                  <Text className="font-medium">Viewer:</Text> Read-only access
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
