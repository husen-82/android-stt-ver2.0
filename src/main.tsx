import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*実装内容
音声録音　IndexedDB API使用による、録音、保存、再生
オフラインでの使用可能
入力順ソートの（上古い→下新しい）
削除用ポップアップの変更
カレンダーの背景の変更
*/
