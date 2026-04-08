import { Redirect } from 'expo-router';

// LEARNING: This root index handles the initial redirect based on app mode.
// For Voice Diary standalone deployment, set EXPO_PUBLIC_APP_MODE=voice-diary
const APP_MODE = process.env.EXPO_PUBLIC_APP_MODE || 'fieldconnect';

export default function Index() {
  if (APP_MODE === 'voice-diary') {
    return <Redirect href="/(voice-diary)" />;
  }

  return <Redirect href="/(tabs)" />;
}
