import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { MapPin, X, Check } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';

interface AddressSuggestion {
  id: string;
  name: string;
  fullAddress: string;
  city?: string;
  state?: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectAddress?: (address: AddressSuggestion) => void;
  placeholder?: string;
  label?: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Fetch address suggestions from Open-Meteo Geocoding API
 */
async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  if (!query || query.length < 3) return [];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();

    if (!data.results || data.results.length === 0) return [];

    return data.results.map((result: any) => {
      // Build full address string
      const parts: string[] = [result.name];
      if (result.admin1) parts.push(result.admin1);
      if (result.country && result.country !== result.admin1) parts.push(result.country);

      return {
        id: `${result.latitude}-${result.longitude}`,
        name: result.name,
        fullAddress: parts.join(', '),
        city: result.name,
        state: result.admin1,
        country: result.country,
        latitude: result.latitude,
        longitude: result.longitude,
      };
    });
  } catch (error) {
    console.error('[address] Autocomplete error:', error);
    return [];
  }
}

export function AddressAutocomplete({
  value,
  onChangeText,
  onSelectAddress,
  placeholder = 'Enter address...',
  label,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<AddressSuggestion | null>(null);

  const inputRef = useRef<TextInput>(null);
  const debouncedQuery = useDebounce(inputValue, 300);

  // Sync external value changes
  useEffect(() => {
    if (value !== inputValue && !showSuggestions) {
      setInputValue(value);
    }
  }, [value]);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedQuery || debouncedQuery.length < 3 || selectedAddress) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      const results = await fetchAddressSuggestions(debouncedQuery);
      setSuggestions(results);
      setIsLoading(false);

      if (results.length > 0) {
        setShowSuggestions(true);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, selectedAddress]);

  const handleInputChange = useCallback((text: string) => {
    setInputValue(text);
    setSelectedAddress(null);
    onChangeText(text);

    if (text.length >= 3) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [onChangeText]);

  const handleSelectSuggestion = useCallback((suggestion: AddressSuggestion) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }

    setInputValue(suggestion.fullAddress);
    setSelectedAddress(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    onChangeText(suggestion.fullAddress);
    onSelectAddress?.(suggestion);
    Keyboard.dismiss();
  }, [onChangeText, onSelectAddress]);

  const handleClear = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
    setInputValue('');
    setSelectedAddress(null);
    setSuggestions([]);
    setShowSuggestions(false);
    onChangeText('');
    inputRef.current?.focus();
  }, [onChangeText]);

  const handleFocus = useCallback(() => {
    if (suggestions.length > 0 && !selectedAddress) {
      setShowSuggestions(true);
    }
  }, [suggestions, selectedAddress]);

  const handleBlur = useCallback(() => {
    // Delay hiding to allow tap on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  return (
    <View className="mb-3">
      {label && (
        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
          {label}
        </Text>
      )}

      <View className="relative">
        {/* Input field */}
        <View className="flex-row items-center bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
          <View className="pl-3">
            <MapPin size={18} color={selectedAddress ? '#10B981' : '#9CA3AF'} />
          </View>

          <TextInput
            ref={inputRef}
            value={inputValue}
            onChangeText={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
            className="flex-1 px-3 py-3 text-base text-gray-900 dark:text-white"
            autoCapitalize="words"
            autoCorrect={false}
          />

          {isLoading && (
            <View className="pr-3">
              <ActivityIndicator size="small" color="#F97316" />
            </View>
          )}

          {selectedAddress && !isLoading && (
            <View className="pr-3">
              <Check size={18} color="#10B981" />
            </View>
          )}

          {inputValue.length > 0 && !isLoading && (
            <Pressable onPress={handleClear} className="pr-3 py-2">
              <X size={18} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden"
            style={{ elevation: 5 }}
          >
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.id}
                onPress={() => handleSelectSuggestion(suggestion)}
                className={cn(
                  'flex-row items-center px-4 py-3',
                  index < suggestions.length - 1 && 'border-b border-gray-100 dark:border-gray-700'
                )}
              >
                <MapPin size={16} color="#F97316" />
                <View className="flex-1 ml-3">
                  <Text className="text-base text-gray-900 dark:text-white" numberOfLines={1}>
                    {suggestion.name}
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400" numberOfLines={1}>
                    {suggestion.state ? `${suggestion.state}, ` : ''}{suggestion.country}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* No results message */}
        {showSuggestions && !isLoading && suggestions.length === 0 && inputValue.length >= 3 && (
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(100)}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 p-4"
            style={{ elevation: 5 }}
          >
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-center">
              No addresses found. Try a different search.
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Selected address confirmation */}
      {selectedAddress && (
        <Animated.View
          entering={FadeIn.duration(200)}
          className="flex-row items-center mt-2 px-1"
        >
          <Check size={12} color="#10B981" />
          <Text className="ml-1 text-xs text-green-600 dark:text-green-400">
            Address verified: {selectedAddress.city}, {selectedAddress.state ?? selectedAddress.country}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
