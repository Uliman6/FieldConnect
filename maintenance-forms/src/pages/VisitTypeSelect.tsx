import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { VisitType } from '../lib/types';

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

export default function VisitTypeSelect() {
  const { visitId } = useParams<{ visitId: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSelectType = async (visitType: VisitType) => {
    if (!visitId) return;

    setIsLoading(true);
    setError('');

    try {
      // Update the visit with the selected type
      await api.updateVisit(visitId, { visitType });

      // Navigate based on visit type
      if (visitType === 'SERVIS_SUPERVISORLUK') {
        // Servis visits go directly to Servis Raporu form (no pump setup)
        navigate(`/visit/${visitId}/servis`);
      } else {
        // Bakım and Devreye Alım go to pump setup first
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
        {visitTypes.map((item) => (
          <button
            key={item.type}
            onClick={() => handleSelectType(item.type)}
            disabled={isLoading}
            className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-left hover:border-blue-500 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-semibold text-gray-800">{item.label}</div>
            <div className="text-sm text-gray-600 mt-1">{item.description}</div>
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center text-gray-600">
          Kaydediliyor...
        </div>
      )}
    </div>
  );
}
