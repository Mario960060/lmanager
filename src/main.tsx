import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './themes/theme.css';
import './themes/calculatorLayout.css';
import './index.css';
import 'react-datepicker/dist/react-datepicker.css';
import './i18n/config.ts';
import { ThemeProvider } from './themes';

// Supabase (and browser fetch) abort in-flight requests on unmount/navigation/auth refresh.
// Those rejections are expected; without handling they clutter the console as unhandled.
window.addEventListener('unhandledrejection', (event) => {
  const r = event.reason;
  if (r?.name === 'AbortError') {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>Loading...</div>}>
        <App />
      </Suspense>
    </ThemeProvider>
  </StrictMode>
);
