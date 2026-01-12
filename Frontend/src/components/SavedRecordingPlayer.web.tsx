import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { FileText, Smartphone, Trash2 } from 'lucide-react-native';

interface SavedRecordingPlayerProps {
  audioUri: string;
  recordedAt?: string;
  transcriptText?: string | null;
  isTranscribing?: boolean;
  transcriptionError?: string | null;
  onDelete?: () => void;
  onReRecord?: () => void;
  onRetryTranscription?: () => void;
  compact?: boolean;
}

export function SavedRecordingPlayer({
  recordedAt,
  transcriptText,
  isTranscribing = false,
  transcriptionError,
  onDelete,
  compact = false,
}: SavedRecordingPlayerProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Audio playback notice */}
      <View style={styles.audioNotice}>
        <Smartphone size={16} color="#888" />
        <Text style={styles.audioNoticeText}>
          Audio playback available on mobile
        </Text>
      </View>

      {/* Transcript display */}
      {transcriptText ? (
        <View style={styles.transcriptContainer}>
          <View style={styles.transcriptHeader}>
            <FileText size={14} color="#666" />
            <Text style={styles.transcriptLabel}>Transcript</Text>
          </View>
          <ScrollView style={styles.transcriptScroll}>
            <Text style={styles.transcriptText}>{transcriptText}</Text>
          </ScrollView>
        </View>
      ) : isTranscribing ? (
        <View style={styles.transcribingContainer}>
          <Text style={styles.transcribingText}>Transcribing...</Text>
        </View>
      ) : transcriptionError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{transcriptionError}</Text>
        </View>
      ) : (
        <View style={styles.noTranscriptContainer}>
          <Text style={styles.noTranscriptText}>No transcript available</Text>
        </View>
      )}

      {/* Metadata and actions */}
      <View style={styles.footer}>
        {recordedAt && (
          <Text style={styles.recordedAt}>
            Recorded: {new Date(recordedAt).toLocaleString()}
          </Text>
        )}

        {onDelete && (
          <Pressable style={styles.deleteButton} onPress={onDelete}>
            <Trash2 size={16} color="#ef4444" />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 16,
  },
  containerCompact: {
    padding: 12,
  },
  audioNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  audioNoticeText: {
    color: '#888',
    fontSize: 13,
  },
  transcriptContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  transcriptLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  transcriptScroll: {
    maxHeight: 150,
  },
  transcriptText: {
    color: '#333',
    fontSize: 14,
    lineHeight: 20,
  },
  transcribingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  transcribingText: {
    color: '#666',
    fontSize: 14,
  },
  errorContainer: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
  },
  noTranscriptContainer: {
    padding: 16,
    alignItems: 'center',
  },
  noTranscriptText: {
    color: '#888',
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  recordedAt: {
    color: '#888',
    fontSize: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 13,
  },
});
