import { useState, useEffect } from 'react';
import {
  X,
  ClipboardCheck,
  Sun,
  Moon,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToolFeedbackStore } from '../lib/tool-feedback-store';
import { TOOL_ISSUE_TYPES, type ToolBrand, type ToolIssueType } from '../lib/types';

interface DailyChecklistProps {
  isDark: boolean;
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  toolBrand: ToolBrand;
  userId?: string;
}

interface CheckState {
  // Start of Day
  toolInspected: boolean;
  batteryCharged: boolean;
  needsRepair: boolean | null;
  accessoriesAvailable: boolean;
  workingAtHeights: boolean;
  lanyardReady: boolean;
  // End of Day
  toolCleaned: boolean;
  toolInspectedEndOfDay: boolean;
  storedProperly: boolean;
  batteryOnCharger: boolean;
  // Issues
  issueTypes: ToolIssueType[];
  otherIssueNote: string;
}

const initialState: CheckState = {
  toolInspected: false,
  batteryCharged: false,
  needsRepair: null,
  accessoriesAvailable: false,
  workingAtHeights: false,
  lanyardReady: false,
  toolCleaned: false,
  toolInspectedEndOfDay: false,
  storedProperly: false,
  batteryOnCharger: false,
  issueTypes: [],
  otherIssueNote: '',
};

