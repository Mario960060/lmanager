import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';
import { Modal, Button } from '../themes/uiComponents';
import { colors, spacing } from '../themes/designTokens';

interface DeleteRequestConfirmationProps {
  onClose: () => void;
}

const DeleteRequestConfirmation: React.FC<DeleteRequestConfirmationProps> = ({ onClose }) => {
  const { t } = useTranslation(['event']);
  return (
    <Modal
      open={true}
      onClose={onClose}
      title={t('event:success')}
      width={400}
      footer={
        <Button onClick={onClose} variant="accent">
          {t('event:close')}
        </Button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
        <CheckCircle style={{ width: 20, height: 20, color: colors.green, flexShrink: 0 }} />
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0 }}>{t('event:deletion_request_sent')}</p>
      </div>
    </Modal>
  );
};

export default DeleteRequestConfirmation;
