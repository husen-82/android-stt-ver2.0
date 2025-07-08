import { useState, useRef, useCallback, useEffect } from 'react';
import sttApiService, { STTResponse } from '../services/sttApiService';

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
  confidence?: number;
  processingTime?: number;
}

// Android最適化音声録音クラス（STT処理はバックエンドに移行）
class AndroidVoiceRecognition {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  
  // Android検出
  private isAndroid: boolean = false;
  private isChrome: boolean = false;
  
  // 録音データ
  private audioChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  
  // コールバック
  private onRecordingStateChange?: (isRecording: boolean) => void;
  private onError?: (error: string) => void;
  private onAudioLevel?: (level: number) => void;
  private onTranscriptionComplete?: (result: STTResponse) => void;

  constructor() {
    this.detectPlatform();
  }

  // プラットフォーム検出
  private detectPlatform(): void {
    const userAgent = navigator.userAgent.toLowerCase();
    this.isAndroid = userAgent.includes('android');
    this.isChrome = userAgent.includes('chrome');
    
    console.log('Platform detected:', {
      isAndroid: this.isAndroid,
      isChrome: this.isChrome,
      userAgent: userAgent
    });
  }

  // 初期化
  async initialize(): Promise<void> {
    try {
      // AudioContextの初期化
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.isAndroid ? 16000 : 44100, // Android向け最適化
        latencyHint: 'interactive'
      });

      // AudioWorkletの読み込み
      await this.audioContext.audioWorklet.addModule('/audio-processor.js');
      
      console.log('AndroidVoiceRecognition initialized successfully');
    } catch (error) {
      console.error('AndroidVoiceRecognition initialization failed:', error);
      throw new Error('音声認識の初期化に失敗しました');
    }
  }

  // 録音開始
  async startRecording(): Promise<void> {
    try {
      if (!this.audioContext) {
        await this.initialize();
      }

      // AudioContextの再開
      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume();
      }

      // マイクアクセス
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.isAndroid ? 16000 : 44100,
          channelCount: 1, // モノラル録音でパフォーマンス向上
          ...(this.isAndroid && {
            // Android固有の最適化
            latency: 0.1,
            volume: 1.0
          })
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // AudioWorkletNodeの作成
      this.audioWorkletNode = new AudioWorkletNode(
        this.audioContext!,
        'android-audio-processor'
      );

      // AudioWorkletメッセージハンドラー
      this.audioWorkletNode.port.onmessage = (event) => {
        const { type, data } = event.data;
        
        switch (type) {
          case 'recording-started':
            console.log('AudioWorklet recording started');
            break;
          case 'recording-complete':
            this.handleAudioWorkletComplete(event.data);
            break;
          case 'audio-level':
            if (this.onAudioLevel) {
              this.onAudioLevel(data.rms);
            }
            break;
          case 'silence-detected':
            console.log('Silence detected:', data);
            break;
          case 'buffer-overflow':
            console.warn('Audio buffer overflow:', data.message);
            this.stopRecording();
            break;
        }
      };

      // 音声ストリームをAudioWorkletに接続
      const source = this.audioContext!.createMediaStreamSource(this.mediaStream);
      source.connect(this.audioWorkletNode);
      this.audioWorkletNode.connect(this.audioContext!.destination);

      // MediaRecorderの設定（フォールバック用）
      this.setupMediaRecorder();

      // 録音開始
      this.recordingStartTime = Date.now();
      this.audioChunks = [];

      // AudioWorkletに録音開始を通知
      this.audioWorkletNode.port.postMessage({
        command: 'start',
        data: {
          sampleRate: this.isAndroid ? 16000 : 44100,
          noiseGate: 0.005,
          silenceThreshold: 0.01
        }
      });

      // MediaRecorder開始
      if (this.mediaRecorder) {
        this.mediaRecorder.start(100);
      }

      if (this.onRecordingStateChange) {
        this.onRecordingStateChange(true);
      }

      console.log('Recording started successfully');

    } catch (error) {
      console.error('Recording start failed:', error);
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error('マイクへのアクセスを許可してください');
        } else if (error.name === 'NotFoundError') {
          throw new Error('マイクが見つかりません');
        }
      }
      
      throw new Error('録音を開始できませんでした');
    }
  }

  // MediaRecorderの設定
  private setupMediaRecorder(): void {
    if (!this.mediaStream) return;

    const options: MediaRecorderOptions = {};
    
    // Android向けコーデック最適化
    if (this.isAndroid) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }
    } else {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      }
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped');
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
    };
  }

  // AudioWorklet完了処理
  private handleAudioWorkletComplete(data: any): void {
    console.log('AudioWorklet recording complete:', data);
    // 必要に応じて高品質音声データの処理を実装
  }

  // 録音停止
  async stopRecording(): Promise<AudioRecording | null> {
    try {
      const duration = Date.now() - this.recordingStartTime;

      // AudioWorklet停止
      if (this.audioWorkletNode) {
        this.audioWorkletNode.port.postMessage({ command: 'stop' });
        this.audioWorkletNode.disconnect();
        this.audioWorkletNode = null;
      }

      // MediaRecorder停止
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }

      // ストリーム停止
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      if (this.onRecordingStateChange) {
        this.onRecordingStateChange(false);
      }

      // 録音データの処理
      if (this.audioChunks.length > 0) {
        const audioBlob = new Blob(this.audioChunks, { 
          type: this.mediaRecorder?.mimeType || 'audio/wav' 
        });

        
        // バックエンドSTTサービスで文字起こし
        this.processAudioWithSTT(audioBlob, duration);
        
        // 一時的な録音データを返す（文字起こし結果は後で更新）
        const tempRecording: AudioRecording = {
          id: Date.now().toString(),
          timestamp: new Date(),
          transcript: '文字起こし処理中...',
          audioBlob,
          audioUrl: URL.createObjectURL(audioBlob),
          duration
        };

        return tempRecording;
      }

      return null;

    } catch (error) {
      console.error('Recording stop failed:', error);
      throw new Error('録音の停止に失敗しました');
    }
  }

  // バックエンドSTTサービスで音声を文字起こし
  private async processAudioWithSTT(audioBlob: Blob, duration: number): Promise<void> {
    try {
      console.log('Starting backend STT processing...');
      
      // 音声フォーマットを検出
      const format = sttApiService.detectAudioFormat(audioBlob);
      
      // STTサービスで文字起こし
      const sttResult = await sttApiService.transcribeAudioFile(audioBlob, format, 'ja-JP');
      
      if (sttResult.success && this.onTranscriptionComplete) {
        this.onTranscriptionComplete(sttResult);
      } else if (this.onError) {
        this.onError(sttResult.error || '文字起こしに失敗しました');
      }
      
    } catch (error) {
      console.error('STT processing error:', error);
      if (this.onError) {
        this.onError(error instanceof Error ? error.message : '文字起こしに失敗しました');
      }
    }
  }

  // コールバック設定
  setCallbacks(callbacks: {
    onRecordingStateChange?: (isRecording: boolean) => void;
    onError?: (error: string) => void;
    onAudioLevel?: (level: number) => void;
    onTranscriptionComplete?: (result: STTResponse) => void;
  }): void {
    this.onRecordingStateChange = callbacks.onRecordingStateChange;
    this.onError = callbacks.onError;
    this.onAudioLevel = callbacks.onAudioLevel;
    this.onTranscriptionComplete = callbacks.onTranscriptionComplete;
  }

  // クリーンアップ
  cleanup(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.audioChunks = [];
  }

  // プラットフォーム情報取得
  getPlatformInfo(): { isAndroid: boolean; isChrome: boolean } {
    return {
      isAndroid: this.isAndroid,
      isChrome: this.isChrome
    };
  }
}

