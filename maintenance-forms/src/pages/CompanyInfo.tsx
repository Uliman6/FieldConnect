import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { MaintenanceVisit } from '../lib/types';

interface PriorCompany {
  companyName: string;
  locations: string[];
  lastVisit: string;
  visitCount: number;
}

export default function CompanyInfo() {
  const [companyName, setCompanyName] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [priorCompanies, setPriorCompanies] = useState<PriorCompany[]>([]);
  const [showPriorCompanies, setShowPriorCompanies] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<PriorCompany | null>(null);
  const [recentVisits, setRecentVisits] = useState<MaintenanceVisit[]>([]);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);
  const navigate = useNavigate();
  useAuth(); // Ensure user is authenticated

  // Load recent visits and extract unique companies with locations
  const loadRecentVisits = async () => {
    try {
      const visits = await api.listVisits({ limit: 100 });
      setRecentVisits(visits);

      // Extract unique companies with their locations
      const companyMap = new Map<string, PriorCompany>();
      for (const visit of visits) {
        if (!visit.companyName) continue;

        const existing = companyMap.get(visit.companyName);
        if (existing) {
          existing.visitCount++;
          if (visit.createdAt > existing.lastVisit) {
            existing.lastVisit = visit.createdAt;
          }
          // Add unique locations
          if (visit.address && !existing.locations.includes(visit.address)) {
            existing.locations.push(visit.address);
          }
        } else {
          companyMap.set(visit.companyName, {
            companyName: visit.companyName,
            locations: visit.address ? [visit.address] : [],
            lastVisit: visit.createdAt,
            visitCount: 1,
          });
        }
      }

      // Sort by most recent
      const sorted = Array.from(companyMap.values()).sort(
        (a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime()
      );
      setPriorCompanies(sorted);
    } catch (err) {
      console.error('Failed to load recent visits:', err);
    }
  };

  useEffect(() => {
    loadRecentVisits();
  }, []);

  const handleSelectCompany = (company: PriorCompany) => {
    setCompanyName(company.companyName);
    setSelectedCompany(company);
    // If only one location, auto-select it
    if (company.locations.length === 1) {
      setLocation(company.locations[0]);
    } else {
      setLocation('');
    }
    setShowPriorCompanies(false);
  };

  const handleDeleteVisit = async (visitId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation

    if (!confirm('Bu ziyareti silmek istediginizden emin misiniz?')) {
      return;
    }

    setDeletingVisitId(visitId);
    try {
      await api.deleteVisit(visitId);
      // Reload visits
      await loadRecentVisits();
    } catch (err) {
      console.error('Failed to delete visit:', err);
      setError('Ziyaret silinemedi.');
    } finally {
      setDeletingVisitId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError('');

    try {
      // Create a new visit with company info
      const visit = await api.createVisit({
        companyName: companyName.trim() || undefined,
        address: location.trim() || undefined,
      });
      // Navigate to visit type selection
      navigate(`/visit/${visit.id}/type`);
    } catch (err) {
      setError('Ziyaret olusturulamadi. Lutfen tekrar deneyin.');
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getVisitTypeLabel = (visitType: string | null | undefined) => {
    switch (visitType) {
      case 'BAKIM': return 'Bakim';
      case 'SERVIS_SUPERVISORLUK': return 'Servis';
      case 'DEVREYE_ALIM': return 'Devreye Alim';
      default: return 'Tur secilmedi';
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-800">Yeni Ziyaret</h2>
        <p className="text-gray-600 mt-1">Firma ve konum bilgilerini girin</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Prior Companies Section */}
      {priorCompanies.length > 0 && (
        <div className="bg-blue-50 rounded-lg p-3">
          <button
            type="button"
            onClick={() => setShowPriorCompanies(!showPriorCompanies)}
            className="w-full flex items-center justify-between text-blue-700 font-medium"
          >
            <span>Onceki Firmalar ({priorCompanies.length})</span>
            <span className="text-lg">{showPriorCompanies ? '−' : '+'}</span>
          </button>

          {showPriorCompanies && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {priorCompanies.map((company, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectCompany(company)}
                  className={`w-full bg-white rounded-md p-3 text-left border transition-colors ${
                    selectedCompany?.companyName === company.companyName
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                >
                  <div className="font-medium text-gray-800">{company.companyName}</div>
                  {company.locations.length > 0 && (
                    <div className="text-sm text-gray-500">
                      {company.locations.length} konum
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Son ziyaret: {formatDate(company.lastVisit)} • {company.visitCount} ziyaret
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
            Firma Adi
          </label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(e) => {
              setCompanyName(e.target.value);
              setSelectedCompany(null);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Ornek: ABC Sanayi A.S."
          />
        </div>

        {/* Location Selection - show dropdown if company has multiple locations */}
        {selectedCompany && selectedCompany.locations.length > 1 ? (
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Konum Sec
            </label>
            <select
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">-- Konum seciniz --</option>
              {selectedCompany.locations.map((loc, idx) => (
                <option key={idx} value={loc}>{loc}</option>
              ))}
              <option value="__new__">+ Yeni konum ekle</option>
            </select>
          </div>
        ) : null}

        {/* New location input - show if no company selected, company has no locations, or new location selected */}
        {(!selectedCompany || selectedCompany.locations.length === 0 || location === '__new__') && (
          <div>
            <label htmlFor="locationInput" className="block text-sm font-medium text-gray-700 mb-1">
              Konum / Adres
            </label>
            <textarea
              id="locationInput"
              value={location === '__new__' ? '' : location}
              onChange={(e) => setLocation(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Sube adresi veya konum bilgisi"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? 'Kaydediliyor...' : 'Devam Et'}
        </button>
      </form>

      {/* Recent Visits Section */}
      {recentVisits.length > 0 && (
        <div className="border-t pt-4 mt-6">
          <h3 className="font-medium text-gray-700 mb-3">Son Ziyaretler</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentVisits.slice(0, 15).map((visit) => (
              <div
                key={visit.id}
                className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => {
                      if (visit.visitType === 'SERVIS_SUPERVISORLUK') {
                        navigate(`/visit/${visit.id}/servis`);
                      } else if (visit.visitType === 'DEVREYE_ALIM') {
                        navigate(`/visit/${visit.id}/devreye-alma`);
                      } else if (visit.visitType) {
                        navigate(`/visit/${visit.id}/bakim`);
                      } else {
                        navigate(`/visit/${visit.id}/type`);
                      }
                    }}
                  >
                    <div className="font-medium text-gray-800">{visit.companyName || 'Isimsiz'}</div>
                    {visit.address && (
                      <div className="text-xs text-gray-500 truncate">{visit.address}</div>
                    )}
                    <div className="text-sm text-gray-500">{getVisitTypeLabel(visit.visitType)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-400">{formatDate(visit.createdAt)}</div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteVisit(visit.id, e)}
                      disabled={deletingVisitId === visit.id}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
                      title="Sil"
                    >
                      {deletingVisitId === visit.id ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {visit.status && (
                  <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                    visit.status === 'completed' ? 'bg-green-100 text-green-700' :
                    visit.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {visit.status === 'completed' ? 'Tamamlandi' :
                     visit.status === 'in_progress' ? 'Devam ediyor' : 'Taslak'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
