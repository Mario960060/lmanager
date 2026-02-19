import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import SetupDigging from './ProjectManagement/Setup/SetupDigging';
import SetupMaterialUsage from './ProjectManagement/Setup/SetupMaterialUsage';
import SetupEquipment from './ProjectManagement/Setup/SetupEquipment';
import SetupMaterials from './ProjectManagement/Setup/SetupMaterials';
import SetupTasks from './ProjectManagement/Setup/SetupTasks';

type Step = 1 | 2 | 3 | 4 | 5;

const CompanySetupWizard: React.FC = () => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

  // Block browser back button and history navigation
  useEffect(() => {
    // Push a new history state to prevent going back
    window.history.pushState(null, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      // Show exit modal instead of going back
      setShowExitModal(true);
      // Push state again to prevent actual navigation
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const steps = [
    {
      number: 1,
      title: t('form:equipment_setup_wizard_title'),
      description: t('form:equipment_setup_description'),
      warning: t('form:equipment_setup_warning'),
      canSkip: true,
    },
    {
      number: 2,
      title: t('form:material_usage_wizard_title'),
      description: t('form:material_usage_wizard_description'),
      warning: t('form:material_usage_wizard_warning'),
      canSkip: true,
    },
    {
      number: 3,
      title: t('form:equipment_manage_wizard_title'),
      description: t('form:equipment_manage_description'),
      warning: null,
      canSkip: false,
    },
    {
      number: 4,
      title: t('form:materials_manage_wizard_title'),
      description: t('form:materials_manage_description'),
      warning: null,
      canSkip: false,
    },
    {
      number: 5,
      title: t('form:tasks_manage_wizard_title'),
      description: t('form:tasks_manage_description'),
      warning: null,
      canSkip: false,
    },
  ];

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep((currentStep + 1) as Step);
    } else {
      setShowCompletionModal(true);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    } else {
      // On step 1, show exit modal instead of navigating back
      setShowExitModal(true);
    }
  };

  const handleExitSetup = (confirm: boolean) => {
    setShowExitModal(false);
    if (confirm) {
      navigate('/');
    }
  };

  const handleComplete = () => {
    setShowCompletionModal(false);
    navigate('/');
  };

  const handleClose = (isLastStep: boolean = false) => {
    if (isLastStep) {
      handleNext();
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return <SetupDigging onClose={handleNext} wizardMode={true} />;
      case 2:
        return <SetupMaterialUsage onClose={handleNext} wizardMode={true} />;
      case 3:
        return <SetupEquipment onClose={handleNext} wizardMode={true} />;
      case 4:
        return <SetupMaterials onClose={handleNext} wizardMode={true} />;
      case 5:
        return <SetupTasks onClose={handleNext} wizardMode={true} />;
      default:
        return null;
    }
  };

  const step = steps[currentStep - 1];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={() => {}} />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full md:max-w-5xl max-h-[100vh] md:max-h-[90vh] md:rounded-lg flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b p-4 flex justify-between items-center flex-shrink-0">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                  {currentStep}
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{step.title}</h2>
              </div>
              <p className="text-sm text-gray-600 ml-11">{step.description}</p>
            </div>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={() => setShowExitModal(true)}
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="px-4 pt-3 pb-2 flex-shrink-0 border-b">
            <div className="flex gap-2">
              {steps.map((s) => (
                <div key={s.number} className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      s.number <= currentStep ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-600 text-right mt-1">
              {t('form:step_indicator', { step: currentStep, total: 5 })}
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto">
            {step.warning && (
              <div className="px-4 pt-2 pb-2">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{step.warning}</p>
                </div>
              </div>
            )}
            {renderStepContent()}
          </div>

          {/* Footer */}
          <div className="border-t p-3 bg-gray-50 flex justify-between items-center gap-3 flex-shrink-0">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('form:previous_button')}
            </button>

            <div className="flex gap-2">
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                {currentStep === 5 ? t('form:complete_setup_button') : t('form:next_button')}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
            <div className="p-8 text-center">
              <div className="flex justify-center mb-6">
                <CheckCircle2 className="w-16 h-16 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {t('form:congratulations_title')}
              </h2>
              <p className="text-gray-600 mb-8">
                {t('form:setup_complete_message')}
              </p>
              <button
                onClick={handleComplete}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                {t('form:go_to_dashboard_button')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Setup Modal */}
      {showExitModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
            <div className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-3">
                {t('form:exit_setup_title')}
              </h2>
              <p className="text-gray-600 mb-8">
                {t('form:exit_setup_message')}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => handleExitSetup(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors font-semibold"
                >
                  {t('form:no_continue_setup_button')}
                </button>
                <button
                  onClick={() => handleExitSetup(true)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  {t('form:yes_go_to_dashboard_button')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CompanySetupWizard;
