/**
 * Cross-platform photo picker component
 * Works on both web (file input) and native (expo-image-picker)
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Alert, ActionSheetIOS } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, Image as ImageIcon } from 'lucide-react-native';

// Photo data structure that works on both web and native
export interface PhotoData {
  uri: string;
  name: string;
  type: string;
  file?: File | Blob; // Only available on web
}

interface PhotoPickerProps {
  onPhotoPicked: (photo: PhotoData) => Promise<void>;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function PhotoPicker({ onPhotoPicked, disabled, children }: PhotoPickerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Please grant camera and photo library permissions to add photos.',
          [{ text: 'OK' }]
        );
        return false;
      }
    }
    return true;
  };

  const pickFromLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageResult(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image from library');
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        await handleImageResult(result.assets[0]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleImageResult = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsLoading(true);
    try {
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      // For native, pass the URI directly - FormData will handle it
      const photoData: PhotoData = {
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      };

      await onPhotoPicked(photoData);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error processing image:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to process image');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebPick = () => {
    // Create file input for web
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif';
    input.multiple = false;

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsLoading(true);
      try {
        const uri = URL.createObjectURL(file);
        const photoData: PhotoData = {
          uri,
          name: file.name,
          type: file.type,
          file, // Include the File object for web
        };
        await onPhotoPicked(photoData);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('Error uploading photo:', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        alert('Failed to upload photo. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    input.click();
  };

  const showOptions = () => {
    if (disabled || isLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === 'web') {
      handleWebPick();
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickFromLibrary();
          }
        }
      );
    } else {
      // Android - show Alert as action sheet
      Alert.alert(
        'Add Photo',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Choose from Library', onPress: pickFromLibrary },
        ]
      );
    }
  };

  // If children provided, wrap them with the picker functionality
  if (children) {
    return (
      <Pressable onPress={showOptions} disabled={disabled || isLoading}>
        {children}
      </Pressable>
    );
  }

  // Default button UI
  return (
    <Pressable
      onPress={showOptions}
      disabled={disabled || isLoading}
      className="flex-row items-center bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-lg"
    >
      <Camera size={14} color="#10B981" />
      <Text className="ml-1 text-xs font-medium text-green-600 dark:text-green-400">
        {isLoading ? 'Adding...' : 'Add Photo'}
      </Text>
    </Pressable>
  );
}

export default PhotoPicker;
