// Google Cloud Speech-to-Text設定
export const speechConfig = {
  // 音声認識設定
  encoding: 'WEBM_OPUS', // Android Chrome対応
  sampleRateHertz: 16000, // Android最適化
  languageCode: 'ja-JP',
  alternativeLanguageCodes: ['en-US'], // フォールバック
  
  // 認識精度向上設定
  enableAutomaticPunctuation: true,
  enableWordTimeOffsets: true,
  enableWordConfidence: true,
  
  // Android向け最適化
  model: 'latest_long', // 長時間音声対応
  useEnhanced: true, // 高精度モデル使用
  
  // ファイル制限
  maxAudioLength: 300, // 5分制限
  maxFileSize: 10 * 1024 * 1024, // 10MB制限
  
  // サポートフォーマット
  supportedFormats: ['webm', 'wav', 'mp3', 'ogg'],
  
  // レート制限
  rateLimitPerMinute: 60,
  rateLimitPerHour: 1000
};

// Workload Identity設定
export const workloadIdentityConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  workloadIdentityPoolId: process.env.GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID,
  workloadIdentityProviderId: process.env.GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID,
  serviceAccountEmail: process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL,
  
  // GitHub Actions用設定
  githubRepo: `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`,
  
  // 認証スコープ
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/speech'
  ]
};

// エラーメッセージ
export const errorMessages = {
  UNSUPPORTED_FORMAT: '対応していない音声フォーマットです',
  FILE_TOO_LARGE: 'ファイルサイズが大きすぎます（10MB以下にしてください）',
  AUDIO_TOO_LONG: '音声が長すぎます（5分以下にしてください）',
  RATE_LIMIT_EXCEEDED: 'リクエスト制限を超えました。しばらく待ってから再試行してください',
  AUTHENTICATION_FAILED: '認証に失敗しました',
  TRANSCRIPTION_FAILED: '音声の文字起こしに失敗しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました'
};