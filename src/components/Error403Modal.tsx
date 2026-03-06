import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../themes/uiComponents';
import { colors, fontSizes, radii, spacing } from '../themes/designTokens';

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

  const title = t('no_access_title');

  return createPortal(
    <Modal open={visible} onClose={handleClose} title={title} width={340} footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={handleClose}>{t('ok')}</Button>
      </div>
    }>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.lg, marginBottom: spacing["5xl"] }}>
        <div style={{
          width: 36, height: 36, borderRadius: radii.md, flexShrink: 0,
          background: colors.statusPaused.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <p style={{ fontSize: fontSizes.md, lineHeight: 1.5, color: colors.textCool, margin: 0 }}>{message}</p>
      </div>
    </Modal>,
    document.body
  );
}
