import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

async function init() {
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    try {
      const bridgeUrl = await window.electronAPI.getBridgeUrl();
      (window as any).__ELECTRON_BRIDGE_URL__ = bridgeUrl;
      console.log('[Electron] Bridge URL set to:', bridgeUrl);
    } catch (err) {
      console.error('Failed to get Electron bridge URL:', err);
    }
  } else {
    console.log('[Electron] Not in Electron environment, electronAPI:', typeof window !== 'undefined' ? (window as any).electronAPI : 'N/A');
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void init();
