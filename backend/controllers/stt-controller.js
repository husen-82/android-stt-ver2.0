import googleSTTService from '../services/google-stt-service.js';
import { errorMessages } from '../config/speech-config.js';

class STTController {
  // 音声文字起こしエンドポイント
  async transcribeAudio(req, res) {
    try {
      const startTime = Date.now();
      
      // リクエスト検証
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: '音声ファイルが見つかりません'
        });
      }

      const audioBuffer = req.file.buffer;
      const format = req.body.audioFormat || 'webm';
      const language = req.body.language || 'ja-JP';
      const clientId = req.ip || 'unknown';

      console.log('Transcription request:', {
        fileSize: audioBuffer.length,
        format: format,
        language: language,
        clientId: clientId
      });

      // オプション設定
      const options = {
        languageCode: language,
        clientId: clientId,
        sampleRate: parseInt(req.body.sampleRate) || 16000
      };

      // 音声文字起こし実行
      let result;
      if (audioBuffer.length > 4 * 1024 * 1024) { // 4MB以上は分割処理
        result = await googleSTTService.transcribeLongAudio(audioBuffer, format, options);
      } else {
        result = await googleSTTService.transcribeAudio(audioBuffer, format, options);
      }

      const totalTime = Date.now() - startTime;
      
      // レスポンス
      res.json({
        success: true,
        transcription: result.transcription,
        confidence: result.confidence,
        processingTime: result.processingTime,
        totalTime: totalTime,
        alternatives: result.alternatives || [],
        wordDetails: result.wordDetails || [],
        metadata: {
          audioFormat: format,
          audioSize: audioBuffer.length,
          language: language,
          chunks: result.chunks || 1,
          timestamp: new Date().toISOString()
        }
      });

      console.log('Transcription completed:', {
        success: true,
        textLength: result.transcription.length,
        confidence: result.confidence,
        totalTime: totalTime
      });

    } catch (error) {
      console.error('Transcription error:', error);
      
      // エラーレスポンス
      res.status(500).json({
        success: false,
        error: error.message || errorMessages.TRANSCRIPTION_FAILED,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Base64音声データの文字起こし
  async transcribeBase64Audio(req, res) {
    try {
      const { audioData, audioFormat, language } = req.body;
      
      if (!audioData) {
        return res.status(400).json({
          success: false,
          error: '音声データが見つかりません'
        });
      }

      // Base64デコード
      const audioBuffer = Buffer.from(audioData, 'base64');
      const format = audioFormat || 'webm';
      const lang = language || 'ja-JP';
      const clientId = req.ip || 'unknown';

      console.log('Base64 transcription request:', {
        dataSize: audioBuffer.length,
        format: format,
        language: lang
      });

      const options = {
        languageCode: lang,
        clientId: clientId
      };

      // 音声文字起こし実行
      const result = await googleSTTService.transcribeAudio(audioBuffer, format, options);

      res.json({
        success: true,
        transcription: result.transcription,
        confidence: result.confidence,
        processingTime: result.processingTime,
        alternatives: result.alternatives || [],
        metadata: {
          audioFormat: format,
          audioSize: audioBuffer.length,
          language: lang,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Base64 transcription error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || errorMessages.TRANSCRIPTION_FAILED,
        timestamp: new Date().toISOString()
      });
    }
  }

  // サービス状態チェック
  async healthCheck(req, res) {
    try {
      const health = await googleSTTService.healthCheck();
      const stats = googleSTTService.getStats();
      
      res.json({
        status: health.status,
        service: 'Google Speech-to-Text',
        authenticated: health.authenticated,
        initialized: health.initialized,
        stats: stats,
        timestamp: health.timestamp,
        version: '1.0.0'
      });

    } catch (error) {
      console.error('Health check error:', error);
      
      res.status(500).json({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // サポートされている音声フォーマット一覧
  async getSupportedFormats(req, res) {
    try {
      const { speechConfig } = await import('../config/speech-config.js');
      
      res.json({
        success: true,
        supportedFormats: speechConfig.supportedFormats,
        maxFileSize: speechConfig.maxFileSize,
        maxAudioLength: speechConfig.maxAudioLength,
        sampleRate: speechConfig.sampleRateHertz,
        languages: ['ja-JP', 'en-US'],
        features: {
          automaticPunctuation: true,
          wordTimeOffsets: true,
          wordConfidence: true,
          longAudioSupport: true
        }
      });

    } catch (error) {
      console.error('Get formats error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 統計情報取得
  async getStats(req, res) {
    try {
      const stats = googleSTTService.getStats();
      
      res.json({
        success: true,
        stats: stats,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get stats error:', error);
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // エラーハンドリングミドルウェア
  static errorHandler(error, req, res, next) {
    console.error('STT Controller Error:', error);
    
    // Multerエラー
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: errorMessages.FILE_TOO_LARGE
      });
    }
    
    // その他のエラー
    res.status(500).json({
      success: false,
      error: error.message || 'サーバーエラーが発生しました',
      timestamp: new Date().toISOString()
    });
  }
}

export default new STTController();