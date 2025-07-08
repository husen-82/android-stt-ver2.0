import React, { useState } from 'react';
import { Download, X, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { usePWAManager } from '../hooks/PWAManager';

export const PWAInstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(true);
  const { isInstallable, isOnline, installPWA } = usePWAManager();

  if (!isInstallable || !showPrompt) {
    return null;
  }

  const handleInstall = async () => {
    try {
      await installPWA();
      setShowPrompt(false);
    } catch (error) {
      console.error('PWA installation failed:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 animate-fade-in">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="text-blue-600" size={20} />
            <h3 className="font-semibold text-gray-800">アプリをインストール</h3>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          ふせん君をホーム画面に追加して、より快適にご利用いただけます。
        </p>
        
        <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
          {isOnline ? (
            <>
              <Wifi size={14} className="text-green-500" />
              <span>オンライン</span>
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-red-500" />
              <span>オフライン</span>
            </>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            後で
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
          >
            <Download size={14} />
            インストール
          </button>
        </div>
      </div>
    </div>
  );
};