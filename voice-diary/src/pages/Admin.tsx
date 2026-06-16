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
  Plus,
  Edit3,
  Trash2,
  X,
  Check,
  Shield,
  Eye,
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

interface ManagedUser {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'EDITOR' | 'VIEWER';
  isActive: boolean;
  createdAt: string;
}

const ROLE_CONFIG = {
  ADMIN: { icon: Shield, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Admin' },
  EDITOR: { icon: Edit3, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Editor' },
  VIEWER: { icon: Eye, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-900/30', label: 'Viewer' },
};

export default function Admin() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'entries' | 'feedback' | 'users'>('users');
  const [entries, setEntries] = useState<UserEntry[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User management state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', name: '', role: 'VIEWER' as 'EDITOR' | 'VIEWER' });
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

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
      const [entriesData, feedbackData, usersData] = await Promise.all([
        api.getAllUserEntries().catch(() => []),
        api.getFeedback().catch(() => []),
        api.getAllUsers().catch(() => []),
      ]);

      setEntries(entriesData);
      setFeedback(feedbackData);
      setUsers(usersData);

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

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password) {
      setUserError('Email and password are required');
      return;
    }

    setIsCreating(true);
    setUserError(null);

    try {
      await api.createUser({
        email: newUser.email,
        password: newUser.password,
        name: newUser.name || undefined,
        role: newUser.role,
      });

      // Reload users
      const usersData = await api.getAllUsers();
      setUsers(usersData);

      setNewUser({ email: '', password: '', name: '', role: 'VIEWER' });
      setShowCreateUser(false);
    } catch (err: any) {
      setUserError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateUser = async (id: string, updates: { role?: string; isActive?: boolean }) => {
    setIsSaving(true);
    try {
      await api.updateUser(id, updates);
      const usersData = await api.getAllUsers();
      setUsers(usersData);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (!confirm(`Delete user "${email}"? This cannot be undone.`)) return;

    try {
      await api.deleteUser(id);
      setUsers(users.filter((u) => u.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete user');
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
        <div className="max-w-4xl mx-auto px-4 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-primary-600 text-primary-600'
                : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <Users size={18} />
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('entries')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === 'entries'
                ? 'border-primary-600 text-primary-600'
                : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <FileText size={18} />
            Entries ({entries.length})
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
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
          ) : activeTab === 'users' ? (
            /* Users Tab */
            <div>
              {/* Create User Button */}
              <button
                onClick={() => setShowCreateUser(true)}
                className={`w-full flex items-center justify-center gap-2 p-4 rounded-xl mb-4 border border-dashed ${
                  isDark ? 'border-gray-700 hover:border-primary-500' : 'border-gray-300 hover:border-primary-500'
                } transition-colors`}
              >
                <Plus size={20} className="text-primary-600" />
                <span className="text-primary-600 font-medium">Create New User</span>
              </button>

              {users.length === 0 ? (
                <div className={`p-8 rounded-xl text-center ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                  <Users size={48} className={isDark ? 'mx-auto mb-4 text-gray-700' : 'mx-auto mb-4 text-gray-300'} />
                  <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No users yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => {
                    const roleConfig = ROLE_CONFIG[u.role];
                    const RoleIcon = roleConfig.icon;
                    const isCurrentUser = u.id === user?.id;

                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm ${
                          !u.isActive ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${roleConfig.bg}`}>
                              <RoleIcon size={18} className={roleConfig.color} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  {u.name || u.email}
                                </span>
                                {isCurrentUser && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400">
                                    You
                                  </span>
                                )}
                                {!u.isActive && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {u.email}
                              </p>
                              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {roleConfig.label} · Joined {formatDate(u.createdAt)}
                              </p>
                            </div>
                          </div>

                          {!isCurrentUser && (
                            <div className="flex items-center gap-1">
                              {/* Role Toggle Buttons */}
                              {u.role !== 'ADMIN' && (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })}
                                  disabled={isSaving}
                                  className={`text-xs px-2 py-1 rounded-lg ${
                                    isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                  }`}
                                >
                                  <option value="VIEWER">Viewer</option>
                                  <option value="EDITOR">Editor</option>
                                </select>
                              )}

                              {/* Active/Inactive Toggle */}
                              <button
                                onClick={() => handleUpdateUser(u.id, { isActive: !u.isActive })}
                                disabled={isSaving}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.isActive
                                    ? 'text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30'
                                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                }`}
                                title={u.isActive ? 'Deactivate user' : 'Activate user'}
                              >
                                {u.isActive ? <Check size={16} /> : <X size={16} />}
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                                title="Delete user"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreateUser(false)} />
          <div className={`relative w-full max-w-md mx-4 rounded-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-xl`}>
            <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Create New User</h2>
              <button onClick={() => { setShowCreateUser(false); setUserError(null); }} className="p-2">
                <X size={24} className={isDark ? 'text-white' : 'text-gray-900'} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {userError && (
                <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm">
                  {userError}
                </div>
              )}

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Email *
                </label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                  className={`w-full px-4 py-3 rounded-lg ${
                    isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Password *
                </label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Min 12 chars, upper, lower, number, special"
                  className={`w-full px-4 py-3 rounded-lg ${
                    isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Name
                </label>
                <input
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="John Doe"
                  className={`w-full px-4 py-3 rounded-lg ${
                    isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Role
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'EDITOR' | 'VIEWER' })}
                  className={`w-full px-4 py-3 rounded-lg ${
                    isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <option value="VIEWER">Viewer - Can view data</option>
                  <option value="EDITOR">Editor - Can view and edit data</option>
                </select>
              </div>
            </div>

            <div className={`p-4 border-t ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCreateUser(false); setUserError(null); }}
                  className={`flex-1 py-3 rounded-lg font-medium ${
                    isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={isCreating}
                  className="flex-1 py-3 rounded-lg font-medium bg-primary-600 text-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create User'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
