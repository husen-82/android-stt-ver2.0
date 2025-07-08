import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Play, Pause, Download, Trash2 } from 'lucide-react';

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

// Bluetooth HFP/HSP検出とマイク制御クラス
class BluetoothMicController {
  private builtInMicDeviceId: string | null = null;
  private isBluetoothHFPConnected: boolean = false;
  private deviceChangeListener: (() => void) | null = null;

  async init(): Promise<void> {
    try {
      await this.identifyBuiltInMicrophone();
      this.startDeviceMonitoring();
    } catch (error) {
      console.warn('Bluetooth mic controller initialization failed:', error);
    }
  }

  private async identifyBuiltInMicrophone(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      const builtInMic = audioInputs.find(device => 
        device.label.toLowerCase().includes('built-in') ||
        device.label.toLowerCase().includes('internal') ||
        device.label.toLowerCase().includes('default') ||
        device.label.toLowerCase().includes('マイク') ||
        (!device.label.toLowerCase().includes('bluetooth') && 
         !device.label.toLowerCase().includes('headset') &&
         !device.label.toLowerCase().includes('airpods') &&
         !device.label.toLowerCase().includes('headphone'))
      );

      if (builtInMic) {
        this.builtInMicDeviceId = builtInMic.deviceId;
        console.log('Built-in microphone identified:', builtInMic.label);
      } else if (audioInputs.length > 0) {
        this.builtInMicDeviceId = audioInputs[0].deviceId;
        console.log('Using first available microphone as built-in:', audioInputs[0].label);
      }
    } catch (error) {
      console.warn('Failed to identify built-in microphone:', error);
    }
  }

  private startDeviceMonitoring(): void {
    this.deviceChangeListener = () => {
      this.checkBluetoothHFPConnection();
    };

    navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeListener);
    this.checkBluetoothHFPConnection();
  }

  private async checkBluetoothHFPConnection(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      const bluetoothHFPDevice = audioInputs.find(device => {
        const label = device.label.toLowerCase();
        return (
          label.includes('bluetooth') && (
            label.includes('hands-free') ||
            label.includes('headset') ||
            label.includes('hfp') ||
            label.includes('hsp') ||
            (label.includes('bluetooth') && !label.includes('a2dp') && !label.includes('stereo'))
          )
        );
      });

      const wasConnected = this.isBluetoothHFPConnected;
      this.isBluetoothHFPConnected = !!bluetoothHFPDevice;

      if (wasConnected !== this.isBluetoothHFPConnected) {
        console.log(`Bluetooth HFP/HSP ${this.isBluetoothHFPConnected ? 'connected' : 'disconnected'}`);
        if (bluetoothHFPDevice) {
          console.log('Detected HFP/HSP device:', bluetoothHFPDevice.label);
        }
      }
    } catch (error) {
      console.warn('Failed to check Bluetooth HFP connection:', error);
    }
  }

  getOptimalMicrophoneConstraints(): MediaTrackConstraints {
    const baseConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100
    };

    if (this.isBluetoothHFPConnected && this.builtInMicDeviceId) {
      console.log('Using built-in microphone due to Bluetooth HFP/HSP connection');
      return {
        ...baseConstraints,
        deviceId: { exact: this.builtInMicDeviceId }
      };
    }

    return baseConstraints;
  }

  cleanup(): void {
    if (this.deviceChangeListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeListener);
      this.deviceChangeListener = null;
    }
  }
}

// Android対応の音声認識クラス
class CrossPlatformSpeechRecognition {
  private recognition: any = null;
  private isAndroid: boolean = false;
  private isIOS: boolean = false;

  constructor() {
    this.detectPlatform();
  }

  private detectPlatform(): void {
    const userAgent = navigator.userAgent.toLowerCase();
    this.isAndroid = userAgent.includes('android');
    this.isIOS = userAgent.includes('iphone') || userAgent.includes('ipad');
    
    console.log('Platform detected:', { 
      isAndroid: this.isAndroid, 
      isIOS: this.isIOS,
      userAgent: userAgent 
    });
  }

