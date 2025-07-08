/*import { useState, useRef, useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export const useVoiceRecognition = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      // ブラウザサポート
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Chrome または Edge をご使用ください');
        return;
      }

      // マイクリクエスト、音声録音開始
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();

      // Start speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setTranscript('');
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          setTranscript(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('マイクへのアクセスを許可してください');
        } else {
          alert('もう一度お試しください');
        }
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('マイクへのアクセスを許可してください');
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ text: string; audioBlob: Blob | null }> => {
    return new Promise((resolve) => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = audioChunksRef.current.length > 0 
            ? new Blob(audioChunksRef.current, { type: 'audio/wav' })
            : null;
          
          // Stop all tracks to release microphone
          if (mediaRecorderRef.current?.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
          }
          
          resolve({
            text: transcript,
            audioBlob
          });
        };
        
        mediaRecorderRef.current.stop();
      } else {
        resolve({
          text: transcript,
          audioBlob: null
        });
      }

      setIsRecording(false);
    });
  }, [transcript]);

  return {
    isRecording,
    transcript,
    startRecording,
    stopRecording
  };
};
*/

//  ニューコード hookの使用で入力、文字起こし、録音、保存、再生可能、コンポーネントのアンマウント時にはcleanup()で呼び出し
//indexedDB　以前のコード
/*
import { useState, useRef, useCallback } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface AudioRecording {
  id: string;
  timestamp: Date;
  transcript: string;
  audioBlob: Blob;
  audioUrl: string;
  duration: number;
}

export const useVoiceRecognition = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [recordings, setRecordings] = useState<AudioRecording[]>([]);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // 音声録音の初期化
  const initializeAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
    } catch (error) {
      console.error('Audio context initialization failed:', error);
    }
  }, []);

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
      // ブラウザサポートチェック
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Chrome または Edge をご使用ください');
        return;
      }

      await initializeAudioContext();

      // マイクアクセス許可とストリーム取得
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      streamRef.current = stream;
      recordingStartTimeRef.current = Date.now();

      // MediaRecorderの設定
      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        options.mimeType = 'audio/wav';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 音声認識の設定
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsRecording(true);
        setTranscript('');
        console.log('音声認識開始');
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }
        
        // 最終結果と暫定結果を組み合わせて表示
        setTranscript(finalTranscript + interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        switch(event.error) {
          case 'not-allowed':
            alert('マイクへのアクセスを許可してください');
            break;
          case 'no-speech':
            console.log('音声が検出されませんでした');
            break;
          case 'network':
            alert('ネットワークエラーが発生しました');
            break;
          default:
            alert('音声認識エラー: ' + event.error);
        }
        stopRecording();
      };

      recognition.onend = () => {
        console.log('音声認識終了');
      };

      recognitionRef.current = recognition;
      
      // 録音と音声認識を同時開始
      mediaRecorder.start(100); // 100msごとにデータを取得
      recognition.start();

    } catch (error) {
      console.error('録音開始エラー:', error);
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          alert('マイクへのアクセスを許可してください');
        } else if (error.name === 'NotFoundError') {
          alert('マイクが見つかりません');
        } else {
          alert('マイクエラー: ' + error.message);
        }
      } else {
        alert('録音を開始できませんでした');
      }
      setIsRecording(false);
    }
  }, [initializeAudioContext]);

  // 録音停止
  const stopRecording = useCallback((): Promise<AudioRecording | null> => {
    return new Promise((resolve) => {
      const recordingDuration = Date.now() - recordingStartTimeRef.current;

      // 音声認識停止
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      // MediaRecorder停止
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            const mimeType = mediaRecorderRef.current?.mimeType || 'audio/wav';
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const recording: AudioRecording = {
              id: Date.now().toString(),
              timestamp: new Date(),
              transcript: transcript || '(音声認識結果なし)',
              audioBlob,
              audioUrl,
              duration: recordingDuration
            };

            setRecordings(prev => [recording, ...prev]);
            resolve(recording);
          } else {
            resolve(null);
          }

          // リソースクリーンアップ
          cleanupResources();
        };
        
        mediaRecorderRef.current.stop();
      } else {
        cleanupResources();
        resolve(null);
      }

      setIsRecording(false);
    });
  }, [transcript]);

  // リソースクリーンアップ
  const cleanupResources = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  // 音声再生
  const playAudio = useCallback((recording: AudioRecording) => {
    if (isPlaying === recording.id) {
      // 再生中の場合は停止
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setIsPlaying(null);
      return;
    }

    // 他の音声が再生中の場合は停止
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    const audio = new Audio(recording.audioUrl);
    currentAudioRef.current = audio;
    
    audio.onplay = () => setIsPlaying(recording.id);
    audio.onended = () => {
      setIsPlaying(null);
      currentAudioRef.current = null;
    };
    audio.onerror = () => {
      setIsPlaying(null);
      currentAudioRef.current = null;
      alert('音声の再生に失敗しました');
    };

    audio.play().catch(error => {
      console.error('音声再生エラー:', error);
      setIsPlaying(null);
      currentAudioRef.current = null;
    });
  }, [isPlaying]);

  // 音声停止
  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsPlaying(null);
  }, []);

  // 録音削除
  const deleteRecording = useCallback((recordingId: string) => {
    setRecordings(prev => {
      const recording = prev.find(r => r.id === recordingId);
      if (recording) {
        // 再生中の場合は停止
        if (isPlaying === recordingId) {
          stopAudio();
        }
        // Blob URLを解放
        URL.revokeObjectURL(recording.audioUrl);
      }
      return prev.filter(r => r.id !== recordingId);
    });
  }, [isPlaying, stopAudio]);

  // 音声ダウンロード
  const downloadAudio = useCallback((recording: AudioRecording) => {
    const link = document.createElement('a');
    link.href = recording.audioUrl;
    link.download = `recording_${recording.timestamp.toISOString().slice(0, 19).replace(/:/g, '-')}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // 時間フォーマット関数
  const formatDuration = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // クリーンアップ（コンポーネントアンマウント時）
  const cleanup = useCallback(() => {
    cleanupResources();
    stopAudio();
    recordings.forEach(recording => {
      URL.revokeObjectURL(recording.audioUrl);
    });
  }, [cleanupResources, stopAudio, recordings]);

  return {
    isRecording,
    transcript,
    recordings,
    isPlaying,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    deleteRecording,
    downloadAudio,
    formatDuration,
    cleanup
  };
};
*/