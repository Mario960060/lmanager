import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, Paintbrush } from 'lucide-react';
import { Modal } from '../../themes/uiComponents';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../../themes/designTokens';

interface CreateProjectChoiceModalProps {
  onClose: () => void;
}

export default function CreateProjectChoiceModal({ onClose }: CreateProjectChoiceModalProps) {
  const { t } = useTranslation('project');
  const navigate = useNavigate();

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleFormBased = () => {
    onClose();
    navigate('/project-management/create');
  };

  const handleCanvas = () => {
    onClose();
    navigate('/project-management/create-canvas');
  };

  return (
    <Modal open={true} onClose={onClose} title={t('create_project_choice_title')} width={512}>
        <p style={{ fontSize: fontSizes.base, color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"] }}>
          {t('create_project_choice_description')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.base }}>
            <div
              onClick={handleFormBased}
              style={{ display: 'flex', alignItems: 'flex-start', gap: spacing["5xl"], padding: spacing["5xl"], borderRadius: radii.lg, border: `2px solid ${colors.borderLight}`, cursor: 'pointer', transition: 'all 0.2s', background: colors.bgSubtle }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.accentBlue; (e.currentTarget as HTMLElement).style.background = `${colors.accentBlue}10`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.borderLight; (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
            >
              <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: radii.lg, background: `${colors.accentBlue}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSpreadsheet style={{ width: 24, height: 24, color: colors.accentBlue }} />
              </div>
              <div>
                <h3 style={{ fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('create_project_form_based_title')}</h3>
                <p style={{ fontSize: fontSizes.base, color: colors.textDim, marginTop: spacing.xs, fontFamily: fonts.body }}>{t('create_project_form_based_description')}</p>
              </div>
            </div>

            <div
              onClick={handleCanvas}
              style={{ display: 'flex', alignItems: 'flex-start', gap: spacing["5xl"], padding: spacing["5xl"], borderRadius: radii.lg, border: `2px solid ${colors.borderLight}`, cursor: 'pointer', transition: 'all 0.2s', background: colors.bgSubtle }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.green; (e.currentTarget as HTMLElement).style.background = `${colors.green}10`; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = colors.borderLight; (e.currentTarget as HTMLElement).style.background = colors.bgSubtle; }}
            >
              <div style={{ flexShrink: 0, width: 48, height: 48, borderRadius: radii.lg, background: `${colors.green}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Paintbrush style={{ width: 24, height: 24, color: colors.green }} />
              </div>
              <div>
                <h3 style={{ fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('create_project_canvas_title')}</h3>
                <p style={{ fontSize: fontSizes.base, color: colors.textDim, marginTop: spacing.xs, fontFamily: fonts.body }}>{t('create_project_canvas_description')}</p>
              </div>
            </div>
          </div>
    </Modal>
  );
}
