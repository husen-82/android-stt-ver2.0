import { useState, useEffect, useCallback, useRef } from 'react';
import { calculateMemoSize } from '../utils/sizeCalculator';
import { AudioRecording } from './IndexedDBAudio';

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

// IndexedDB関連の設定
const DB_NAME = 'MemoAppDB';
const DB_VERSION = 1;
const MEMO_STORE = 'memos';
const AUDIO_STORE = 'audioData';

interface MemoData {
  id: number;
  text: string;
  createdAt: number;
  currentSize: number;
  type: 'text' | 'audio' | 'mixed';
  audioId?: string; // 音声データのID（別ストアに保存）
}

interface AudioData {
  id: string;
  audioBlob: Blob;
  transcript: string;
  timestamp: Date;
  duration: number;
}

class MemoIndexedDB {
  private db: IDBDatabase | null = null;
  private urlCache: Map<string, string> = new Map(); // URLキャッシュシステム

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // メモストア
        if (!db.objectStoreNames.contains(MEMO_STORE)) {
          const memoStore = db.createObjectStore(MEMO_STORE, { keyPath: 'id' });
          memoStore.createIndex('createdAt', 'createdAt', { unique: false });
          memoStore.createIndex('type', 'type', { unique: false });
        }

        // 音声データストア
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          const audioStore = db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
          audioStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // URLキャッシュシステム - 音声URLの安定化
  getOrCreateAudioUrl(audioId: string, audioBlob: Blob): string {
    console.log('getOrCreateAudioUrl called for audioId:', audioId);
    
    // 既存のURLをチェック
    const existingUrl = this.urlCache.get(audioId);
    if (existingUrl) {
      // URLが有効かチェック
      try {
        const testAudio = new Audio();
        testAudio.src = existingUrl;
        // URLが有効な場合はそのまま返す
        console.log('Using cached URL for audioId:', audioId);
        return existingUrl;
      } catch (error) {
        console.log('Cached URL invalid, creating new one for audioId:', audioId);
        // 無効なURLはキャッシュから削除
        URL.revokeObjectURL(existingUrl);
        this.urlCache.delete(audioId);
      }
    }

    // 新しいBlobインスタンスを作成して参照を安定化
    const stableBlobRef = new Blob([audioBlob], { type: audioBlob.type });
    const newUrl = URL.createObjectURL(stableBlobRef);
    
    // キャッシュに保存
    this.urlCache.set(audioId, newUrl);
    console.log('Created new URL for audioId:', audioId, 'URL:', newUrl);
    
    return newUrl;
  }

  // URLキャッシュをクリア
  clearUrlCache(): void {
    console.log('Clearing URL cache, entries:', this.urlCache.size);
    this.urlCache.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.urlCache.clear();
  }

  // 特定のURLをキャッシュから削除
  removeFromUrlCache(audioId: string): void {
    const url = this.urlCache.get(audioId);
    if (url) {
      console.log('Removing URL from cache for audioId:', audioId);
      URL.revokeObjectURL(url);
      this.urlCache.delete(audioId);
    }
  }

