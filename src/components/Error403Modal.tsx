import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const EVENT_NAME = 'error403:show';

export function show403Modal(message?: string) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { message } }));
}

export default function Error403Modal() {
  const { t } = useTranslation('common');
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handler = (e: CustomEvent<{ message?: string }>) => {
      setMessage(e.detail?.message || t('no_access_403', { defaultValue: 'Nie masz uprawnień do wykonania tej akcji. Skontaktuj się z administratorem, jeśli uważasz, że to błąd.' }));
      setVisible(true);
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, [t]);

  const handleClose = () => setVisible(false);

  if (!visible) return null;

  const title = t('no_access_title', { defaultValue: 'Brak uprawnień' });

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        fontFamily: "'DM Sans', -apple-system, sans-serif",
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      <div
        className="max-w-[340px] w-full overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error403-title"
        style={{
          background: '#151921',
          border: '1px solid #2a3244',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          animation: 'popIn 250ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{ height: 3, background: '#ef4444' }} />
        <div style={{ padding: 20 }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <div id="error403-title" style={{ fontSize: 15, fontWeight: 700, color: '#f0f2f5' }}>{title}</div>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#8a94a6', marginBottom: 18 }}>{message}</p>
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="!min-w-0 !min-h-0 px-7 py-2 rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-[0.96] active:scale-[0.96]"
              style={{
                background: '#1e2430',
                color: '#f0f2f5',
                border: '1px solid #2a3244',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#232a38';
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.color = '#3b82f6';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#1e2430';
                e.currentTarget.style.borderColor = '#2a3244';
                e.currentTarget.style.color = '#f0f2f5';
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
