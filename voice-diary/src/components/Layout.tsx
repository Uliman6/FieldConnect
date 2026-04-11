import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Mic, LayoutDashboard, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useThemeToggle } from '../lib/use-color-scheme';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { colorScheme, toggleTheme } = useThemeToggle();
  const isDark = colorScheme === 'dark';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className={`h-full min-h-screen flex flex-col ${isDark ? 'bg-black' : 'bg-gray-100'}`}>
      {/* Header */}
      <header className={`${isDark ? 'bg-gray-900' : 'bg-white'} shadow-sm safe-area-top`}>
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Voice Diary
          </h1>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} hidden sm:block`}>
              {user?.name || user?.email}
            </span>
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-colors`}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <Sun size={20} className="text-yellow-400" />
              ) : (
                <Moon size={20} className="text-gray-600" />
              )}
            </button>
            <button
              onClick={handleLogout}
              className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-colors`}
              title="Logout"
            >
              <LogOut size={20} className={isDark ? 'text-gray-400' : 'text-gray-600'} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-lg mx-auto h-full">
          <Outlet />
        </div>
      </main>

      {/* Bottom Tab Navigation - Mobile Friendly */}
      <nav className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} border-t safe-area-bottom`}>
        <div className="max-w-lg mx-auto flex">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 px-4 transition-colors ${
                isActive
                  ? 'text-primary-600'
                  : isDark
                  ? 'text-gray-500 hover:text-gray-300'
                  : 'text-gray-500 hover:text-gray-700'
              }`
            }
          >
            <Mic size={24} />
            <span className="text-xs mt-1 font-medium">Record</span>
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center py-3 px-4 transition-colors ${
                isActive
                  ? 'text-primary-600'
                  : isDark
                  ? 'text-gray-500 hover:text-gray-300'
                  : 'text-gray-500 hover:text-gray-700'
              }`
            }
          >
            <LayoutDashboard size={24} />
            <span className="text-xs mt-1 font-medium">Dashboard</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
