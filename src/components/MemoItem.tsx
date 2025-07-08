import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Volume2, Trash2, Play, Pause } from 'lucide-react';
import { calculateMemoSize } from '../utils/sizeCalculator';
import { AudioRecording } from '../hooks/IndexedDBAudio';
import { TextPopup } from './TextPopup';

interface Memo {
  id: number;
  text: string;
  audioRecording?: AudioRecording | null;
  createdAt: number;
  currentSize: number;
  type: 'text' | 'audio' | 'mixed';
}

interface MemoItemProps {
  memo: Memo;
  onDelete: () => void;
}

export const MemoItem: React.FC<MemoItemProps> = ({ memo, onDelete }) => {
  const [showTextPopup, setShowTextPopup] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDirection, setDeleteDirection] = useState<'left' | 'right' | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const memoRef = useRef<HTMLDivElement>(null);

  const currentSize = calculateMemoSize(memo.createdAt);
  const baseHeight = 80;
  const height = Math.round(baseHeight * currentSize);

  // Calculate font size based on memo size
  const baseFontSize = 16;
  const fontSize = Math.max(baseFontSize, Math.round(baseFontSize * (currentSize * 0.5 + 0.5)));

  // 改善された背景色計算（1-24時間の変化を強調）
  const getBackgroundColor = (size: number) => {
    const normalizedSize = Math.min(Math.max(size - 1, 0) / 7, 1); // 0-1の範囲に正規化（最大8.0に対応）
    
    if (normalizedSize <= 0.125) { // 1時間未満 - 薄い黄色
      const intensity = normalizedSize * 8;
      const r = 255;
      const g = Math.round(250 - intensity * 5);
      const b = Math.round(122 + intensity * 3);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalizedSize <= 0.375) { // 1-6時間 - 黄色→オレンジ（変化強調）
      const intensity = (normalizedSize - 0.125) / 0.25;
      const r = 255;
      const g = Math.round(245 - intensity * 90); // 245 → 155
      const b = Math.round(125 - intensity * 69); // 125 → 56
      return `rgb(${r}, ${g}, ${b})`;
    } else if (normalizedSize <= 0.625) { // 6-24時間 - オレンジ→赤（変化強調）
      const intensity = (normalizedSize - 0.375) / 0.25;
      const r = 255;
      const g = Math.round(155 - intensity * 59); // 155 → 96
      const b = Math.round(56 - intensity * 21); // 56 → 35
      return `rgb(${r}, ${g}, ${b})`;
    } else { // 24時間以上 - 濃い赤系
      const intensity = (normalizedSize - 0.625) / 0.375;
      const r = 255;
      const g = Math.round(96 - intensity * 0); // 96のまま
      const b = Math.round(35 + intensity * 61); // 35 → 96
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // 音声再生機能の修正
  const playAudio = async () => {
    if (!memo.audioRecording) {
      console.warn('音声データが見つかりません');
      return;
    }

    try {
      if (isPlaying) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
        }
        return;
      }

      // 新しいAudioインスタンスを作成
      const audio = new Audio();
      audioRef.current = audio;

      // 音声データの形式を確認して適切に設定
      if (memo.audioRecording.audioUrl) {
        audio.src = memo.audioRecording.audioUrl;
      } else if (memo.audioRecording.audioBlob) {
        // Blobから新しいURLを作成
        const audioUrl = URL.createObjectURL(memo.audioRecording.audioBlob);
        audio.src = audioUrl;
      } else {
        throw new Error('音声データが無効です');
      }

      // イベントリスナーを設定
      audio.onloadstart = () => console.log('音声読み込み開始');
      audio.oncanplay = () => console.log('音声再生準備完了');
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = (e) => {
        console.error('音声再生エラー:', e);
        setIsPlaying(false);
        audioRef.current = null;
        alert('音声の再生に失敗しました');
      };

      // 音声を読み込んで再生
      audio.load();
      await audio.play();
      
    } catch (error) {
      console.error('音声再生エラー:', error);
      setIsPlaying(false);
      audioRef.current = null;
      alert('音声の再生に失敗しました');
    }
  };

  useEffect(() => {
    return () => {
      // コンポーネントアンマウント時のクリーンアップ
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // スライド削除アニメーション付きの削除処理
  const handleDeleteWithAnimation = (direction: 'left' | 'right') => {
    setIsDeleting(true);
    setDeleteDirection(direction);
    
    // アニメーション完了後に削除処理を実行
    setTimeout(() => {
      onDelete();
    }, 300);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = Math.abs(touchEnd.y - touchStart.y);

    // スワイプで直接削除（ポップアップ確認なし）
    if (Math.abs(deltaX) > 100 && deltaY < 50) {
      const direction = deltaX > 0 ? 'right' : 'left';
      handleDeleteWithAnimation(direction);
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  const handleTextClick = (e: React.MouseEvent) => {
    // ボタンクリックの場合は無視
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setShowTextPopup(true);
  };

  // 文字数制限用のヘルパー関数
  const truncateText = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  };

  // Format text with first 2 characters larger
  const formatText = (text: string) => {
    if (text.length < 2) return text;
    
    const firstTwo = text.substring(0, 2);
    const rest = text.substring(2);
    
    return (
      <>
        <span className="font-bold" style={{ fontSize: `${fontSize * 1.5}px` }}>
          {firstTwo}
        </span>
        <span style={{ fontSize: `${fontSize}px` }}>{rest}</span>
      </>
    );
  };

  return (
    <>
      <div 
        ref={memoRef}
        className={`border border-[#ffeaa7] rounded-lg p-4 shadow-md relative hover:shadow-lg cursor-pointer transition-all duration-300 ease-in-out ${
          isDeleting ? 'memo-delete-animation' : ''
        }`}
        style={{ 
          height: `${height}px`,
          backgroundColor: getBackgroundColor(currentSize),
          boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
          transform: isDeleting ? 
            `translateX(${deleteDirection === 'right' ? '100%' : '-100%'}) scale(0.8)` : 
            'translateX(0) scale(1)',
          opacity: isDeleting ? 0 : 1,
          transition: isDeleting ? 
            'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' : 
            'all 0.3s ease-in-out, background-color 0.5s ease-in-out, transform 0.2s ease-out'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTextClick}
      >
        <div className="flex justify-between items-start h-full">
          <div className="flex-1 overflow-hidden">
            <p 
              className="text-[#333333] leading-relaxed break-words items-center"
              style={{ 
                lineHeight: '1.5',
                position: 'relative',
                top:'5px',
              }}
            >
              {formatText(truncateText(memo.text,15))}
            </p>
          </div>

          <div className="flex flex-col gap-2 ml-2">
            {memo.audioRecording && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playAudio();
                }}
                className={`w-7 h-7 rounded-full text-white flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200 transform active:scale-95 ${
                  isPlaying ? 'bg-[#28a745]' : 'bg-[#007bff]'
                }`}
                style={{
                  position:'relative',
                  top:'-10px'
                } as React.CSSProperties}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteWithAnimation('right');
              }}
              className="w-7 h-7 rounded-full bg-[#dc3545] text-white flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200 transform active:scale-95"
              style={{
                position:'relative',
                top:'-15px'
              } as React.CSSProperties}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        
        <audio ref={audioRef} />
      </div>
      
      {/* Text Detail Popup */}
      <TextPopup 
        text={memo.text}
        isOpen={showTextPopup}
        onClose={() => setShowTextPopup(false)}
      />
    </>
  );
};