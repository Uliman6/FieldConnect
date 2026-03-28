/**
 * Devreye Alma (Commissioning) Checklist Definitions
 * Based on pump type selection - shows relevant checklists
 */

export interface ChecklistItem {
  id: string;
  label: string;
  tip?: string;  // Optional tip/note for the item
  required?: boolean;
}

export interface ChecklistSection {
  id: string;
  title: string;
  description?: string;
  items: ChecklistItem[];
}

export interface DevreveAlmaChecklist {
  id: string;
  title: string;
  pumpType: 'ELEKTRIKLI' | 'DIZEL' | 'JOCKEY';
  sections: ChecklistSection[];
}

// =============================================================================
// ELEKTRIKLI (ELECTRIC) PUMP COMMISSIONING CHECKLIST
// =============================================================================
export const elektrikliDevreveAlmaChecklist: DevreveAlmaChecklist = {
  id: 'elektrikli_devreye_alma',
  title: 'Elektrikli Yangin Pompasi Devreye Alma',
  pumpType: 'ELEKTRIKLI',
  sections: [
    {
      id: 'montaj_kontrol',
      title: 'Montaj Kontrolleri',
      description: 'Pompanin fiziksel montaj kontrollerini yapin',
      items: [
        {
          id: 'pompa_montaj',
          label: 'Pompa dogru monte edildi',
          tip: 'Pompa kaidesi ankraj vidalari ile yere sabitlenmeli, teraziye alinarak sasenin duz durmasi saglanmali',
          required: true,
        },
        {
          id: 'aksesuar_baglanti',
          label: 'Pompa aksesuarlari baglandi',
          tip: 'Cark uzerine hava atma ventili, vakumlu manometre emis tarafina, normal manometre basma tarafina baglanmali',
          required: true,
        },
        {
          id: 'salmastra_drenaj',
          label: 'Salmastra drenajlari gidere baglandi',
          required: true,
        },
        {
          id: 'casing_relief_vana',
          label: 'Casing relief vana monte edildi',
          tip: 'Pompaya ait casing relief vana govde uzerindeki tapa sokulerek yerine monte edilmeli, cikisi gidere baglanmali',
          required: true,
        },
      ],
    },
    {
      id: 'su_sistemi',
      title: 'Su Sistemi Kontrolleri',
      items: [
        {
          id: 'yangin_suyu_dolu',
          label: 'Yangin suyu tanki dolu',
          tip: 'Pompa kesinlikle susuz calistirilmamali',
          required: true,
        },
        {
          id: 'emis_hatti_su',
          label: 'Emis hattinda su oldugu dogrulandi',
          required: true,
        },
      ],
    },
    {
      id: 'basinc_hatti',
      title: 'Basinc Hissetme Hatti',
      items: [
        {
          id: 'basinc_hatti_baglanti',
          label: '1/2 parmak basinc hissetme hatti baglandi',
          tip: 'Elektrikli pompa basma vanasi ile check vana arasindan alinmali',
          required: true,
        },
        {
          id: 'check_valf_montaj',
          label: '2 adet 1/2 parmak check valf monte edildi',
          tip: 'Aralarindaki mesafe en az 150 cm olmali, valflerin yonu panodan pompaya dogru olmali',
          required: true,
        },
        {
          id: 'orifis_delik',
          label: 'Orifis 3mm delik kontrol edildi',
          required: true,
        },
      ],
    },
    {
      id: 'elektrik_baglanti',
      title: 'Elektrik Baglantilari',
      items: [
        {
          id: 'besleme_hatti',
          label: 'Kontrol panosuna besleme hatti cekildi',
          tip: 'Kablo kesiti motor gucunun %25 fazlasini kaldiracak sekilde olmali. Baglanti panonun ust tarafindaki saltere yapilmali',
          required: true,
        },
        {
          id: 'uc_faz_toprak',
          label: '3 faz ve topraklama hatti baglandi',
          tip: 'Notr hattina ihtiyac yoktur',
          required: true,
        },
        {
          id: 'motor_baglanti',
          label: 'Kontrol panosu ile motor arasi baglanti yapildi',
          tip: 'Baglanti noktasi panonun alt tarafindaki kontaktorun cikisi ile motor baglanti kutusudur',
          required: true,
        },
      ],
    },
    {
      id: 'son_kontrol',
      title: 'Son Kontroller',
      items: [
        {
          id: 'panel_ayar',
          label: 'Kontrol paneli devreye girme/cikma ayarlari yapildi',
          tip: 'Bu ayarlar ARI Yangin tarafindan yapilacaktir',
          required: true,
        },
      ],
    },
  ],
};

