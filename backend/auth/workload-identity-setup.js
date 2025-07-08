import { GoogleAuth } from 'google-auth-library';
import { workloadIdentityConfig } from '../config/speech-config.js';

class WorkloadIdentityManager {
  constructor() {
    this.auth = null;
    this.client = null;
    this.initialized = false;
  }

  // Workload Identity認証の初期化
  async initialize() {
    try {
      console.log('Initializing Workload Identity...');
      
      // GitHub Actions環境での認証設定
      if (process.env.GITHUB_ACTIONS) {
        this.auth = new GoogleAuth({
          scopes: workloadIdentityConfig.scopes,
          projectId: workloadIdentityConfig.projectId
        });
      } else {
        // ローカル開発環境での認証
        this.auth = new GoogleAuth({
          scopes: workloadIdentityConfig.scopes,
          projectId: workloadIdentityConfig.projectId,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
        });
      }

      // 認証クライアントを取得
      this.client = await this.auth.getClient();
      
      // 認証テスト
      await this.testAuthentication();
      
      this.initialized = true;
      console.log('Workload Identity initialized successfully');
      
    } catch (error) {
      console.error('Workload Identity initialization failed:', error);
      throw new Error('認証の初期化に失敗しました');
    }
  }

  // 認証テスト
  async testAuthentication() {
    try {
      const projectId = await this.auth.getProjectId();
      console.log('Authenticated for project:', projectId);
      
      // アクセストークンを取得してテスト
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }
      
      console.log('Authentication test passed');
    } catch (error) {
      console.error('Authentication test failed:', error);
      throw error;
    }
  }

  // アクセストークンを取得
  async getAccessToken() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      const accessToken = await this.client.getAccessToken();
      return accessToken.token;
    } catch (error) {
      console.error('Failed to get access token:', error);
      throw new Error('アクセストークンの取得に失敗しました');
    }
  }

  // 認証済みクライアントを取得
  async getAuthenticatedClient() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return this.client;
    } catch (error) {
      console.error('Failed to get authenticated client:', error);
      throw new Error('認証済みクライアントの取得に失敗しました');
    }
  }

  // プロジェクトIDを取得
  async getProjectId() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      return await this.auth.getProjectId();
    } catch (error) {
      console.error('Failed to get project ID:', error);
      throw new Error('プロジェクトIDの取得に失敗しました');
    }
  }

  // 認証状態をチェック
  isAuthenticated() {
    return this.initialized && this.client !== null;
  }

  // 認証情報をリフレッシュ
  async refreshAuthentication() {
    try {
      console.log('Refreshing authentication...');
      this.initialized = false;
      this.client = null;
      await this.initialize();
      console.log('Authentication refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh authentication:', error);
      throw new Error('認証のリフレッシュに失敗しました');
    }
  }
}

// シングルトンインスタンス
const workloadIdentityManager = new WorkloadIdentityManager();

export default workloadIdentityManager;

// 環境変数の検証
export function validateEnvironmentVariables() {
  const requiredVars = [
    'GOOGLE_CLOUD_PROJECT_ID',
    'GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID',
    'GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID',
    'GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  console.log('Environment variables validated successfully');
}

// GitHub Actions用のWorkload Identity設定を表示
export function displayWorkloadIdentitySetup() {
  console.log('\n=== Workload Identity Setup Instructions ===');
  console.log('1. Google Cloud Console でプロジェクトを作成');
  console.log('2. Speech-to-Text API を有効化');
  console.log('3. Workload Identity Pool を作成:');
  console.log(`   gcloud iam workload-identity-pools create "github-pool" \\
     --project="${workloadIdentityConfig.projectId}" \\
     --location="global" \\
     --display-name="GitHub Actions Pool"`);
  
  console.log('\n4. GitHub Provider を作成:');
  console.log(`   gcloud iam workload-identity-pools providers create-oidc "github-provider" \\
     --project="${workloadIdentityConfig.projectId}" \\
     --location="global" \\
     --workload-identity-pool="github-pool" \\
     --display-name="GitHub Provider" \\
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \\
     --issuer-uri="https://token.actions.githubusercontent.com"`);
  
  console.log('\n5. Service Account を作成:');
  console.log(`   gcloud iam service-accounts create "fusenkun-stt" \\
     --project="${workloadIdentityConfig.projectId}" \\
     --display-name="Fusenkun STT Service Account"`);
  
  console.log('\n6. 必要な権限を付与:');
  console.log(`   gcloud projects add-iam-policy-binding "${workloadIdentityConfig.projectId}" \\
     --member="serviceAccount:${workloadIdentityConfig.serviceAccountEmail}" \\
     --role="roles/speech.client"`);
  
  console.log('\n7. Workload Identity バインディング:');
  console.log(`   gcloud iam service-accounts add-iam-policy-binding \\
     "${workloadIdentityConfig.serviceAccountEmail}" \\
     --project="${workloadIdentityConfig.projectId}" \\
     --role="roles/iam.workloadIdentityUser" \\
     --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/${workloadIdentityConfig.githubRepo}"`);
  
  console.log('\n8. GitHub Secrets に以下を設定:');
  console.log(`   GOOGLE_CLOUD_PROJECT_ID: ${workloadIdentityConfig.projectId}`);
  console.log(`   GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool`);
  console.log(`   GOOGLE_CLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider`);
  console.log(`   GOOGLE_CLOUD_SERVICE_ACCOUNT_EMAIL: ${workloadIdentityConfig.serviceAccountEmail}`);
  console.log('===============================================\n');
}