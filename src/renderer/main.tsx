import React from 'react';
import ReactDOM from 'react-dom/client';
import { backgroundFrameCount } from '@nebula/design/react';
import { App } from './App';
import '@nebula/design/styles.css';
import './styles/app.css';
import './styles/dashboard.css';
import './styles/catalog.css';
import './styles/installed.css';
import './styles/operations.css';
import './styles/link.css';
import './styles/home.css';
import './styles/sidebar.css';

// Read-only diagnostic used by the packaged-app checks (M1): proves the canvas background
// stops painting while the window is hidden in the tray. Exposes no data and no action.
(window as unknown as { __nebulaHubDiagnostics: unknown }).__nebulaHubDiagnostics = Object.freeze({ backgroundFrames: backgroundFrameCount });

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
