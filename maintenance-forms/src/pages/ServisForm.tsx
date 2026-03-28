import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { MaintenanceVisit } from '../lib/types';
import {
  servisRaporuSections,
  ServisFormSection,
  ServisFormField,
} from '../lib/servisFormDefinitions';
import SignatureCanvas from '../components/SignatureCanvas';
import VoiceRecorder from '../components/VoiceRecorder';
import VoiceNotesInput from '../components/VoiceNotesInput';

interface VoiceNote {
  id: string;
  audioUrl: string;
  transcription?: string;
  duration: number;
  createdAt: string;
  isTranscribing?: boolean;
}

interface VoiceRecording {
  id: string;
  audioUrl: string;
  rawTranscription?: string;
  duration: number;
  createdAt: string;
  isTranscribing?: boolean;
}

interface PhotoItem {
  id: string;
  url: string;
  caption?: string;
}

// ============================================
// FIELD COMPONENTS
// ============================================

function TextField({
  field,
  value,
  onChange,
}: {
  field: ServisFormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function TimeField({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}

function CheckboxField({
  field,
  value,
  onChange,
}: {
  field: ServisFormField;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
}) {
  const isChecked = value === true;

  return (
    <button
      type="button"
      onClick={() => onChange(!isChecked)}
      className="flex items-center gap-3 w-full text-left py-2"
    >
      <div
        className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
          isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
        }`}
      >
        {isChecked && <span className="text-white text-sm">✓</span>}
      </div>
      <span className="text-gray-700">{field.label}</span>
    </button>
  );
}

function YesNoField({
  field,
  value,
  onChange,
}: {
  field: ServisFormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const options = [
    { label: 'Evet', value: 'YES' },
    { label: 'Hayır', value: 'NO' },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">{field.label}</p>
      <div className="flex gap-2">
        {options.map((option) => {
          const isSelected = value === option.value;
          const bgColor = isSelected
            ? option.value === 'YES'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200';

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`flex-1 py-2 px-3 rounded-md font-medium transition-colors ${bgColor}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextareaField({
  field,
  value,
  onChange,
}: {
  field: ServisFormField;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      rows={4}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
    />
  );
}

// ============================================
// PHOTOS COMPONENT
// ============================================

function PhotosField({
  value,
  onChange,
}: {
  value: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      try {
        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;

        // Upload photo
        const response = await api.uploadPhoto(base64);

        // Add to photos list
        const newPhoto: PhotoItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          url: response.url,
        };

        onChange([...value, newPhoto]);
      } catch (err) {
        console.error('Failed to upload photo:', err);
      }
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const deletePhoto = (id: string) => {
    onChange(value.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Upload button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
      >
        {isUploading ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Yükleniyor...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Fotoğraf Ekle</span>
          </>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Photo grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((photo) => (
            <div key={photo.id} className="relative aspect-square">
              <img
                src={photo.url}
                alt="Uploaded"
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                type="button"
                onClick={() => deletePhoto(photo.id)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// FORM SECTION COMPONENT
// ============================================

function FormSectionComponent({
  section,
  data,
  onChange,
  onTranscribe,
}: {
  section: ServisFormSection;
  data: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  onTranscribe: (audioBlob: Blob) => Promise<string>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
      >
        <span className="font-medium text-gray-700">{section.title}</span>
        <span className={`transform transition-transform text-sm ${isExpanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {section.description && (
            <p className="text-sm text-gray-500 italic">{section.description}</p>
          )}

          {section.fields.map((field) => (
            <div key={field.id} className="space-y-1">
              {/* Label for certain field types */}
              {!['CHECKBOX', 'YES_NO', 'VOICE_NOTE', 'VOICE_NOTES_INPUT', 'PHOTOS'].includes(field.type) && (
                <label className="block text-sm font-medium text-gray-600">
                  {field.label}
                </label>
              )}

              {/* Field inputs */}
              {field.type === 'TEXT' && (
                <TextField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'DATE' && (
                <DateField
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'TIME' && (
                <TimeField
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'CHECKBOX' && (
                <CheckboxField
                  field={field}
                  value={data[field.id] as boolean | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'YES_NO' && (
                <YesNoField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'TEXTAREA' && (
                <TextareaField
                  field={field}
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}

              {field.type === 'SIGNATURE' && (
                <SignatureCanvas
                  value={data[field.id] as string | undefined}
                  onChange={(val) => onChange(field.id, val)}
                  label={field.label}
                />
              )}

              {field.type === 'VOICE_NOTE' && (
                <VoiceRecorder
                  value={(data[field.id] as VoiceNote[]) || []}
                  onChange={(val) => onChange(field.id, val)}
                  onTranscribe={onTranscribe}
                />
              )}

              {field.type === 'VOICE_NOTES_INPUT' && (
                <VoiceNotesInput
                  value={(data[field.id] as string) || ''}
                  onChange={(val) => onChange(field.id, val)}
                  recordings={(data[`${field.id}_recordings`] as VoiceRecording[]) || []}
                  onRecordingsChange={(recs) => onChange(`${field.id}_recordings`, recs)}
                  placeholder={field.placeholder}
                />
              )}

              {field.type === 'PHOTOS' && (
                <PhotosField
                  value={(data[field.id] as PhotoItem[]) || []}
                  onChange={(val) => onChange(field.id, val)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN SERVIS FORM PAGE
// ============================================

export default function ServisForm() {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();

  const [visit, setVisit] = useState<MaintenanceVisit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // Load visit data
  useEffect(() => {
    if (!visitId) return;

    const loadData = async () => {
      try {
        const data = await api.getVisit(visitId);
        setVisit(data);

        // Try to load existing form data from visit notes
        let existingFormData: Record<string, unknown> = {};
        if (data.notes) {
          try {
            const notesData = JSON.parse(data.notes);
            if (notesData.SERVIS_RAPORU?.formData) {
              existingFormData = notesData.SERVIS_RAPORU.formData;
            }
          } catch {
            // Notes is not JSON or doesn't have form data
          }
        }

        // Merge existing data with defaults
        setFormData({
          // Default values
          firma_adi: data.companyName || '',
          adres: data.address || '',
          varis_tarihi: new Date().toISOString().split('T')[0],
          varis_saati: new Date().toTimeString().slice(0, 5),
          // Override with existing saved data
          ...existingFormData,
        });
      } catch {
        setError('Ziyaret yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [visitId]);

  // Handle field change
  const handleFieldChange = useCallback((fieldId: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  }, []);

  // Handle transcription
  const handleTranscribe = useCallback(async (audioBlob: Blob): Promise<string> => {
    try {
      const response = await api.transcribeAudio(audioBlob);
      if (response.success && response.text) {
        return response.text;
      }
      throw new Error(response.error || 'Transcription failed');
    } catch (err) {
      console.error('Transcription error:', err);
      throw err;
    }
  }, []);

  // Save form
  const handleSave = async (complete: boolean = false) => {
    if (!visitId) return;

    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      // Combine all voice note transcriptions into notes_text
      const voiceNotes = (formData.voice_notes as VoiceNote[]) || [];
      const transcriptions = voiceNotes
        .filter(n => n.transcription)
        .map(n => n.transcription)
        .join('\n\n');

      const finalFormData = {
        ...formData,
        combined_notes: [
          formData.notes_text || '',
          transcriptions,
        ].filter(Boolean).join('\n\n---\n\n'),
      };

      await api.createOrUpdateVisitForm(visitId, {
        formType: 'SERVIS_RAPORU',
        formData: finalFormData,
        status: complete ? 'completed' : 'in_progress',
      });

      // Refresh visit data to confirm save
      const refreshedData = await api.getVisit(visitId);
      setVisit(refreshedData);

      if (complete) {
        await api.updateVisit(visitId, { status: 'completed' });
        setSuccessMessage('Servis raporu tamamlandı!');
        setTimeout(() => navigate('/'), 1500);
      } else {
        setSuccessMessage('Kaydedildi!');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Form kaydedilemedi. Lutfen tekrar deneyin.');
    } finally {
      setIsSaving(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!visitId) return;

    setIsGeneratingPdf(true);
    setError('');
    setSuccessMessage('');

    try {
      // Auto-save form data before generating PDF to ensure latest data
      const voiceNotes = (formData.voice_notes as VoiceNote[]) || [];
      const transcriptions = voiceNotes
        .filter(n => n.transcription)
        .map(n => n.transcription)
        .join('\n\n');

      const finalFormData = {
        ...formData,
        combined_notes: [
          formData.notes_text || '',
          transcriptions,
        ].filter(Boolean).join('\n\n---\n\n'),
      };

      await api.createOrUpdateVisitForm(visitId, {
        formType: 'SERVIS_RAPORU',
        formData: finalFormData,
        status: 'in_progress',
      });

      // Generate and download PDF
      const blob = await api.downloadPdf(visitId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `servis_raporu_${visit?.companyName || 'rapor'}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF error:', err);
      setError('PDF olusturulamadi. Lutfen tekrar deneyin.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-600">Yükleniyor...</div>;
  }

  if (!visit) {
    return (
      <div className="text-center py-8 text-red-600">Ziyaret bulunamadı</div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/visit/${visitId}/type`)}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Geri
        </button>
        <h2 className="text-xl font-semibold text-gray-800">Servis Raporu</h2>
        <div className="w-16" />
      </div>

      {/* Visit Info */}
      <div className="bg-green-50 p-3 rounded-md">
        <p className="text-sm text-green-800">
          <strong>Firma:</strong> {visit.companyName || '-'} |{' '}
          <strong>Tür:</strong> {visit.visitType || '-'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm font-medium">
          {successMessage}
        </div>
      )}

      {/* Form Sections */}
      <div className="space-y-3">
        {servisRaporuSections.map((section) => (
          <FormSectionComponent
            key={section.id}
            section={section}
            data={formData}
            onChange={handleFieldChange}
            onTranscribe={handleTranscribe}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        <button
          onClick={() => handleSave(false)}
          disabled={isSaving}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>

        <button
          onClick={() => handleSave(true)}
          disabled={isSaving}
          className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isSaving ? 'Kaydediliyor...' : 'Tamamla ve Bitir'}
        </button>

        {/* Download PDF */}
        <button
          onClick={handleDownloadPdf}
          disabled={isGeneratingPdf || isSaving}
          className="w-full bg-purple-600 text-white py-3 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
        >
          {isGeneratingPdf ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>PDF Olusturuluyor...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>PDF Indir</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
