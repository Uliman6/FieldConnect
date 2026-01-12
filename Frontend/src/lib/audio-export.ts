// Audio Export Utilities for creating ZIP archives with real audio files
// Supports both mobile (file:// URIs) and web (blob URLs) platforms

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { format } from 'date-fns';
import {
  Event,
  DailyLog,
  PendingIssue,
  InspectionNote,
  AdditionalWorkEntry,
  VoiceArtifact,
  generateId,
} from './types';
import { useDailyLogStore } from './store';

// ============================================
// AUDIO MANIFEST TYPES (Enhanced per spec)
// ============================================

export type AudioEntityType =
  | 'event'
  | 'pending_issue'
  | 'inspection_note'
  | 'additional_work'
  | 'daily_summary'
  | 'voice_artifact';

export type AudioSectionKey =
  | 'event'
  | 'pending_issues'
  | 'inspection_notes'
  | 'additional_work'
  | 'daily_summary'
  | 'voice_artifacts';

export interface AudioFileManifestEntry {
  audio_file_id: string;
  entity_type: AudioEntityType;
  entity_id: string;
  section_key: AudioSectionKey;
  project_id: string;
  daily_log_id: string | null;
  created_at: string;
  filename: string;
  mime_type: string;
  duration_seconds: number | null;
  original_uri: string;
  transcript_text: string | null;
}

export interface AudioManifest {
  audio_files: AudioFileManifestEntry[];
  transcript_files: TranscriptFileEntry[];
  export_metadata: {
    exported_at: string;
    total_audio_files: number;
    total_transcript_files: number;
    total_size_bytes: number | null;
  };
}

export interface TranscriptFileEntry {
  transcript_file_id: string;
  audio_file_id: string;
  entity_type: AudioEntityType;
  entity_id: string;
  filename: string;
  text: string;
  word_count: number;
}

export interface CollectedAudioFile {
  manifest_entry: AudioFileManifestEntry;
  audio_uri: string;
}

// ============================================
// AUDIO FILE COLLECTION
// ============================================

/**
 * Determine MIME type from file URI
 */
function getMimeType(uri: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes('.m4a')) return 'audio/m4a';
  if (lowerUri.includes('.mp4')) return 'audio/mp4';
  if (lowerUri.includes('.wav')) return 'audio/wav';
  if (lowerUri.includes('.webm')) return 'audio/webm';
  if (lowerUri.includes('.aac')) return 'audio/aac';
  if (lowerUri.includes('.mp3')) return 'audio/mpeg';
  // Default for expo-av HIGH_QUALITY recording
  return 'audio/m4a';
}

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
  };
  return mimeToExt[mimeType] ?? 'm4a';
}

/**
 * Generate a deterministic filename for an audio file
 */
function generateAudioFilename(
  entityType: AudioEntityType,
  entityId: string,
  mimeType: string
): string {
  const ext = getFileExtension(mimeType);
  const shortId = entityId.slice(0, 16);
  return `${entityType}_${shortId}.${ext}`;
}

/**
 * Collect all audio files from events
 */
function collectEventAudio(events: Event[]): CollectedAudioFile[] {
  const files: CollectedAudioFile[] = [];

  for (const event of events) {
    if (event.local_audio_uri) {
      const mimeType = getMimeType(event.local_audio_uri);
      const filename = generateAudioFilename('event', event.id, mimeType);

      files.push({
        audio_uri: event.local_audio_uri,
        manifest_entry: {
          audio_file_id: generateId(),
          entity_type: 'event',
          entity_id: event.id,
          section_key: 'event',
          project_id: event.project_id,
          daily_log_id: event.linked_daily_log_id,
          created_at: event.created_at,
          filename,
          mime_type: mimeType,
          duration_seconds: null,
          original_uri: event.local_audio_uri,
          transcript_text: event.transcript_text,
        },
      });
    }
  }

  return files;
}

/**
 * Collect all audio files from daily logs
 */
