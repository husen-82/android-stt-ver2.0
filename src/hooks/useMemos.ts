//元のメモコード
/*import { useState, useEffect, useCallback } from 'react';
import { calculateMemoSize } from '../utils/sizeCalculator';

interface Memo {
  id: number;
  text: string;
  audioBlob?: Blob | null;
  createdAt: number;
  currentSize: number;
}

export const useMemos = () => {
  const [memos, setMemos] = useState<Memo[]>([]);

  // Load memos from localStorage on mount
  useEffect(() => {
    const savedMemos = localStorage.getItem('fusenkun-memos');
    if (savedMemos) {
      try {
        const parsed = JSON.parse(savedMemos);
        // オーディオログはローカルに保存できないため除外
        const memosWithoutAudio = parsed.map((memo: Memo) => ({
          ...memo,
          audioBlob: null
        }));
        setMemos(memosWithoutAudio);
      } catch (error) {
        console.error('Error loading memos:', error);
      }
    }
  }, []);

  // Save memos to localStorage whenever memos change
  useEffect(() => {
    const memosToSave = memos.map(memo => ({
      ...memo,
      audioBlob: null // Don't save audio blobs to localStorage
    }));
    localStorage.setItem('fusenkun-memos', JSON.stringify(memosToSave));
  }, [memos]);

  const addMemo = useCallback((text: string, audioBlob?: Blob | null) => {
    if (memos.length >= 15) {
      alert('メモの数が上限に達しました。古いメモを削除してください。');
      return;
    }

    const newMemo: Memo = {
      id: Date.now(),
      text: text.trim(),
      audioBlob,
      createdAt: Date.now(),
      currentSize: 1.0
    };

    setMemos(prev => [newMemo, ...prev]);
  }, [memos.length]);

  const deleteMemo = useCallback((id: number) => {
    setMemos(prev => prev.filter(memo => memo.id !== id));
  }, []);

  const updateMemoSizes = useCallback(() => {
    setMemos(prev => prev.map(memo => ({
      ...memo,
      currentSize: calculateMemoSize(memo.createdAt)
    })));
  }, []);

  return {
    memos,
    addMemo,
    deleteMemo,
    updateMemoSizes
  };
};
*/


