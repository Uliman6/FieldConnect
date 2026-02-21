import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { FileText, Share2, Printer, ArrowLeft, Check } from 'lucide-react-native';
import { useDailyLogStore } from '@/lib/store';
import { Button } from '@/components/ui';
import { DailyLog, Project } from '@/lib/types';

function generatePdfHtml(log: DailyLog, project: Project | undefined): string {
  const formatDate = (dateStr: string) => format(new Date(dateStr), 'MMMM d, yyyy');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #1a1a1a;
          padding: 40px;
        }
        .header {
          border-bottom: 3px solid #4B6F44;
          padding-bottom: 20px;
          margin-bottom: 20px;
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          color: #4B6F44;
          margin-bottom: 4px;
        }
        .subtitle {
          font-size: 14px;
          color: #666;
        }
        .project-info {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .project-name {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        .project-details {
          color: #666;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          color: #4B6F44;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #ddd;
        }
        .row {
          display: flex;
          margin-bottom: 8px;
        }
        .label {
          font-weight: 600;
          width: 140px;
          color: #444;
        }
        .value {
          flex: 1;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background: #f5f5f5;
          font-weight: 600;
        }
        .issue {
          background: #fff8f0;
          border-left: 4px solid #4B6F44;
          padding: 12px;
          margin-bottom: 10px;
          border-radius: 0 4px 4px 0;
        }
        .issue-high {
          border-left-color: #EF4444;
          background: #fef2f2;
        }
        .issue-title {
          font-weight: bold;
          margin-bottom: 4px;
        }
        .issue-meta {
          font-size: 11px;
          color: #666;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
        }
        .badge-high { background: #fee2e2; color: #dc2626; }
        .badge-medium { background: #fef3c7; color: #d97706; }
        .badge-low { background: #dcfce7; color: #16a34a; }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 10px;
          color: #888;
          text-align: center;
        }
        .totals {
          display: flex;
          gap: 20px;
          margin-bottom: 15px;
        }
        .total-box {
          background: #f0f9ff;
          padding: 10px 15px;
          border-radius: 8px;
          text-align: center;
        }
        .total-value {
          font-size: 20px;
          font-weight: bold;
          color: #0369a1;
        }
        .total-label {
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">DAILY LOG</div>
        <div class="subtitle">${formatDate(log.date)}</div>
      </div>

      ${project ? `
      <div class="project-info">
        <div class="project-name">${project.name}</div>
        <div class="project-details">
          ${project.number ? `#${project.number}` : ''} ${project.address ? `· ${project.address}` : ''}
        </div>
      </div>
      ` : ''}

      <div class="section">
        <div class="row">
          <span class="label">Prepared By:</span>
          <span class="value">${log.prepared_by || 'N/A'}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Weather Conditions</div>
        <div class="row">
          <span class="label">Temperature:</span>
          <span class="value">${log.weather.low_temp ?? '--'}°F - ${log.weather.high_temp ?? '--'}°F</span>
        </div>
        <div class="row">
          <span class="label">Sky:</span>
          <span class="value">${log.weather.sky_condition}</span>
        </div>
        <div class="row">
          <span class="label">Precipitation:</span>
          <span class="value">${log.weather.precipitation || 'None'}</span>
        </div>
        <div class="row">
          <span class="label">Wind:</span>
          <span class="value">${log.weather.wind || 'Calm'}</span>
        </div>
        ${log.weather.weather_delay ? '<div class="row"><span class="label">⚠️ Weather Delay:</span><span class="value">Yes</span></div>' : ''}
      </div>

      <div class="section">
        <div class="section-title">Daily Totals</div>
        <div class="totals">
          <div class="total-box">
            <div class="total-value">${log.daily_totals_workers}</div>
            <div class="total-label">Workers</div>
          </div>
          <div class="total-box">
            <div class="total-value">${log.daily_totals_hours}</div>
            <div class="total-label">Hours</div>
          </div>
        </div>
      </div>

      ${log.tasks.length > 0 ? `
      <div class="section">
        <div class="section-title">Activity / Tasks by Company</div>
        <table>
          <tr>
            <th>Company</th>
            <th>Workers</th>
            <th>Hours</th>
            <th>Task Description</th>
            <th>Notes</th>
          </tr>
          ${log.tasks.map(t => `
            <tr>
              <td>${t.company_name || 'N/A'}</td>
              <td>${t.workers}</td>
              <td>${t.hours}</td>
              <td>${t.task_description || '-'}</td>
              <td>${t.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      ${log.pending_issues.length > 0 ? `
      <div class="section">
        <div class="section-title">Pending Issues</div>
        ${log.pending_issues.map(i => `
          <div class="issue ${i.severity === 'High' ? 'issue-high' : ''}">
            <div class="issue-title">${i.title || 'Untitled Issue'}</div>
            ${i.description ? `<div style="margin-bottom: 8px;">${i.description}</div>` : ''}
            <div class="issue-meta">
              <span class="badge badge-${i.severity.toLowerCase()}">${i.severity}</span>
              <span style="margin-left: 8px;">Category: ${i.category}</span>
              ${i.location ? `<span style="margin-left: 8px;">Location: ${i.location}</span>` : ''}
              ${i.assignee ? `<span style="margin-left: 8px;">Assignee: ${i.assignee}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${log.inspection_notes.length > 0 ? `
      <div class="section">
        <div class="section-title">Inspection Notes</div>
        <table>
          <tr>
            <th>Type</th>
            <th>Inspector</th>
            <th>AHJ</th>
            <th>Result</th>
            <th>Notes</th>
            <th>Follow-up</th>
          </tr>
          ${log.inspection_notes.map(n => `
            <tr>
              <td>${n.inspection_type || 'N/A'}</td>
              <td>${n.inspector_name || '-'}</td>
              <td>${n.ahj || '-'}</td>
              <td style="color: ${n.result === 'Pass' ? '#16a34a' : n.result === 'Fail' ? '#dc2626' : '#d97706'}; font-weight: bold;">${n.result}</td>
              <td>${n.notes || '-'}</td>
              <td>${n.follow_up_needed ? 'Yes' : 'No'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      ${log.additional_work.length > 0 ? `
      <div class="section">
        <div class="section-title">Additional Work / Rework</div>
        ${log.additional_work.map(w => `
          <div class="issue">
            <div class="issue-meta" style="margin-bottom: 4px;">
              <span class="badge" style="background: #f3e8ff; color: #7c3aed;">${w.tag.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div>${w.description || 'No description'}</div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      ${log.visitors.length > 0 ? `
      <div class="section">
        <div class="section-title">Visitors</div>
        <table>
          <tr>
            <th>Time</th>
            <th>Name</th>
            <th>Company</th>
            <th>Notes</th>
          </tr>
          ${log.visitors.map(v => `
            <tr>
              <td>${v.time}</td>
              <td>${v.visitor_name || '-'}</td>
              <td>${v.company_name || '-'}</td>
              <td>${v.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      ${log.equipment.length > 0 ? `
      <div class="section">
        <div class="section-title">Equipment</div>
        <table>
          <tr>
            <th>Company</th>
            <th>Equipment</th>
            <th>Notes</th>
          </tr>
          ${log.equipment.map(e => `
            <tr>
              <td>${e.company || '-'}</td>
              <td>${e.equipment || '-'}</td>
              <td>${e.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      ${log.materials.length > 0 ? `
      <div class="section">
        <div class="section-title">Materials</div>
        <table>
          <tr>
            <th>Company</th>
            <th>Material</th>
            <th>Quantity</th>
            <th>Phase Code</th>
            <th>Notes</th>
          </tr>
          ${log.materials.map(m => `
            <tr>
              <td>${m.company || '-'}</td>
              <td>${m.material_name || '-'}</td>
              <td>${m.quantity || '-'}</td>
              <td>${m.phase_code || '-'}</td>
              <td>${m.notes || '-'}</td>
            </tr>
          `).join('')}
        </table>
      </div>
      ` : ''}

      <div class="footer">
        Generated ${format(new Date(), 'MMMM d, yyyy h:mm a')} · Daily Log App
      </div>
    </body>
    </html>
  `;
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const currentLogId = useDailyLogStore((s) => s.currentLogId);
  const dailyLogs = useDailyLogStore((s) => s.dailyLogs);
  const projects = useDailyLogStore((s) => s.projects);
  const currentProjectId = useDailyLogStore((s) => s.currentProjectId);

  const log = dailyLogs.find((l) => l.id === currentLogId);
  const project = projects.find((p) => p.id === currentProjectId);

  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);

  const handleGeneratePdf = async () => {
    if (!log) return;

    setIsGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const html = generatePdfHtml(log, project);
      const { uri } = await Print.printToFileAsync({
        html,
        width: 612,
        height: 792,
      });

      setPdfUri(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('PDF generation error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = async () => {
    if (!log) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const html = generatePdfHtml(log, project);
      await Print.printAsync({ html });
    } catch (error) {
      console.error('Print error:', error);
    }
  };

  const handleShare = async () => {
    if (!pdfUri) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Share Daily Log PDF',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  if (!log) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <Text className="text-gray-500 dark:text-gray-400">No log selected</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View
        className="flex-row items-center px-4 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
        style={{ paddingTop: insets.top + 16 }}
      >
        <Pressable onPress={() => router.back()} className="p-2 mr-2">
          <ArrowLeft size={24} color="#6B7280" />
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900 dark:text-white flex-1">
          Export Daily Log
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-6">
        {/* Preview info */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {format(new Date(log.date), 'EEEE, MMMM d, yyyy')}
          </Text>
          {project && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {project.name}
            </Text>
          )}
          <View className="flex-row mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              {log.tasks.length} tasks · {log.pending_issues.length} issues · {log.inspection_notes.length} inspections
            </Text>
          </View>
        </View>

        {/* Generate PDF */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4">
          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Generate PDF
          </Text>

          {!pdfUri ? (
            <Button
              title={isGenerating ? 'Generating...' : 'Generate PDF'}
              onPress={handleGeneratePdf}
              variant="primary"
              disabled={isGenerating}
              icon={
                isGenerating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <FileText size={20} color="white" />
                )
              }
            />
          ) : (
            <View>
              <View className="flex-row items-center bg-green-100 dark:bg-green-900 rounded-xl px-4 py-3 mb-3">
                <Check size={20} color="#22C55E" />
                <Text className="ml-2 text-green-700 dark:text-green-300 font-medium">
                  PDF Ready
                </Text>
              </View>

              <Button
                title="Share PDF"
                onPress={handleShare}
                variant="primary"
                icon={<Share2 size={20} color="white" />}
              />

              <View className="h-3" />

              <Button
                title="Generate New"
                onPress={() => {
                  setPdfUri(null);
                  handleGeneratePdf();
                }}
                variant="secondary"
              />
            </View>
          )}
        </View>

        {/* Print directly */}
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 mb-4">
          <Text className="text-base font-semibold text-gray-900 dark:text-white mb-3">
            Print
          </Text>
          <Button
            title="Print Document"
            onPress={handlePrint}
            variant="secondary"
            icon={<Printer size={20} color="#4B6F44" />}
          />
        </View>
      </ScrollView>
    </View>
  );
}
