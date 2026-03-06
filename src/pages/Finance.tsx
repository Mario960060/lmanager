import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import { DollarSign, FileText, Calculator } from 'lucide-react';
import BackButton from '../components/BackButton';
import PageInfoModal from '../components/PageInfoModal';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
import { Button, Card, Badge } from '../themes/uiComponents';
import WorkPricingModal from '../pages/finance/WorkPricingModal';

const Finance = () => {
  const { t } = useTranslation(['common', 'dashboard', 'form']);
  const { profile } = useAuthStore();
  const [showWorkPricing, setShowWorkPricing] = useState(false);

  const hasFinanceAccess = profile?.role === 'Admin' || profile?.role === 'project_manager';

  const sections = [
    {
      title: t('common:work_pricing'),
      description: t('common:work_pricing_desc'),
      icon: Calculator,
      button: true
    },
    {
      title: t('common:invoice_maker'),
      description: t('common:invoice_maker_desc'),
      icon: FileText,
      status: t('common:coming_soon')
    },
    {
      title: t('common:financial_overview'),
      description: t('common:financial_overview_desc'),
      icon: DollarSign,
      status: t('common:coming_soon')
    }
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["6xl"], fontFamily: fonts.body }}>
      <BackButton />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontSize: fontSizes["3xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('common:finance_title')}</h1>
        <PageInfoModal
          description={t('common:finance_info_description')}
          title={t('common:finance_info_title')}
          quickTips={[]}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing["6xl"] }}>
        {sections.map((section) => (
          <Card key={section.title}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <section.icon style={{ width: 24, height: 24, color: colors.accentBlue, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{section.title}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"] }}>{section.description}</p>
            {section.button ? (
              <Button
                onClick={() => {
                  if (!hasFinanceAccess) {
                    show403Modal();
                    return;
                  }
                  setShowWorkPricing(true);
                }}
              >
                {t('common:work_pricing')}
              </Button>
            ) : (
              <Badge color={colors.accentBlue}>{section.status}</Badge>
            )}
          </Card>
        ))}
      </div>

      {showWorkPricing && (
        <WorkPricingModal
          isOpen={showWorkPricing}
          onClose={() => setShowWorkPricing(false)}
        />
      )}
    </div>
  );
};

export default Finance;
