import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronRight, Globe, Mic, LogOut, Info, Users, Plus, Trash2, Edit2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useColorScheme } from '@/lib/useColorScheme';
import { useAuthStore } from '@/lib/auth-store';
import { useLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n/LanguageProvider';
import { getUsers, createUser, updateUser, deleteUser, queryKeys, type UserInfo } from '@/lib/api';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { logout, user } = useAuthStore();
  const queryClient = useQueryClient();
  const {
    language,
    setLanguage,
    transcriptionLanguage,
    setTranscriptionLanguage,
    t,
    supportedLanguages,
  } = useLanguage();

  const [showLanguageSelector, setShowLanguageSelector] = React.useState(false);
  const [showTranscriptionSelector, setShowTranscriptionSelector] = React.useState(false);

  // Admin panel state
  const [showUserManagement, setShowUserManagement] = React.useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserInfo | null>(null);
  const [newUserEmail, setNewUserEmail] = React.useState('');
  const [newUserPassword, setNewUserPassword] = React.useState('');
  const [newUserName, setNewUserName] = React.useState('');
  const [newUserRole, setNewUserRole] = React.useState<'VIEWER' | 'EDITOR' | 'ADMIN'>('VIEWER');

  const isAdmin = user?.role === 'ADMIN';

  // Fetch users (only when admin opens the section)
  const usersQuery = useQuery({
    queryKey: queryKeys.users,
    queryFn: getUsers,
    enabled: isAdmin && showUserManagement,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      setShowCreateUserModal(false);
      resetNewUserForm();
      Alert.alert('Success', 'User created successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; role?: 'ADMIN' | 'EDITOR' | 'VIEWER' } }) =>
      updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      setEditingUser(null);
      Alert.alert('Success', 'User updated successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users });
      Alert.alert('Success', 'User deleted successfully');
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const resetNewUserForm = () => {
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    setNewUserRole('VIEWER');
  };

  const handleCreateUser = () => {
    if (!newUserEmail || !newUserPassword) {
      Alert.alert('Error', 'Email and password are required');
      return;
    }
    createUserMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
      name: newUserName || undefined,
      role: newUserRole,
    });
  };

  const handleDeleteUser = (userToDelete: UserInfo) => {
    if (userToDelete.id === user?.id) {
      Alert.alert('Error', 'You cannot delete your own account');
      return;
    }
    Alert.alert(
      'Delete User',
      `Are you sure you want to delete ${userToDelete.name || userToDelete.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteUserMutation.mutate(userToDelete.id),
        },
      ]
    );
  };

  const handleUpdateUserRole = (userToUpdate: UserInfo, newRole: 'ADMIN' | 'EDITOR' | 'VIEWER') => {
    if (userToUpdate.id === user?.id && newRole !== 'ADMIN') {
      Alert.alert('Error', 'You cannot demote your own account');
      return;
    }
    updateUserMutation.mutate({
      id: userToUpdate.id,
      data: { role: newRole },
    });
  };

  const handleLanguageChange = async (lang: LanguageCode) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    await setLanguage(lang);
    setShowLanguageSelector(false);
  };

  const handleTranscriptionLanguageChange = async (lang: LanguageCode) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    await setTranscriptionLanguage(lang);
    setShowTranscriptionSelector(false);
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      // Use window.confirm for web since Alert.alert doesn't work
      const confirmed = window.confirm(t('settings.logoutConfirm'));
      if (confirmed) {
        await logout();
      }
    } else {
      Alert.alert(
        t('settings.logout'),
        t('settings.logoutConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.logout'),
            style: 'destructive',
            onPress: async () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await logout();
            },
          },
        ]
      );
    }
  };

  const currentLang = supportedLanguages.find(l => l.code === language);
  const currentTranscriptionLang = supportedLanguages.find(l => l.code === transcriptionLanguage);

  return (
    <SafeAreaView
      className={`flex-1 ${isDark ? 'bg-black' : 'bg-gray-50'}`}
      edges={['top']}
    >
      <ScrollView className="flex-1">
        {/* Header */}
        <View className="px-4 py-4">
          <Text className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {t('settings.title')}
          </Text>
        </View>

        {/* Language Section */}
        <View className="px-4 mt-4">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.language').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            {/* UI Language */}
            <Pressable
              onPress={() => {
                setShowLanguageSelector(!showLanguageSelector);
                setShowTranscriptionSelector(false);
              }}
              className={`flex-row items-center justify-between p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <View className="flex-row items-center flex-1">
                <Globe size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <View className="ml-3 flex-1">
                  <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {t('settings.language')}
                  </Text>
                  <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('settings.languageDescription')}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className={`mr-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {currentLang?.flag} {currentLang?.nativeName}
                </Text>
                <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </View>
            </Pressable>

            {/* Language Selector */}
            {showLanguageSelector && (
              <View className={`border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                {supportedLanguages.map((lang, index) => (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleLanguageChange(lang.code)}
                    className={`flex-row items-center justify-between p-4 ${
                      index < supportedLanguages.length - 1
                        ? isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'
                        : ''
                    } ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{lang.flag}</Text>
                      <View>
                        <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lang.nativeName}
                        </Text>
                        <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {lang.name}
                        </Text>
                      </View>
                    </View>
                    {language === lang.code && (
                      <Check size={20} color="#F97316" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <View className={`h-px ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />

            {/* Transcription Language */}
            <Pressable
              onPress={() => {
                setShowTranscriptionSelector(!showTranscriptionSelector);
                setShowLanguageSelector(false);
              }}
              className={`flex-row items-center justify-between p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <View className="flex-row items-center flex-1">
                <Mic size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <View className="ml-3 flex-1">
                  <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {t('settings.transcriptionLanguage')}
                  </Text>
                  <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('settings.transcriptionDescription')}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <Text className={`mr-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {currentTranscriptionLang?.flag} {currentTranscriptionLang?.nativeName}
                </Text>
                <ChevronRight size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              </View>
            </Pressable>

            {/* Transcription Language Selector */}
            {showTranscriptionSelector && (
              <View className={`border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                {supportedLanguages.map((lang, index) => (
                  <Pressable
                    key={lang.code}
                    onPress={() => handleTranscriptionLanguageChange(lang.code)}
                    className={`flex-row items-center justify-between p-4 ${
                      index < supportedLanguages.length - 1
                        ? isDark ? 'border-b border-gray-800' : 'border-b border-gray-100'
                        : ''
                    } ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
                  >
                    <View className="flex-row items-center">
                      <Text className="text-xl mr-3">{lang.flag}</Text>
                      <View>
                        <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {lang.nativeName}
                        </Text>
                        <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {lang.name}
                        </Text>
                      </View>
                    </View>
                    {transcriptionLanguage === lang.code && (
                      <Check size={20} color="#F97316" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Admin User Management Section - Only visible to ADMIN */}
        {isAdmin && (
          <View className="px-4 mt-6">
            <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              ADMIN
            </Text>
            <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <Pressable
                onPress={() => setShowUserManagement(!showUserManagement)}
                className={`flex-row items-center justify-between p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
              >
                <View className="flex-row items-center">
                  <Users size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                  <Text className={`ml-3 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    User Management
                  </Text>
                </View>
                <ChevronRight
                  size={20}
                  color={isDark ? '#6B7280' : '#9CA3AF'}
                  style={{ transform: [{ rotate: showUserManagement ? '90deg' : '0deg' }] }}
                />
              </Pressable>

              {/* User Management Panel */}
              {showUserManagement && (
                <View className={`border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                  {/* Add User Button */}
                  <Pressable
                    onPress={() => setShowCreateUserModal(true)}
                    className={`flex-row items-center p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
                  >
                    <Plus size={18} color="#F97316" />
                    <Text className="ml-2 font-medium text-orange-500">Add New User</Text>
                  </Pressable>

                  {/* Users List */}
                  {usersQuery.isLoading ? (
                    <View className="p-4 items-center">
                      <ActivityIndicator color="#F97316" />
                    </View>
                  ) : usersQuery.error ? (
                    <View className="p-4">
                      <Text className="text-red-500 text-center">Failed to load users</Text>
                    </View>
                  ) : (
                    usersQuery.data?.map((u, index) => (
                      <View
                        key={u.id}
                        className={`p-4 ${index < (usersQuery.data?.length || 0) - 1 ? (isDark ? 'border-b border-gray-800' : 'border-b border-gray-100') : ''}`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1">
                            <Text className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {u.name || u.email.split('@')[0]}
                            </Text>
                            <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {u.email}
                            </Text>
                          </View>
                          <View className="flex-row items-center">
                            {/* Role Selector */}
                            <View className="flex-row mr-2">
                              {(['VIEWER', 'EDITOR', 'ADMIN'] as const).map((role) => (
                                <Pressable
                                  key={role}
                                  onPress={() => handleUpdateUserRole(u, role)}
                                  disabled={updateUserMutation.isPending}
                                  className={`px-2 py-1 rounded ${
                                    u.role === role
                                      ? role === 'ADMIN'
                                        ? 'bg-red-500'
                                        : role === 'EDITOR'
                                        ? 'bg-orange-500'
                                        : 'bg-blue-500'
                                      : isDark
                                      ? 'bg-gray-700'
                                      : 'bg-gray-200'
                                  } ${role !== 'ADMIN' ? 'mr-1' : ''}`}
                                >
                                  <Text
                                    className={`text-xs font-medium ${
                                      u.role === role ? 'text-white' : isDark ? 'text-gray-300' : 'text-gray-600'
                                    }`}
                                  >
                                    {role[0]}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                            {/* Delete Button */}
                            <Pressable
                              onPress={() => handleDeleteUser(u)}
                              disabled={u.id === user?.id || deleteUserMutation.isPending}
                              className={`p-2 ${u.id === user?.id ? 'opacity-30' : ''}`}
                            >
                              <Trash2 size={18} color="#EF4444" />
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Account Section */}
        <View className="px-4 mt-6">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.account').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <Pressable
              onPress={handleLogout}
              className={`flex-row items-center p-4 ${isDark ? 'active:bg-gray-800' : 'active:bg-gray-100'}`}
            >
              <LogOut size={20} color="#EF4444" />
              <Text className="ml-3 font-medium text-red-500">
                {t('settings.logout')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* About Section */}
        <View className="px-4 mt-6 mb-8">
          <Text className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {t('settings.about').toUpperCase()}
          </Text>
          <View className={`rounded-xl overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <Info size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <Text className={`ml-3 font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {t('settings.version')}
                </Text>
              </View>
              <Text className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                1.0.0
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Create User Modal */}
      <Modal
        visible={showCreateUserModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCreateUserModal(false);
          resetNewUserForm();
        }}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className={`w-80 rounded-xl p-4 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <View className="flex-row justify-between items-center mb-4">
              <Text className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Create New User
              </Text>
              <Pressable onPress={() => { setShowCreateUserModal(false); resetNewUserForm(); }}>
                <X size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </Pressable>
            </View>

            {/* Email */}
            <Text className={`text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Email *</Text>
            <TextInput
              value={newUserEmail}
              onChangeText={setNewUserEmail}
              placeholder="email@example.com"
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              keyboardType="email-address"
              autoCapitalize="none"
              className={`border rounded-lg p-3 mb-3 ${isDark ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            />

            {/* Password */}
            <Text className={`text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Password *</Text>
            <TextInput
              value={newUserPassword}
              onChangeText={setNewUserPassword}
              placeholder="Password"
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              secureTextEntry
              className={`border rounded-lg p-3 mb-3 ${isDark ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            />

            {/* Name */}
            <Text className={`text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Name</Text>
            <TextInput
              value={newUserName}
              onChangeText={setNewUserName}
              placeholder="Full Name"
              placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
              className={`border rounded-lg p-3 mb-3 ${isDark ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
            />

            {/* Role Selector */}
            <Text className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Role</Text>
            <View className="flex-row mb-4">
              {(['VIEWER', 'EDITOR', 'ADMIN'] as const).map((role) => (
                <Pressable
                  key={role}
                  onPress={() => setNewUserRole(role)}
                  className={`flex-1 py-2 rounded-lg mx-1 ${
                    newUserRole === role
                      ? role === 'ADMIN'
                        ? 'bg-red-500'
                        : role === 'EDITOR'
                        ? 'bg-orange-500'
                        : 'bg-blue-500'
                      : isDark
                      ? 'bg-gray-700'
                      : 'bg-gray-200'
                  }`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${
                      newUserRole === role ? 'text-white' : isDark ? 'text-gray-300' : 'text-gray-600'
                    }`}
                  >
                    {role}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Create Button */}
            <Pressable
              onPress={handleCreateUser}
              disabled={createUserMutation.isPending}
              className={`bg-orange-500 py-3 rounded-lg ${createUserMutation.isPending ? 'opacity-50' : ''}`}
            >
              {createUserMutation.isPending ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-center font-semibold">Create User</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
