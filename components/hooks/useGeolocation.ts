import { useState, useEffect, useCallback } from 'react';

export interface LocationData {
  lat: number;
  lng: number;
}

export const useGeolocation = (isMapMode: boolean) => {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Check location permission
  const checkLocationPermission = async (): Promise<string> => {
    // Check if Permissions API is available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state; // 'granted', 'denied', or 'prompt'
      } catch (e) {
        // Permissions API might not support 'geolocation' name in some browsers
        return 'unknown';
      }
    }
    return 'unknown';
  };

  // Format location error for user display
  const formatLocationError = (error: any): string => {
    if (!error) {
      return 'Unable to get your current location.';
    }

    const errorCode = error.code;

    // Check error codes
    if (errorCode === 1) { // PERMISSION_DENIED
      return 'Location permission was denied. Please enable location access in your browser settings and ensure your device location services are enabled.';
    } else if (errorCode === 2) { // POSITION_UNAVAILABLE
      return 'Location information is unavailable. Possible causes:\n• Device location services are disabled\n• GPS signal is weak or unavailable\n• You may be in a location where GPS cannot work (e.g., indoors, underground)';
    } else if (errorCode === 3) { // TIMEOUT
      return 'Location request timed out. This may happen if:\n• GPS signal is too weak\n• Location services are slow to respond\n• Network connectivity issues\n\nPlease try again or check your device location settings.';
    }

    // Check error message for additional clues
    const errorMessage = error.message || '';
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return 'Location request timed out. Please ensure your device location services are enabled and try again.';
    }
    if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
      return 'Location permission issue. Please check:\n• Browser location permissions\n• Device location services (system settings)\n• Try refreshing the page and granting permission again';
    }
    if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
      return 'Location is currently unavailable. Please check:\n• Device location services are enabled\n• GPS/Wi-Fi location is enabled\n• You are in an area with location coverage';
    }

    // Default error message
    return `Unable to get your current location. Error: ${errorMessage || 'Unknown error'}\n\nPlease check:\n• Browser location permissions\n• Device location services (system settings)\n• GPS signal strength\n• Network connectivity`;
  };

  // Enhanced geolocation function with retry logic and accuracy fallback
  const getCurrentPositionWithRetry = useCallback((
    onSuccess: (position: GeolocationPosition) => void,
    onError: (error: GeolocationPositionError) => void,
    maxRetries: number = 3,
    currentRetry: number = 0
  ): void => {
    // Progressive timeout and accuracy settings
    const settings = [
      { timeout: 10000, enableHighAccuracy: true },    // First attempt: high accuracy
      { timeout: 15000, enableHighAccuracy: false },   // Second attempt: fast/low accuracy
      { timeout: 20000, enableHighAccuracy: false }    // Third attempt: longer timeout/low accuracy
    ];

    const currentSettings = settings[Math.min(currentRetry, settings.length - 1)];

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        if (currentRetry < maxRetries) {
          const accuracy = currentSettings.enableHighAccuracy ? '高精度' : '普通精度';
          console.log(`位置获取尝试 ${currentRetry + 1} 失败 (${accuracy})，正在重试...`, error);
          setTimeout(() => {
            getCurrentPositionWithRetry(onSuccess, onError, maxRetries, currentRetry + 1);
          }, 1500); // Wait 1.5 seconds before retry
        } else {
          onError(error);
        }
      },
      currentSettings
    );
  }, []);

  // Get current browser location (used for live fallback)
  const getCurrentBrowserLocation = useCallback(async (): Promise<LocationData> => {
    return new Promise((resolve, reject) => {
      getCurrentPositionWithRetry(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error(formatLocationError(error)));
        }
      );
    });
  }, [getCurrentPositionWithRetry, formatLocationError]);

  // Manual location request function (must be called from user gesture)
  const requestLocation = useCallback(async () => {
    try {
      setLocationError(null);

      // Check permission first
      const permission = await checkLocationPermission();
      setHasLocationPermission(permission === 'granted');

      if (permission === 'denied') {
        setLocationError('位置权限已被拒绝。请在浏览器设置中允许位置访问，或点击"申请权限"按钮重新请求。');
        return;
      }

      if (permission !== 'granted') {
        // Permission is 'prompt' - try to request it
        // The getCurrentPosition call will trigger the browser's permission dialog
      }

      // Get current position
      await getCurrentPositionWithRetry(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationError(null);
        },
        (error) => {
          console.warn('Location request failed:', error);
          setLocationError(formatLocationError(error));
        }
      );
    } catch (error) {
      console.warn('Location request error:', error);
      setLocationError('获取位置信息时发生错误。');
    }
  }, [getCurrentPositionWithRetry, checkLocationPermission, formatLocationError]);

  // Initialize only permission check and device orientation (no automatic location request)
  useEffect(() => {
    if (!isMapMode) return;

    // Check permission status without requesting location
    checkLocationPermission().then(permission => {
      setHasLocationPermission(permission === 'granted');
    }).catch(() => {
      setHasLocationPermission(false);
    });

    // Set up device orientation listener for heading
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      // Use webkitCompassHeading if available (iOS), otherwise calculate from alpha
      let heading = (event as any).webkitCompassHeading || event.alpha;

      if (heading !== null && heading !== undefined) {
        // Convert to 0-360 range and adjust for magnetic declination if needed
        heading = Math.round(heading);
        setDeviceHeading(heading);
      }
    };

    // Add orientation listener
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    }

    return () => {
      if ('DeviceOrientationEvent' in window) {
        window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
      }
    };
  }, [isMapMode, checkLocationPermission]);

  return {
    currentLocation,
    deviceHeading,
    hasLocationPermission,
    locationError,
    requestLocation,
    getCurrentBrowserLocation,
    checkLocationPermission
  };
};
