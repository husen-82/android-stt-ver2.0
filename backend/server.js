import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sttRoutes from './routes/stt-routes.js';
import { validateEnvironmentVariables, displayWorkloadIdentitySetup } from './auth/workload-identity-setup.js';
import googleSTTService from './services/google-stt-service.js';

// 環境変数読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS設定
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] // 本番環境のドメインを設定
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ミドルウェア設定
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// リクエストログ
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// ヘルスチェック（ルートパス）
app.get('/', (req, res) => {
  res.json({
    service: 'Fusenkun STT API',
    status: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      transcribe: '/api/stt/transcribe',
      transcribeBase64: '/api/stt/transcribe-base64',
      health: '/api/stt/health',
      formats: '/api/stt/formats',
      stats: '/api/stt/stats'
    }
  });
});

// STT API ルート
app.use('/api/stt', sttRoutes);

// 404エラーハンドリング
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'エンドポイントが見つかりません',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// グローバルエラーハンドリング
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  res.status(500).json({
    success: false,
    error: 'サーバー内部エラーが発生しました',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

// サーバー起動
async function startServer() {
  try {
    console.log('Starting Fusenkun STT Server...');
    
    // 環境変数検証
    if (process.env.NODE_ENV === 'production') {
      validateEnvironmentVariables();
    } else {
      console.log('Development mode - skipping environment validation');
      displayWorkloadIdentitySetup();
    }
    
    // STTサービス初期化（本番環境のみ）
    if (process.env.NODE_ENV === 'production') {
      console.log('Initializing STT service...');
      await googleSTTService.initialize();
      console.log('STT service initialized successfully');
    } else {
      console.log('Development mode - STT service initialization skipped');
    }
    
    // サーバー開始
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Fusenkun STT Server is running!`);
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`🌍 Network: http://0.0.0.0:${PORT}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/api/stt/health`);
      console.log(`📝 API Docs: http://localhost:${PORT}/api/stt/formats`);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('\n⚠️  Development Mode:');
        console.log('   - STT service is mocked');
        console.log('   - Environment validation is skipped');
        console.log('   - See console for Workload Identity setup instructions');
      }
      
      console.log('\n✅ Server ready to accept requests\n');
    });
    
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    
    if (error.message.includes('environment variables')) {
      console.log('\n📋 Required Environment Variables:');
      console.log('   - GOOGLE_CLOUD_PROJECT_ID');
      console.log('   - GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID');
      console.log('   - GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID');
      console.log('   - GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL');
      console.log('\n💡 Run in development mode to see setup instructions');
    }
    
    process.exit(1);
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// サーバー開始
startServer();