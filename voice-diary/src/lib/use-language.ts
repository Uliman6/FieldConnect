import { useState, useEffect, createContext, useContext } from 'react';

export type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

// Translations object
export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Layout & Navigation
    'app.voiceDiary': 'Voice Diary',
    'app.toolFeedback': 'Tool Feedback',
    'nav.record': 'Record',
    'nav.dashboard': 'Dashboard',
    'nav.summary': 'Summary',
    'nav.tools': 'Tools',
    'nav.diary': 'Diary',
    'header.switchToSpanish': 'Espa\u00f1ol',
    'header.switchToEnglish': 'English',
    'header.logout': 'Logout',
    'header.admin': 'Admin Dashboard',

    // Record Page
    'record.selectProject': 'Select a project...',
    'record.tapToRecord': 'Tap to record a voice note',
    'record.selectProjectFirst': 'Select a project to start recording',
    'record.recording': 'Recording... Tap to stop',
    'record.reRecording': 'Re-recording... Tap to stop',
    'record.recordingFeedback': 'Recording feedback... Tap to stop',
    'record.topicsTocover': 'Topics to cover in your note:',
    'record.giveFeedback': 'Give Feedback',
    'record.viewEditNotes': 'View and Edit Notes',
    'record.noRecordings': 'No recordings yet',
    'record.loadExample': 'Load Example Data',
    'record.micDenied': 'Microphone access denied. Please enable it in settings.',
    'record.noAudio': 'No audio detected. Please try again.',
    'record.couldNotStart': 'Could not start recording. Please try again.',
    'record.processing': 'Processing...',
    'record.cancel': 'Cancel',
    'record.save': 'Save',
    'record.saving': 'Saving...',

    // Categories (keys match actual category names lowercase without spaces)
    'category.safety': 'Safety',
    'category.logistics': 'Logistics',
    'category.process': 'Process',
    'category.workcompleted': 'Work Done',
    'category.worktobedone': 'To Do',
    'category.follow-upitems': 'Follow-up',
    'category.issues': 'Issues',
    'category.team': 'Team',
    'category.materials': 'Materials',

    // Dashboard
    'dashboard.noProject': 'No Project Selected',
    'dashboard.selectOnRecord': 'Select a project on the Record tab to see your dashboard',
    'dashboard.dailySummary': 'Daily Summary',
    'dashboard.noNotes': 'No notes recorded on',
    'dashboard.notesRecorded': 'note(s) recorded. Processing...',
    'dashboard.followUpItems': 'Follow-up Items',
    'dashboard.noFollowUps': 'No follow-up items on',
    'dashboard.followUpHint': 'Items from "Follow-up" category or with due dates will appear here',
    'dashboard.createForm': 'Create Form',
    'dashboard.selectDate': 'Select Date',
    'dashboard.tapDateToSelect': 'Tap date to select',
    'dashboard.hasNotes': 'Has notes',
    'dashboard.items': 'items',
    'dashboard.item': 'item',
    'dashboard.editFollowUp': 'Edit Follow-up Item',
    'dashboard.enterFollowUp': 'Enter follow-up item...',
    'dashboard.on': 'on',
    'dashboard.generalNotes': 'General Notes',
    'dashboard.saving': 'Saving...',

    // Forms
    'form.selectEntries': 'Select entries from',
    'form.noEntries': 'No entries on',
    'form.recordFirst': 'Record voice notes first.',
    'form.createForm': 'Create Form',
    'form.selectToCreate': 'Select entries to create form',
    'form.entries': 'entries',
    'form.translateToEnglish': 'Translate to English',
    'form.translating': 'Translating...',
    'form.showBothLanguages': 'Show Both Languages',
    'form.spanishOriginal': 'Spanish (Original)',
    'form.englishTranslation': 'English (Translation)',

    // Form Templates (lowercase keys for ID matching)
    'template.dailylog': 'Daily Log',
    'template.punchlist': 'Punch List',
    'template.rfi': 'RFI',
    'template.inspectionnotes': 'Inspection Notes',
    'template.fieldnotes': 'Field Notes',
    'template.incidentreport': 'Injury/Incident Report',
    // Legacy camelCase keys
    'template.dailyLog': 'Daily Log',
    'template.dailyLogDesc': 'Daily work summary and progress report',
    'template.punchList': 'Punch List',
    'template.punchListDesc': 'Track deficiencies and incomplete work items',
    'template.rfiDesc': 'Request for Information - clarify design or construction questions',
    'template.inspectionNotes': 'Inspection Notes',
    'template.inspectionNotesDesc': 'Document site inspection findings',
    'template.fieldNotes': 'Field Notes',
    'template.fieldNotesDesc': 'General field observations and notes',
    'template.incidentReport': 'Injury/Incident Report',
    'template.incidentReportDesc': 'Document safety incidents and injuries',

    // Common
    'common.today': 'Today',
    'common.yesterday': 'Yesterday',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.done': 'Done',
    'common.asap': 'ASAP',
    'common.tomorrow': 'Tomorrow',
    'common.thisWeek': 'This Week',
    'common.nextWeek': 'Next Week',

    // Projects
    'project.select': 'Select Project',
    'project.create': 'Create New Project',
    'project.name': 'New Project Name',
    'project.enterName': 'Enter project name...',
    'project.noProjects': 'No projects yet. Create one above!',
  },

  es: {
    // Layout & Navigation
    'app.voiceDiary': 'Diario de Voz',
    'app.toolFeedback': 'Comentarios de Herramientas',
    'nav.record': 'Grabar',
    'nav.dashboard': 'Tablero',
    'nav.summary': 'Resumen',
    'nav.tools': 'Herramientas',
    'nav.diary': 'Diario',
    'header.switchToSpanish': 'Espa\u00f1ol',
    'header.switchToEnglish': 'English',
    'header.logout': 'Cerrar Sesi\u00f3n',
    'header.admin': 'Panel de Administrador',

    // Record Page
    'record.selectProject': 'Seleccionar un proyecto...',
    'record.tapToRecord': 'Toca para grabar una nota de voz',
    'record.selectProjectFirst': 'Selecciona un proyecto para comenzar a grabar',
    'record.recording': 'Grabando... Toca para detener',
    'record.reRecording': 'Re-grabando... Toca para detener',
    'record.recordingFeedback': 'Grabando comentarios... Toca para detener',
    'record.topicsTocover': 'Temas a cubrir en tu nota:',
    'record.giveFeedback': 'Dar Comentarios',
    'record.viewEditNotes': 'Ver y Editar Notas',
    'record.noRecordings': 'Sin grabaciones a\u00fan',
    'record.loadExample': 'Cargar Datos de Ejemplo',
    'record.micDenied': 'Acceso al micr\u00f3fono denegado. Por favor habil\u00edtalo en configuraci\u00f3n.',
    'record.noAudio': 'No se detect\u00f3 audio. Por favor intenta de nuevo.',
    'record.couldNotStart': 'No se pudo iniciar la grabaci\u00f3n. Por favor intenta de nuevo.',
    'record.processing': 'Procesando...',
    'record.cancel': 'Cancelar',
    'record.save': 'Guardar',
    'record.saving': 'Guardando...',

    // Categories (keys match actual category names lowercase without spaces)
    'category.safety': 'Seguridad',
    'category.logistics': 'Logística',
    'category.process': 'Proceso',
    'category.workcompleted': 'Trabajo Hecho',
    'category.worktobedone': 'Por Hacer',
    'category.follow-upitems': 'Seguimiento',
    'category.issues': 'Problemas',
    'category.team': 'Equipo',
    'category.materials': 'Materiales',

    // Dashboard
    'dashboard.noProject': 'Ningún Proyecto Seleccionado',
    'dashboard.selectOnRecord': 'Selecciona un proyecto en la pestaña Grabar para ver tu tablero',
    'dashboard.dailySummary': 'Resumen Diario',
    'dashboard.noNotes': 'Sin notas grabadas el',
    'dashboard.notesRecorded': 'nota(s) grabadas. Procesando...',
    'dashboard.followUpItems': 'Elementos de Seguimiento',
    'dashboard.noFollowUps': 'Sin elementos de seguimiento el',
    'dashboard.followUpHint': 'Los elementos de la categoría "Seguimiento" o con fechas límite aparecerán aquí',
    'dashboard.createForm': 'Crear Formulario',
    'dashboard.selectDate': 'Seleccionar Fecha',
    'dashboard.tapDateToSelect': 'Toca la fecha para seleccionar',
    'dashboard.hasNotes': 'Tiene notas',
    'dashboard.items': 'elementos',
    'dashboard.item': 'elemento',
    'dashboard.editFollowUp': 'Editar Elemento de Seguimiento',
    'dashboard.enterFollowUp': 'Ingresa el elemento de seguimiento...',
    'dashboard.on': 'el',
    'dashboard.generalNotes': 'Notas Generales',
    'dashboard.saving': 'Guardando...',

    // Forms
    'form.selectEntries': 'Selecciona entradas de',
    'form.noEntries': 'Sin entradas el',
    'form.recordFirst': 'Graba notas de voz primero.',
    'form.createForm': 'Crear Formulario',
    'form.selectToCreate': 'Selecciona entradas para crear formulario',
    'form.entries': 'entradas',
    'form.translateToEnglish': 'Traducir al Ingl\u00e9s',
    'form.translating': 'Traduciendo...',
    'form.showBothLanguages': 'Mostrar Ambos Idiomas',
    'form.spanishOriginal': 'Espa\u00f1ol (Original)',
    'form.englishTranslation': 'Ingl\u00e9s (Traducci\u00f3n)',

    // Form Templates (lowercase keys for ID matching)
    'template.dailylog': 'Registro Diario',
    'template.punchlist': 'Lista de Pendientes',
    'template.rfi': 'RFI',
    'template.inspectionnotes': 'Notas de Inspección',
    'template.fieldnotes': 'Notas de Campo',
    'template.incidentreport': 'Reporte de Lesiones/Incidentes',
    // Legacy camelCase keys
    'template.dailyLog': 'Registro Diario',
    'template.dailyLogDesc': 'Resumen de trabajo diario e informe de progreso',
    'template.punchList': 'Lista de Pendientes',
    'template.punchListDesc': 'Seguimiento de deficiencias y trabajos incompletos',
    'template.rfiDesc': 'Solicitud de Información - aclarar preguntas de diseño o construcción',
    'template.inspectionNotes': 'Notas de Inspección',
    'template.inspectionNotesDesc': 'Documentar hallazgos de inspección del sitio',
    'template.fieldNotes': 'Notas de Campo',
    'template.fieldNotesDesc': 'Observaciones generales de campo',
    'template.incidentReport': 'Reporte de Lesiones/Incidentes',
    'template.incidentReportDesc': 'Documentar incidentes de seguridad y lesiones',

    // Common
    'common.today': 'Hoy',
    'common.yesterday': 'Ayer',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.done': 'Hecho',
    'common.asap': 'LO ANTES POSIBLE',
    'common.tomorrow': 'Ma\u00f1ana',
    'common.thisWeek': 'Esta Semana',
    'common.nextWeek': 'Pr\u00f3xima Semana',

    // Projects
    'project.select': 'Seleccionar Proyecto',
    'project.create': 'Crear Nuevo Proyecto',
    'project.name': 'Nombre del Nuevo Proyecto',
    'project.enterName': 'Ingresa el nombre del proyecto...',
    'project.noProjects': '\u00a1A\u00fan no hay proyectos. \u00a1Crea uno arriba!',
  },
};

// Create context
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Hook to use language
export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context) {
    return context;
  }

  // Fallback for when context is not available (during initial render)
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-diary-language');
      return (saved as Language) || 'en';
    }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('voice-diary-language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('voice-diary-language', lang);
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'es' : 'en';
    setLanguage(newLang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return { language, setLanguage, toggleLanguage, t };
}

// Export provider for use in App
export { LanguageContext };

// Standalone hook that doesn't require context
export function useLanguageStore() {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voice-diary-language');
      return (saved as Language) || 'en';
    }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('voice-diary-language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState(prev => prev === 'en' ? 'es' : 'en');
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return { language, setLanguage, toggleLanguage, t };
}
