import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { MaintenanceVisit, PumpModel, PumpType } from '../lib/types';

// Equipment types for OCR
type EquipmentType = 'fire_pump' | 'fire_pump_controller' | 'diesel_engine';

// Component field definitions
const COMPONENT_DEFINITIONS = {
  pompa: {
    name: 'Pompa Etiket Bilgileri',
    fields: [
      { key: 'brand', label: 'Markası/Brand', type: 'text', required: true },
      { key: 'model', label: 'Modeli/Tipi/Type', type: 'text', required: true },
      { key: 'serialNumber', label: 'Seri/Üretim No', type: 'text', required: true },
      { key: 'manufacturingYear', label: 'İmalat Yılı', type: 'text', required: false },
      { key: 'capacity', label: 'Kapasitesi (%100 GPM)', type: 'text', required: true },
      { key: 'rpm', label: 'Devir/RPM', type: 'text', required: true },
      { key: 'pressure0', label: 'Etiket Basıncı %0', type: 'text', unit: 'PSI', required: true },
      { key: 'pressure100', label: 'Etiket Basıncı %100', type: 'text', unit: 'PSI', required: true },
      { key: 'pressure150', label: 'Etiket Basıncı %150', type: 'text', unit: 'PSI', required: true },
    ],
  },
  kontrolPaneli: {
    name: 'Kontrol Paneli Etiket Bilgileri',
    fields: [
      { key: 'brand', label: 'Markası/Brand', type: 'text', required: true },
      { key: 'model', label: 'Modeli/Tipi/Type', type: 'text', required: true },
      { key: 'serialNumber', label: 'Seri/Üretim No', type: 'text', required: true },
      { key: 'manufacturingYear', label: 'İmalat Yılı', type: 'text', required: false },
    ],
  },
  surucu: {
    name: 'Sürücü Bilgileri',
    fields: [
      { key: 'model', label: 'Model', type: 'text', required: true },
      { key: 'serialNumber', label: 'Üretici Seri No', type: 'text', required: true },
      { key: 'manufacturingYear', label: 'İmalat Yılı', type: 'text', required: false },
      { key: 'power', label: 'Sürücü Gücü', type: 'text', required: true },
    ],
  },
};

type ComponentType = keyof typeof COMPONENT_DEFINITIONS;

