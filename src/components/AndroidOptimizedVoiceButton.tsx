import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';

interface AndroidOptimizedVoiceButtonProps {
  isRecording: boolean;
  audioLevel: number;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => Promise<void>;
  disabled?: boolean;
}

export const AndroidOptimizedVoiceButton: React.FC<AndroidOptimizedVoiceButtonProps> = ({
  isRecording,
  audioLevel,
  onStartRecording,
  onStopRecording,
  disabled = false
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef<boolean>(false);

  // Android向けハプティックフィードバック
  const triggerHapticFeedback = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50); // 50ms振動
    }
  }, []);

  // タッチ開始処理
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (disabled) return;

    setIsPressed(true);
    setTouchStartTime(Date.now());
    isLongPressRef.current = false;
    
    triggerHapticFeedback();

    // 長押し検出タイマー
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      triggerHapticFeedback();
      
      if (!isRecording) {
        onStartRecording();
      }
    }, 500); // 500ms長押し
  }, [disabled, isRecording, onStartRecording, triggerHapticFeedback]);

  // タッチ終了処理
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    
    if (disabled) return;

    setIsPressed(false);
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const touchDuration = Date.now() - touchStartTime;

    if (isLongPressRef.current) {
      // 長押しの場合は録音停止
      if (isRecording) {
        onStopRecording();
        triggerHapticFeedback();
      }
    } else if (touchDuration < 500) {
      // 短いタップの場合はトグル
      if (isRecording) {
        onStopRecording();
      } else {
        onStartRecording();
      }
      triggerHapticFeedback();
    }

    isLongPressRef.current = false;
  }, [disabled, touchStartTime, isRecording, onStartRecording, onStopRecording, triggerHapticFeedback]);

  // タッチキャンセル処理
  const handleTouchCancel = useCallback(() => {
    setIsPressed(false);
    
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    isLongPressRef.current = false;
  }, []);

  // マウス操作（デスクトップ対応）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    
    setIsPressed(true);
    
    if (isRecording) {
      onStopRecording();
    } else {
      onStartRecording();
    }
  }, [disabled, isRecording, onStartRecording, onStopRecording]);

  const handleMouseUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  // ボタンの状態に応じたスタイル
  const getButtonStyle = () => {
    let baseClasses = "relative w-28 h-28 rounded-full flex flex-col items-center justify-center text-white font-medium transition-all duration-200 transform shadow-lg";
    
    if (disabled) {
      return `${baseClasses} bg-gray-400 cursor-not-allowed`;
    }
    
    if (isRecording) {
      return `${baseClasses} bg-red-500 hover:bg-red-600 ${isPressed ? 'scale-95' : 'scale-100'} animate-pulse`;
    }
    
    if (isPressed) {
      return `${baseClasses} bg-blue-700 scale-95`;
    }
    
    return `${baseClasses} bg-blue-600 hover:bg-blue-700 active:scale-95`;
  };

  // 音声レベルインジケーター
  const renderAudioLevelIndicator = () => {
    if (!isRecording || audioLevel === 0) return null;
    
    const levelPercentage = Math.min(audioLevel * 100, 100);
    
    return (
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div 
          className="absolute bottom-0 left-0 right-0 bg-white bg-opacity-30 transition-all duration-100"
          style={{ height: `${levelPercentage}%` }}
        />
      </div>
    );
  };

  // ボタンテキスト
  const getButtonText = () => {
    if (disabled) return "無効";
    if (isRecording) return "録音中\nタップで停止";
    return "音声入力\n長押しで開始";
  };

  // アイコン
  const getIcon = () => {
    if (isRecording) {
      return <MicOff size={32} />;
    }
    return <Mic size={32} />;
  };

  return (
    <div className="relative">
      <button
        className={getButtonStyle()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        disabled={disabled}
        style={{
          WebkitTapHighlightColor: 'transparent',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        }}
      >
        {renderAudioLevelIndicator()}
        
        <div className="relative z-10 flex flex-col items-center">
          {getIcon()}
          <span className="text-xs mt-1 text-center leading-tight whitespace-pre-line">
            {getButtonText()}
          </span>
        </div>
        
        {/* 録音中のリップル効果 */}
        {isRecording && (
          <div className="absolute inset-0 rounded-full border-4 border-white border-opacity-50 animate-ping" />
        )}
      </button>
      
      {/* 音声レベル表示 */}
      {isRecording && audioLevel > 0 && (
        <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center gap-1 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
            <Activity size={12} />
            <span>{Math.round(audioLevel * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};