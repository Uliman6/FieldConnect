import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  SafeAreaView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { X, Share2 } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';

interface PDFViewerModalProps {
  visible: boolean;
  pdfUri: string | null;
  title?: string;
  onClose: () => void;
}

export function PDFViewerModal({ visible, pdfUri, title = 'PDF Preview', onClose }: PDFViewerModalProps) {
  const [loading, setLoading] = React.useState(true);

  const handleShare = async () => {
    if (!pdfUri) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share PDF',
        });
      }
    } catch (error) {
      console.error('Failed to share PDF:', error);
    }
  };

  if (!pdfUri) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-gray-900">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            className="p-2"
          >
            <X size={24} color="#fff" />
          </Pressable>
          
          <Text className="text-white font-semibold text-base flex-1 text-center" numberOfLines={1}>
            {title}
          </Text>
          
          <Pressable onPress={handleShare} className="p-2">
            <Share2 size={22} color="#fff" />
          </Pressable>
        </View>

        {/* PDF Content */}
        <View className="flex-1 bg-gray-100">
          {loading && (
            <View className="absolute inset-0 items-center justify-center bg-gray-100 z-10">
              <ActivityIndicator size="large" color="#4B6F44" />
              <Text className="mt-3 text-gray-600">Loading PDF...</Text>
            </View>
          )}
          
          {Platform.OS === 'web' ? (
            <iframe
              src={pdfUri}
              style={{ width: '100%', height: '100%', border: 'none' }}
              onLoad={() => setLoading(false)}
            />
          ) : (
            <WebView
              source={{ uri: pdfUri }}
              style={{ flex: 1 }}
              onLoadEnd={() => setLoading(false)}
              onError={(e) => {
                console.error('WebView error:', e.nativeEvent);
                setLoading(false);
              }}
              allowFileAccess={true}
              allowFileAccessFromFileURLs={true}
              allowUniversalAccessFromFileURLs={true}
              originWhitelist={['*']}
              javaScriptEnabled={true}
              scalesPageToFit={true}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
