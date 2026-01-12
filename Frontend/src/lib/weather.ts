// Weather Service using Open-Meteo API (free, no API key required)
// Fetches current weather conditions based on project address

import { SkyCondition, WeatherConditions } from './types';

// ============================================
// TYPES
// ============================================

interface GeocodingResult {
  latitude: number;
  longitude: number;
  name: string;
  country: string;
  admin1?: string; // State/Province
}

interface OpenMeteoWeather {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    rain: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    relative_humidity_2m: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weather_code: number[];
    wind_speed_10m_max: number[];
  };
}

export interface FetchedWeather {
  low_temp: number;
  high_temp: number;
  current_temp: number;
  precipitation: string;
  wind: string;
  sky_condition: SkyCondition;
  humidity: number;
  location_name: string;
  fetched_at: string;
}

// ============================================
// GEOCODING (Address to Coordinates)
// ============================================

/**
 * Convert an address string to latitude/longitude using Open-Meteo geocoding
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    // Clean the address for the API
    const cleanAddress = address.trim();
    if (!cleanAddress) return null;

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanAddress)}&count=1&language=en&format=json`;

    console.log('[weather] Geocoding address:', cleanAddress);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[weather] Geocoding failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      console.warn('[weather] No geocoding results for:', cleanAddress);
      return null;
    }

    const result = data.results[0];
    console.log('[weather] Geocoded to:', result.name, result.latitude, result.longitude);

    return {
      latitude: result.latitude,
      longitude: result.longitude,
      name: result.name,
      country: result.country,
      admin1: result.admin1,
    };
  } catch (error) {
    console.error('[weather] Geocoding error:', error);
    return null;
  }
}

// ============================================
// WEATHER CODE MAPPING
// ============================================

/**
 * Map WMO weather codes to our SkyCondition type
 * https://open-meteo.com/en/docs (see weather code table)
 */
function weatherCodeToSkyCondition(code: number): SkyCondition {
  // Clear
  if (code === 0) return 'Clear';

  // Mainly clear, partly cloudy
  if (code === 1 || code === 2) return 'Partly Cloudy';

  // Overcast
  if (code === 3) return 'Overcast';

  // Fog, depositing rime fog
  if (code === 45 || code === 48) return 'Cloudy';

  // Drizzle (light, moderate, dense)
  if (code >= 51 && code <= 57) return 'Rainy';

  // Rain (slight, moderate, heavy)
  if (code >= 61 && code <= 67) return 'Rainy';

  // Snow (slight, moderate, heavy)
  if (code >= 71 && code <= 77) return 'Rainy'; // Using Rainy for precipitation

  // Rain showers (slight, moderate, violent)
  if (code >= 80 && code <= 82) return 'Rainy';

  // Snow showers
  if (code === 85 || code === 86) return 'Rainy';

  // Thunderstorm
  if (code >= 95 && code <= 99) return 'Stormy';

  return 'Cloudy';
}

/**
 * Get precipitation description from weather code
 */
function weatherCodeToPrecipitation(code: number, precipMm: number): string {
  if (precipMm === 0 && code < 50) return 'None';

  // Drizzle
  if (code >= 51 && code <= 53) return 'Light drizzle';
  if (code >= 54 && code <= 57) return 'Freezing drizzle';

  // Rain
  if (code === 61) return 'Light rain';
  if (code === 63) return 'Moderate rain';
  if (code === 65) return 'Heavy rain';
  if (code === 66 || code === 67) return 'Freezing rain';

  // Snow
  if (code === 71) return 'Light snow';
  if (code === 73) return 'Moderate snow';
  if (code === 75) return 'Heavy snow';
  if (code === 77) return 'Snow grains';

  // Showers
  if (code === 80) return 'Light rain showers';
  if (code === 81) return 'Moderate rain showers';
  if (code === 82) return 'Heavy rain showers';
  if (code === 85) return 'Light snow showers';
  if (code === 86) return 'Heavy snow showers';

  // Thunderstorm
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';

  if (precipMm > 0) return `${precipMm.toFixed(1)} mm`;

  return 'None';
}

/**
 * Get wind description from speed
 */
