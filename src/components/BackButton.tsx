import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../themes/uiComponents';
import { spacing } from '../themes/designTokens';

const BackButton = () => {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();

  return (
    <Button
      variant="secondary"
      onClick={() => navigate(-1)}
      style={{ position: 'absolute', top: spacing["6xl"], right: spacing["6xl"], display: 'inline-flex', alignItems: 'center', gap: spacing.sm }}
    >
      <ArrowLeft style={{ width: 16, height: 16 }} />
      {t('common:back')}
    </Button>
  );
}

export default BackButton;
