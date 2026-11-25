import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import AuthGate from './features/auth/AuthGate';
import './index.css';
import './keyboardInset';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthGate>
        <App />
      </AuthGate>
    </HashRouter>
  </StrictMode>,
);
