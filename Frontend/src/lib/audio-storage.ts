// Audio Storage Utilities
// Handles persistent storage of audio files so they survive app restarts

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { generateId } from './types';

// Directory for persistent audio storage
const AUDIO_DIRECTORY = `${FileSystem.documentDirectory}audio/`;

/**
 * Ensure the audio directory exists
 */
export async function ensureAudioDirectory(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const dirInfo = await FileSystem.getInfoAsync(AUDIO_DIRECTORY);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(AUDIO_DIRECTORY, { intermediates: true });
      console.log('[audio-storage] Created audio directory');
    }
  } catch (error) {
    console.error('[audio-storage] Error creating audio directory:', error);
  }
}

/**
 * Get file extension from URI
 */
function getExtension(uri: string): string {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.includes('.m4a')) return '.m4a';
  if (lowerUri.includes('.mp4')) return '.mp4';
  if (lowerUri.includes('.wav')) return '.wav';
  if (lowerUri.includes('.webm')) return '.webm';
  if (lowerUri.includes('.aac')) return '.aac';
  if (lowerUri.includes('.mp3')) return '.mp3';
  // Default for expo-av HIGH_QUALITY recording
  return '.m4a';
}

/**
 * Copy a temporary audio file to persistent storage
 * Returns the new permanent URI, or the original URI on web/failure
 */
export async function persistAudioFile(tempUri: string): Promise<string> {
  // On web, blob URLs work differently - just return as-is
  if (Platform.OS === 'web') {
    return tempUri;
  }

  // If already in our persistent directory, return as-is
  if (tempUri.startsWith(AUDIO_DIRECTORY)) {
    return tempUri;
  }

  try {
    await ensureAudioDirectory();

    // Check if source file exists
    const sourceInfo = await FileSystem.getInfoAsync(tempUri);
    if (!sourceInfo.exists) {
      console.warn('[audio-storage] Source file does not exist:', tempUri);
      return tempUri;
    }

    // Generate unique filename
    const extension = getExtension(tempUri);
    const timestamp = Date.now();
    const uniqueId = generateId();
    const filename = `recording_${timestamp}_${uniqueId}${extension}`;
    const permanentUri = `${AUDIO_DIRECTORY}${filename}`;

    // Copy to permanent location
    await FileSystem.copyAsync({
      from: tempUri,
      to: permanentUri,
    });

    console.log('[audio-storage] Persisted audio:', permanentUri);

    // Optionally delete the temp file to save space
    try {
      await FileSystem.deleteAsync(tempUri, { idempotent: true });
    } catch {
      // Ignore deletion errors - temp files will be cleaned up eventually
    }

    return permanentUri;
  } catch (error) {
    console.error('[audio-storage] Error persisting audio file:', error);
    return tempUri;
  }
}

/**
 * Check if an audio file exists
 */
export async function audioFileExists(uri: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // On web, blob URLs are valid as long as they haven't been revoked
    // We can't really check this, so assume they exist
    return true;
  }

  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Delete an audio file
 */
export async function deleteAudioFile(uri: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    console.log('[audio-storage] Deleted audio:', uri);
  } catch (error) {
    console.error('[audio-storage] Error deleting audio file:', error);
  }
}

/**
 * Get the size of an audio file in bytes
 */
export async function getAudioFileSize(uri: string): Promise<number | null> {
  if (Platform.OS === 'web') return null;

  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info) {
      return info.size;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List all persisted audio files
 */
export async function listPersistedAudioFiles(): Promise<string[]> {
  if (Platform.OS === 'web') return [];

  try {
    await ensureAudioDirectory();
    const files = await FileSystem.readDirectoryAsync(AUDIO_DIRECTORY);
    return files.map(f => `${AUDIO_DIRECTORY}${f}`);
  } catch (error) {
    console.error('[audio-storage] Error listing audio files:', error);
    return [];
  }
}

/**
 * Clean up orphaned audio files that are no longer referenced
 * Pass in all URIs that should be kept
 */
export async function cleanupOrphanedAudioFiles(keepUris: string[]): Promise<number> {
  if (Platform.OS === 'web') return 0;

  try {
    const allFiles = await listPersistedAudioFiles();
    const keepSet = new Set(keepUris);
    let deletedCount = 0;

    for (const file of allFiles) {
      if (!keepSet.has(file)) {
        await deleteAudioFile(file);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[audio-storage] Cleaned up ${deletedCount} orphaned audio files`);
    }

    return deletedCount;
  } catch (error) {
    console.error('[audio-storage] Error cleaning up orphaned files:', error);
    return 0;
  }
}
