import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { VisitType, MaintenanceVisit } from '../lib/types';

const visitTypes: { type: VisitType; label: string; description: string }[] = [
  {
    type: 'BAKIM',
    label: 'Bakim',
    description: 'Periyodik bakim ziyareti',
  },
  {
    type: 'SERVIS_SUPERVISORLUK',
    label: 'Servis & Supervizorluk',
    description: 'Servis ve denetim ziyareti',
  },
  {
    type: 'DEVREYE_ALIM',
    label: 'Devreye Alim',
    description: 'Sistem devreye alma ziyareti',
  },
];

const STATUS_LABELS: Record<MaintenanceVisit['status'], { label: string; className: string }> = {
  completed: { label: 'Tamamlandı', className: 'bg-green-100 text-green-700' },
  in_progress: { label: 'Devam Ediyor', className: 'bg-yellow-100 text-yellow-700' },
  draft: { label: 'Taslak', className: 'bg-gray-100 text-gray-500' },
};

export default function VisitTypeSelect() {
  const { visitId } = useParams<{ visitId: string }>();
  const { state } = useLocation() as { state?: { companyName?: string; address?: string } };
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Map from visitType → most recent prior visit status for this company
  const [priorStatuses, setPriorStatuses] = useState<Partial<Record<VisitType, MaintenanceVisit['status']>>>({});

  useEffect(() => {
    async function loadPriorVisits() {
      try {
        // Get companyName: prefer nav state, fallback to fetching the visit
        let companyName = state?.companyName;
        if (!companyName && visitId) {
          const visit = await api.getVisit(visitId);
          companyName = visit.companyName || undefined;
        }
        if (!companyName) return;

        const allVisits = await api.listVisits({ limit: 100 });
        // Prior visits for same company, excluding the current new visit
        const sameCompany = allVisits.filter(
          v => v.companyName === companyName && v.id !== visitId && v.visitType
        );

        // For each visit type, find most recent visit and take its status
        const map: Partial<Record<VisitType, MaintenanceVisit['status']>> = {};
        for (const v of sameCompany) {
          if (!v.visitType) continue;
          const existing = map[v.visitType];
          if (!existing) {
            map[v.visitType] = v.status;
          }
          // listVisits returns sorted by most recent first, so first match wins
        }
        setPriorStatuses(map);
      } catch {
        // Non-critical — silently ignore
      }
    }
    loadPriorVisits();
  }, [visitId, state?.companyName]);

  const handleSelectType = async (visitType: VisitType) => {
    if (!visitId) return;

    setIsLoading(true);
    setError('');

    try {
      await api.updateVisit(visitId, { visitType });

      if (visitType === 'SERVIS_SUPERVISORLUK') {
        navigate(`/visit/${visitId}/servis`);
      } else {
        navigate(`/visit/${visitId}/pumps`);
      }
    } catch (err) {
      setError('Ziyaret tipi kaydedilemedi. Lutfen tekrar deneyin.');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Geri
        </button>
        <h2 className="text-xl font-semibold text-gray-800">Ziyaret Turu</h2>
        <div className="w-16" />
      </div>

      <p className="text-center text-gray-600">Yapacaginiz ziyaret turunu secin</p>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {visitTypes.map((item) => {
          const prior = priorStatuses[item.type];
          const statusInfo = prior ? STATUS_LABELS[prior] : null;
          return (
            <button
              key={item.type}
              onClick={() => handleSelectType(item.type)}
              disabled={isLoading}
              className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:border-blue-500 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-800">{item.label}</div>
                {statusInfo && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.className}`}>
                    {statusInfo.label}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-600 mt-1">{item.description}</div>
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="text-center text-gray-600">
          Kaydediliyor...
        </div>
      )}
    </div>
  );
}