  createRecognition(): any {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Android固有の設定
    if (this.isAndroid) {
      recognition.lang = 'ja-JP';
      recognition.continuous = false; // Androidでは連続認識を無効にして安定性を向上
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      
      // Android Chrome固有の問題対応
      recognition.serviceURI = undefined; // デフォルトサービスを使用
    } else {
      // iOS/その他のプラットフォーム設定
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
    }

    return recognition;
  }

  isSupported(): boolean {
    return ('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window);
  }

  getPlatformInfo(): { isAndroid: boolean; isIOS: boolean } {
    return { isAndroid: this.isAndroid, isIOS: this.isIOS };
  }
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
  const bluetoothControllerRef = useRef<BluetoothMicController>(new BluetoothMicController());
  const speechRecognitionRef = useRef<CrossPlatformSpeechRecognition>(new CrossPlatformSpeechRecognition());
  
  // 音声認識の継続管理用のref
  const accumulatedTranscriptRef = useRef<string>('');
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRecognitionActiveRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRestartingRef = useRef<boolean>(false);
  const lastInterimResultRef = useRef<string>('');

  // リソースクリーンアップ関数
  const cleanupResources = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    
    isRecognitionActiveRef.current = false;
    accumulatedTranscriptRef.current = '';
    isRestartingRef.current = false;
    lastInterimResultRef.current = '';
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  };

