# ふせん君 - Android対応音声入力アプリ

Android OS最適化された音声入力・文字起こし忘備録アプリです。Google Cloud Speech-to-Textを使用したバックエンド処理により、高精度な文字起こしを実現します。

## 🚀 主な機能

- **Android最適化音声録音**: Android端末での安定した音声録音
- **高精度文字起こし**: Google Cloud Speech-to-Text APIによる高品質な文字起こし
- **オフライン対応**: IndexedDBによるローカルデータ保存
- **リアルタイム音声レベル表示**: 録音中の音声レベル可視化
- **PWA対応**: ホーム画面への追加とオフライン動作
- **レスポンシブデザイン**: モバイル・デスクトップ両対応

## 🏗️ アーキテクチャ

### フロントエンド
- **React 18** + **TypeScript**
- **Tailwind CSS** (スタイリング)
- **Vite** (ビルドツール)
- **IndexedDB** (ローカルストレージ)
- **Web Audio API** (音声録音)

### バックエンド
- **Node.js** + **Express**
- **Google Cloud Speech-to-Text API**
- **Workload Identity** (認証)
- **Multer** (ファイルアップロード)

## 📋 セットアップ手順

### 1. 環境変数設定

`.env.example`をコピーして`.env`を作成し、以下の値を設定してください：

```bash
# Google Cloud設定
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID=projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool
GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID=projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL=fusenkun-stt@your-project-id.iam.gserviceaccount.com

# GitHub Actions用
GITHUB_REPO_OWNER=your-username
GITHUB_REPO_NAME=your-repo-name

# サーバー設定
PORT=3001
NODE_ENV=development
```

### 2. Google Cloud設定

#### プロジェクト作成と API有効化
```bash
# プロジェクト作成
gcloud projects create your-project-id
gcloud config set project your-project-id

# Speech-to-Text API有効化
gcloud services enable speech.googleapis.com
```

#### Workload Identity設定
```bash
# Workload Identity Pool作成
gcloud iam workload-identity-pools create "github-pool" \
  --project="your-project-id" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# GitHub Provider作成
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="your-project-id" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# Service Account作成
gcloud iam service-accounts create "fusenkun-stt" \
  --project="your-project-id" \
  --display-name="Fusenkun STT Service Account"

# 権限付与
gcloud projects add-iam-policy-binding "your-project-id" \
  --member="serviceAccount:fusenkun-stt@your-project-id.iam.gserviceaccount.com" \
  --role="roles/speech.client"

# Workload Identity バインディング
gcloud iam service-accounts add-iam-policy-binding \
  "fusenkun-stt@your-project-id.iam.gserviceaccount.com" \
  --project="your-project-id" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/your-username/your-repo-name"
```

### 3. GitHub Secrets設定

GitHub リポジトリの Settings > Secrets and variables > Actions で以下を設定：

```
GOOGLE_CLOUD_PROJECT_ID
GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID
GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID
GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL
NETLIFY_AUTH_TOKEN
NETLIFY_SITE_ID
```

## 🛠️ 開発環境

### 依存関係インストール
```bash
npm install
```

### 開発サーバー起動
```bash
# フロントエンドのみ
npm run dev

# フロントエンド + バックエンド
npm run dev:full
```

### バックエンドのみ起動
```bash
npm run dev:backend
```

## 📱 使用方法

1. **音声録音**: 中央の青いボタンをタップまたは長押しで録音開始
2. **録音停止**: 録音中にボタンをタップで停止
3. **文字起こし**: 録音停止後、自動的にバックエンドで文字起こし処理
4. **メモ保存**: 文字起こし完了後、メモとして自動保存
5. **音声再生**: メモの再生ボタンで録音した音声を再生
6. **メモ削除**: スワイプまたは削除ボタンでメモを削除

## 🔧 API エンドポイント

### STT API
- `POST /api/stt/transcribe` - 音声ファイルアップロード文字起こし
- `POST /api/stt/transcribe-base64` - Base64音声データ文字起こし
- `GET /api/stt/health` - サービス状態チェック
- `GET /api/stt/formats` - サポートフォーマット一覧
- `GET /api/stt/stats` - 統計情報

### リクエスト例
```javascript
// 音声ファイルアップロード
const formData = new FormData();
formData.append('audio', audioBlob, 'audio.webm');
formData.append('audioFormat', 'webm');
formData.append('language', 'ja-JP');

const response = await fetch('/api/stt/transcribe', {
  method: 'POST',
  body: formData
});
```

## 🚀 デプロイ

### 自動デプロイ
GitHub Actions により、`main` ブランチへのプッシュで自動デプロイされます：

- **フロントエンド**: Netlify
- **バックエンド**: Google Cloud Run

### 手動デプロイ
```bash
# フロントエンドビルド
npm run build

# バックエンドデプロイ
gcloud run deploy fusenkun-stt-api \
  --source=./backend \
  --platform=managed \
  --region=asia-northeast1 \
  --allow-unauthenticated
```

## 🔒 セキュリティ

- **Workload Identity**: パスワードレス認証
- **CORS設定**: 許可されたオリジンのみアクセス可能
- **レート制限**: API使用量制限
- **ファイルサイズ制限**: 10MB以下の音声ファイルのみ
- **音声データ暗号化**: HTTPS通信による暗号化

## 📊 監視・ログ

- **Google Cloud Logging**: バックエンドログ
- **Error Tracking**: エラー監視
- **Performance Monitoring**: パフォーマンス監視
- **Usage Analytics**: API使用量分析

## 🐛 トラブルシューティング

### よくある問題

1. **マイクアクセス拒否**
   - ブラウザの設定でマイクアクセスを許可
   - HTTPS環境での実行を確認

2. **文字起こし失敗**
   - ネットワーク接続を確認
   - 音声ファイルサイズ（10MB以下）を確認
   - サポートフォーマット（WebM, WAV, MP3）を確認

3. **認証エラー**
   - 環境変数の設定を確認
   - Workload Identity設定を確認
   - Service Account権限を確認

### ログ確認
```bash
# バックエンドログ
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=fusenkun-stt-api"

# 開発環境ログ
npm run dev:backend
```

## 🤝 コントリビューション

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 ライセンス

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 謝辞

- Google Cloud Speech-to-Text API
- React Community
- Tailwind CSS Team
- All contributors and users
