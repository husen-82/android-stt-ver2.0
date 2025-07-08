import { SpeechClient } from '@google-cloud/speech';
import workloadIdentityManager from '../auth/workload-identity-setup.js';
import { speechConfig, errorMessages } from '../config/speech-config.js';

class GoogleSTTService {
  constructor() {
    this.speechClient = null;
    this.initialized = false;
    this.requestCount = new Map(); // レート制限用
  }

  // サービス初期化
  async initialize() {
    try {
      console.log('Initializing Google STT Service...');
      
      // Workload Identity認証
      await workloadIdentityManager.initialize();
      const authClient = await workloadIdentityManager.getAuthenticatedClient();
      
      // Speech Clientを初期化
      this.speechClient = new SpeechClient({
        projectId: await workloadIdentityManager.getProjectId(),
        auth: authClient
      });
      
      this.initialized = true;
      console.log('Google STT Service initialized successfully');
      
    } catch (error) {
      console.error('Google STT Service initialization failed:', error);
      throw new Error('STTサービスの初期化に失敗しました');
    }
  }

  // 音声ファイルの検証
  validateAudioFile(audioBuffer, format) {
    // ファイルサイズチェック
    if (audioBuffer.length > speechConfig.maxFileSize) {
      throw new Error(errorMessages.FILE_TOO_LARGE);
    }

    // フォーマットチェック
    if (!speechConfig.supportedFormats.includes(format.toLowerCase())) {
      throw new Error(errorMessages.UNSUPPORTED_FORMAT);
    }

    // 音声長チェック（概算）
    const estimatedDuration = audioBuffer.length / (speechConfig.sampleRateHertz * 2); // 16bit想定
    if (estimatedDuration > speechConfig.maxAudioLength) {
      throw new Error(errorMessages.AUDIO_TOO_LONG);
    }

    return true;
  }

  // レート制限チェック
  checkRateLimit(clientId) {
    const now = Date.now();
    const clientRequests = this.requestCount.get(clientId) || [];
    
    // 1分以内のリクエスト数をカウント
    const recentRequests = clientRequests.filter(time => now - time < 60000);
    
    if (recentRequests.length >= speechConfig.rateLimitPerMinute) {
      throw new Error(errorMessages.RATE_LIMIT_EXCEEDED);
    }

    // 1時間以内のリクエスト数をカウント
    const hourlyRequests = clientRequests.filter(time => now - time < 3600000);
    
    if (hourlyRequests.length >= speechConfig.rateLimitPerHour) {
      throw new Error(errorMessages.RATE_LIMIT_EXCEEDED);
    }

    // リクエスト記録を更新
    recentRequests.push(now);
    this.requestCount.set(clientId, recentRequests);
    
    return true;
  }

  // 音声フォーマットに応じたエンコーディング設定
  getEncodingConfig(format) {
    const formatMap = {
      'webm': 'WEBM_OPUS',
      'wav': 'LINEAR16',
      'mp3': 'MP3',
      'ogg': 'OGG_OPUS'
    };

    return formatMap[format.toLowerCase()] || 'WEBM_OPUS';
  }