//ボイスレコーダーと関連付けしたニューコード
//indexedDB前のコード　
/*
import { useState, useEffect, useCallback } from 'react';
import { calculateMemoSize } from '../utils/sizeCalculator';
import { AudioRecording } from './useVoiceRecognition';

export interface Memo {
  id: number;
  text: string;
  audioRecording?: AudioRecording | null;
  createdAt: number;
  currentSize: number;
  type: 'text' | 'audio' | 'mixed'; // メモの種類を判別
}

export interface MemoStats {
  total: number;
  textOnly: number;
  audioOnly: number;
  mixed: number;
  totalAudioDuration: number;
}

export type SortOrder = 'newest-first' | 'oldest-first' | 'alphabetical' | 'type' | 'size';

export const useMemos = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest-first'); // デフォルトを古い順に変更

  // LocalStorageからメモを読み込み
  useEffect(() => {
    const loadMemos = async () => {
      setIsLoading(true);
      try {
        const savedMemos = localStorage.getItem('fusenkun-memos');
        if (savedMemos) {
          const parsed = JSON.parse(savedMemos);
          // 音声データは保存されていないため、テキストメモのみ復元
          const memosWithoutAudio = parsed.map((memo: any) => ({
            id: memo.id,
            text: memo.text || '',
            audioRecording: null, // 音声データは復元できない
            createdAt: memo.createdAt,
            currentSize: calculateMemoSize(memo.createdAt),
            type: memo.audioRecording ? 'mixed' : 'text' as 'text' | 'audio' | 'mixed'
          }));
          setMemos(memosWithoutAudio);
        }
      } catch (error) {
        console.error('メモの読み込みエラー:', error);
        // エラーの場合は空の配列で初期化
        setMemos([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMemos();
  }, []);

  // メモが変更されるたびにLocalStorageに保存
  useEffect(() => {
    if (!isLoading) {
      try {
        const memosToSave = memos.map(memo => ({
          id: memo.id,
          text: memo.text,
          createdAt: memo.createdAt,
          currentSize: memo.currentSize,
          type: memo.type,
          // 音声データがあったことを記録（実際のデータは保存しない）
          hadAudioRecording: !!memo.audioRecording
        }));
        localStorage.setItem('fusenkun-memos', JSON.stringify(memosToSave));
      } catch (error) {
        console.error('メモの保存エラー:', error);
      }
    }
  }, [memos, isLoading]);

  // メモをソートする関数
  const sortMemos = useCallback((memosToSort: Memo[], order: SortOrder): Memo[] => {
    const sortedMemos = [...memosToSort];
    
    switch (order) {
      case 'newest-first':
        return sortedMemos.sort((a, b) => b.createdAt - a.createdAt);
      
      case 'oldest-first':
        return sortedMemos.sort((a, b) => a.createdAt - b.createdAt);
      
      case 'alphabetical':
        return sortedMemos.sort((a, b) => a.text.localeCompare(b.text, 'ja'));
      
      case 'type':
        // type順: audio -> mixed -> text
        const typeOrder = { audio: 0, mixed: 1, text: 2 };
        return sortedMemos.sort((a, b) => {
          const typeCompare = typeOrder[a.type] - typeOrder[b.type];
          if (typeCompare === 0) {
            return b.createdAt - a.createdAt; // 同じタイプなら新しい順
          }
          return typeCompare;
        });
      
      case 'size':
        return sortedMemos.sort((a, b) => b.currentSize - a.currentSize);
      
      default:
        return sortedMemos;
    }
  }, []);

  // ソートされたメモを取得
  const sortedMemos = useCallback(() => {
    return sortMemos(memos, sortOrder);
  }, [memos, sortOrder, sortMemos]);

  // 並び順を変更
  const changeSortOrder = useCallback((newOrder: SortOrder) => {
    setSortOrder(newOrder);
  }, []);


  // テキストメモを追加
  const addTextMemo = useCallback((text: string) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    if (!text.trim()) {
      alert('メモの内容を入力してください。');
      return null;
    }

    const newMemo: Memo = {
      id: Date.now(),
      text: text.trim(),
      audioRecording: null,
      createdAt: Date.now(),
      currentSize: 1.0,
      type: 'text'
    };

    // 新しいメモを配列の最後に追加（古い順ソートの場合、最後に追加されたものが最下部に表示される）
    setMemos(prev => [...prev, newMemo]);
    return newMemo;
  }, [memos.length]);

  // 音声メモを追加
  const addAudioMemo = useCallback((audioRecording: AudioRecording, additionalText?: string) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    const combinedText = additionalText ? 
      `${audioRecording.transcript}\n\n${additionalText.trim()}` : 
      audioRecording.transcript;

    const memoType = additionalText ? 'mixed' : 'audio';

    const newMemo: Memo = {
      id: Date.now(),
      text: combinedText,
      audioRecording,
      createdAt: Date.now(),
      currentSize: 1.0,
      type: memoType
    };

    // 新しいメモを配列の最後に追加
    setMemos(prev => [...prev, newMemo]);
    return newMemo;
  }, [memos.length]);

  // 混合メモを追加（テキスト + 音声）
  const addMixedMemo = useCallback((text: string, audioRecording: AudioRecording) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    const newMemo: Memo = {
      id: Date.now(),
      text: text.trim(),
      audioRecording,
      createdAt: Date.now(),
      currentSize: 1.0,
      type: 'mixed'
    };

    // 新しいメモを配列の最後に追加
    setMemos(prev => [...prev, newMemo]);
    return newMemo;
  }, [memos.length]);

  // メモを削除
  const deleteMemo = useCallback((id: number) => {
    setMemos(prev => {
      const memoToDelete = prev.find(memo => memo.id === id);
      if (memoToDelete?.audioRecording) {
        // 音声URLを解放してメモリリークを防ぐ
        URL.revokeObjectURL(memoToDelete.audioRecording.audioUrl);
      }
      return prev.filter(memo => memo.id !== id);
    });
  }, []);

  // メモを編集
  const editMemo = useCallback((id: number, newText: string) => {
    if (!newText.trim()) {
      alert('メモの内容を入力してください。');
      return false;
    }

    setMemos(prev => prev.map(memo => 
      memo.id === id ? { ...memo, text: newText.trim() } : memo
    ));
    return true;
  }, []);

  // メモサイズを更新
  const updateMemoSizes = useCallback(() => {
    setMemos(prev => prev.map(memo => ({
      ...memo,
      currentSize: calculateMemoSize(memo.createdAt)
    })));
  }, []);

  // すべてのメモを削除
  const clearAllMemos = useCallback(() => {
    if (window.confirm('すべてのメモを削除しますか？この操作は元に戻せません。')) {
      // 音声URLを解放
      memos.forEach(memo => {
        if (memo.audioRecording) {
          URL.revokeObjectURL(memo.audioRecording.audioUrl);
        }
      });
      setMemos([]);
    }
  }, [memos]);

  // メモを検索
  const searchMemos = useCallback((query: string) => {
    if (!query.trim()) return memos;
    
    const lowercaseQuery = query.toLowerCase();
    return memos.filter(memo => 
      memo.text.toLowerCase().includes(lowercaseQuery)
    );
  }, [memos]);

  // 特定のタイプのメモを取得
  const getMemosByType = useCallback((type: 'text' | 'audio' | 'mixed') => {
    return memos.filter(memo => memo.type === type);
  }, [memos]);

  // メモの統計情報を取得
  const getMemoStats = useCallback((): MemoStats => {
    const stats = memos.reduce((acc, memo) => {
      acc.total++;
      switch (memo.type) {
        case 'text':
          acc.textOnly++;
          break;
        case 'audio':
          acc.audioOnly++;
          break;
        case 'mixed':
          acc.mixed++;
          break;
      }
      if (memo.audioRecording) {
        acc.totalAudioDuration += memo.audioRecording.duration;
      }
      return acc;
    }, {
      total: 0,
      textOnly: 0,
      audioOnly: 0,
      mixed: 0,
      totalAudioDuration: 0
    });

    return stats;
  }, [memos]);

  // 音声付きメモの音声を再生
  const playMemoAudio = useCallback((id: number, onPlay?: () => void, onEnd?: () => void) => {
    const memo = memos.find(m => m.id === id);
    if (!memo?.audioRecording) {
      console.warn('指定されたメモに音声が見つかりません');
      return null;
    }

    const audio = new Audio(memo.audioRecording.audioUrl);
    
    if (onPlay) audio.onplay = onPlay;
    if (onEnd) audio.onended = onEnd;
    
    audio.onerror = () => {
      console.error('音声の再生に失敗しました');
    };

    return audio;
  }, [memos]);

  // メモの音声をダウンロード
  const downloadMemoAudio = useCallback((id: number) => {
    const memo = memos.find(m => m.id === id);
    if (!memo?.audioRecording) {
      alert('このメモには音声が含まれていません');
      return;
    }

    const link = document.createElement('a');
    link.href = memo.audioRecording.audioUrl;
    link.download = `memo_${memo.id}_${new Date(memo.createdAt).toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [memos]);

  // クリーンアップ関数
  const cleanup = useCallback(() => {
    memos.forEach(memo => {
      if (memo.audioRecording) {
        URL.revokeObjectURL(memo.audioRecording.audioUrl);
      }
    });
  }, [memos]);

  return {
    memos,
    isLoading,
    sortOrder,
    sortedMemos,
    changeSortOrder,
    addTextMemo,
    addAudioMemo,
    addMixedMemo,
    deleteMemo,
    editMemo,
    updateMemoSizes,
    clearAllMemos,
    searchMemos,
    getMemosByType,
    getMemoStats,
    playMemoAudio,
    downloadMemoAudio,
    cleanup
  };
};
*/