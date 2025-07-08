// STT API通信サービス
export interface STTResponse {
  success: boolean;
  transcription: string;
  confidence: number;
  processingTime: number;
  totalTime?: number;
  alternatives?: Array<{
    transcript: string;
    confidence: number;
  }>;
  wordDetails?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence: number;
  }>;
  metadata?: {
    audioFormat: string;
    audioSize: number;
    language: string;
    chunks?: number;
    timestamp: string;
  };
  error?: string;
}

export interface STTServiceHealth {
  status: string;
  service: string;
  authenticated: boolean;
  initialized: boolean;
  stats: {
    totalRequests: number;
    activeClients: number;
    initialized: boolean;
    uptime: number;
  };
  timestamp: string;
  version: string;
}

class STTApiService {
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;

  constructor() {
    // 環境に応じてベースURLを設定
    this.baseUrl = import.meta.env.PROD 
      ? 'https://your-api-domain.com/api/stt' // 本番環境のAPIドメイン
      : 'http://localhost:3001/api/stt';
    
    this.timeout = 30000; // 30秒タイムアウト
    this.retryAttempts = 3;
  }

  // 音声ファイルを文字起こし
  async transcribeAudioFile(audioBlob: Blob, format: string = 'webm', language: string = 'ja-JP'): Promise<STTResponse> {
    try {
      console.log('Transcribing audio file:', {
        size: audioBlob.size,
        type: audioBlob.type,
        format: format
      });

      const formData = new FormData();
      formData.append('audio', audioBlob, `audio.${format}`);
      formData.append('audioFormat', format);
      formData.append('language', language);

      const response = await this.fetchWithRetry('/transcribe', {
        method: 'POST',
        body: formData,
        // Content-Typeは自動設定されるため指定しない
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: STTResponse = await response.json();
      
      console.log('Transcription completed:', {
        success: result.success,
        textLength: result.transcription?.length || 0,
        confidence: result.confidence,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      console.error('Audio file transcription error:', error);
      throw this.handleError(error);
    }
  }

  // Base64音声データを文字起こし
  async transcribeBase64Audio(audioData: string, format: string = 'webm', language: string = 'ja-JP'): Promise<STTResponse> {
    try {
      console.log('Transcribing base64 audio:', {
        dataLength: audioData.length,
        format: format
      });

      const requestBody = {
        audioData: audioData,
        audioFormat: format,
        language: language
      };

      const response = await this.fetchWithRetry('/transcribe-base64', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result: STTResponse = await response.json();
      
      console.log('Base64 transcription completed:', {
        success: result.success,
        textLength: result.transcription?.length || 0,
        confidence: result.confidence
      });

      return result;

    } catch (error) {
      console.error('Base64 transcription error:', error);
      throw this.handleError(error);
    }
  }

  // サービス状態チェック
  async checkHealth(): Promise<STTServiceHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000) // 5秒タイムアウト
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Health check error:', error);
      throw new Error('STTサービスとの通信に失敗しました');
    }
  }

  // サポートフォーマット取得
  async getSupportedFormats() {
    try {
      const response = await fetch(`${this.baseUrl}/formats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Failed to get formats: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Get formats error:', error);
      throw new Error('サポートフォーマットの取得に失敗しました');
    }
  }

  // リトライ機能付きfetch
  private async fetchWithRetry(endpoint: string, options: RequestInit, attempt: number = 1): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;

    } catch (error) {
      console.error(`Fetch attempt ${attempt} failed:`, error);

      if (attempt < this.retryAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // 指数バックオフ
        console.log(`Retrying in ${delay}ms... (attempt ${attempt + 1}/${this.retryAttempts})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchWithRetry(endpoint, options, attempt + 1);
      }

      throw error;
    }
  }

  // エラーハンドリング
  private handleError(error: any): Error {
    if (error.name === 'AbortError') {
      return new Error('リクエストがタイムアウトしました。ネットワーク接続を確認してください。');
    }
    
    if (error.message.includes('Failed to fetch')) {
      return new Error('STTサーバーに接続できません。ネットワーク接続を確認してください。');
    }
    
    if (error.message.includes('rate limit')) {
      return new Error('リクエスト制限に達しました。しばらく待ってから再試行してください。');
    }
    
    if (error.message.includes('file too large')) {
      return new Error('音声ファイルが大きすぎます。10MB以下のファイルを使用してください。');
    }
    
    if (error.message.includes('unsupported format')) {
      return new Error('対応していない音声フォーマットです。WebM、WAV、MP3形式を使用してください。');
    }

    return error instanceof Error ? error : new Error('音声の文字起こしに失敗しました');
  }

  // 音声データをBase64に変換
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // "data:audio/webm;base64," の部分を除去
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // 音声フォーマットを検出
  detectAudioFormat(blob: Blob): string {
    const mimeType = blob.type.toLowerCase();
    
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
    if (mimeType.includes('ogg')) return 'ogg';
    
    // デフォルトはwebm（Android Chrome対応）
    return 'webm';
  }

  // 接続テスト
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/test`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// シングルトンインスタンス
const sttApiService = new STTApiService();

export default sttApiService;