// =============================================================================
// DIZEL (DIESEL) PUMP COMMISSIONING CHECKLIST
// =============================================================================
export const dizelDevreveAlmaChecklist: DevreveAlmaChecklist = {
  id: 'dizel_devreye_alma',
  title: 'Dizel Yangin Pompasi Devreye Alma',
  pumpType: 'DIZEL',
  sections: [
    {
      id: 'montaj_kontrol',
      title: 'Montaj Kontrolleri',
      description: 'Pompanin fiziksel montaj kontrollerini yapin',
      items: [
        {
          id: 'pompa_montaj',
          label: 'Dizel pompa dogru monte edildi',
          tip: 'Pompa kaidesi ankraj vidalari ile yere sabitlenmeli, teraziye alinarak sasenin duz durmasi saglanmali',
          required: true,
        },
        {
          id: 'aksesuar_baglanti',
          label: 'Pompa aksesuarlari baglandi',
          tip: 'Cark uzerine hava atma ventili, vakumlu manometre emis tarafina, normal manometre basma tarafina baglanmali',
          required: true,
        },
        {
          id: 'salmastra_drenaj',
          label: 'Salmastra drenajlari gidere baglandi',
          required: true,
        },
      ],
    },
    {
      id: 'sogutma_sistemi',
      title: 'Sogutma Sistemi',
      items: [
        {
          id: 'sogutma_drenaj',
          label: 'Motor sogutma suyu drenaj hatti gidere baglandi',
          tip: 'Akan suyun gorulebilir olmasi gerekir - hat uzerine gozetleme cami konmali',
          required: true,
        },
        {
          id: 'sogutma_haznesi',
          label: 'Sogutma suyu haznesi dolduruldu',
          tip: '%50 antifriz + %50 su karisimi ile doldurulmali',
          required: true,
        },
        {
          id: 'sogutma_vanalari',
          label: 'Sogutma sistemi vanalari uygun konumda',
          tip: 'Elektrikli selenoid vananin bagli oldugu hattaki 2 vana surekli acik konumda olmali. BY-PASS vanalari sadece gerektiginde acilmali - surekli acik kalirsa su kaybi olur',
          required: true,
        },
      ],
    },
    {
      id: 'su_sistemi',
      title: 'Su Sistemi Kontrolleri',
      items: [
        {
          id: 'yangin_suyu_dolu',
          label: 'Yangin suyu tanki dolu',
          tip: 'Dizel pompa kesinlikle susuz calistirilmamali',
          required: true,
        },
        {
          id: 'emis_hatti_su',
          label: 'Emis hattinda su oldugu dogrulandi',
          required: true,
        },
      ],
    },
    {
      id: 'yakit_sistemi',
      title: 'Yakit Sistemi',
      items: [
        {
          id: 'yakit_tanki_sabit',
          label: 'Yakit tanki yere sabitlendi',
          required: true,
        },
        {
          id: 'yakit_aksesuarlari',
          label: 'Yakit tanki aksesuarlari baglandi',
          required: true,
        },
        {
          id: 'yakit_seviyesi',
          label: 'Yakit tanki 3/4 dolu',
          required: true,
        },
        {
          id: 'yakit_hatlari',
          label: 'Besleme ve donus hatlari baglandi',
          tip: 'Bu hatlar kesinlikle siyah demir boru veya bakir boru ile yapilmali. Galvaniz boru KULLANILMAMALI',
          required: true,
        },
        {
          id: 'mazot_vanasi',
          label: 'Mazot vanasi acilarak sistem havasi alindi',
          tip: 'Vana bakim harici kesinlikle acik kalmali',
          required: true,
        },
      ],
    },
    {
      id: 'basinc_hatti',
      title: 'Basinc Hissetme Hatti',
      items: [
        {
          id: 'basinc_hatti_baglanti',
          label: '1/2 parmak basinc hatti baglandi',
          tip: 'Dizel pompa basma vanasi ile check vanasi arasindan alinmali',
          required: true,
        },
        {
          id: 'check_valf_montaj',
          label: '1/2 parmak check valf monte edildi',
          tip: 'Valfin yonu panodan pompaya dogru olmali',
          required: true,
        },
        {
          id: 'orifis_delik',
          label: 'Orifis 3mm delik kontrol edildi',
          required: true,
        },
      ],
    },
    {
      id: 'motor_kontrol',
      title: 'Motor Kontrolleri',
      items: [
        {
          id: 'yag_seviyesi',
          label: 'Motor yag seviyesi kontrol edildi',
          tip: 'Yag seviyesi yag cubugundan kontrol edilmeli, ust cizgiye yakin olmali',
          required: true,
        },
        {
          id: 'aku_hazirlik',
          label: 'Akulere asit konuldu ve sarj ettirildi',
          tip: 'Bu islem akucu tarafindan yapilmali',
          required: true,
        },
      ],
    },
    {
      id: 'elektrik_baglanti',
      title: 'Elektrik Baglantilari',
      items: [
        {
          id: 'motor_pano_kablo',
          label: 'Motor ile kontrol panosu arasi kablo cekildi',
          tip: '12 x 2,5 mm kablo ile baglanti yapilmali',
          required: true,
        },
        {
          id: 'isitici_besleme',
          label: 'Motor isitici besleme hatti cekildi',
          tip: 'Motor govdesinin surekli sicak olmasini saglar - kolay calisma ve minimum asinma icin onemli',
          required: true,
        },
        {
          id: 'pano_besleme',
          label: 'Kontrol panosuna 220V besleme hatti cekildi',
          tip: 'Akulerin surekli otomatik olarak sarj edilmesini saglar',
          required: true,
        },
      ],
    },
    {
      id: 'son_kontrol',
      title: 'Son Kontroller',
      items: [
        {
          id: 'aku_baglanti',
          label: 'Aku kablolari ve kutupbaslari baglandi',
          required: true,
        },
        {
          id: 'panel_ayar',
          label: 'Devreye girme/cikma ve minimum calisma ayarlari yapildi',
          tip: 'Bu ayarlar ARI Yangin tarafindan yapilacaktir',
          required: true,
        },
      ],
    },
  ],
};

