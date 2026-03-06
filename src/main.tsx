import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './themes/theme.css';
import './index.css';
import 'react-datepicker/dist/react-datepicker.css';
import './i18n/config.ts';
import { ThemeProvider } from './themes';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>Loading...</div>}>
        <App />
      </Suspense>
    </ThemeProvider>
  </StrictMode>
);