function collectDailyLogAudio(dailyLogs: DailyLog[]): CollectedAudioFile[] {
  const files: CollectedAudioFile[] = [];

  for (const log of dailyLogs) {
    // Daily summary audio
    if (log.daily_summary_audio_uri) {
      const mimeType = getMimeType(log.daily_summary_audio_uri);
      const filename = generateAudioFilename('daily_summary', log.id, mimeType);

      files.push({
        audio_uri: log.daily_summary_audio_uri,
        manifest_entry: {
          audio_file_id: generateId(),
          entity_type: 'daily_summary',
          entity_id: log.id,
          section_key: 'daily_summary',
          project_id: log.project_id,
          daily_log_id: log.id,
          created_at: log.created_at,
          filename,
          mime_type: mimeType,
          duration_seconds: null,
          original_uri: log.daily_summary_audio_uri,
          transcript_text: null, // Daily summary doesn't have transcript yet
        },
      });
    }

    // Pending issues audio
    for (const issue of log.pending_issues) {
      if (issue.audio_uri) {
        const mimeType = getMimeType(issue.audio_uri);
        const filename = generateAudioFilename('pending_issue', issue.id, mimeType);

        files.push({
          audio_uri: issue.audio_uri,
          manifest_entry: {
            audio_file_id: generateId(),
            entity_type: 'pending_issue',
            entity_id: issue.id,
            section_key: 'pending_issues',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename,
            mime_type: mimeType,
            duration_seconds: null,
            original_uri: issue.audio_uri,
            transcript_text: null,
          },
        });
      }
    }

    // Inspection notes audio
    for (const note of log.inspection_notes) {
      if (note.audio_uri) {
        const mimeType = getMimeType(note.audio_uri);
        const filename = generateAudioFilename('inspection_note', note.id, mimeType);

        files.push({
          audio_uri: note.audio_uri,
          manifest_entry: {
            audio_file_id: generateId(),
            entity_type: 'inspection_note',
            entity_id: note.id,
            section_key: 'inspection_notes',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename,
            mime_type: mimeType,
            duration_seconds: null,
            original_uri: note.audio_uri,
            transcript_text: null,
          },
        });
      }
    }

    // Additional work audio
    for (const work of log.additional_work) {
      if (work.audio_uri) {
        const mimeType = getMimeType(work.audio_uri);
        const filename = generateAudioFilename('additional_work', work.id, mimeType);

        files.push({
          audio_uri: work.audio_uri,
          manifest_entry: {
            audio_file_id: generateId(),
            entity_type: 'additional_work',
            entity_id: work.id,
            section_key: 'additional_work',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: log.created_at,
            filename,
            mime_type: mimeType,
            duration_seconds: null,
            original_uri: work.audio_uri,
            transcript_text: null,
          },
        });
      }
    }

    // Voice artifacts
    for (const artifact of log.voice_artifacts ?? []) {
      if (artifact.local_audio_uri) {
        const mimeType = getMimeType(artifact.local_audio_uri);
        const filename = generateAudioFilename('voice_artifact', artifact.id, mimeType);

        files.push({
          audio_uri: artifact.local_audio_uri,
          manifest_entry: {
            audio_file_id: generateId(),
            entity_type: 'voice_artifact',
            entity_id: artifact.id,
            section_key: 'voice_artifacts',
            project_id: log.project_id,
            daily_log_id: log.id,
            created_at: artifact.created_at,
            filename,
            mime_type: mimeType,
            duration_seconds: null,
            original_uri: artifact.local_audio_uri,
            transcript_text: artifact.transcript_text,
          },
        });
      }
    }
  }

  return files;
}

// ============================================
// AUDIO DATA FETCHING
// ============================================

/**
 * Fetch audio bytes from a URI
 * Works on both native (file://) and web (blob:) platforms
 */
async function fetchAudioBytes(uri: string): Promise<ArrayBuffer | null> {
  try {
    if (Platform.OS === 'web') {
      // On web, fetch the blob URL
      const response = await fetch(uri);
      if (!response.ok) {
        console.warn(`[audio-export] Failed to fetch audio: ${uri}`);
        return null;
      }
      return await response.arrayBuffer();
    } else {
      // On native, read the file as base64 then convert
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        console.warn(`[audio-export] Audio file not found: ${uri}`);
        return null;
      }

      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
  } catch (error) {
    console.error(`[audio-export] Error fetching audio from ${uri}:`, error);
    return null;
  }
}

// ============================================
// ZIP CREATION
// ============================================

export interface AudioExportOptions {
  date_from?: string;
  date_to?: string;
  project_id?: string;
}

export interface AudioExportResult {
  success: boolean;
  zipBlob?: Blob;
  zipUri?: string;
  manifest: AudioManifest;
  filesIncluded: number;
  filesSkipped: number;
  error?: string;
}

/**
 * Generate timestamped filename for export
 */
export function generateAudioPackFilename(): string {
  const now = new Date();
  const timestamp = format(now, 'yyyy-MM-dd_HHmm');
  return `lessons_applied_audio_${timestamp}.zip`;
}

/**
 * Create audio pack ZIP with all audio files and manifest
 */
