import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useColorScheme } from './lib/use-color-scheme';
import Login from './pages/Login';
import Record from './pages/Record';
import Dashboard from './pages/Dashboard';
import FormFill from './pages/FormFill';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  // Initialize color scheme
  useColorScheme();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Record />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="form-fill" element={<FormFill />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
