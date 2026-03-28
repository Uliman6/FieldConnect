// Servis Raporu Form Definitions
// Based on official ARI Yangın template: SERVIS_RAPORU_ARI YANGIN.pdf

export type ServisFieldType = 'TEXT' | 'DATE' | 'TIME' | 'CHECKBOX' | 'YES_NO' | 'TEXTAREA' | 'SIGNATURE' | 'VOICE_NOTE' | 'VOICE_NOTES_INPUT' | 'PHOTOS';

export interface ServisFormField {
  id: string;
  label: string;
  labelEn?: string;
  type: ServisFieldType;
  placeholder?: string;
  required?: boolean;
}

export interface ServisFormSection {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  fields: ServisFormField[];
}

// ============================================
// PROJECT INFO - Proje Bilgileri (auto-filled from visit)
// ============================================
export const projectInfoSection: ServisFormSection = {
  id: 'project_info',
  title: 'Proje Bilgileri',
  titleEn: 'Project Information',
  description: 'Bu bilgiler ziyaret kaydından otomatik doldurulur',
  fields: [
    { id: 'isin_adi', label: 'İşin Adı', labelEn: 'Project Name', type: 'TEXT', placeholder: 'Proje/İş adı' },
    { id: 'adres', label: 'Adres', labelEn: 'Address', type: 'TEXTAREA', placeholder: 'Tam adres' },
    { id: 'il', label: 'İl', labelEn: 'City', type: 'TEXT', placeholder: 'İstanbul' },
    { id: 'ilce', label: 'İlçe', labelEn: 'District', type: 'TEXT', placeholder: 'Ümraniye' },
    { id: 'firma_adi', label: 'Firma Adı', labelEn: 'Company Name', type: 'TEXT', placeholder: 'Firma adı' },
  ],
};

// ============================================
// VISIT TIMES - Ziyaret Zamanları
// ============================================
export const visitTimesSection: ServisFormSection = {
  id: 'visit_times',
  title: 'Ziyaret Zamanları',
  titleEn: 'Visit Times',
  fields: [
    { id: 'varis_tarihi', label: 'Varış Tarihi', labelEn: 'Arrival Date', type: 'DATE' },
    { id: 'varis_saati', label: 'Varış Saati', labelEn: 'Arrival Time', type: 'TIME' },
    { id: 'ayrilis_tarihi', label: 'Ayrılış Tarihi', labelEn: 'Departure Date', type: 'DATE' },
    { id: 'ayrilis_saati', label: 'Ayrılış Saati', labelEn: 'Departure Time', type: 'TIME' },
  ],
};

// ============================================
// SERVICE TYPE - Yapılan Hizmet
// ============================================
export const serviceTypeSection: ServisFormSection = {
  id: 'service_type',
  title: 'Yapılan Hizmet',
  titleEn: 'Service Performed',
  fields: [
    { id: 'supervizyon_kesif', label: 'Süpervizyon / Keşif', labelEn: 'Supervision / Survey', type: 'CHECKBOX' },
    { id: 'servis', label: 'Servis', labelEn: 'Service', type: 'CHECKBOX' },
    { id: 'bakim', label: 'Bakım', labelEn: 'Maintenance', type: 'CHECKBOX' },
    { id: 'isletmeye_alma', label: 'İşletmeye Alma', labelEn: 'Commissioning', type: 'CHECKBOX' },
  ],
};

// ============================================
// SYSTEM CHECKS - Sistem Kontrolleri
// ============================================
export const systemChecksSection: ServisFormSection = {
  id: 'system_checks',
  title: 'Sistem Kontrolleri',
  titleEn: 'System Checks',
  fields: [
    {
      id: 'elektrik_baglanti_kontrol',
      label: 'SİSTEM elemanlarının elektriksel bağlantıları gösterildi, kontrol edildi',
      labelEn: 'System components electrical connections shown and checked',
      type: 'YES_NO'
    },
    {
      id: 'montaj_kontrol',
      label: 'SİSTEM elemanlarının montaj yeri ve montaj şekli gösterildi, kontrol edildi',
      labelEn: 'System components installation location and method shown and checked',
      type: 'YES_NO'
    },
    {
      id: 'ariza_giderildi',
      label: 'SİSTEMDEKİ arıza giderildi. Arızalı parça değiştirildi',
      labelEn: 'System fault fixed. Defective part replaced',
      type: 'YES_NO'
    },
    {
      id: 'sistem_teslim',
      label: 'SİSTEM çalışır durumda eksiksiz olarak teslim edildi',
      labelEn: 'System delivered complete and operational',
      type: 'YES_NO'
    },
  ],
};

// ============================================
// NOTES SECTION - Notlar (voice-first with AI cleanup)
// ============================================
export const notesSection: ServisFormSection = {
  id: 'notes',
  title: 'Servis Notlari',
  titleEn: 'Service Notes',
  description: 'Sesli kayit yaparak not ekleyin. AI ile otomatik duzenlenir.',
  fields: [
    {
      id: 'service_notes',
      label: 'Servis Notu',
      labelEn: 'Service Notes',
      type: 'VOICE_NOTES_INPUT',
      placeholder: 'Sesli kayit yapin veya buraya yazin...'
    },
    { id: 'photos', label: 'Fotograflar', labelEn: 'Photos', type: 'PHOTOS' },
  ],
};

// ============================================
// APPROVAL SECTION - Onay
// ============================================
export const approvalSection: ServisFormSection = {
  id: 'approval',
  title: 'Onay / Approval',
  titleEn: 'Approval',
  fields: [
    { id: 'technician_name', label: 'ARI YANGIN Teknisyen Adı', labelEn: 'ARI YANGIN Technician Name', type: 'TEXT' },
    { id: 'technician_signature', label: 'ARI YANGIN Teknisyen İmza', labelEn: 'ARI YANGIN Technician Signature', type: 'SIGNATURE' },
    { id: 'customer_name', label: 'Firma İlgilisi Adı', labelEn: 'Company Representative Name', type: 'TEXT' },
    { id: 'customer_signature', label: 'Firma İlgilisi İmza', labelEn: 'Company Representative Signature', type: 'SIGNATURE' },
  ],
};

// ============================================
// ALL SECTIONS
// ============================================
export const servisRaporuSections: ServisFormSection[] = [
  projectInfoSection,
  visitTimesSection,
  serviceTypeSection,
  systemChecksSection,
  notesSection,
  approvalSection,
];
