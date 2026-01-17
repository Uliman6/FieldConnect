import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  Sun,
  Cloud,
  CloudRain,
  ThermometerSun,
  FileText,
  Copy,
  Check,
  ArrowLeft,
  Eye,
  Download,
  Users,
  Clock,
  AlertTriangle,
  ClipboardList,
  Truck,
  Package,
  UserCheck,
  Building2,
  Wind,
  Droplets,
} from 'lucide-react-native';
import { getDailyLog, fetchDailyLogPdf, DailyLogDetail, queryKeys } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Parse a date string as local date (not UTC)
 */
function parseLocalDate(dateString: string): Date {
  if (dateString && dateString.length === 10) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(dateString);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

function SectionHeader({ title, icon, count }: { title: string; icon: React.ReactNode; count?: number }) {
  return (
    <View className="flex-row items-center mb-3">
      {icon}
      <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {count !== undefined && count > 0 && (
        <View className="ml-2 px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded-full">
          <Text className="text-xs font-medium text-orange-600 dark:text-orange-400">{count}</Text>
        </View>
      )}
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Text className="text-sm text-gray-400 dark:text-gray-500 italic">{message}</Text>
  );
}

export default function DailyLogDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Fetch daily log from backend
  const { data: log, isLoading, isError, error } = useQuery({
    queryKey: [...queryKeys.dailyLogs(), id],
    queryFn: () => getDailyLog(id!),
    enabled: !!id,
  });

  // View PDF
  const handleViewPdf = useCallback(async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoadingPdf(true);
    try {
      const blobUrl = await fetchDailyLogPdf(id, true);
      if (Platform.OS === 'web') {
        window.open(blobUrl, '_blank');
      } else {
        Linking.openURL(blobUrl);
      }
    } catch (err) {
      console.error('[pdf] Failed to fetch PDF:', err);
    } finally {
      setIsLoadingPdf(false);
    }
  }, [id]);

  // Download PDF
  const handleDownloadPdf = useCallback(async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const blobUrl = await fetchDailyLogPdf(id, false);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `daily-log-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } else {
        Linking.openURL(blobUrl);
      }
    } catch (err) {
      console.error('[pdf] Failed to download PDF:', err);
    }
  }, [id]);

  // Copy summary
  const handleCopySummary = useCallback(async () => {
    if (!log) return;
    const logDate = parseLocalDate(log.date);
    const summary = `Daily Log - ${format(logDate, 'MMM d, yyyy')}
Project: ${log.project?.name || 'Unknown'}
Weather: ${log.weather?.sky_condition || 'N/A'}, ${log.weather?.low_temp ?? '--'}° - ${log.weather?.high_temp ?? '--'}°
Tasks: ${log.tasks?.length || 0}
Issues: ${log.pendingIssues?.length || 0}
Workers: ${log.dailyTotalsWorkers || 0}
Hours: ${log.dailyTotalsHours || 0}`;

    await Clipboard.setStringAsync(summary);
    setCopiedSummary(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedSummary(false), 2000);
  }, [log]);

  // Loading state
  if (isLoading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className="mt-4 text-gray-500 dark:text-gray-400">Loading daily log...</Text>
      </View>
    );
  }

  // Error state
  if (isError || !log) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center p-8">
        <FileText size={48} color="#9CA3AF" />
        <Text className="mt-4 text-lg text-gray-500 dark:text-gray-400 text-center">
          {isError ? 'Failed to load daily log' : 'Daily log not found'}
        </Text>
        {isError && (
          <Text className="mt-2 text-sm text-red-500 text-center">
            {error instanceof Error ? error.message : 'Unknown error'}
          </Text>
        )}
        <Pressable
          onPress={() => router.back()}
          className="mt-4 bg-orange-500 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const logDate = parseLocalDate(log.date);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Header */}
        <View
          className="bg-white dark:bg-gray-800 px-4 pb-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <View className="flex-row items-center mb-3">
            <Pressable
              onPress={() => router.back()}
              className="p-2 -ml-2 mr-2"
            >
              <ArrowLeft size={24} color="#6B7280" />
            </Pressable>
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                Daily Log Details
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">
                {format(logDate, 'EEEE, MMMM d, yyyy')}
              </Text>
            </View>
            <View className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
              <Text className="text-xs text-gray-600 dark:text-gray-300">{log.status || 'draft'}</Text>
            </View>
          </View>

          {/* Project info */}
          {log.project && (
            <View className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 mb-3">
              <View className="flex-row items-center">
                <Building2 size={18} color="#F97316" />
                <Text className="ml-2 text-base font-semibold text-gray-900 dark:text-white">
                  {log.project.name}
                </Text>
              </View>
              {log.project.number && (
                <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Project #{log.project.number}
                </Text>
              )}
            </View>
          )}

          {/* Prepared By */}
          {log.preparedBy && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Prepared by: <Text className="font-medium text-gray-700 dark:text-gray-300">{log.preparedBy}</Text>
            </Text>
          )}

          {/* Quick Actions */}
          <View className="flex-row space-x-2">
            <Pressable
              onPress={handleViewPdf}
              disabled={isLoadingPdf}
              className="flex-1 flex-row items-center justify-center py-3 bg-orange-500 rounded-xl"
            >
              {isLoadingPdf ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Eye size={18} color="white" />
                  <Text className="ml-2 text-white font-semibold">View PDF</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={handleDownloadPdf}
              className="flex-1 flex-row items-center justify-center py-3 bg-gray-200 dark:bg-gray-700 rounded-xl ml-2"
            >
              <Download size={18} color="#6B7280" />
              <Text className="ml-2 text-gray-700 dark:text-gray-300 font-semibold">Download</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={handleCopySummary}
            className="flex-row items-center justify-center py-3 bg-gray-100 dark:bg-gray-700 rounded-xl mt-2"
          >
            {copiedSummary ? (
              <>
                <Check size={18} color="#22C55E" />
                <Text className="ml-2 text-green-600 font-semibold">Copied!</Text>
              </>
            ) : (
              <>
                <Copy size={18} color="#6B7280" />
                <Text className="ml-2 text-gray-700 dark:text-gray-300 font-semibold">Copy Summary</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Daily Totals */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
            <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Daily Totals
            </Text>
            <View className="flex-row">
              <View className="flex-1 items-center">
                <View className="flex-row items-center">
                  <Users size={20} color="#F97316" />
                  <Text className="ml-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {log.dailyTotalsWorkers || 0}
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">Workers</Text>
              </View>
              <View className="w-px bg-gray-200 dark:bg-gray-700" />
              <View className="flex-1 items-center">
                <View className="flex-row items-center">
                  <Clock size={20} color="#F97316" />
                  <Text className="ml-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {log.dailyTotalsHours || 0}
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">Hours</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Weather */}
        {log.weather && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Weather"
                icon={<ThermometerSun size={20} color="#F97316" />}
              />
              <View className="flex-row flex-wrap">
                {log.weather.sky_condition && (
                  <View className="flex-row items-center mr-4 mb-2">
                    {log.weather.sky_condition.includes('Rain') || log.weather.sky_condition.includes('Storm') ? (
                      <CloudRain size={16} color="#3B82F6" />
                    ) : log.weather.sky_condition.includes('Cloud') || log.weather.sky_condition === 'Overcast' ? (
                      <Cloud size={16} color="#6B7280" />
                    ) : (
                      <Sun size={16} color="#F59E0B" />
                    )}
                    <Text className="ml-1 text-sm text-gray-700 dark:text-gray-300">{log.weather.sky_condition}</Text>
                  </View>
                )}
                {(log.weather.low_temp != null || log.weather.high_temp != null) && (
                  <View className="flex-row items-center mr-4 mb-2">
                    <ThermometerSun size={16} color="#EF4444" />
                    <Text className="ml-1 text-sm text-gray-700 dark:text-gray-300">
                      {log.weather.low_temp ?? '--'}° - {log.weather.high_temp ?? '--'}°F
                    </Text>
                  </View>
                )}
                {log.weather.wind && (
                  <View className="flex-row items-center mr-4 mb-2">
                    <Wind size={16} color="#6B7280" />
                    <Text className="ml-1 text-sm text-gray-700 dark:text-gray-300">{log.weather.wind}</Text>
                  </View>
                )}
                {log.weather.precipitation && (
                  <View className="flex-row items-center mr-4 mb-2">
                    <Droplets size={16} color="#3B82F6" />
                    <Text className="ml-1 text-sm text-gray-700 dark:text-gray-300">{log.weather.precipitation}</Text>
                  </View>
                )}
              </View>
              {log.weather.weather_delay && (
                <View className="mt-2 px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Text className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                    Weather Delay Reported
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Tasks */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
            <SectionHeader
              title="Tasks"
              icon={<ClipboardList size={20} color="#F97316" />}
              count={log.tasks?.length}
            />
            {!log.tasks || log.tasks.length === 0 ? (
              <EmptyState message="No tasks recorded" />
            ) : (
              log.tasks.map((task, index) => (
                <View
                  key={task.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      {task.companyName && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {task.companyName}
                        </Text>
                      )}
                      {task.taskDescription && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {task.taskDescription}
                        </Text>
                      )}
                      {task.notes && (
                        <Text className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
                          {task.notes}
                        </Text>
                      )}
                    </View>
                    <View className="items-end ml-3">
                      {task.workers != null && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {task.workers} workers
                        </Text>
                      )}
                      {task.hours != null && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {task.hours} hrs
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Pending Issues */}
        <View className="px-4 mt-4">
          <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 border-2 border-orange-200 dark:border-orange-800">
            <SectionHeader
              title="Pending Issues"
              icon={<AlertTriangle size={20} color="#EF4444" />}
              count={log.pendingIssues?.length}
            />
            {!log.pendingIssues || log.pendingIssues.length === 0 ? (
              <EmptyState message="No pending issues" />
            ) : (
              log.pendingIssues.map((issue, index) => (
                <View
                  key={issue.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      {issue.title && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {issue.title}
                        </Text>
                      )}
                      {issue.description && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {issue.description}
                        </Text>
                      )}
                      <View className="flex-row flex-wrap mt-2">
                        {issue.category && (
                          <View className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded mr-2 mb-1">
                            <Text className="text-xs text-gray-600 dark:text-gray-400">{issue.category}</Text>
                          </View>
                        )}
                        {issue.severity && (
                          <View className={cn(
                            "px-2 py-0.5 rounded mr-2 mb-1",
                            issue.severity === 'High' ? 'bg-red-100 dark:bg-red-900/30' :
                            issue.severity === 'Medium' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                            'bg-green-100 dark:bg-green-900/30'
                          )}>
                            <Text className={cn(
                              "text-xs",
                              issue.severity === 'High' ? 'text-red-600 dark:text-red-400' :
                              issue.severity === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-green-600 dark:text-green-400'
                            )}>{issue.severity}</Text>
                          </View>
                        )}
                        {issue.assignee && (
                          <View className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded mr-2 mb-1">
                            <Text className="text-xs text-blue-600 dark:text-blue-400">{issue.assignee}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Inspection Notes */}
        {log.inspectionNotes && log.inspectionNotes.length > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Inspections"
                icon={<ClipboardList size={20} color="#8B5CF6" />}
                count={log.inspectionNotes.length}
              />
              {log.inspectionNotes.map((note, index) => (
                <View
                  key={note.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      {note.inspectionType && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {note.inspectionType}
                        </Text>
                      )}
                      {note.inspectorName && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400">
                          Inspector: {note.inspectorName}
                        </Text>
                      )}
                      {note.ahj && (
                        <Text className="text-xs text-gray-500 dark:text-gray-500">
                          AHJ: {note.ahj}
                        </Text>
                      )}
                      {note.notes && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {note.notes}
                        </Text>
                      )}
                    </View>
                    {note.result && (
                      <View className={cn(
                        "px-2 py-1 rounded",
                        note.result.toLowerCase().includes('pass') ? 'bg-green-100 dark:bg-green-900/30' :
                        note.result.toLowerCase().includes('fail') ? 'bg-red-100 dark:bg-red-900/30' :
                        'bg-gray-100 dark:bg-gray-700'
                      )}>
                        <Text className={cn(
                          "text-xs font-medium",
                          note.result.toLowerCase().includes('pass') ? 'text-green-600 dark:text-green-400' :
                          note.result.toLowerCase().includes('fail') ? 'text-red-600 dark:text-red-400' :
                          'text-gray-600 dark:text-gray-400'
                        )}>{note.result}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Visitors */}
        {log.visitors && log.visitors.length > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Visitors"
                icon={<UserCheck size={20} color="#10B981" />}
                count={log.visitors.length}
              />
              {log.visitors.map((visitor, index) => (
                <View
                  key={visitor.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      {visitor.visitorName && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {visitor.visitorName}
                        </Text>
                      )}
                      {visitor.companyName && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400">
                          {visitor.companyName}
                        </Text>
                      )}
                      {visitor.notes && (
                        <Text className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {visitor.notes}
                        </Text>
                      )}
                    </View>
                    {visitor.time && (
                      <Text className="text-xs text-gray-400">{visitor.time}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Equipment */}
        {log.equipment && log.equipment.length > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Equipment"
                icon={<Truck size={20} color="#6B7280" />}
                count={log.equipment.length}
              />
              {log.equipment.map((eq, index) => (
                <View
                  key={eq.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      {eq.equipmentType && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {eq.equipmentType}
                        </Text>
                      )}
                      {eq.notes && (
                        <Text className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {eq.notes}
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      {eq.quantity != null && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          Qty: {eq.quantity}
                        </Text>
                      )}
                      {eq.hours != null && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {eq.hours} hrs
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Materials */}
        {log.materials && log.materials.length > 0 && (
          <View className="px-4 mt-4">
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <SectionHeader
                title="Materials"
                icon={<Package size={20} color="#3B82F6" />}
                count={log.materials.length}
              />
              {log.materials.map((mat, index) => (
                <View
                  key={mat.id}
                  className={cn(
                    "py-3",
                    index > 0 && "border-t border-gray-100 dark:border-gray-700"
                  )}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      {mat.material && (
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {mat.material}
                        </Text>
                      )}
                      {mat.supplier && (
                        <Text className="text-sm text-gray-600 dark:text-gray-400">
                          Supplier: {mat.supplier}
                        </Text>
                      )}
                      {mat.notes && (
                        <Text className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          {mat.notes}
                        </Text>
                      )}
                    </View>
                    {(mat.quantity != null || mat.unit) && (
                      <Text className="text-sm text-gray-500 dark:text-gray-400">
                        {mat.quantity ?? ''} {mat.unit ?? ''}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View className="px-4 py-6 items-center">
          <Text className="text-xs text-gray-400 dark:text-gray-500">
            Log ID: {log.id}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