  // 音声録音の初期化
  const initializeAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      await bluetoothControllerRef.current.init();
    } catch (error) {
      console.error('Audio context initialization failed:', error);
    }
  }, []);

  // Android対応の音声認識再起動関数
  const restartRecognition = useCallback(() => {
    if (!isRecognitionActiveRef.current || isRestartingRef.current) return;
    
    isRestartingRef.current = true;
    console.log('音声認識を再起動します...');
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    const lastInterim = lastInterimResultRef.current;
    const platformInfo = speechRecognitionRef.current.getPlatformInfo();

    try {
      const recognition = speechRecognitionRef.current.createRecognition();

      const handleResult = (event: any) => {
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

        if (finalTranscript) {
          console.log('Final result:', finalTranscript);
          if (accumulatedTranscriptRef.current) {
            const lastChar = accumulatedTranscriptRef.current.slice(-1);
            if (lastChar !== '。' && lastChar !== '、' && lastChar !== '！' && lastChar !== '？') {
              accumulatedTranscriptRef.current += '、' + finalTranscript;
            } else {
              accumulatedTranscriptRef.current += finalTranscript;
            }
          } else {
            accumulatedTranscriptRef.current = finalTranscript;
          }
          lastSpeechTimeRef.current = Date.now();
          lastInterimResultRef.current = '';
        }

        if (interimTranscript) {
          lastInterimResultRef.current = interimTranscript;
        }

        const displayText = accumulatedTranscriptRef.current + interimTranscript;
        setTranscript(displayText);

        if (finalTranscript || interimTranscript) {
          if (speechTimeoutRef.current) {
            clearTimeout(speechTimeoutRef.current);
          }
          
          // Android用の短いタイムアウト
          const timeoutDuration = platformInfo.isAndroid ? 10000 : 15000;
          speechTimeoutRef.current = setTimeout(() => {
            if (isRecognitionActiveRef.current && recognitionRef.current) {
              console.log('無音タイムアウト - 音声認識を再起動');
              recognitionRef.current.stop();
            }
          }, timeoutDuration);
        }
      };

      const handleError = (event: any) => {
        console.error('Speech recognition error:', event.error);
        isRestartingRef.current = false;
        
        switch(event.error) {
          case 'not-allowed':
            alert('マイクへのアクセスを許可してください');
            setIsRecording(false);
            isRecognitionActiveRef.current = false;
            return;
          case 'no-speech':
            console.log('音声が検出されませんでした - 再起動します');
            break;
          case 'network':
            console.log('ネットワークエラー - 再起動を試みます');
            break;
          case 'aborted':
            console.log('音声認識が中断されました');
            break;
          default:
            console.log('音声認識エラー:', event.error, '- 再起動を試みます');
        }

        if (isRecognitionActiveRef.current && event.error !== 'not-allowed') {
          const retryDelay = platformInfo.isAndroid ? 1000 : 500;
          restartTimeoutRef.current = setTimeout(() => {
            restartRecognition();
          }, retryDelay);
        }
      };

      const handleEnd = () => {
        console.log('音声認識終了');
        isRestartingRef.current = false;
        
        if (lastInterimResultRef.current && isRecognitionActiveRef.current) {
          console.log('最後のinterim結果を保存:', lastInterimResultRef.current);
          if (accumulatedTranscriptRef.current) {
            const lastChar = accumulatedTranscriptRef.current.slice(-1);
            if (lastChar !== '。' && lastChar !== '、' && lastChar !== '！' && lastChar !== '？') {
              accumulatedTranscriptRef.current += '、' + lastInterimResultRef.current;
            } else {
              accumulatedTranscriptRef.current += lastInterimResultRef.current;
            }
          } else {
            accumulatedTranscriptRef.current = lastInterimResultRef.current;
          }
          lastInterimResultRef.current = '';
          setTranscript(accumulatedTranscriptRef.current);
        }
        
        if (isRecognitionActiveRef.current) {
          const restartDelay = platformInfo.isAndroid ? 500 : 300;
          restartTimeoutRef.current = setTimeout(() => {
            restartRecognition();
          }, restartDelay);
        }
      };

      const handleStart = () => {
        console.log('音声認識開始/再開');
        isRestartingRef.current = false;
      };

      recognition.onstart = handleStart;
      recognition.onresult = handleResult;
      recognition.onerror = handleError;
      recognition.onend = handleEnd;

      recognitionRef.current = recognition;
      recognition.start();

    } catch (error) {
      console.error('音声認識再起動エラー:', error);
      isRestartingRef.current = false;
      if (isRecognitionActiveRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          restartRecognition();
        }, 1000);
      }
    }
  }, []);

  // 録音開始（Android対応強化版）
  const startRecording = useCallback(async () => {
    try {
      if (!speechRecognitionRef.current.isSupported()) {
        alert('Chrome または Edge をご使用ください');
        return;
      }

      setIsRecording(true);
      await initializeAudioContext();

      const audioConstraints = bluetoothControllerRef.current.getOptimalMicrophoneConstraints();

      // Android用の音声制約調整
      const platformInfo = speechRecognitionRef.current.getPlatformInfo();
      if (platformInfo.isAndroid) {
        audioConstraints.sampleRate = 16000; // Androidでは低いサンプルレートが安定
        audioConstraints.channelCount = 1; // モノラル録音
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints
      });
      
      streamRef.current = stream;
      recordingStartTimeRef.current = Date.now();

      // MediaRecorderの設定（Android対応）
      const options: MediaRecorderOptions = {};
      if (platformInfo.isAndroid) {
        // Android用の設定
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        }
      } else {
        // iOS/その他用の設定
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          options.mimeType = 'audio/wav';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      accumulatedTranscriptRef.current = '';
      lastInterimResultRef.current = '';
      isRecognitionActiveRef.current = true;
      isRestartingRef.current = false;
      lastSpeechTimeRef.current = Date.now();
      
      setTranscript('');

      mediaRecorder.start(100);
      restartRecognition();

      console.log('録音と音声認識を開始しました (Platform:', platformInfo.isAndroid ? 'Android' : 'Other', ')');

    } catch (error) {
      console.error('録音開始エラー:', error);
      setIsRecording(false);
      
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
      isRecognitionActiveRef.current = false;
    }
  }, [initializeAudioContext, restartRecognition]);

  // 録音停止（音声データ保存改善版）
  const stopRecording = useCallback((): Promise<AudioRecording | null> => {
    return new Promise((resolve) => {
      const recordingDuration = Date.now() - recordingStartTimeRef.current;

      setIsRecording(false);
      isRecognitionActiveRef.current = false;
      isRestartingRef.current = false;

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }

      if (lastInterimResultRef.current) {
        console.log('停止時に最後のinterim結果を保存:', lastInterimResultRef.current);
        if (accumulatedTranscriptRef.current) {
          const lastChar = accumulatedTranscriptRef.current.slice(-1);
          if (lastChar !== '。' && lastChar !== '、' && lastChar !== '！' && lastChar !== '？') {
            accumulatedTranscriptRef.current += '、' + lastInterimResultRef.current;
          } else {
            accumulatedTranscriptRef.current += lastInterimResultRef.current;
          }
        } else {
          accumulatedTranscriptRef.current = lastInterimResultRef.current;
        }
        lastInterimResultRef.current = '';
      }

      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      const handleMediaRecorderStop = async () => {
        if (audioChunksRef.current.length > 0) {
          try {
            const mimeType = mediaRecorderRef.current?.mimeType || 'audio/wav';
            const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
            
            // 音声URLを安定的に作成
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const finalTranscript = accumulatedTranscriptRef.current || transcript || '(音声認識結果なし)';
            
            const recording: AudioRecording = {
              id: Date.now().toString(),
              timestamp: new Date(),
              transcript: finalTranscript,
              audioBlob,
              audioUrl,
              duration: recordingDuration
            };

            setRecordings(prev => [recording, ...prev]);
            accumulatedTranscriptRef.current = '';
            resolve(recording);
          } catch (error) {
            console.error('録音データの保存に失敗:', error);
            resolve(null);
          }
        } else {
          resolve(null);
        }

        cleanupResources();
      };

      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.onstop = handleMediaRecorderStop;
        mediaRecorderRef.current.stop();
      } else {
        cleanupResources();
        resolve(null);
      }
    });
  }, [transcript]);

  // 音声再生（改善版）
  const playAudio = useCallback((recording: AudioRecording) => {
    if (isPlaying === recording.id) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setIsPlaying(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    try {
      const audio = new Audio();
      currentAudioRef.current = audio;
      
      // 音声データの設定
      if (recording.audioUrl) {
        audio.src = recording.audioUrl;
      } else if (recording.audioBlob) {
        const url = URL.createObjectURL(recording.audioBlob);
        audio.src = url;
      } else {
        throw new Error('音声データが見つかりません');
      }

      audio.onplay = () => setIsPlaying(recording.id);
      audio.onended = () => {
        setIsPlaying(null);
        currentAudioRef.current = null;
      };
      audio.onerror = (e) => {
        console.error('音声再生エラー:', e);
        setIsPlaying(null);
        currentAudioRef.current = null;
        alert('音声の再生に失敗しました');
      };

      audio.play().catch(error => {
        console.error('音声再生エラー:', error);
        setIsPlaying(null);
        currentAudioRef.current = null;
      });
    } catch (error) {
      console.error('音声再生準備エラー:', error);
      alert('音声の再生に失敗しました');
    }
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
  const deleteRecording = useCallback(async (recordingId: string) => {
    try {
      setRecordings(prev => {
        const recording = prev.find(r => r.id === recordingId);
        if (recording) {
          if (isPlaying === recordingId) {
            stopAudio();
          }
          URL.revokeObjectURL(recording.audioUrl);
        }
        return prev.filter(r => r.id !== recordingId);
      });
    } catch (error) {
      console.error('録音データの削除に失敗:', error);
    }
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

  // クリーンアップ
  const cleanup = useCallback(async () => {
    cleanupResources();
    stopAudio();
    recordings.forEach(recording => {
      URL.revokeObjectURL(recording.audioUrl);
    });
    
    bluetoothControllerRef.current.cleanup();
  }, [stopAudio, recordings]);

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