// =============================================================================
// JOKEY PUMP COMMISSIONING CHECKLIST
// =============================================================================
export const jokeyDevreveAlmaChecklist: DevreveAlmaChecklist = {
  id: 'jokey_devreye_alma',
  title: 'Jokey Pompa Devreye Alma',
  pumpType: 'JOCKEY',
  sections: [
    {
      id: 'montaj_kontrol',
      title: 'Montaj Kontrolleri',
      description: 'Pompanin fiziksel montaj kontrollerini yapin',
      items: [
        {
          id: 'pompa_montaj',
          label: 'Jokey pompa dogru monte edildi',
          tip: 'Pompa kaidesi yere sabitlenmeli',
          required: true,
        },
        {
          id: 'akis_yonu',
          label: 'Akis yonunu gosteren ok isareti kontrol edildi',
          tip: 'Ok isareti depodan basma kollektorune dogru olmali',
          required: true,
        },
      ],
    },
    {
      id: 'su_sistemi',
      title: 'Su Sistemi Kontrolleri',
      items: [
        {
          id: 'yangin_suyu_dolu',
          label: 'Yangin suyu tanki dolu',
          tip: 'Jokey pompa susuz olarak calistirilmamali',
          required: true,
        },
        {
          id: 'emis_hatti_su',
          label: 'Emis hattinda su oldugu dogrulandi',
          required: true,
        },
        {
          id: 'vanalar_acik',
          label: 'Emme ve basma hattindaki vanalar acik',
          tip: 'Bu vanalarin surekli acik olmasi gerekiyor',
          required: true,
        },
      ],
    },
    {
      id: 'basinc_hatti',
      title: 'Basinc Hissetme Hatti',
      items: [
        {
          id: 'basinc_hatti_baglanti',
          label: '1/2 parmak basinc hissetme hatti baglandi',
          tip: 'Jokey pompa check valfi ile basma vanasi arasindan alinacak',
          required: true,
        },
        {
          id: 'check_valf_montaj',
          label: '2 adet 1/2 parmak check valf monte edildi',
          tip: 'Aralarindaki mesafe en az 150 cm olmali, check valflerin yonu panodan pompaya dogru olmali',
          required: true,
        },
        {
          id: 'orifis_delik',
          label: 'Orifis 3mm capinda delik kontrol edildi',
          required: true,
        },
      ],
    },
    {
      id: 'elektrik_baglanti',
      title: 'Elektrik Baglantilari',
      items: [
        {
          id: 'uc_faz_toprak',
          label: '3 faz ve topraklama hatti baglandi',
          tip: 'Baglanti noktasi ON-OFF salterinin ust noktasidir',
          required: true,
        },
        {
          id: 'motor_baglanti',
          label: 'Kontrol panosu ile motor arasi baglanti yapildi',
          tip: 'Baglanti noktasi panodaki termik ile motor baglanti kutusudur',
          required: true,
        },
      ],
    },
    {
      id: 'calistirma',
      title: 'Calistirma Kontrolleri',
      description: 'Pompanin calistirilmasi ve test edilmesi',
      items: [
        {
          id: 'ana_salter_on',
          label: 'Ana salter ON konumuna getirildi',
          tip: 'Pano kapagi acilacaksa ana salter OFF konumuna getirilmeli',
          required: true,
        },
        {
          id: 'manuel_test',
          label: 'Secici anahtar HAND-MANUEL konumuna alinarak test edildi',
          tip: 'Bu konumda jokey pompa su basincina bagli olmaksizin manuel olarak calisacaktir',
          required: true,
        },
        {
          id: 'donus_yonu',
          label: 'Pompa donus yonu kontrol edildi',
          tip: 'Pompa calisirken uzerindeki donus yonu ok isaretine bakilmali, gerekirse panodan degistirilmeli',
          required: true,
        },
        {
          id: 'hava_alma',
          label: 'Pompa havasi alindi',
          tip: 'Pompa calisirken ust kisimindaki hava alma tapasi yavasca acilarak hava alinmali',
          required: true,
        },
        {
          id: 'auto_test',
          label: 'Secici anahtar AUTO konumuna alinarak test edildi',
          tip: 'Pompa kollektor basinci istenilen seviyeye gelince calisacak ve sonra duracaktir',
          required: true,
        },
        {
          id: 'devreye_girme_kayit',
          label: 'Devreye girme ve cikma basinci kaydedildi',
          tip: 'Kollektor basincini depoya donus vanasini veya kollektor bosaltma vanasini yavas yavas acarak dusurup pompanin otomatik devreye girip cikmasini test edin',
          required: true,
        },
      ],
    },
    {
      id: 'basinc_ayar',
      title: 'Basinc Ayarlari',
      items: [
        {
          id: 'prosesstat_ayar',
          label: 'Prosesstat devreye girme/cikma basinci kontrol edildi',
          tip: 'Bu ayar ARI Yangin tarafindan yapilmistir - DEGISTIRMEYINIZ',
          required: true,
        },
      ],
    },
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the appropriate checklist based on pump type
 */
export function getChecklistForPumpType(pumpType: 'ELEKTRIKLI' | 'DIZEL'): DevreveAlmaChecklist {
  if (pumpType === 'DIZEL') {
    return dizelDevreveAlmaChecklist;
  }
  return elektrikliDevreveAlmaChecklist;
}

/**
 * Get the Jockey pump checklist
 */
export function getJokeyChecklist(): DevreveAlmaChecklist {
  return jokeyDevreveAlmaChecklist;
}

/**
 * Calculate completion percentage for a checklist
 */
export function calculateChecklistCompletion(
  checklist: DevreveAlmaChecklist,
  completedItems: Record<string, boolean>
): { completed: number; total: number; percentage: number } {
  let total = 0;
  let completed = 0;

  for (const section of checklist.sections) {
    for (const item of section.items) {
      total++;
      if (completedItems[`${checklist.id}_${item.id}`]) {
        completed++;
      }
    }
  }

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Get all required items that are not yet completed
 */
export function getIncompleteRequiredItems(
  checklist: DevreveAlmaChecklist,
  completedItems: Record<string, boolean>
): ChecklistItem[] {
  const incomplete: ChecklistItem[] = [];

  for (const section of checklist.sections) {
    for (const item of section.items) {
      if (item.required && !completedItems[`${checklist.id}_${item.id}`]) {
        incomplete.push(item);
      }
    }
  }

  return incomplete;
}