  // 音声を文字起こし（メイン処理）
  async transcribeAudio(audioBuffer, format, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const startTime = Date.now();
      
      // 入力検証
      this.validateAudioFile(audioBuffer, format);
      
      // レート制限チェック
      const clientId = options.clientId || 'default';
      this.checkRateLimit(clientId);

      // 音声認識設定
      const encoding = this.getEncodingConfig(format);
      const config = {
        encoding: encoding,
        sampleRateHertz: options.sampleRate || speechConfig.sampleRateHertz,
        languageCode: options.languageCode || speechConfig.languageCode,
        alternativeLanguageCodes: speechConfig.alternativeLanguageCodes,
        enableAutomaticPunctuation: speechConfig.enableAutomaticPunctuation,
        enableWordTimeOffsets: speechConfig.enableWordTimeOffsets,
        enableWordConfidence: speechConfig.enableWordConfidence,
        model: speechConfig.model,
        useEnhanced: speechConfig.useEnhanced,
        
        // Android向け最適化設定
        audioChannelCount: 1, // モノラル
        enableSeparateRecognitionPerChannel: false,
        
        // 精度向上設定
        profanityFilter: false, // 日本語では無効
        enableSpokenPunctuation: true,
        enableSpokenEmojis: false
      };

      const audio = {
        content: audioBuffer.toString('base64')
      };

      const request = {
        config: config,
        audio: audio
      };

      console.log('Starting speech recognition...');
      console.log('Audio size:', audioBuffer.length, 'bytes');
      console.log('Format:', format, '-> Encoding:', encoding);

      // Google Cloud Speech-to-Text API呼び出し
      const [response] = await this.speechClient.recognize(request);
      
      const processingTime = Date.now() - startTime;
      console.log('Speech recognition completed in', processingTime, 'ms');

      // 結果の処理
      if (!response.results || response.results.length === 0) {
        return {
          success: true,
          transcription: '',
          confidence: 0,
          processingTime: processingTime,
          alternatives: [],
          wordDetails: []
        };
      }

      // 最も信頼度の高い結果を取得
      const bestResult = response.results[0];
      const bestAlternative = bestResult.alternatives[0];
      
      // 代替候補を取得
      const alternatives = bestResult.alternatives.slice(1, 3).map(alt => ({
        transcript: alt.transcript,
        confidence: alt.confidence || 0
      }));

      // 単語レベルの詳細情報
      const wordDetails = bestAlternative.words ? bestAlternative.words.map(word => ({
        word: word.word,
        startTime: word.startTime ? parseFloat(word.startTime.seconds || 0) + (word.startTime.nanos || 0) / 1e9 : 0,
        endTime: word.endTime ? parseFloat(word.endTime.seconds || 0) + (word.endTime.nanos || 0) / 1e9 : 0,
        confidence: word.confidence || 0
      })) : [];

      const result = {
        success: true,
        transcription: bestAlternative.transcript || '',
        confidence: bestAlternative.confidence || 0,
        processingTime: processingTime,
        alternatives: alternatives,
        wordDetails: wordDetails,
        
        // デバッグ情報
        debug: {
          totalResults: response.results.length,
          encoding: encoding,
          sampleRate: config.sampleRateHertz,
          audioSize: audioBuffer.length
        }
      };

      console.log('Transcription result:', {
        text: result.transcription,
        confidence: result.confidence,
        processingTime: result.processingTime
      });

      return result;

    } catch (error) {
      console.error('Speech recognition error:', error);
      
      // エラーの種類に応じた処理
      if (error.code === 3) { // INVALID_ARGUMENT
        throw new Error(errorMessages.UNSUPPORTED_FORMAT);
      } else if (error.code === 8) { // RESOURCE_EXHAUSTED
        throw new Error(errorMessages.RATE_LIMIT_EXCEEDED);
      } else if (error.code === 16) { // UNAUTHENTICATED
        throw new Error(errorMessages.AUTHENTICATION_FAILED);
      } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
        throw new Error(errorMessages.RATE_LIMIT_EXCEEDED);
      } else {
        throw new Error(errorMessages.TRANSCRIPTION_FAILED + ': ' + error.message);
      }
    }
  }

  // 長時間音声の分割処理
  async transcribeLongAudio(audioBuffer, format, options = {}) {
    try {
      // 5分以上の音声は分割処理
      const maxChunkSize = 4 * 1024 * 1024; // 4MB chunks
      
      if (audioBuffer.length <= maxChunkSize) {
        return await this.transcribeAudio(audioBuffer, format, options);
      }

      console.log('Processing long audio in chunks...');
      
      const chunks = [];
      for (let i = 0; i < audioBuffer.length; i += maxChunkSize) {
        chunks.push(audioBuffer.slice(i, i + maxChunkSize));
      }

      const results = [];
      let totalProcessingTime = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
        
        const chunkResult = await this.transcribeAudio(chunks[i], format, {
          ...options,
          clientId: `${options.clientId || 'default'}_chunk_${i}`
        });
        
        results.push(chunkResult);
        totalProcessingTime += chunkResult.processingTime;
        
        // チャンク間の待機（レート制限対策）
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 結果をマージ
      const combinedTranscription = results
        .map(r => r.transcription)
        .filter(t => t.length > 0)
        .join(' ');
      
      const averageConfidence = results.length > 0 
        ? results.reduce((sum, r) => sum + r.confidence, 0) / results.length 
        : 0;

      return {
        success: true,
        transcription: combinedTranscription,
        confidence: averageConfidence,
        processingTime: totalProcessingTime,
        chunks: results.length,
        alternatives: [],
        wordDetails: []
      };

    } catch (error) {
      console.error('Long audio transcription error:', error);
      throw error;
    }
  }

  // サービス状態チェック
  async healthCheck() {
    try {
      if (!this.initialized) {
        return { status: 'not_initialized' };
      }

      // 認証状態チェック
      const isAuthenticated = workloadIdentityManager.isAuthenticated();
      
      return {
        status: 'healthy',
        authenticated: isAuthenticated,
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // 統計情報取得
  getStats() {
    const totalRequests = Array.from(this.requestCount.values())
      .reduce((sum, requests) => sum + requests.length, 0);
    
    return {
      totalRequests: totalRequests,
      activeClients: this.requestCount.size,
      initialized: this.initialized,
      uptime: process.uptime()
    };
  }
}

// シングルトンインスタンス
const googleSTTService = new GoogleSTTService();

export default googleSTTService;