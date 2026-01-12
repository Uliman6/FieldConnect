import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Mic } from 'lucide-react-native';

interface VoiceRecorderProps {
  onTranscription: (text: string, audioUri?: string) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
  title?: string;
}

export function VoiceRecorder({
  placeholder = 'Voice recording available on mobile',
  disabled,
  compact = false,
}: VoiceRecorderProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        disabled={true}
      >
        <Mic size={compact ? 16 : 20} color="#888" />
        <Text style={styles.text}>{placeholder}</Text>
      </Pressable>
      <Text style={styles.hint}>
        Use the mobile app to record voice notes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  containerCompact: {
    padding: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.6,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  text: {
    color: '#888',
    fontSize: 14,
  },
  hint: {
    marginTop: 8,
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
});