export async function createAudioPackZip(
  options: AudioExportOptions = {}
): Promise<AudioExportResult> {
  const state = useDailyLogStore.getState();

  // Filter data based on options
  let filteredEvents = [...state.events];
  let filteredLogs = [...state.dailyLogs];

  if (options.project_id) {
    filteredEvents = filteredEvents.filter(e => e.project_id === options.project_id);
    filteredLogs = filteredLogs.filter(l => l.project_id === options.project_id);
  }

  if (options.date_from) {
    filteredEvents = filteredEvents.filter(
      e => e.created_at.split('T')[0] >= options.date_from!
    );
    filteredLogs = filteredLogs.filter(l => l.date >= options.date_from!);
  }

  if (options.date_to) {
    filteredEvents = filteredEvents.filter(
      e => e.created_at.split('T')[0] <= options.date_to!
    );
    filteredLogs = filteredLogs.filter(l => l.date <= options.date_to!);
  }

  // Collect all audio files
  const eventAudio = collectEventAudio(filteredEvents);
  const logAudio = collectDailyLogAudio(filteredLogs);
  const allAudioFiles = [...eventAudio, ...logAudio];

  if (allAudioFiles.length === 0) {
    return {
      success: false,
      manifest: {
        audio_files: [],
        transcript_files: [],
        export_metadata: {
          exported_at: new Date().toISOString(),
          total_audio_files: 0,
          total_transcript_files: 0,
          total_size_bytes: 0,
        },
      },
      filesIncluded: 0,
      filesSkipped: 0,
      error: 'No audio files found for the selected scope.',
    };
  }

  console.log(`[audio-export] Found ${allAudioFiles.length} audio files to export`);

  // Create ZIP
  const zip = new JSZip();
  const audioFolder = zip.folder('audio');

  if (!audioFolder) {
    return {
      success: false,
      manifest: { audio_files: [], transcript_files: [], export_metadata: { exported_at: new Date().toISOString(), total_audio_files: 0, total_transcript_files: 0, total_size_bytes: null } },
      filesIncluded: 0,
      filesSkipped: 0,
      error: 'Failed to create ZIP folder.',
    };
  }

  const manifestEntries: AudioFileManifestEntry[] = [];
  let filesIncluded = 0;
  let filesSkipped = 0;
  let totalSize = 0;

  // Process each audio file
  for (const audioFile of allAudioFiles) {
    try {
      const audioBytes = await fetchAudioBytes(audioFile.audio_uri);

      if (audioBytes) {
        audioFolder.file(audioFile.manifest_entry.filename, audioBytes);
        manifestEntries.push(audioFile.manifest_entry);
        filesIncluded++;
        totalSize += audioBytes.byteLength;
        console.log(`[audio-export] Added: ${audioFile.manifest_entry.filename}`);
      } else {
        filesSkipped++;
        console.warn(`[audio-export] Skipped (could not read): ${audioFile.audio_uri}`);
      }
    } catch (error) {
      filesSkipped++;
      console.error(`[audio-export] Error processing ${audioFile.audio_uri}:`, error);
    }
  }

  // Collect transcript entries
  const transcriptEntries: TranscriptFileEntry[] = [];
  const transcriptsFolder = zip.folder('transcripts');

  // Create transcript files for entries that have transcripts
  for (const entry of manifestEntries) {
    if (entry.transcript_text && entry.transcript_text.trim()) {
      const transcriptFilename = entry.filename.replace(/\.[^.]+$/, '.txt');
      const transcriptEntry: TranscriptFileEntry = {
        transcript_file_id: generateId(),
        audio_file_id: entry.audio_file_id,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        filename: transcriptFilename,
        text: entry.transcript_text,
        word_count: entry.transcript_text.split(/\s+/).filter(Boolean).length,
      };
      transcriptEntries.push(transcriptEntry);

      // Add transcript file to ZIP
      if (transcriptsFolder) {
        transcriptsFolder.file(transcriptFilename, entry.transcript_text);
      }
    }
  }

  // Create manifest
  const manifest: AudioManifest = {
    audio_files: manifestEntries,
    transcript_files: transcriptEntries,
    export_metadata: {
      exported_at: new Date().toISOString(),
      total_audio_files: filesIncluded,
      total_transcript_files: transcriptEntries.length,
      total_size_bytes: totalSize,
    },
  };

  // Add manifest to ZIP
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // Generate ZIP - use different output type based on platform
  try {
    let zipBlob: Blob | undefined;
    let zipUri: string | undefined;

    if (Platform.OS === 'web') {
      // On web, generate as blob
      zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      console.log(`[audio-export] ZIP created: ${filesIncluded} files, ${(totalSize / 1024).toFixed(1)} KB`);
    } else {
      // On native platforms, generate as base64 directly (Blob is not supported)
      const base64Data = await zip.generateAsync({
        type: 'base64',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      const filename = generateAudioPackFilename();
      zipUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(zipUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log(`[audio-export] ZIP saved to: ${zipUri}`);
    }

    return {
      success: true,
      zipBlob,
      zipUri,
      manifest,
      filesIncluded,
      filesSkipped,
    };
  } catch (error) {
    console.error('[audio-export] Error generating ZIP:', error);
    return {
      success: false,
      manifest,
      filesIncluded,
      filesSkipped,
      error: error instanceof Error ? error.message : 'Failed to generate ZIP file.',
    };
  }
}

// ============================================
// EXPORT HANDLERS FOR DIFFERENT PLATFORMS
// ============================================

/**
 * Trigger download on web platform
 */
export function downloadZipOnWeb(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('[audio-export] Web download failed:', error);
    return false;
  }
}

/**
 * Share ZIP file on native platforms
 */
export async function shareZipOnNative(zipUri: string): Promise<boolean> {
  try {
    const sharingAvailable = await Sharing.isAvailableAsync();
    if (sharingAvailable) {
      await Sharing.shareAsync(zipUri, {
        mimeType: 'application/zip',
        dialogTitle: 'Export Audio Pack',
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('[audio-export] Native share failed:', error);
    return false;
  }
}

/**
 * Fallback: Download individual audio files with manifest (for web when ZIP fails)
 */
export async function downloadIndividualFiles(
  options: AudioExportOptions = {}
): Promise<{ manifest: AudioManifest; downloadedCount: number }> {
  const state = useDailyLogStore.getState();

  // Filter data
  let filteredEvents = [...state.events];
  let filteredLogs = [...state.dailyLogs];

  if (options.project_id) {
    filteredEvents = filteredEvents.filter(e => e.project_id === options.project_id);
    filteredLogs = filteredLogs.filter(l => l.project_id === options.project_id);
  }

  if (options.date_from) {
    filteredEvents = filteredEvents.filter(
      e => e.created_at.split('T')[0] >= options.date_from!
    );
    filteredLogs = filteredLogs.filter(l => l.date >= options.date_from!);
  }

  if (options.date_to) {
    filteredEvents = filteredEvents.filter(
      e => e.created_at.split('T')[0] <= options.date_to!
    );
    filteredLogs = filteredLogs.filter(l => l.date <= options.date_to!);
  }

  // Collect audio files
  const eventAudio = collectEventAudio(filteredEvents);
  const logAudio = collectDailyLogAudio(filteredLogs);
  const allAudioFiles = [...eventAudio, ...logAudio];

  const manifestEntries: AudioFileManifestEntry[] = [];
  let downloadedCount = 0;

  // Download each file
  for (const audioFile of allAudioFiles) {
    try {
      const audioBytes = await fetchAudioBytes(audioFile.audio_uri);
      if (audioBytes) {
        const blob = new Blob([audioBytes], { type: audioFile.manifest_entry.mime_type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = audioFile.manifest_entry.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        manifestEntries.push(audioFile.manifest_entry);
        downloadedCount++;

        // Small delay between downloads to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`[audio-export] Failed to download ${audioFile.manifest_entry.filename}:`, error);
    }
  }

  // Collect transcript entries for downloaded files
  const transcriptEntries: TranscriptFileEntry[] = [];
  for (const entry of manifestEntries) {
    if (entry.transcript_text && entry.transcript_text.trim()) {
      transcriptEntries.push({
        transcript_file_id: generateId(),
        audio_file_id: entry.audio_file_id,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        filename: entry.filename.replace(/\.[^.]+$/, '.txt'),
        text: entry.transcript_text,
        word_count: entry.transcript_text.split(/\s+/).filter(Boolean).length,
      });
    }
  }

  // Download manifest
  const manifest: AudioManifest = {
    audio_files: manifestEntries,
    transcript_files: transcriptEntries,
    export_metadata: {
      exported_at: new Date().toISOString(),
      total_audio_files: downloadedCount,
      total_transcript_files: transcriptEntries.length,
      total_size_bytes: null,
    },
  };

  const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  const a = document.createElement('a');
  a.href = manifestUrl;
  a.download = 'manifest.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(manifestUrl);

  return { manifest, downloadedCount };
}