export default function DailyChecklist({
  isDark,
  isOpen,
  onClose,
  projectId,
  toolBrand,
  userId,
}: DailyChecklistProps) {
  const { saveDailyCheck, getDailyCheckForToday, updateDailyCheck, addNotification } =
    useToolFeedbackStore();

  const [checkState, setCheckState] = useState<CheckState>(initialState);
  const [expandedSection, setExpandedSection] = useState<'start' | 'end' | 'issues' | null>('start');
  const [existingCheckId, setExistingCheckId] = useState<string | null>(null);

  // Load existing check for today if it exists
  useEffect(() => {
    if (isOpen && projectId && toolBrand) {
      const existing = getDailyCheckForToday(projectId, toolBrand);
      if (existing) {
        setExistingCheckId(existing.id);
        setCheckState({
          toolInspected: existing.toolInspected,
          batteryCharged: existing.batteryCharged,
          needsRepair: existing.needsRepair,
          accessoriesAvailable: existing.accessoriesAvailable,
          workingAtHeights: existing.workingAtHeights,
          lanyardReady: existing.lanyardReady,
          toolCleaned: existing.toolCleaned,
          toolInspectedEndOfDay: existing.toolInspectedEndOfDay,
          storedProperly: existing.storedProperly,
          batteryOnCharger: existing.batteryOnCharger,
          issueTypes: existing.issueTypes,
          otherIssueNote: existing.otherIssueNote || '',
        });
      } else {
        setExistingCheckId(null);
        setCheckState(initialState);
      }
    }
  }, [isOpen, projectId, toolBrand, getDailyCheckForToday]);

  const toggleCheck = (key: keyof CheckState) => {
    if (typeof checkState[key] === 'boolean') {
      setCheckState((prev) => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const toggleRepair = (value: boolean | null) => {
    setCheckState((prev) => ({ ...prev, needsRepair: value }));
  };

  const toggleIssue = (issue: ToolIssueType) => {
    setCheckState((prev) => ({
      ...prev,
      issueTypes: prev.issueTypes.includes(issue)
        ? prev.issueTypes.filter((i) => i !== issue)
        : [...prev.issueTypes, issue],
    }));
  };

  const handleSave = () => {
    const today = new Date().toISOString().split('T')[0];

    if (existingCheckId) {
      updateDailyCheck(existingCheckId, {
        ...checkState,
        otherIssueNote: checkState.otherIssueNote || undefined,
      });
      addNotification('success', 'Checklist updated');
    } else {
      saveDailyCheck({
        projectId,
        toolBrand,
        userId,
        date: today,
        ...checkState,
        otherIssueNote: checkState.otherIssueNote || undefined,
      });
      addNotification('success', 'Checklist saved');
    }
    onClose();
  };

  const toggleSection = (section: 'start' | 'end' | 'issues') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  if (!isOpen) return null;

  const CheckItem = ({
    label,
    checked,
    onToggle,
    indent = false,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
    indent?: boolean;
  }) => (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 w-full py-2.5 px-3 rounded-lg transition-colors ${
        indent ? 'ml-6' : ''
      } ${
        checked
          ? isDark
            ? 'bg-green-900/30'
            : 'bg-green-50'
          : isDark
          ? 'hover:bg-gray-700'
          : 'hover:bg-gray-50'
      }`}
    >
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          checked
            ? 'bg-green-500 border-green-500'
            : isDark
            ? 'border-gray-600'
            : 'border-gray-300'
        }`}
      >
        {checked && <Check size={14} className="text-white" />}
      </div>
      <span
        className={`text-sm ${
          checked
            ? 'text-green-600 dark:text-green-400'
            : isDark
            ? 'text-gray-300'
            : 'text-gray-700'
        }`}
      >
        {label}
      </span>
    </button>
  );

  const SectionHeader = ({
    icon: Icon,
    title,
    section,
    color,
  }: {
    icon: typeof Sun;
    title: string;
    section: 'start' | 'end' | 'issues';
    color: string;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className={`flex items-center justify-between w-full py-3 px-4 rounded-xl transition-colors ${
        isDark ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-100 hover:bg-gray-150'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} className={color} />
        <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {title}
        </span>
      </div>
      {expandedSection === section ? (
        <ChevronUp size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
      ) : (
        <ChevronDown size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
      )}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative w-full sm:max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden ${
          isDark ? 'bg-gray-900' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'border-gray-800' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck size={24} className="text-orange-500" />
            <div>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Daily Tool Checklist
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {toolBrand} - {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2">
            <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          <div className="space-y-4">
            {/* Start of Day Section */}
            <div>
              <SectionHeader
                icon={Sun}
                title="Start of Day"
                section="start"
                color="text-yellow-500"
              />
              {expandedSection === 'start' && (
                <div className="mt-2 space-y-1">
                  <CheckItem
                    label="Tool inspected (Point 1 & 2)"
                    checked={checkState.toolInspected}
                    onToggle={() => toggleCheck('toolInspected')}
                  />
                  <CheckItem
                    label="Battery charged"
                    checked={checkState.batteryCharged}
                    onToggle={() => toggleCheck('batteryCharged')}
                  />

                  {/* Needs Repair - 3-way toggle */}
                  <div className={`py-2.5 px-3 rounded-lg ${isDark ? '' : ''}`}>
                    <p className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Tool needs repair?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleRepair(false)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          checkState.needsRepair === false
                            ? 'bg-green-500 text-white'
                            : isDark
                            ? 'bg-gray-700 text-gray-300'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        No
                      </button>
                      <button
                        onClick={() => toggleRepair(true)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          checkState.needsRepair === true
                            ? 'bg-red-500 text-white'
                            : isDark
                            ? 'bg-gray-700 text-gray-300'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        Yes
                      </button>
                    </div>
                  </div>

                  <CheckItem
                    label="Accessories available"
                    checked={checkState.accessoriesAvailable}
                    onToggle={() => toggleCheck('accessoriesAvailable')}
                  />
                  <CheckItem
                    label="Working at heights"
                    checked={checkState.workingAtHeights}
                    onToggle={() => toggleCheck('workingAtHeights')}
                  />
                  {checkState.workingAtHeights && (
                    <CheckItem
                      label="Tool lanyard ready"
                      checked={checkState.lanyardReady}
                      onToggle={() => toggleCheck('lanyardReady')}
                      indent
                    />
                  )}
                </div>
              )}
            </div>

            {/* End of Day Section */}
            <div>
              <SectionHeader
                icon={Moon}
                title="End of Day"
                section="end"
                color="text-blue-500"
              />
              {expandedSection === 'end' && (
                <div className="mt-2 space-y-1">
                  <CheckItem
                    label="Tool cleaned"
                    checked={checkState.toolCleaned}
                    onToggle={() => toggleCheck('toolCleaned')}
                  />
                  <CheckItem
                    label="Tool inspected"
                    checked={checkState.toolInspectedEndOfDay}
                    onToggle={() => toggleCheck('toolInspectedEndOfDay')}
                  />
                  <CheckItem
                    label="Stored in gang box / designated area"
                    checked={checkState.storedProperly}
                    onToggle={() => toggleCheck('storedProperly')}
                  />
                  <CheckItem
                    label="Battery on charger"
                    checked={checkState.batteryOnCharger}
                    onToggle={() => toggleCheck('batteryOnCharger')}
                  />
                </div>
              )}
            </div>

            {/* Issues Section */}
            <div>
              <SectionHeader
                icon={AlertTriangle}
                title="Issues (if any)"
                section="issues"
                color="text-red-500"
              />
              {expandedSection === 'issues' && (
                <div className="mt-2 space-y-1">
                  {TOOL_ISSUE_TYPES.filter((issue) => issue !== 'Other').map((issue) => (
                    <CheckItem
                      key={issue}
                      label={issue}
                      checked={checkState.issueTypes.includes(issue)}
                      onToggle={() => toggleIssue(issue)}
                    />
                  ))}

                  {/* Other with text input */}
                  <div className="py-2.5 px-3">
                    <CheckItem
                      label="Other"
                      checked={checkState.issueTypes.includes('Other')}
                      onToggle={() => toggleIssue('Other')}
                    />
                    {checkState.issueTypes.includes('Other') && (
                      <input
                        type="text"
                        value={checkState.otherIssueNote}
                        onChange={(e) =>
                          setCheckState((prev) => ({ ...prev, otherIssueNote: e.target.value }))
                        }
                        placeholder="Describe the issue..."
                        className={`w-full mt-2 ml-6 px-3 py-2 rounded-lg text-sm ${
                          isDark
                            ? 'bg-gray-700 text-white placeholder-gray-500'
                            : 'bg-gray-100 text-gray-900 placeholder-gray-400'
                        }`}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}
        >
          <button
            onClick={handleSave}
            className="w-full py-3 rounded-xl font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors"
          >
            {existingCheckId ? 'Update Checklist' : 'Save Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
