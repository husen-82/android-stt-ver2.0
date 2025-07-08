import { useState, useEffect, useCallback } from 'react';

interface PWAManagerState {
  isOnline: boolean;
}

export const usePWAManager = () => {
  const [state, setState] = useState<PWAManagerState>({
    isOnline: navigator.onLine
  });

  // オンライン/オフライン状態の監視のみ維持
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      console.log('App is online');
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      console.log('App is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // PWA機能は無効化（no-op functions）
  const installPWA = useCallback(async () => {
    console.warn('PWA functionality is disabled in this environment');
  }, []);

  const applyUpdate = useCallback(async () => {
    console.warn('PWA update functionality is disabled in this environment');
  }, []);

  const registerBackgroundSync = useCallback(async (tag: string) => {
    console.warn('Background sync is disabled in this environment:', tag);
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    console.warn('Notification permission is disabled in this environment');
    return false;
  }, []);

  const sendNotification = useCallback(async (title: string, options?: NotificationOptions) => {
    console.warn('Notifications are disabled in this environment:', title);
    return null;
  }, []);

  return {
    ...state,
    // PWA機能は全て無効
    isInstallable: false,
    isInstalled: false,
    updateAvailable: false,
    installPWA,
    applyUpdate,
    registerBackgroundSync,
    requestNotificationPermission,
    sendNotification
  };
};

// PWA関連のユーティリティ関数（基本機能のみ維持）
export const PWAUtils = {
  // デバイス情報の取得
  getDeviceInfo: () => {
    const userAgent = navigator.userAgent.toLowerCase();
    return {
      isAndroid: userAgent.includes('android'),
      isIOS: userAgent.includes('iphone') || userAgent.includes('ipad'),
      isChrome: userAgent.includes('chrome'),
      isSafari: userAgent.includes('safari') && !userAgent.includes('chrome'),
      isMobile: /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)
    };
  }
};