  async saveMemo(memo: Memo): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise(async (resolve, reject) => {
      try {
        const transaction = this.db!.transaction([MEMO_STORE, AUDIO_STORE], 'readwrite');
        const memoStore = transaction.objectStore(MEMO_STORE);
        const audioStore = transaction.objectStore(AUDIO_STORE);

        let audioId: string | undefined;

        // 音声データがある場合は別ストアに保存
        if (memo.audioRecording) {
          audioId = memo.audioRecording.id;
          const audioData: AudioData = {
            id: audioId,
            audioBlob: memo.audioRecording.audioBlob,
            transcript: memo.audioRecording.transcript,
            timestamp: memo.audioRecording.timestamp,
            duration: memo.audioRecording.duration
          };
          
          const audioRequest = audioStore.put(audioData);
          audioRequest.onerror = () => reject(audioRequest.error);
        }

        // メモデータを保存
        const memoData: MemoData = {
          id: memo.id,
          text: memo.text,
          createdAt: memo.createdAt,
          currentSize: memo.currentSize,
          type: memo.type,
          audioId
        };

        const memoRequest = memoStore.put(memoData);
        memoRequest.onsuccess = () => resolve();
        memoRequest.onerror = () => reject(memoRequest.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getMemo(id: number): Promise<Memo | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([MEMO_STORE, AUDIO_STORE], 'readonly');
      const memoStore = transaction.objectStore(MEMO_STORE);
      const audioStore = transaction.objectStore(AUDIO_STORE);

      const memoRequest = memoStore.get(id);
      memoRequest.onsuccess = async () => {
        const memoData = memoRequest.result as MemoData;
        if (!memoData) {
          resolve(null);
          return;
        }

        let audioRecording: AudioRecording | null = null;
        
        // 音声データがある場合は取得してURLキャッシュを使用
        if (memoData.audioId) {
          try {
            const audioRequest = audioStore.get(memoData.audioId);
            audioRequest.onsuccess = () => {
              const audioData = audioRequest.result as AudioData;
              if (audioData) {
                // URLキャッシュシステムを使用
                const audioUrl = this.getOrCreateAudioUrl(audioData.id, audioData.audioBlob);
                audioRecording = {
                  id: audioData.id,
                  audioBlob: audioData.audioBlob,
                  audioUrl,
                  transcript: audioData.transcript,
                  timestamp: audioData.timestamp,
                  duration: audioData.duration
                };
              }

              const memo: Memo = {
                id: memoData.id,
                text: memoData.text,
                audioRecording,
                createdAt: memoData.createdAt,
                currentSize: memoData.currentSize,
                type: memoData.type
              };

              resolve(memo);
            };
            audioRequest.onerror = () => {
              // 音声データの取得に失敗した場合もメモは返す
              const memo: Memo = {
                id: memoData.id,
                text: memoData.text,
                audioRecording: null,
                createdAt: memoData.createdAt,
                currentSize: memoData.currentSize,
                type: memoData.type
              };
              resolve(memo);
            };
          } catch (error) {
            console.error('Audio data loading failed:', error);
            // 音声データの取得に失敗した場合もメモは返す
            const memo: Memo = {
              id: memoData.id,
              text: memoData.text,
              audioRecording: null,
              createdAt: memoData.createdAt,
              currentSize: memoData.currentSize,
              type: memoData.type
            };
            resolve(memo);
          }
        } else {
          const memo: Memo = {
            id: memoData.id,
            text: memoData.text,
            audioRecording: null,
            createdAt: memoData.createdAt,
            currentSize: memoData.currentSize,
            type: memoData.type
          };
          resolve(memo);
        }
      };

      memoRequest.onerror = () => reject(memoRequest.error);
    });
  }

  async getAllMemos(): Promise<Memo[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([MEMO_STORE, AUDIO_STORE], 'readonly');
      const memoStore = transaction.objectStore(MEMO_STORE);
      const audioStore = transaction.objectStore(AUDIO_STORE);

      const memoRequest = memoStore.getAll();
      memoRequest.onsuccess = async () => {
        const memoDataList = memoRequest.result as MemoData[];
        const memos: Memo[] = [];

        for (const memoData of memoDataList) {
          let audioRecording: AudioRecording | null = null;

          if (memoData.audioId) {
            try {
              const audioRequest = audioStore.get(memoData.audioId);
              await new Promise<void>((audioResolve) => {
                audioRequest.onsuccess = () => {
                  const audioData = audioRequest.result as AudioData;
                  if (audioData) {
                    // URLキャッシュシステムを使用
                    const audioUrl = this.getOrCreateAudioUrl(audioData.id, audioData.audioBlob);
                    audioRecording = {
                      id: audioData.id,
                      audioBlob: audioData.audioBlob,
                      audioUrl,
                      transcript: audioData.transcript,
                      timestamp: audioData.timestamp,
                      duration: audioData.duration
                    };
                  }
                  audioResolve();
                };
                audioRequest.onerror = () => {
                  console.error('Audio data loading failed for memo:', memoData.id);
                  audioResolve();
                };
              });
            } catch (error) {
              console.error('Audio data loading failed for memo:', memoData.id, error);
            }
          }

          const memo: Memo = {
            id: memoData.id,
            text: memoData.text,
            audioRecording,
            createdAt: memoData.createdAt,
            currentSize: memoData.currentSize,
            type: memoData.type
          };

          memos.push(memo);
        }

        resolve(memos);
      };

      memoRequest.onerror = () => reject(memoRequest.error);
    });
  }

  async deleteMemo(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise(async (resolve, reject) => {
      try {
        const transaction = this.db!.transaction([MEMO_STORE, AUDIO_STORE], 'readwrite');
        const memoStore = transaction.objectStore(MEMO_STORE);
        const audioStore = transaction.objectStore(AUDIO_STORE);

        // まずメモデータを取得して音声IDを確認
        const memoRequest = memoStore.get(id);
        memoRequest.onsuccess = () => {
          const memoData = memoRequest.result as MemoData;
          
          // 音声データとURLキャッシュも削除
          if (memoData?.audioId) {
            this.removeFromUrlCache(memoData.audioId);
            const audioDeleteRequest = audioStore.delete(memoData.audioId);
            audioDeleteRequest.onerror = () => console.error('Audio data deletion failed');
          }

          // メモデータを削除
          const memoDeleteRequest = memoStore.delete(id);
          memoDeleteRequest.onsuccess = () => resolve();
          memoDeleteRequest.onerror = () => reject(memoDeleteRequest.error);
        };

        memoRequest.onerror = () => reject(memoRequest.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      // URLキャッシュをクリア
      this.clearUrlCache();

      const transaction = this.db!.transaction([MEMO_STORE, AUDIO_STORE], 'readwrite');
      const memoStore = transaction.objectStore(MEMO_STORE);
      const audioStore = transaction.objectStore(AUDIO_STORE);

      let completed = 0;
      const complete = () => {
        completed++;
        if (completed === 2) resolve();
      };

      const memoRequest = memoStore.clear();
      const audioRequest = audioStore.clear();

      memoRequest.onsuccess = () => complete();
      memoRequest.onerror = () => reject(memoRequest.error);

      audioRequest.onsuccess = () => complete();
      audioRequest.onerror = () => reject(audioRequest.error);
    });
  }
}

export const useMemos = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest-first'); // デフォルトを古い順に変更
  const dbRef = useState(() => new MemoIndexedDB())[0];
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // 音声再生管理の改善

  // IndexedDBからメモを読み込み
  useEffect(() => {
    const loadMemos = async () => {
      setIsLoading(true);
      try {
        await dbRef.init();
        const savedMemos = await dbRef.getAllMemos();
        setMemos(savedMemos);
        console.log('Loaded memos:', savedMemos.length);
      } catch (error) {
        console.error('メモの読み込みエラー:', error);
        // エラーの場合は空の配列で初期化
        setMemos([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadMemos();
  }, [dbRef]);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      console.log('Cleaning up useMemos...');
      // 現在再生中の音声を停止
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      // URLキャッシュのクリアを削除 - これが原因でBlobURLが無効になっていた
    };
  }, [dbRef]);

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
  const addTextMemo = useCallback(async (text: string) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    if (!text.trim()) {
      alert('メモの内容を入力してください。');
      return null;
    }

    try {
      const newMemo: Memo = {
        id: Date.now(),
        text: text.trim(),
        audioRecording: null,
        createdAt: Date.now(),
        currentSize: 1.0,
        type: 'text'
      };

      await dbRef.saveMemo(newMemo);
      setMemos(prev => [...prev, newMemo]);
      return newMemo;
    } catch (error) {
      console.error('テキストメモの保存に失敗:', error);
      alert('メモの保存に失敗しました');
      return null;
    }
  }, [memos.length, dbRef]);

  // 音声メモを追加
  const addAudioMemo = useCallback(async (audioRecording: AudioRecording, additionalText?: string) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    try {
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

      await dbRef.saveMemo(newMemo);
      setMemos(prev => [...prev, newMemo]);
      console.log('Audio memo added successfully');
      return newMemo;
    } catch (error) {
      console.error('音声メモの保存に失敗:', error);
      alert('メモの保存に失敗しました');
      return null;
    }
  }, [memos.length, dbRef]);

  // 混合メモを追加（テキスト + 音声）
  const addMixedMemo = useCallback(async (text: string, audioRecording: AudioRecording) => {
    if (memos.length >= 15) {
      alert('メモの数が上限（15個）に達しました。古いメモを削除してください。');
      return null;
    }

    try {
      const newMemo: Memo = {
        id: Date.now(),
        text: text.trim(),
        audioRecording,
        createdAt: Date.now(),
        currentSize: 1.0,
        type: 'mixed'
      };

      await dbRef.saveMemo(newMemo);
      setMemos(prev => [...prev, newMemo]);
      return newMemo;
    } catch (error) {
      console.error('混合メモの保存に失敗:', error);
      alert('メモの保存に失敗しました');
      return null;
    }
  }, [memos.length, dbRef]);

  // メモを削除
  const deleteMemo = useCallback(async (id: number) => {
    try {
      const memoToDelete = memos.find(memo => memo.id === id);
      
      // 現在再生中の音声が削除対象の場合は停止
      if (currentAudioRef.current && memoToDelete?.audioRecording) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      await dbRef.deleteMemo(id);
      setMemos(prev => prev.filter(memo => memo.id !== id));
      console.log('Memo deleted successfully:', id);
    } catch (error) {
      console.error('メモの削除に失敗:', error);
      alert('メモの削除に失敗しました');
    }
  }, [memos, dbRef]);

  // メモを編集
  const editMemo = useCallback(async (id: number, newText: string) => {
    if (!newText.trim()) {
      alert('メモの内容を入力してください。');
      return false;
    }

    try {
      const memoToEdit = memos.find(memo => memo.id === id);
      if (!memoToEdit) {
        alert('編集するメモが見つかりません');
        return false;
      }

      const updatedMemo = { ...memoToEdit, text: newText.trim() };
      await dbRef.saveMemo(updatedMemo);
      
      setMemos(prev => prev.map(memo => 
        memo.id === id ? updatedMemo : memo
      ));
      return true;
    } catch (error) {
      console.error('メモの編集に失敗:', error);
      alert('メモの編集に失敗しました');
      return false;
    }
  }, [memos, dbRef]);

  // メモサイズを更新
  const updateMemoSizes = useCallback(async () => {
    try {
      const updatedMemos = memos.map(memo => ({
        ...memo,
        currentSize: calculateMemoSize(memo.createdAt)
      }));

      // 更新されたメモをすべて保存
      await Promise.all(updatedMemos.map(memo => dbRef.saveMemo(memo)));
      setMemos(updatedMemos);
    } catch (error) {
      console.error('メモサイズの更新に失敗:', error);
    }
  }, [memos, dbRef]);

  // すべてのメモを削除
  const clearAllMemos = useCallback(async () => {
    if (window.confirm('すべてのメモを削除しますか？この操作は元に戻せません。')) {
      try {
        // 現在再生中の音声を停止
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
          currentAudioRef.current = null;
        }

        await dbRef.clearAll();
        setMemos([]);
        console.log('All memos cleared successfully');
      } catch (error) {
        console.error('メモの全削除に失敗:', error);
        alert('メモの削除に失敗しました');
      }
    }
  }, [dbRef]);

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

  // 音声付きメモの音声を再生（改善版）
  const playMemoAudio = useCallback((id: number, onPlay?: () => void, onEnd?: () => void) => {
    console.log('playMemoAudio called for memo id:', id);
    
    const memo = memos.find(m => m.id === id);
    if (!memo?.audioRecording) {
      console.warn('指定されたメモに音声が見つかりません:', id);
      return null;
    }

    try {
      // 既存の再生を停止
      if (currentAudioRef.current) {
        console.log('Stopping existing audio playback');
        currentAudioRef.current.pause();
        currentAudioRef.current.removeEventListener('ended', () => {});
        currentAudioRef.current.removeEventListener('error', () => {});
        currentAudioRef.current = null;
      }

      // 新しいAudioインスタンスを作成
      const audio = new Audio();
      currentAudioRef.current = audio;

      // イベントリスナーを設定
      const handlePlay = () => {
        console.log('Audio playback started for memo:', id);
        if (onPlay) onPlay();
      };

      const handleEnd = () => {
        console.log('Audio playback ended for memo:', id);
        currentAudioRef.current = null;
        if (onEnd) onEnd();
      };

      const handleError = (e: Event) => {
        console.error('Audio playback error for memo:', id, e);
        currentAudioRef.current = null;
        alert('音声の再生に失敗しました');
      };

      audio.addEventListener('play', handlePlay);
      audio.addEventListener('ended', handleEnd);
      audio.addEventListener('error', handleError);

      // 音声ソースを設定
      audio.src = memo.audioRecording.audioUrl;
      console.log('Audio src set to:', memo.audioRecording.audioUrl);

      // 明示的にロード
      audio.load();

      // 再生開始
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Audio play promise resolved for memo:', id);
          })
          .catch(error => {
            console.error('Audio play promise rejected for memo:', id, error);
            currentAudioRef.current = null;
            alert('音声の再生に失敗しました');
          });
      }

      return audio;
    } catch (error) {
      console.error('playMemoAudio error for memo:', id, error);
      currentAudioRef.current = null;
      return null;
    }
  }, [memos]);

  // メモの音声をダウンロード（エラーハンドリング改善）
  const downloadMemoAudio = useCallback((id: number) => {
    try {
      const memo = memos.find(m => m.id === id);
      if (!memo?.audioRecording) {
        alert('このメモには音声が含まれていません');
        return;
      }

      console.log('Downloading audio for memo:', id);
      const link = document.createElement('a');
      link.href = memo.audioRecording.audioUrl;
      link.download = `memo_${memo.id}_${new Date(memo.createdAt).toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Audio download initiated for memo:', id);
    } catch (error) {
      console.error('Audio download error for memo:', id, error);
      alert('音声のダウンロードに失敗しました');
    }
  }, [memos]);

  // クリーンアップ関数
  const cleanup = useCallback(async () => {
    console.log('Cleanup called');
    
    // 現在再生中の音声を停止
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    
    // URLキャッシュをクリア
    dbRef.clearUrlCache();
    
    try {
      await dbRef.clearAll();
    } catch (error) {
      console.error('IndexedDB cleanup failed:', error);
    }
  }, [dbRef]);

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