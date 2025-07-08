// AudioWorklet プロセッサー - Android最適化版
class AndroidOptimizedAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // Android向け最適化パラメータ
    this.bufferSize = 4096; // Android向けバッファサイズ
    this.sampleRate = 16000; // 音声認識に最適なサンプルレート
    this.channels = 1; // モノラル録音でパフォーマンス向上
    
    // 音声データバッファ
    this.audioBuffer = [];
    this.isRecording = false;
    this.recordingStartTime = 0;
    
    // 音声レベル検出
    this.silenceThreshold = 0.01; // 無音判定閾値
    this.silenceCounter = 0;
    this.maxSilenceFrames = 100; // 約2秒の無音で自動停止
    
    // ノイズ抑制パラメータ
    this.noiseGate = 0.005;
    this.previousSample = 0;
    
    // メッセージハンドラー
    this.port.onmessage = (event) => {
      const { command, data } = event.data;
      
      switch (command) {
        case 'start':
          this.startRecording(data);
          break;
        case 'stop':
          this.stopRecording();
          break;
        case 'configure':
          this.configure(data);
          break;
      }
    };
  }

  // 録音開始
  startRecording(config = {}) {
    this.isRecording = true;
    this.recordingStartTime = currentTime;
    this.audioBuffer = [];
    this.silenceCounter = 0;
    
    // 設定の適用
    if (config.sampleRate) this.sampleRate = config.sampleRate;
    if (config.noiseGate) this.noiseGate = config.noiseGate;
    if (config.silenceThreshold) this.silenceThreshold = config.silenceThreshold;
    
    this.port.postMessage({
      type: 'recording-started',
      timestamp: this.recordingStartTime
    });
    
    console.log('AudioProcessor: Recording started');
  }

  // 録音停止
  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    const duration = currentTime - this.recordingStartTime;
    
    // 録音データを送信
    if (this.audioBuffer.length > 0) {
      const audioData = new Float32Array(this.audioBuffer);
      
      this.port.postMessage({
        type: 'recording-complete',
        audioData: audioData,
        duration: duration,
        sampleRate: this.sampleRate,
        channels: this.channels
      });
    }
    
    // バッファクリア
    this.audioBuffer = [];
    
    console.log('AudioProcessor: Recording stopped, duration:', duration);
  }

  // 設定変更
  configure(config) {
    Object.assign(this, config);
    this.port.postMessage({
      type: 'configured',
      config: config
    });
  }

  // メイン処理ループ
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    
    if (!this.isRecording) {
      return true;
    }

    // 音声レベル計算
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < inputChannel.length; i++) {
      let sample = inputChannel[i];
      
      // ノイズゲート適用
      if (Math.abs(sample) < this.noiseGate) {
        sample = 0;
      }
      
      // 簡単なハイパスフィルター（Android向け最適化）
      const filtered = sample - this.previousSample * 0.95;
      this.previousSample = sample;
      
      // 音声データをバッファに追加
      this.audioBuffer.push(filtered);
      
      // レベル計算
      sum += filtered * filtered;
      peak = Math.max(peak, Math.abs(filtered));
    }

    const rms = Math.sqrt(sum / inputChannel.length);
    
    // 無音検出
    if (rms < this.silenceThreshold) {
      this.silenceCounter++;
      
      // 長時間無音の場合は自動停止
      if (this.silenceCounter > this.maxSilenceFrames) {
        this.port.postMessage({
          type: 'silence-detected',
          duration: this.silenceCounter
        });
        
        // 自動停止は無効化（ユーザー操作を優先）
        // this.stopRecording();
      }
    } else {
      this.silenceCounter = 0;
    }

    // リアルタイム音声レベル送信（Android向け頻度調整）
    if (this.audioBuffer.length % 1024 === 0) {
      this.port.postMessage({
        type: 'audio-level',
        rms: rms,
        peak: peak,
        bufferLength: this.audioBuffer.length
      });
    }

    // メモリ管理（Android向け最適化）
    if (this.audioBuffer.length > this.sampleRate * 300) { // 5分制限
      this.port.postMessage({
        type: 'buffer-overflow',
        message: '録音時間が制限を超えました'
      });
      this.stopRecording();
    }

    return true;
  }

  // プロセッサー終了時のクリーンアップ
  static get parameterDescriptors() {
    return [];
  }
}

// AudioWorkletプロセッサーを登録
registerProcessor('android-audio-processor', AndroidOptimizedAudioProcessor);

console.log('AudioWorklet processor registered: android-audio-processor');