// Collapsible Section Component
function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
  badge,
  variant = 'default',
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
  variant?: 'default' | 'primary' | 'secondary';
}) {
  const bgColors = {
    default: 'bg-gray-50 hover:bg-gray-100',
    primary: 'bg-blue-50 hover:bg-blue-100',
    secondary: 'bg-green-50 hover:bg-green-100',
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full px-4 py-3 ${bgColors[variant]} flex items-center justify-between transition-colors`}
      >
        <div className="flex items-center gap-2">
          <span className={`transform transition-transform text-sm ${isOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="font-medium text-gray-700">{title}</span>
          {badge && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
      </button>
      {isOpen && <div className="p-4 bg-white">{children}</div>}
    </div>
  );
}

// OCR Status type
type OcrStatus = 'idle' | 'capturing' | 'processing' | 'done' | 'error';

// OCR Capture Button - captures photo and extracts label data
function OCRCaptureButton({
  onFill,
  equipmentType,
  fieldsToExtract,
  onPhotoCapture,
}: {
  onFill: (data: Record<string, string>, photo?: string) => void;
  equipmentType: EquipmentType;
  fieldsToExtract: string[];
  onPhotoCapture?: (photo: string | null) => void;
}) {
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('processing');
    setError(null);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data:image/...;base64, prefix
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Store photo with data URI prefix for display
      const photoWithPrefix = `data:image/jpeg;base64,${base64}`;
      if (onPhotoCapture) {
        onPhotoCapture(photoWithPrefix);
      }

      // Call OCR API
      const result = await api.extractNameplateOcr({
        imageBase64: base64,
        equipmentType,
        fieldsToExtract,
      });

      if (result.success && result.extractedData) {
        // Map extracted data to our field keys
        const mappedData: Record<string, string> = {};
        Object.entries(result.extractedData).forEach(([key, value]) => {
          if (value) {
            // Convert API field names to our field keys
            const fieldKey = mapOcrFieldToKey(key);
            if (fieldKey) {
              mappedData[fieldKey] = value;
            }
          }
        });
        onFill(mappedData, photoWithPrefix);
        setStatus('done');
      } else {
        setError('Etiket okunamadı. Manuel giriş yapabilirsiniz.');
        setStatus('error');
      }
    } catch (err) {
      console.error('OCR error:', err);
      setError('OCR hatası. Lütfen tekrar deneyin.');
      setStatus('error');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Map OCR API field names to our component field keys
  const mapOcrFieldToKey = (ocrField: string): string | null => {
    const mapping: Record<string, string> = {
      // Common fields (returned by all equipment types)
      'brand': 'brand',
      'manufacturer': 'brand',
      'model': 'model',
      'serial_number': 'serialNumber',
      'manufacturing_year': 'manufacturingYear',
      'year': 'manufacturingYear',

      // Pump-specific fields
      'capacity_gpm': 'capacity',
      'gpm': 'capacity',
      'capacity': 'capacity',
      'rpm': 'rpm',
      'head_feet': 'head', // Could add to form if needed

      // Pressure fields - mapped from OCR
      // MAX. PRESS → pressure0 (0% / shutoff)
      // GPM AT [PSI] → pressure100 (100% / rated)
      // PSI AT 150% → pressure150 (150% / overload)
      'pressure_0': 'pressure0',
      'pressure_100': 'pressure100',
      'pressure_150': 'pressure150',

      // Controller-specific fields (Cat. No. maps to model)
      'catalog_no': 'model',
      'cat_no': 'model',

      // Driver/Engine-specific fields
      'horsepower': 'power',
      'bhp': 'power',
      'hp': 'power',
      'power': 'power',
      'engine_bhp': 'power',
      'engine_rpm': 'rpm',
    };
    return mapping[ocrField.toLowerCase()] || null;
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        type="button"
        onClick={handleCapture}
        disabled={status === 'processing'}
        className={`text-sm flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors ${
          status === 'processing'
            ? 'bg-gray-100 text-gray-400 cursor-wait'
            : status === 'done'
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : status === 'error'
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        }`}
      >
        {status === 'processing' ? (
          <>
            <span className="animate-spin">⏳</span> OCR işleniyor...
          </>
        ) : status === 'done' ? (
          <>
            <span>✓</span> Tekrar çek
          </>
        ) : (
          <>
            <span>📷</span> Etiketten Oku (OCR)
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}

// Component Fields
function ComponentFieldsForm({
  componentType,
  data,
  onChange,
}: {
  componentType: ComponentType;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const definition = COMPONENT_DEFINITIONS[componentType];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {definition.fields.map((field) => {
        const fieldUnit = 'unit' in field ? field.unit : undefined;

        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              {field.label}
            </label>
            <div className="flex">
              <input
                type={field.type}
                value={data[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm border-gray-300 ${fieldUnit ? 'rounded-r-none' : ''}`}
                placeholder={field.label}
              />
              {fieldUnit && (
                <span className="px-2 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-sm text-gray-600">
                  {fieldUnit}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Map component type to equipment type for OCR
const COMPONENT_EQUIPMENT_TYPE: Record<ComponentType, EquipmentType> = {
  pompa: 'fire_pump',
  kontrolPaneli: 'fire_pump_controller',
  surucu: 'diesel_engine',
};

// Get fields to extract for each component type
const getFieldsToExtract = (componentType: ComponentType): string[] => {
  switch (componentType) {
    case 'pompa':
      return ['manufacturer', 'model', 'serial_number', 'year', 'capacity', 'rpm', 'pressure_shutoff', 'pressure_rated', 'pressure_max'];
    case 'kontrolPaneli':
      return ['manufacturer', 'model', 'serial_number', 'year'];
    case 'surucu':
      return ['manufacturer', 'model', 'serial_number', 'year', 'horsepower'];
    default:
      return [];
  }
};

// Photo Modal for viewing OCR captured photos
function PhotoModal({
  isOpen,
  onClose,
  photoUrl,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  photoUrl: string | null;
  title: string;
}) {
  if (!isOpen || !photoUrl) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh] w-full">
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl font-bold"
        >
          ✕
        </button>
        <p className="text-white text-center mb-2">{title}</p>
        <img
          src={photoUrl}
          alt={title}
          className="max-w-full max-h-[80vh] mx-auto object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

// Single Component Section - always shows fields, with optional OCR capture
function ComponentSection({
  componentType,
  data,
  onChange,
  onBulkChange,
  isFirst,
  showValidation = false,
  ocrPhoto,
  onOcrPhotoChange,
  labelPhotos = [],
  onLabelPhotosChange,
}: {
  componentType: ComponentType;
  data: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onBulkChange: (updates: Record<string, string>) => void;
  isFirst: boolean;
  showValidation?: boolean;
  ocrPhoto?: string | null;
  onOcrPhotoChange?: (photo: string | null) => void;
  labelPhotos?: string[];
  onLabelPhotosChange?: (photos: string[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(isFirst);
  const [viewingPhoto, setViewingPhoto] = useState<{ url: string; title: string } | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const definition = COMPONENT_DEFINITIONS[componentType];
  void showValidation; // Reserved for future validation

  const _filledCount = Object.values(data).filter((v) => v && v.trim()).length;
  void _filledCount; // Reserved for future validation
  const requiredCount = definition.fields.filter((f) => f.required).length;
  const filledRequiredCount = definition.fields.filter(
    (f) => f.required && data[f.key] && data[f.key].trim()
  ).length;
  const badge = filledRequiredCount > 0 ? `${filledRequiredCount}/${requiredCount}` : undefined;

  // Handler for OCR fill - populates multiple fields at once and stores photo
  const handleOCRFill = (ocrData: Record<string, string>, photo?: string) => {
    onBulkChange(ocrData);
    if (photo && onOcrPhotoChange) {
      onOcrPhotoChange(photo);
    }
  };

  // Handle adding label photos
  const handleLabelPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onLabelPhotosChange) return;

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    onLabelPhotosChange([...labelPhotos, base64]);

    if (labelInputRef.current) {
      labelInputRef.current.value = '';
    }
  };

  const removeLabelPhoto = (index: number) => {
    if (onLabelPhotosChange) {
      onLabelPhotosChange(labelPhotos.filter((_, i) => i !== index));
    }
  };

  return (
    <>
      <PhotoModal
        isOpen={!!viewingPhoto}
        onClose={() => setViewingPhoto(null)}
        photoUrl={viewingPhoto?.url || null}
        title={viewingPhoto?.title || ''}
      />
      <CollapsibleSection
        title={definition.name}
        isOpen={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        badge={badge}
        variant="secondary"
      >
        <div className="space-y-4">
          {/* OCR capture option at top */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {ocrPhoto && (
                <button
                  type="button"
                  onClick={() => setViewingPhoto({ url: ocrPhoto, title: `${definition.name} - OCR Fotoğrafı` })}
                  className="relative w-12 h-12 rounded border-2 border-green-400 overflow-hidden hover:border-green-600 transition-colors"
                >
                  <img src={ocrPhoto} alt="OCR" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center transition-all">
                    <span className="text-white text-xs opacity-0 hover:opacity-100">🔍</span>
                  </div>
                </button>
              )}
            </div>
            <OCRCaptureButton
              onFill={handleOCRFill}
              equipmentType={COMPONENT_EQUIPMENT_TYPE[componentType]}
              fieldsToExtract={getFieldsToExtract(componentType)}
              onPhotoCapture={onOcrPhotoChange}
            />
          </div>

          {/* Always show editable fields */}
          <ComponentFieldsForm
            componentType={componentType}
            data={data}
            onChange={onChange}
          />

          {/* Separate Label Photos Section */}
          {onLabelPhotosChange && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-600">
                  Etiket Fotoğrafları
                </label>
                <input
                  ref={labelInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleLabelPhotoCapture}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => labelInputRef.current?.click()}
                  className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-200 flex items-center gap-1"
                >
                  <span>📷</span> Fotoğraf Ekle
                </button>
              </div>
              {labelPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {labelPhotos.map((photo, idx) => (
                    <div key={idx} className="relative group">
                      <button
                        type="button"
                        onClick={() => setViewingPhoto({ url: photo, title: `${definition.name} - Etiket #${idx + 1}` })}
                        className="w-16 h-16 rounded border border-gray-300 overflow-hidden hover:border-blue-400 transition-colors"
                      >
                        <img src={photo} alt={`Etiket ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLabelPhoto(idx)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {labelPhotos.length === 0 && (
                <p className="text-xs text-gray-400">Etiket fotoğrafı eklenmedi</p>
              )}
            </div>
          )}
        </div>
      </CollapsibleSection>
    </>
  );
}

// Photo data structure for components
interface ComponentPhotos {
  ocrPhoto: string | null;
  labelPhotos: string[];
}

// Pump data structure
interface PumpComponentData {
  pompa: Record<string, string>;
  kontrolPaneli: Record<string, string>;
  surucu: Record<string, string>;
}

interface PumpPhotoData {
  pompa: ComponentPhotos;
  kontrolPaneli: ComponentPhotos;
  surucu: ComponentPhotos;
}

interface PumpData {
  id?: string;
  pumpModel: PumpModel | null;
  pumpType: PumpType | null;
  components: PumpComponentData;
  photos: PumpPhotoData;
}

const createEmptyComponentPhotos = (): ComponentPhotos => ({
  ocrPhoto: null,
  labelPhotos: [],
});

const createEmptyComponents = (): PumpComponentData => ({
  pompa: {},
  kontrolPaneli: {},
  surucu: {},
});

const createEmptyPhotos = (): PumpPhotoData => ({
  pompa: createEmptyComponentPhotos(),
  kontrolPaneli: createEmptyComponentPhotos(),
  surucu: createEmptyComponentPhotos(),
});

// Pump Card
function PumpCard({
  index,
  data,
  onChange,
  onRemove,
  canRemove,
  showValidation = false,
}: {
  index: number;
  data: PumpData;
  onChange: (data: PumpData) => void;
  onRemove: () => void;
  canRemove: boolean;
  showValidation?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(index === 0);

  const modelLabel = data.pumpModel === 'VERTICAL' ? 'Vertical' : data.pumpModel === 'HORIZONTAL' ? 'Horizontal' : '';
  const typeLabel = data.pumpType === 'ELEKTRIKLI' ? 'Elektrikli' : data.pumpType === 'DIZEL' ? 'Dizel' : '';
  const pumpLabel = `${modelLabel} ${typeLabel} Pompa #${index + 1}`.trim();

  // Ensure photos object exists
  const photos = data.photos || createEmptyPhotos();

  return (
    <div className="border-2 border-blue-200 rounded-lg overflow-hidden">
      <div
        className="px-4 py-3 bg-blue-50 flex items-center justify-between cursor-pointer hover:bg-blue-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`transform transition-transform text-sm ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="font-semibold text-gray-800">{pumpLabel}</span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-red-500 hover:text-red-600 text-sm px-2"
          >
            Sil
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          <ComponentSection
            componentType="pompa"
            data={data.components.pompa}
            onChange={(key, value) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  pompa: { ...data.components.pompa, [key]: value },
                },
              });
            }}
            onBulkChange={(updates) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  pompa: { ...data.components.pompa, ...updates },
                },
              });
            }}
            isFirst={true}
            showValidation={showValidation}
            ocrPhoto={photos.pompa.ocrPhoto}
            onOcrPhotoChange={(photo) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  pompa: { ...photos.pompa, ocrPhoto: photo },
                },
              });
            }}
            labelPhotos={photos.pompa.labelPhotos}
            onLabelPhotosChange={(labelPhotos) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  pompa: { ...photos.pompa, labelPhotos },
                },
              });
            }}
          />
          <ComponentSection
            componentType="kontrolPaneli"
            data={data.components.kontrolPaneli}
            onChange={(key, value) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  kontrolPaneli: { ...data.components.kontrolPaneli, [key]: value },
                },
              });
            }}
            onBulkChange={(updates) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  kontrolPaneli: { ...data.components.kontrolPaneli, ...updates },
                },
              });
            }}
            isFirst={false}
            showValidation={showValidation}
            ocrPhoto={photos.kontrolPaneli.ocrPhoto}
            onOcrPhotoChange={(photo) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  kontrolPaneli: { ...photos.kontrolPaneli, ocrPhoto: photo },
                },
              });
            }}
            labelPhotos={photos.kontrolPaneli.labelPhotos}
            onLabelPhotosChange={(labelPhotos) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  kontrolPaneli: { ...photos.kontrolPaneli, labelPhotos },
                },
              });
            }}
          />
          <ComponentSection
            componentType="surucu"
            data={data.components.surucu}
            onChange={(key, value) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  surucu: { ...data.components.surucu, [key]: value },
                },
              });
            }}
            onBulkChange={(updates) => {
              onChange({
                ...data,
                components: {
                  ...data.components,
                  surucu: { ...data.components.surucu, ...updates },
                },
              });
            }}
            isFirst={false}
            showValidation={showValidation}
            ocrPhoto={photos.surucu.ocrPhoto}
            onOcrPhotoChange={(photo) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  surucu: { ...photos.surucu, ocrPhoto: photo },
                },
              });
            }}
            labelPhotos={photos.surucu.labelPhotos}
            onLabelPhotosChange={(labelPhotos) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  surucu: { ...photos.surucu, labelPhotos },
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

// Jockey Pump data structure
interface JockeyPumpPhotos {
  pompa: ComponentPhotos;
  kontrolPaneli: ComponentPhotos;
}

interface JockeyPumpData {
  id?: string;
  pompa: Record<string, string>;
  kontrolPaneli: Record<string, string>;
  photos: JockeyPumpPhotos;
}

const createEmptyJockeyPhotos = (): JockeyPumpPhotos => ({
  pompa: createEmptyComponentPhotos(),
  kontrolPaneli: createEmptyComponentPhotos(),
});

const createEmptyJockeyComponents = (): JockeyPumpData => ({
  pompa: {},
  kontrolPaneli: {},
  photos: createEmptyJockeyPhotos(),
});

// Jockey Pump Card - with Pompa and Kontrol Paneli sections
function JockeyPumpCard({
  index,
  data,
  onChange,
  onRemove,
  canRemove,
  showValidation = false,
}: {
  index: number;
  data: JockeyPumpData;
  onChange: (data: JockeyPumpData) => void;
  onRemove: () => void;
  canRemove: boolean;
  showValidation?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(index === 0);

  // Ensure photos object exists
  const photos = data.photos || createEmptyJockeyPhotos();

  return (
    <div className="border-2 border-orange-200 rounded-lg overflow-hidden">
      <div
        className="px-4 py-3 bg-orange-50 flex items-center justify-between cursor-pointer hover:bg-orange-100 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`transform transition-transform text-sm ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="font-semibold text-gray-800">Jockey Pompa #{index + 1}</span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-red-500 hover:text-red-600 text-sm px-2"
          >
            Sil
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 space-y-3 bg-white">
          {/* Pompa section for Jockey */}
          <ComponentSection
            componentType="pompa"
            data={data.pompa}
            onChange={(key, value) => {
              onChange({
                ...data,
                pompa: { ...data.pompa, [key]: value },
              });
            }}
            onBulkChange={(updates) => {
              onChange({
                ...data,
                pompa: { ...data.pompa, ...updates },
              });
            }}
            isFirst={true}
            showValidation={showValidation}
            ocrPhoto={photos.pompa.ocrPhoto}
            onOcrPhotoChange={(photo) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  pompa: { ...photos.pompa, ocrPhoto: photo },
                },
              });
            }}
            labelPhotos={photos.pompa.labelPhotos}
            onLabelPhotosChange={(labelPhotos) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  pompa: { ...photos.pompa, labelPhotos },
                },
              });
            }}
          />
          {/* Kontrol Paneli section for Jockey */}
          <ComponentSection
            componentType="kontrolPaneli"
            data={data.kontrolPaneli}
            onChange={(key, value) => {
              onChange({
                ...data,
                kontrolPaneli: { ...data.kontrolPaneli, [key]: value },
              });
            }}
            onBulkChange={(updates) => {
              onChange({
                ...data,
                kontrolPaneli: { ...data.kontrolPaneli, ...updates },
              });
            }}
            isFirst={false}
            showValidation={showValidation}
            ocrPhoto={photos.kontrolPaneli.ocrPhoto}
            onOcrPhotoChange={(photo) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  kontrolPaneli: { ...photos.kontrolPaneli, ocrPhoto: photo },
                },
              });
            }}
            labelPhotos={photos.kontrolPaneli.labelPhotos}
            onLabelPhotosChange={(labelPhotos) => {
              onChange({
                ...data,
                photos: {
                  ...photos,
                  kontrolPaneli: { ...photos.kontrolPaneli, labelPhotos },
                },
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

// Main Page
export default function PumpSetup() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<MaintenanceVisit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Configuration state
  const [selectedModel, setSelectedModel] = useState<PumpModel | null>(null);
  const [selectedType, setSelectedType] = useState<PumpType | null>(null);
  const [pumpCount, setPumpCount] = useState(1);
  const [pumps, setPumps] = useState<PumpData[]>([]);
  const [configExpanded, setConfigExpanded] = useState(true);
  const [pumpsExpanded, setPumpsExpanded] = useState(false);

  // Jockey pump state
  const [hasJockey, setHasJockey] = useState(false);
  const [jockeyCount, setJockeyCount] = useState(1);
  const [jockeyPumps, setJockeyPumps] = useState<JockeyPumpData[]>([]);
  const [jockeyExpanded, setJockeyExpanded] = useState(false);

  // Validation state
  const [showValidation, setShowValidation] = useState(false);

  // Load visit data and hydrate existing pumps
  useEffect(() => {
    if (!visitId) return;
    const loadVisit = async () => {
      try {
        const data = await api.getVisit(visitId);
        setVisit(data);

        // Hydrate existing pumps from database
        if (data.pumps && data.pumps.length > 0) {
          const mainPumps: PumpData[] = [];
          const jockeyPumpsList: JockeyPumpData[] = [];

          for (const dbPump of data.pumps) {
            // Convert component data from database to our format
            const componentData: PumpComponentData = createEmptyComponents();

            if (dbPump.components) {
              for (const comp of dbPump.components) {
                const compData = (comp.componentData || {}) as Record<string, string>;
                if (comp.componentType === 'pompa') {
                  componentData.pompa = {
                    brand: comp.brand || compData.brand || '',
                    model: comp.modelNumber || compData.model || '',
                    serialNumber: comp.serialNumber || compData.serialNumber || '',
                    manufacturingYear: compData.manufacturingYear || '',
                    capacity: compData.capacity || '',
                    rpm: compData.rpm || '',
                    pressure0: compData.pressure0 || '',
                    pressure100: compData.pressure100 || '',
                    pressure150: compData.pressure150 || '',
                  };
                } else if (comp.componentType === 'kontrolPaneli') {
                  componentData.kontrolPaneli = {
                    brand: comp.brand || compData.brand || '',
                    model: comp.modelNumber || compData.model || '',
                    serialNumber: comp.serialNumber || compData.serialNumber || '',
                    manufacturingYear: compData.manufacturingYear || '',
                  };
                } else if (comp.componentType === 'surucu') {
                  componentData.surucu = {
                    model: comp.modelNumber || compData.model || '',
                    serialNumber: comp.serialNumber || compData.serialNumber || '',
                    manufacturingYear: compData.manufacturingYear || '',
                    power: compData.power || '',
                  };
                }
              }
            }

            if (dbPump.pumpCategory === 'MAIN') {
              mainPumps.push({
                id: dbPump.id,
                pumpModel: dbPump.pumpModel,
                pumpType: dbPump.pumpType,
                components: componentData,
                photos: createEmptyPhotos(), // Photos are stored separately, will be hydrated if we implement photo storage
              });
            } else if (dbPump.pumpCategory === 'JOCKEY') {
              // For jockey pumps, extract pompa and kontrolPaneli
              jockeyPumpsList.push({
                id: dbPump.id,
                pompa: componentData.pompa,
                kontrolPaneli: componentData.kontrolPaneli,
                photos: createEmptyJockeyPhotos(),
              });
            }
          }

          if (mainPumps.length > 0) {
            setPumps(mainPumps);
            setSelectedModel(mainPumps[0].pumpModel);
            setSelectedType(mainPumps[0].pumpType);
            setPumpCount(mainPumps.length);
            setConfigExpanded(false);
            setPumpsExpanded(true);
          }

          if (jockeyPumpsList.length > 0) {
            setJockeyPumps(jockeyPumpsList);
            setJockeyCount(jockeyPumpsList.length);
            setHasJockey(true);
            setJockeyExpanded(true);
          }
        }
      } catch {
        setError('Ziyaret yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };
    loadVisit();
  }, [visitId]);

  // Generate pumps when config changes
  const generatePumps = () => {
    if (!selectedModel || !selectedType) {
      setError('Lütfen model ve tip seçin');
      return;
    }

    const newPumps: PumpData[] = [];
    for (let i = 0; i < pumpCount; i++) {
      newPumps.push({
        pumpModel: selectedModel,
        pumpType: selectedType,
        components: createEmptyComponents(),
        photos: createEmptyPhotos(),
      });
    }
    setPumps(newPumps);
    setConfigExpanded(false);
    setPumpsExpanded(true);
    setError('');
    setShowValidation(false);
  };

  // Generate jockey pumps
  const generateJockeyPumps = () => {
    const newJockeyPumps: JockeyPumpData[] = [];
    for (let i = 0; i < jockeyCount; i++) {
      newJockeyPumps.push(createEmptyJockeyComponents());
    }
    setJockeyPumps(newJockeyPumps);
  };

  useEffect(() => {
    if (hasJockey && jockeyPumps.length === 0) {
      generateJockeyPumps();
    } else if (!hasJockey) {
      setJockeyPumps([]);
    }
  }, [hasJockey]);

  useEffect(() => {
    if (hasJockey && jockeyCount > 0) {
      generateJockeyPumps();
    }
  }, [jockeyCount]);

  // Validation helper - check if all required fields are filled (DISABLED FOR TESTING)
  const _validatePumps = (): boolean => {
    // Check main pumps
    for (const pump of pumps) {
      // Check pompa
      for (const field of COMPONENT_DEFINITIONS.pompa.fields) {
        if (field.required && (!pump.components.pompa[field.key] || pump.components.pompa[field.key].trim() === '')) {
          return false;
        }
      }
      // Check kontrolPaneli
      for (const field of COMPONENT_DEFINITIONS.kontrolPaneli.fields) {
        if (field.required && (!pump.components.kontrolPaneli[field.key] || pump.components.kontrolPaneli[field.key].trim() === '')) {
          return false;
        }
      }
      // Check surucu
      for (const field of COMPONENT_DEFINITIONS.surucu.fields) {
        if (field.required && (!pump.components.surucu[field.key] || pump.components.surucu[field.key].trim() === '')) {
          return false;
        }
      }
    }

    // Check jockey pumps
    if (hasJockey) {
      for (const pump of jockeyPumps) {
        // Check pompa
        for (const field of COMPONENT_DEFINITIONS.pompa.fields) {
          if (field.required && (!pump.pompa[field.key] || pump.pompa[field.key].trim() === '')) {
            return false;
          }
        }
        // Check kontrolPaneli
        for (const field of COMPONENT_DEFINITIONS.kontrolPaneli.fields) {
          if (field.required && (!pump.kontrolPaneli[field.key] || pump.kontrolPaneli[field.key].trim() === '')) {
            return false;
          }
        }
      }
    }

    return true;
  };
  void _validatePumps; // Reserved for future use when validation is re-enabled

  const handleSave = async () => {
    if (!visitId) return;

    // DISABLED FOR TESTING - Validate required fields
    // if (!validatePumps()) {
    //   setShowValidation(true);
    //   setError('Lütfen zorunlu alanları doldurun (kırmızı ile işaretli alanlar)');
    //   return;
    // }

    setIsSaving(true);
    setError('');

    try {
      // First, delete existing pumps to start fresh
      // (This ensures we don't have duplicates)
      if (visit?.pumps) {
        for (const existingPump of visit.pumps) {
          try {
            await api.deletePump(existingPump.id);
          } catch {
            // Pump might already be deleted, continue
          }
        }
      }

      // Save main pumps with their components
      const savedMainPumps: PumpData[] = [];
      for (const pump of pumps) {
        // Create the pump
        const savedPump = await api.addPump(visitId, {
          pumpCategory: 'MAIN',
          pumpModel: pump.pumpModel || undefined,
          pumpType: pump.pumpType || undefined,
        });

        // Save pompa component
        if (Object.keys(pump.components.pompa).length > 0) {
          await api.upsertPumpComponent(savedPump.id, {
            componentType: 'pompa',
            brand: pump.components.pompa.brand || undefined,
            modelNumber: pump.components.pompa.model || undefined,
            serialNumber: pump.components.pompa.serialNumber || undefined,
            componentData: pump.components.pompa,
          });
        }

        // Save kontrolPaneli component
        if (Object.keys(pump.components.kontrolPaneli).length > 0) {
          await api.upsertPumpComponent(savedPump.id, {
            componentType: 'kontrolPaneli',
            brand: pump.components.kontrolPaneli.brand || undefined,
            modelNumber: pump.components.kontrolPaneli.model || undefined,
            serialNumber: pump.components.kontrolPaneli.serialNumber || undefined,
            componentData: pump.components.kontrolPaneli,
          });
        }

        // Save surucu component
        if (Object.keys(pump.components.surucu).length > 0) {
          await api.upsertPumpComponent(savedPump.id, {
            componentType: 'surucu',
            modelNumber: pump.components.surucu.model || undefined,
            serialNumber: pump.components.surucu.serialNumber || undefined,
            componentData: pump.components.surucu,
          });
        }

        savedMainPumps.push({ ...pump, id: savedPump.id });
      }

      // Update local state with saved pump IDs
      setPumps(savedMainPumps);

      // Save jockey pumps with their components
      if (hasJockey) {
        const savedJockeyPumps: JockeyPumpData[] = [];
        for (const pump of jockeyPumps) {
          // Create the jockey pump
          const savedPump = await api.addPump(visitId, {
            pumpCategory: 'JOCKEY',
          });

          // Save pompa component for jockey
          if (Object.keys(pump.pompa).length > 0) {
            await api.upsertPumpComponent(savedPump.id, {
              componentType: 'pompa',
              brand: pump.pompa.brand || undefined,
              modelNumber: pump.pompa.model || undefined,
              serialNumber: pump.pompa.serialNumber || undefined,
              componentData: pump.pompa,
            });
          }

          // Save kontrolPaneli component for jockey
          if (Object.keys(pump.kontrolPaneli).length > 0) {
            await api.upsertPumpComponent(savedPump.id, {
              componentType: 'kontrolPaneli',
              brand: pump.kontrolPaneli.brand || undefined,
              modelNumber: pump.kontrolPaneli.model || undefined,
              serialNumber: pump.kontrolPaneli.serialNumber || undefined,
              componentData: pump.kontrolPaneli,
            });
          }

          savedJockeyPumps.push({ ...pump, id: savedPump.id });
        }
        setJockeyPumps(savedJockeyPumps);
      }

      // Reload visit data to update local state
      const updatedVisit = await api.getVisit(visitId);
      setVisit(updatedVisit);

      // Navigate to the appropriate form based on visit type
      if (updatedVisit.visitType === 'DEVREYE_ALIM') {
        navigate(`/visit/${visitId}/devreye-alma`);
      } else {
        navigate(`/visit/${visitId}/bakim`);
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Pompalar kaydedilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-600">Yükleniyor...</div>;
  }

  if (!visit) {
    return <div className="text-center py-8 text-red-600">Ziyaret bulunamadı</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/visit/${visitId}/type`)}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Geri
        </button>
        <h2 className="text-xl font-semibold text-gray-800">Pompa Seçimi</h2>
        <div className="w-16" />
      </div>

      {/* Visit Info */}
      <div className="bg-blue-50 p-3 rounded-md">
        <p className="text-sm text-blue-800">
          <strong>Firma:</strong> {visit.companyName || '-'} | <strong>Tip:</strong>{' '}
          {visit.visitType === 'BAKIM'
            ? 'Bakım'
            : visit.visitType === 'SERVIS_SUPERVISORLUK'
            ? 'Servis & Süpervizörlük'
            : 'Devreye Alım'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>
      )}

      {/* Configuration Section */}
      <CollapsibleSection
        title="Ana Pompa Konfigürasyonu"
        isOpen={configExpanded}
        onToggle={() => setConfigExpanded(!configExpanded)}
        badge={pumps.length > 0 ? `${pumps.length} pompa` : undefined}
        variant="primary"
      >
        <div className="space-y-4">
          {/* Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Model</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedModel('VERTICAL')}
                className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                  selectedModel === 'VERTICAL'
                    ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Vertical
              </button>
              <button
                type="button"
                onClick={() => setSelectedModel('HORIZONTAL')}
                className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                  selectedModel === 'HORIZONTAL'
                    ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Horizontal
              </button>
            </div>
          </div>

          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Tip</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedType('ELEKTRIKLI')}
                className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                  selectedType === 'ELEKTRIKLI'
                    ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Elektrikli
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('DIZEL')}
                className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                  selectedType === 'DIZEL'
                    ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Dizel
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Adet</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPumpCount(Math.max(1, pumpCount - 1))}
                className="w-10 h-10 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold"
              >
                -
              </button>
              <span className="text-xl font-semibold w-8 text-center">{pumpCount}</span>
              <button
                type="button"
                onClick={() => setPumpCount(pumpCount + 1)}
                className="w-10 h-10 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={generatePumps}
            className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Pompaları Oluştur
          </button>
        </div>
      </CollapsibleSection>

      {/* Generated Pumps */}
      {pumps.length > 0 && (
        <CollapsibleSection
          title="Ana Pompalar"
          isOpen={pumpsExpanded}
          onToggle={() => setPumpsExpanded(!pumpsExpanded)}
          badge={`${pumps.length} adet`}
          variant="primary"
        >
          <div className="space-y-4">
            {pumps.map((pump, index) => (
              <PumpCard
                key={index}
                index={index}
                data={pump}
                onChange={(newData) => {
                  const newPumps = [...pumps];
                  newPumps[index] = newData;
                  setPumps(newPumps);
                }}
                onRemove={() => {
                  setPumps(pumps.filter((_, i) => i !== index));
                }}
                canRemove={pumps.length > 1}
                showValidation={showValidation}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Jockey Pump Section */}
      <CollapsibleSection
        title="Jockey Pompa"
        isOpen={jockeyExpanded}
        onToggle={() => setJockeyExpanded(!jockeyExpanded)}
        badge={hasJockey ? `${jockeyPumps.length} adet` : 'Yok'}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHasJockey(true)}
              className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                hasJockey
                  ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Var
            </button>
            <button
              type="button"
              onClick={() => setHasJockey(false)}
              className={`flex-1 py-2 px-4 rounded-md border transition-colors ${
                !hasJockey
                  ? 'bg-blue-100 border-blue-500 text-blue-700 font-medium'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Yok
            </button>
          </div>

          {hasJockey && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Adet</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setJockeyCount(Math.max(1, jockeyCount - 1))}
                    className="w-10 h-10 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold"
                  >
                    -
                  </button>
                  <span className="text-xl font-semibold w-8 text-center">{jockeyCount}</span>
                  <button
                    type="button"
                    onClick={() => setJockeyCount(jockeyCount + 1)}
                    className="w-10 h-10 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {jockeyPumps.map((pump, index) => (
                  <JockeyPumpCard
                    key={index}
                    index={index}
                    data={pump}
                    onChange={(newData) => {
                      const newPumps = [...jockeyPumps];
                      newPumps[index] = newData;
                      setJockeyPumps(newPumps);
                    }}
                    onRemove={() => {
                      setJockeyPumps(jockeyPumps.filter((_, i) => i !== index));
                      if (jockeyPumps.length === 1) setHasJockey(false);
                    }}
                    canRemove={jockeyPumps.length > 1}
                    showValidation={showValidation}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {/* Save Button */}
      {pumps.length > 0 && (
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? 'Kaydediliyor...' : 'Kaydet ve Devam Et'}
        </button>
      )}
    </div>
  );
}
