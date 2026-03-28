import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import CompanyInfo from './pages/CompanyInfo';
import VisitTypeSelect from './pages/VisitTypeSelect';
import PumpSetup from './pages/PumpSetup';
import BakimForm from './pages/BakimForm';
import ServisForm from './pages/ServisForm';
import DevreveAlmaForm from './pages/DevreveAlmaForm';
import Layout from './components/Layout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Yukleniyor...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
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
        <Route index element={<CompanyInfo />} />
        <Route path="visit/:visitId/type" element={<VisitTypeSelect />} />
        <Route path="visit/:visitId/pumps" element={<PumpSetup />} />
        <Route path="visit/:visitId/bakim" element={<BakimForm />} />
        <Route path="visit/:visitId/servis" element={<ServisForm />} />
        <Route path="visit/:visitId/devreye-alma" element={<DevreveAlmaForm />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
