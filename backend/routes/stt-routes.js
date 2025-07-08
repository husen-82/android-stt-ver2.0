import express from 'express';
import multer from 'multer';
import sttController from '../controllers/stt-controller.js';
import { speechConfig } from '../config/speech-config.js';

const router = express.Router();

// Multer設定（音声ファイルアップロード用）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: speechConfig.maxFileSize, // 10MB制限
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // MIMEタイプチェック
    const allowedMimes = [
      'audio/webm',
      'audio/wav',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/x-wav',
      'audio/wave'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('対応していない音声フォーマットです'), false);
    }
  }
});

// レート制限ミドルウェア
const rateLimitMap = new Map();

const rateLimit = (req, res, next) => {
  const clientId = req.ip;
  const now = Date.now();
  
  if (!rateLimitMap.has(clientId)) {
    rateLimitMap.set(clientId, []);
  }
  
  const requests = rateLimitMap.get(clientId);
  
  // 1分以内のリクエストをフィルタ
  const recentRequests = requests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= speechConfig.rateLimitPerMinute) {
    return res.status(429).json({
      success: false,
      error: 'リクエスト制限を超えました。1分後に再試行してください。',
      retryAfter: 60
    });
  }
  
  recentRequests.push(now);
  rateLimitMap.set(clientId, recentRequests);
  
  next();
};

// ログミドルウェア
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });
  
  next();
};

// ルート定義

// 音声ファイルアップロードによる文字起こし
router.post('/transcribe', 
  requestLogger,
  rateLimit,
  upload.single('audio'),
  sttController.transcribeAudio
);

// Base64音声データによる文字起こし
router.post('/transcribe-base64',
  requestLogger,
  rateLimit,
  express.json({ limit: '15mb' }), // Base64は元データより大きくなるため
  sttController.transcribeBase64Audio
);

// サービス状態チェック
router.get('/health',
  requestLogger,
  sttController.healthCheck
);

// サポートフォーマット一覧
router.get('/formats',
  requestLogger,
  sttController.getSupportedFormats
);

// 統計情報
router.get('/stats',
  requestLogger,
  sttController.getStats
);

// テスト用エンドポイント
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'STT API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// エラーハンドリング
router.use(sttController.errorHandler);

export default router;