// React Hook
export const useAndroidVoiceRecognition = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const voiceRecognitionRef = useRef<AndroidVoiceRecognition | null>(null);
  const currentRecordingRef = useRef<AudioRecording | null>(null);

  // 初期化
  useEffect(() => {
    voiceRecognitionRef.current = new AndroidVoiceRecognition();
    
    voiceRecognitionRef.current.setCallbacks({
      onRecordingStateChange: setIsRecording,
      onError: setError,
      onAudioLevel: setAudioLevel,
      onTranscriptionComplete: (sttResult) => {
        console.log('STT processing completed:', sttResult);
        setIsProcessing(false);
        
        // 現在の録音データを更新
        if (currentRecordingRef.current) {
          currentRecordingRef.current.transcript = sttResult.transcription;
          currentRecordingRef.current.confidence = sttResult.confidence;
          currentRecordingRef.current.processingTime = sttResult.processingTime;
          setTranscript(sttResult.transcription);
        }
      }
    });

    return () => {
      if (voiceRecognitionRef.current) {
        voiceRecognitionRef.current.cleanup();
      }
    };
  }, []);

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      setIsProcessing(false);
      currentRecordingRef.current = null;
      
      if (voiceRecognitionRef.current) {
        await voiceRecognitionRef.current.startRecording();
      }
    } catch (error) {
      console.error('Start recording failed:', error);
      setError(error instanceof Error ? error.message : '録音開始に失敗しました');
    }
  }, []);

  // 録音停止
  const stopRecording = useCallback(async (): Promise<AudioRecording | null> => {
    try {
      setIsProcessing(true);
      
      if (voiceRecognitionRef.current) {
        const recording = await voiceRecognitionRef.current.stopRecording();
        
        if (recording) {
          currentRecordingRef.current = recording;
          setTranscript('文字起こし処理中...');
        }
        
        return recording;
      }
      return null;
    } catch (error) {
      console.error('Stop recording failed:', error);
      setError(error instanceof Error ? error.message : '録音停止に失敗しました');
      return null;
    }
  }, []);

  // プラットフォーム情報
  const platformInfo = voiceRecognitionRef.current?.getPlatformInfo() || {
    isAndroid: false,
    isChrome: false
  };

  return {
    isRecording,
    transcript,
    audioLevel,
    error,
    isProcessing,
    startRecording,
    stopRecording,
    platformInfo
  };
};