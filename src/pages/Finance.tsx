import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import { DollarSign, FileText, Calculator } from 'lucide-react';
import BackButton from '../components/BackButton';
import PageInfoModal from '../components/PageInfoModal';
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
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex items-center">
        <h1 className="text-3xl font-bold text-gray-900">{t('common:finance_title')}</h1>
        <PageInfoModal description="" quickTips={[]} />
      </div>
      <div className="grid md:grid-cols-3 gap-6">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-4">
              <section.icon className="w-6 h-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold">{section.title}</h2>
            </div>
            <p className="text-gray-600 mb-4">{section.description}</p>
            {section.button ? (
              <button
                className="inline-block px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium"
                onClick={() => {
                  if (!hasFinanceAccess) {
                    show403Modal();
                    return;
                  }
                  setShowWorkPricing(true);
                }}
              >
                {t('common:work_pricing')}
              </button>
            ) : (
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {section.status}
              </span>
            )}
          </div>
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