function getWindDescription(speedKmh: number, gustsKmh?: number): string {
  let description = '';

  if (speedKmh < 5) {
    description = 'Calm';
  } else if (speedKmh < 20) {
    description = 'Light breeze';
  } else if (speedKmh < 40) {
    description = 'Moderate wind';
  } else if (speedKmh < 60) {
    description = 'Strong wind';
  } else {
    description = 'Very strong wind';
  }

  // Convert to mph for US users
  const speedMph = Math.round(speedKmh * 0.621371);
  description += ` (${speedMph} mph)`;

  if (gustsKmh && gustsKmh > speedKmh + 10) {
    const gustsMph = Math.round(gustsKmh * 0.621371);
    description += `, gusts ${gustsMph} mph`;
  }

  return description;
}

// ============================================
// WEATHER FETCHING
// ============================================

/**
 * Fetch weather for given coordinates
 */
export async function fetchWeatherForCoordinates(
  latitude: number,
  longitude: number,
  locationName: string
): Promise<FetchedWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max&timezone=auto&forecast_days=1`;

    console.log('[weather] Fetching weather for:', latitude, longitude);

    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[weather] Weather fetch failed:', response.status);
      return null;
    }

    const data: OpenMeteoWeather = await response.json();

    // Convert Celsius to Fahrenheit
    const celsiusToFahrenheit = (c: number) => Math.round((c * 9/5) + 32);

    const weather: FetchedWeather = {
      low_temp: celsiusToFahrenheit(data.daily.temperature_2m_min[0]),
      high_temp: celsiusToFahrenheit(data.daily.temperature_2m_max[0]),
      current_temp: celsiusToFahrenheit(data.current.temperature_2m),
      precipitation: weatherCodeToPrecipitation(
        data.current.weather_code,
        data.daily.precipitation_sum[0]
      ),
      wind: getWindDescription(
        data.current.wind_speed_10m,
        data.current.wind_gusts_10m
      ),
      sky_condition: weatherCodeToSkyCondition(data.current.weather_code),
      humidity: data.current.relative_humidity_2m,
      location_name: locationName,
      fetched_at: new Date().toISOString(),
    };

    console.log('[weather] Fetched weather:', weather);
    return weather;
  } catch (error) {
    console.error('[weather] Weather fetch error:', error);
    return null;
  }
}

/**
 * Fetch weather for an address string
 * This is the main function to use
 */
export async function fetchWeatherForAddress(address: string): Promise<FetchedWeather | null> {
  // First geocode the address
  const location = await geocodeAddress(address);
  if (!location) {
    console.warn('[weather] Could not geocode address:', address);
    return null;
  }

  // Build location name
  const locationName = location.admin1
    ? `${location.name}, ${location.admin1}`
    : `${location.name}, ${location.country}`;

  // Then fetch weather
  return fetchWeatherForCoordinates(
    location.latitude,
    location.longitude,
    locationName
  );
}

/**
 * Convert fetched weather to WeatherConditions format for the store
 */
export function weatherToConditions(weather: FetchedWeather): Partial<WeatherConditions> {
  return {
    low_temp: weather.low_temp,
    high_temp: weather.high_temp,
    precipitation: weather.precipitation,
    wind: weather.wind,
    sky_condition: weather.sky_condition,
    weather_delay: false, // User determines this
  };
}

// ============================================
// CACHING
// ============================================

interface WeatherCache {
  [address: string]: {
    weather: FetchedWeather;
    cachedAt: number;
  };
}

const weatherCache: WeatherCache = {};
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Fetch weather with caching to avoid redundant API calls
 */
export async function fetchWeatherCached(address: string): Promise<FetchedWeather | null> {
  const cacheKey = address.toLowerCase().trim();
  const cached = weatherCache[cacheKey];

  if (cached && Date.now() - cached.cachedAt < CACHE_DURATION_MS) {
    console.log('[weather] Using cached weather for:', address);
    return cached.weather;
  }

  const weather = await fetchWeatherForAddress(address);

  if (weather) {
    weatherCache[cacheKey] = {
      weather,
      cachedAt: Date.now(),
    };
  }

  return weather;
}

/**
 * Clear the weather cache (useful for force refresh)
 */
export function clearWeatherCache(): void {
  Object.keys(weatherCache).forEach(key => delete weatherCache[key]);
  console.log('[weather] Cache cleared');
}
