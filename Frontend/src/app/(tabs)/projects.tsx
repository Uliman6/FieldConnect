import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import {
  Plus,
  Building2,
  FileText,
  ChevronRight,
  Trash2,
  X,
  AlertTriangle,
  Upload,
} from 'lucide-react-native';
import { useDailyLogStore } from '@/lib/store';
import { Button, InputField } from '@/components/ui';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { cn } from '@/lib/cn';
import { Project } from '@/lib/types';
import { saveCurrentProjectName, getBackendId } from '@/lib/data-provider';
import { deleteProjectApi, queryKeys } from '@/lib/api';

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const projects = useDailyLogStore((s) => s.projects);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const events = useDailyLogStore((s) => s.events);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);
  const addProject = useDailyLogStore((s) => s.addProject);
  const setCurrentProject = useDailyLogStore((s) => s.setCurrentProject);
  const createDailyLog = useDailyLogStore((s) => s.createDailyLog);
  const deleteProject = useDailyLogStore((s) => s.deleteProject);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectNumber, setNewProjectNumber] = useState('');
  const [newProjectAddress, setNewProjectAddress] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const project = addProject(newProjectName.trim(), newProjectNumber.trim(), newProjectAddress.trim());

    // Automatically create a daily log for this project
    createDailyLog(project.id);

    // Save project name to localStorage for persistence
    saveCurrentProjectName(project.name);

    setNewProjectName('');
    setNewProjectNumber('');
    setNewProjectAddress('');
    setShowNewProject(false);

    // Navigate to daily log
    router.push('/(tabs)');
  };

  const handleSelectProject = (projectId: string) => {
    Haptics.selectionAsync();
    setCurrentProject(projectId);

    // Save project name to localStorage for persistence
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      saveCurrentProjectName(project.name);
    }

    // Check if there's a log for today, if not create one
    const today = new Date().toISOString().split('T')[0];
    const existingLog = dailyLogs.find((l) => l.project_id === projectId && l.date === today);

    if (!existingLog) {
      createDailyLog(projectId);
    } else {
      useDailyLogStore.getState().setCurrentLog(existingLog.id);
    }

    router.push('/(tabs)');
  };

  const getProjectLogCount = (projectId: string) => {
    return dailyLogs.filter((l) => l.project_id === projectId).length;
  };

  const getProjectEventCount = (projectId: string) => {
    return events.filter((e) => e.project_id === projectId).length;
  };

  const getLatestLog = (projectId: string) => {
    const projectLogs = dailyLogs.filter((l) => l.project_id === projectId);
    if (projectLogs.length === 0) return null;
    return projectLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    // Delete from backend first (if synced)
    const backendId = getBackendId('projects', projectToDelete.id);
    if (backendId) {
      try {
        await deleteProjectApi(backendId);
        console.log('[projects] Deleted from backend:', backendId);

        // Invalidate React Query cache so history page refreshes
        queryClient.invalidateQueries({ queryKey: queryKeys.projects });
        queryClient.invalidateQueries({ queryKey: ['daily-logs'] });
      } catch (error) {
        console.error('[projects] Failed to delete from backend:', error);
        // Continue with local delete even if backend fails
      }
    }

    // Delete locally
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    deleteProject(projectToDelete.id);
    setProjectToDelete(null);
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Header */}
        <View className="px-4 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Projects
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Select a project to view or create daily logs
          </Text>
        </View>

        {/* Projects List */}
        <View className="px-4 mt-4">
          {projects.length === 0 ? (
            <View className="items-center py-12">
              <Building2 size={48} color="#9CA3AF" />
              <Text className="text-lg font-medium text-gray-500 dark:text-gray-400 mt-4">
                No projects yet
              </Text>
              <Text className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2">
                Create your first project to start logging daily activities
              </Text>
            </View>
          ) : (
            projects.map((project) => {
              const logCount = getProjectLogCount(project.id);
              const eventCount = getProjectEventCount(project.id);
              const latestLog = getLatestLog(project.id);
              const isSelected = currentProjectId === project.id;

              return (
                <View
                  key={project.id}
                  className={cn(
                    'bg-white dark:bg-gray-900 rounded-2xl mb-3 border-2',
                    isSelected ? 'border-orange-500' : 'border-transparent'
                  )}
                >
                  <Pressable
                    onPress={() => handleSelectProject(project.id)}
                    className="p-4"
                  >
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Building2 size={20} color="#F97316" />
                          <Text className="ml-2 text-lg font-semibold text-gray-900 dark:text-white">
                            {project.name}
                          </Text>
                        </View>
                        {project.number && (
                          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            #{project.number}
                          </Text>
                        )}
                        {project.address && (
                          <Text className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
                            {project.address}
                          </Text>
                        )}
                      </View>
                      <ChevronRight size={24} color="#9CA3AF" />
                    </View>

                    <View className="flex-row items-center mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <FileText size={16} color="#6B7280" />
                      <Text className="ml-1 text-sm text-gray-500 dark:text-gray-400">
                        {logCount} {logCount === 1 ? 'log' : 'logs'}
                      </Text>
                      {eventCount > 0 && (
                        <Text className="ml-3 text-sm text-gray-400 dark:text-gray-500">
                          {eventCount} {eventCount === 1 ? 'event' : 'events'}
                        </Text>
                      )}
                      {latestLog && (
                        <Text className="ml-3 text-sm text-gray-400 dark:text-gray-500">
                          Last: {format(new Date(latestLog.date), 'MMM d')}
                        </Text>
                      )}
                    </View>
                  </Pressable>

                  {/* Delete Button */}
                  <View className="border-t border-gray-100 dark:border-gray-800">
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setProjectToDelete(project);
                      }}
                      className="flex-row items-center justify-center py-3"
                    >
                      <Trash2 size={16} color="#EF4444" />
                      <Text className="ml-2 text-sm font-medium text-red-500">
                        Delete Project
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Add Project Button */}
        <View className="px-4 mt-4">
          <Button
            title="New Project"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowNewProject(true);
            }}
            variant="primary"
            icon={<Plus size={20} color="white" />}
          />
        </View>

        {/* Import Button */}
        <View className="px-4 mt-3">
          <Button
            title="Import Data"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/import');
            }}
            variant="secondary"
            icon={<Upload size={20} color="#F97316" />}
          />
        </View>
      </ScrollView>

      {/* New Project Modal */}
      <Modal
        visible={showNewProject}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View className="flex-1 bg-gray-50 dark:bg-black">
          <View
            className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800"
            style={{ paddingTop: insets.top + 16 }}
          >
            <Pressable onPress={() => setShowNewProject(false)} className="p-2">
              <X size={24} color="#6B7280" />
            </Pressable>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              New Project
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1 px-4 pt-4">
            <InputField
              label="Project Name *"
              value={newProjectName}
              onChangeText={setNewProjectName}
              placeholder="e.g., Downtown Office Building"
              autoFocus
            />

            <InputField
              label="Project Number"
              value={newProjectNumber}
              onChangeText={setNewProjectNumber}
              placeholder="e.g., PRJ-2024-001"
            />

            <AddressAutocomplete
              label="Project Address"
              value={newProjectAddress}
              onChangeText={setNewProjectAddress}
              onSelectAddress={(address) => {
                if (Platform.OS !== 'web') {
                  Haptics.selectionAsync();
                }
              }}
              placeholder="Start typing city or address..."
            />

            <View className="mt-6">
              <Button
                title="Create Project"
                onPress={handleCreateProject}
                variant="primary"
                disabled={!newProjectName.trim()}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={!!projectToDelete}
        animationType="fade"
        transparent
      >
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm overflow-hidden">
            <View className="p-6">
              <View className="items-center mb-4">
                <View className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center">
                  <AlertTriangle size={28} color="#EF4444" />
                </View>
              </View>

              <Text className="text-xl font-bold text-gray-900 dark:text-white text-center mb-2">
                Delete Project?
              </Text>

              <Text className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
                Are you sure you want to delete{' '}
                <Text className="font-semibold text-gray-900 dark:text-white">
                  {projectToDelete?.name}
                </Text>
                ?
              </Text>

              {projectToDelete && (
                <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 mb-4">
                  <Text className="text-sm text-red-700 dark:text-red-300 text-center">
                    This will permanently delete:
                  </Text>
                  <View className="flex-row justify-center mt-2 gap-4">
                    <Text className="text-sm font-medium text-red-600 dark:text-red-400">
                      {getProjectLogCount(projectToDelete.id)} logs
                    </Text>
                    <Text className="text-sm font-medium text-red-600 dark:text-red-400">
                      {getProjectEventCount(projectToDelete.id)} events
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View className="flex-row border-t border-gray-200 dark:border-gray-800">
              <Pressable
                onPress={() => setProjectToDelete(null)}
                className="flex-1 py-4 items-center border-r border-gray-200 dark:border-gray-800"
              >
                <Text className="text-base font-medium text-gray-600 dark:text-gray-400">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDeleteProject}
                className="flex-1 py-4 items-center"
              >
                <Text className="text-base font-semibold text-red-500">
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
