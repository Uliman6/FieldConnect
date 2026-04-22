import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Mic, UserPlus, LogIn, Check, X } from 'lucide-react';

// Password validation
const validatePassword = (password: string) => {
  return {
    minLength: password.length >= 12,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const { login, register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Password validation state
  const passwordChecks = useMemo(() => validatePassword(password), [password]);
  const isPasswordValid = useMemo(() => {
    return Object.values(passwordChecks).every(Boolean);
  }, [passwordChecks]);

  // Redirect if already logged in
  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegisterMode) {
      if (!name.trim()) {
        setError('Please enter your name');
        return;
      }
      if (!isPasswordValid) {
        setError('Please meet all password requirements');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isRegisterMode) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err: any) {
      const serverError = err?.response?.data?.error || err?.response?.data?.message;
      if (isRegisterMode) {
        setError(serverError || 'Registration failed. Please try again.');
      } else {
        setError(serverError || 'Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegisterMode(!isRegisterMode);
    setError('');
    setName('');
    setPassword('');
  };

  const PasswordRequirement = ({ met, text }: { met: boolean; text: string }) => (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
      {met ? <Check size={14} /> : <X size={14} />}
      {text}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black px-4 safe-area-top safe-area-bottom">
      <div className="max-w-sm w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Mic size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voice Diary</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {isRegisterMode ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {/* Login/Register Form */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm text-center">
                {error}
              </div>
            )}

            {isRegisterMode && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegisterMode}
                  autoComplete="name"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
                  placeholder="Your name"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base"
                placeholder={isRegisterMode ? 'Create a strong password' : 'Enter your password'}
              />

              {/* Password requirements (only show in register mode when password has content) */}
              {isRegisterMode && password.length > 0 && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Password requirements:</p>
                  <PasswordRequirement met={passwordChecks.minLength} text="At least 12 characters" />
                  <PasswordRequirement met={passwordChecks.hasUppercase} text="One uppercase letter" />
                  <PasswordRequirement met={passwordChecks.hasLowercase} text="One lowercase letter" />
                  <PasswordRequirement met={passwordChecks.hasNumber} text="One number" />
                  <PasswordRequirement met={passwordChecks.hasSpecial} text="One special character (!@#$%^&*)" />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || (isRegisterMode && !isPasswordValid)}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-xl font-semibold hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-base flex items-center justify-center gap-2"
            >
              {isRegisterMode ? (
                <>
                  <UserPlus size={20} />
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </>
              )}
            </button>
          </form>

          {/* Toggle between login and register */}
          <div className="mt-6 text-center">
            <button
              onClick={toggleMode}
              className="text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
            >
              {isRegisterMode
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-gray-500 mt-6">
          {isRegisterMode
            ? 'Your data will be stored securely'
            : 'Use your FieldConnect credentials or create a new account'}
        </p>
      </div>
    </div>
  );
}
