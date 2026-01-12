import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Mic, Smartphone } from 'lucide-react-native';

interface MasterVoiceCaptureProps {
  onRecordingComplete: (audioUri: string) => void;
  projectName?: string;
  date: string;
}

export function MasterVoiceCapture({ projectName, date }: MasterVoiceCaptureProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Smartphone size={48} color="#888" />
      </View>

      <Text style={styles.title}>Voice Recording</Text>
      <Text style={styles.subtitle}>Available on Mobile Only</Text>

      <View style={styles.infoBox}>
        <Mic size={20} color="#666" />
        <Text style={styles.infoText}>
          Master voice capture is available in the mobile app.
          Download the app to record daily logs with voice.
        </Text>
      </View>

      {projectName && (
        <Text style={styles.meta}>
          Project: {projectName} | Date: {date}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    maxWidth: 400,
  },
  infoText: {
    flex: 1,
    color: '#666',
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    marginTop: 24,
    color: '#888',
    fontSize: 12,
  },
});
