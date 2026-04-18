import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  FileText,
  Loader2,
  RefreshCw,
  Calendar,
  User,
  Building2,
} from 'lucide-react';
import { useColorScheme } from '../lib/use-color-scheme';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

interface UserEntry {
  id: string;
  userId: string;
  userName?: string;
  projectName?: string;
  transcriptText?: string;
  createdAt: string;
}

interface FeedbackEntry {
  id: string;
  text: string;
  userId?: string;
  userName?: string;
  timestamp: string;
}

export default function Admin() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'entries' | 'feedback'>('entries');
  const [entries, setEntries] = useState<UserEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin
  const isAdmin = user?.role === 'ADMIN' || user?.email === '***REMOVED***';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try to load from API
      const [entriesData, feedbackData] = await Promise.all([
        api.getAllUserEntries().catch(() => []),
        api.getFeedback().catch(() => []),
      ]);

      setEntries(entriesData);
      setFeedback(feedbackData);

      // Also load local feedback
      const localFeedback = JSON.parse(localStorage.getItem('voice-diary-feedback') || '[]');
      if (localFeedback.length > 0) {
        setFeedback(prev => [...prev, ...localFeedback.map((f: any) => ({
          id: f.id,
          text: f.text || '(Audio feedback - transcription pending)',
          userId: f.userId,
          userName: f.userName,
          timestamp: f.timestamp,
        }))]);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isAdmin) {
    return (
      <div className={`h-full flex flex-col items-center justify-center p-10 ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
        <Users size={64} className={isDark ? 'text-gray-700' : 'text-gray-300'} />
        <h2 className={`mt-5 text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Admin Access Required
        </h2>
        <p className={`mt-2 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          You don't have permission to view this page.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-black' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm safe-area-top`}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className={`p-2 -ml-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            >
              <ArrowLeft size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
            </button>
            <h1 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Admin Dashboard
            </h1>
            <button
              onClick={loadData}
              disabled={isLoading}
              className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
            >
              <RefreshCw size={20} className={`${isDark ? 'text-white' : 'text-gray-900'} ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-4xl mx-auto px-4 flex gap-4">
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'entries'
                ? 'border-primary-600 text-primary-600'
                : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <FileText size={18} />
            User Entries ({entries.length})
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'feedback'
                ? 'border-primary-600 text-primary-600'
                : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <MessageSquare size={18} />
            Feedback ({feedback.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-primary-600" />
            </div>
          ) : error ? (
            <div className={`p-4 rounded-xl text-center ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
              <p className="text-red-600">{error}</p>
              <button
                onClick={loadData}
                className="mt-2 text-sm text-primary-600 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : activeTab === 'entries' ? (
            /* Entries Tab */
            entries.length === 0 ? (
              <div className={`p-8 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                <FileText size={48} className={isDark ? 'mx-auto mb-4 text-gray-700' : 'mx-auto mb-4 text-gray-300'} />
                <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No entries yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-4 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-primary-600" />
                        <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {entry.userName || 'Unknown User'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar size={12} />
                        {formatDate(entry.createdAt)}
                      </div>
                    </div>

                    {entry.projectName && (
                      <div className="flex items-center gap-1 mb-2 text-xs text-gray-500">
                        <Building2 size={12} />
                        {entry.projectName}
                      </div>
                    )}

                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {entry.transcriptText || '(No transcript)'}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Feedback Tab */
            feedback.length === 0 ? (
              <div className={`p-8 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                <MessageSquare size={48} className={isDark ? 'mx-auto mb-4 text-gray-700' : 'mx-auto mb-4 text-gray-300'} />
                <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No feedback yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedback.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-xl ${isDark ? 'bg-purple-900/20' : 'bg-purple-50'}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare size={16} className="text-purple-600" />
                        <span className={`text-sm font-medium ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>
                          {item.userName || 'Anonymous'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar size={12} />
                        {formatDate(item.timestamp)}
                      </div>
                    </div>

                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
