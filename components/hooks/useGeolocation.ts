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
    // Special handling for WeChat and mobile browsers
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isEdge = /edg/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

    // For WeChat and problematic mobile browsers, be more aggressive
    if (isWeChat || (isAndroid && isEdge)) {
      // WeChat and some mobile browsers have issues with Permissions API
      // Try direct geolocation call with very short timeout
      try {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('timeout'));
          }, 2000); // Very short timeout for quick check

          navigator.geolocation.getCurrentPosition(
            (position) => {
              clearTimeout(timeoutId);
              resolve(position);
            },
            (error) => {
              clearTimeout(timeoutId);
              reject(error);
            },
            {
              timeout: 2000,
              enableHighAccuracy: false,
              maximumAge: 30000 // Accept cached positions up to 30 seconds old
            }
          );
        });
        return 'granted';
      } catch (error: any) {
        if (error.code === 1) { // PERMISSION_DENIED
          return 'denied';
        }
        // For WeChat and Edge, treat timeout/network errors as potentially recoverable
        return 'prompt'; // Encourage user to try again
      }
    }

    // Check if Permissions API is available for modern browsers
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state; // 'granted', 'denied', or 'prompt'
      } catch (e) {
        // Permissions API might not support 'geolocation' name in some browsers
        console.log('Permissions API not fully supported, falling back to basic check');
      }
    }

    // Fallback for browsers without full Permissions API support
    if (isMobile) {
      // Try a quick geolocation call to test permission
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (error) => reject(error),
            { timeout: 5000, enableHighAccuracy: false, maximumAge: 30000 }
          );
        });
        return 'granted';
      } catch (error: any) {
        if (error.code === 1) { // PERMISSION_DENIED
          return 'denied';
        }
        // Other errors might be temporary, treat as unknown
        return 'unknown';
      }
    }

    return 'unknown';
  };

  // Format location error for user display
  const formatLocationError = (error: any): string => {
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!error) {
      return '无法获取您的当前位置。';
    }

    const errorCode = error.code;

    // Check error codes
    if (errorCode === 1) { // PERMISSION_DENIED
      if (isWeChat) {
        return '位置权限被拒绝。在微信中：\n1. 点击地址栏右侧的设置图标\n2. 选择"允许使用位置信息"\n3. 刷新页面后重试\n\n或者在微信设置中允许位置权限。';
      } else if (isMobile) {
        if (isAndroid) {
          return '位置权限被拒绝。请检查：\n1. 浏览器设置中的位置权限\n2. 系统设置 > 应用 > [浏览器] > 权限 > 位置\n3. 设备的位置服务开关\n4. 刷新页面后重新授权';
        } else if (isIOS) {
          return '位置权限被拒绝。请检查：\n1. Safari设置中的位置权限\n2. 系统设置 > 隐私与安全性 > 定位服务\n3. 允许该网站访问位置信息\n4. 刷新页面后重试';
        }
        return '位置权限被拒绝。请在浏览器设置中允许位置访问，并确保设备位置服务已开启。';
      }
      return '位置权限被拒绝。请在浏览器设置中允许位置访问权限。';
    } else if (errorCode === 2) { // POSITION_UNAVAILABLE
      if (isWeChat) {
        return '位置信息不可用。微信中可能的原因：\n• 微信未获得位置权限\n• 网络环境不佳\n• GPS信号弱\n\n建议：退出微信重新进入，或使用手机自带浏览器试试。';
      } else if (isMobile) {
        return '位置信息不可用。可能的原因：\n• 设备位置服务未开启\n• GPS信号弱或无信号\n• 室内环境或网络问题\n• 浏览器不支持精确定位\n\n请检查设备设置并尝试在室外使用。';
      }
      return '位置信息不可用。可能的原因：\n• 设备位置服务未开启\n• GPS信号弱\n• 室内环境限制\n• 网络连接问题';
    } else if (errorCode === 3) { // TIMEOUT
      if (isWeChat) {
        return '位置请求超时。微信中可能的原因：\n• 网络连接慢\n• GPS信号弱\n• 微信定位功能受限\n\n建议：检查网络连接，或使用其他浏览器试试。';
      } else if (isMobile) {
        return '位置请求超时。可能的原因：\n• GPS信号弱\n• 网络连接问题\n• 定位服务响应慢\n\n请在有良好网络和GPS信号的地方重试。';
      }
      return '位置请求超时。请检查网络连接和GPS信号后重试。';
    }

    // Check error message for additional clues
    const errorMessage = error.message || '';
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return '位置请求超时。请确保设备位置服务已开启并在有良好GPS信号的地方重试。';
    }
    if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
      if (isWeChat) {
        return '位置权限问题。在微信中：\n1. 点击地址栏右侧设置图标\n2. 允许位置信息访问\n3. 如不行，请在微信设置中开启位置权限\n4. 刷新页面重试';
      }
      return '位置权限问题。请检查浏览器和系统的位置权限设置。';
    }
    if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
      return '位置服务当前不可用。请检查：\n• 设备位置服务是否开启\n• GPS/Wi-Fi定位是否启用\n• 是否在有定位信号覆盖的区域';
    }

    // Default error message with browser-specific guidance
    let defaultMsg = `无法获取当前位置。错误：${errorMessage || '未知错误'}\n\n请检查：\n• 浏览器位置权限\n• 设备位置服务设置\n• GPS信号强度\n• 网络连接状态`;

    if (isWeChat) {
      defaultMsg += '\n\n微信用户额外检查：\n• 微信版本是否为最新\n• 是否在微信设置中允许了位置权限\n• 尝试使用手机自带浏览器';
    } else if (isMobile) {
      defaultMsg += '\n\n移动设备用户检查：\n• 系统位置服务是否开启\n• 应用的定位权限\n• GPS和网络定位是否启用';
    }

    return defaultMsg;
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

      // Check if geolocation is available
      if (!navigator.geolocation) {
        setLocationError('此设备或浏览器不支持地理位置功能。请尝试使用现代浏览器。');
        return;
      }

      const isWeChat = /micromessenger/i.test(navigator.userAgent);
      const isAndroid = /android/i.test(navigator.userAgent);
      const isEdge = /edg/i.test(navigator.userAgent);

      // Check permission first
      const permission = await checkLocationPermission();
      setHasLocationPermission(permission === 'granted');

      if (permission === 'denied') {
        const deniedMessage = isWeChat
          ? '微信中位置权限被拒绝。请尝试：\n1. 点击地址栏右侧的设置图标\n2. 选择"允许使用位置信息"\n3. 或者在微信设置 > 通用 > 访问权限 中开启位置权限\n4. 刷新页面后重试'
          : isAndroid && isEdge
          ? 'Edge浏览器位置权限被拒绝。请尝试：\n1. 点击地址栏左侧的锁图标\n2. 选择"网站权限" > "位置"\n3. 选择"允许"\n4. 刷新页面后重试'
          : '位置权限被拒绝。如需使用定位功能，请在浏览器设置中允许位置访问权限。';
        setLocationError(deniedMessage);
        return;
      }

      // Special handling for WeChat and problematic mobile browsers
      if ((isWeChat || (isAndroid && isEdge)) && permission === 'unknown') {
        const specialMessage = isWeChat
          ? '微信浏览器需要额外的位置权限设置。请尝试：\n1. 点击地址栏右侧的设置图标\n2. 选择"允许使用位置信息"\n3. 刷新页面后重试\n\n如果仍然失败，请在微信设置中开启位置权限。'
          : 'Edge浏览器可能需要额外的位置权限设置。请尝试：\n1. 点击地址栏左侧的锁图标\n2. 选择"网站权限" > "位置" > "允许"\n3. 刷新页面后重试';
        setLocationError(specialMessage);
        return;
      }

      // Get current position
      await getCurrentPositionWithRetry(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationError(null);
          setHasLocationPermission(true);
        },
        (error) => {
          console.warn('Location request failed:', error);
          setLocationError(formatLocationError(error));
          setHasLocationPermission(false);
        }
      );
    } catch (error) {
      console.warn('Location request error:', error);
      setLocationError('获取位置信息时发生错误。请检查网络连接和位置权限设置。');
    }
  }, [getCurrentPositionWithRetry, checkLocationPermission, formatLocationError]);

  // Initialize only permission check and device orientation (no automatic location request)
  useEffect(() => {
    if (!isMapMode) return;

    // Special handling for mobile browsers and WeChat
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

    // Check permission status without requesting location
    checkLocationPermission().then(permission => {
      setHasLocationPermission(permission === 'granted');

      // For WeChat and mobile browsers, provide additional guidance
      if ((isWeChat || isMobile) && permission === 'unknown') {
        console.log('Mobile browser detected, location permission status unclear');
        // Don't set an error here, let the user try to request location
      }
    }).catch((error) => {
      console.warn('Permission check failed:', error);
      setHasLocationPermission(false);

      // For mobile browsers, don't immediately show error - let user try
      if (isWeChat || isMobile) {
        console.log('Mobile browser permission check failed, will retry on user request');
      }
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
    setLocationError,
    requestLocation,
    getCurrentBrowserLocation,
    checkLocationPermission
  };
};
