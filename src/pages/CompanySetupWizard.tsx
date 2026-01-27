import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import SetupDigging from './ProjectManagement/Setup/SetupDigging';
import SetupMaterialUsage from './ProjectManagement/Setup/SetupMaterialUsage';
import SetupEquipment from './ProjectManagement/Setup/SetupEquipment';
import SetupMaterials from './ProjectManagement/Setup/SetupMaterials';
import SetupTasks from './ProjectManagement/Setup/SetupTasks';

type Step = 1 | 2 | 3 | 4 | 5;

const CompanySetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [skippedSteps, setSkippedSteps] = useState<Step[]>([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const steps = [
    {
      number: 1,
      title: 'Equipment Setup',
      description: 'Excavators, Dumpers & Barrows',
      warning: 'Without this, you won\'t be able to estimate hours for tasks. It\'s highly recommended to complete this step.',
      canSkip: true,
    },
    {
      number: 2,
      title: 'Material Usage',
      description: 'Configure material usage',
      warning: 'It\'s highly recommended to complete this. It will take only one minute. If you skip it, this might cause problems with material calculation in your tasks.',
      canSkip: true,
    },
    {
      number: 3,
      title: 'Equipment',
      description: 'Manage your equipment',
      warning: null,
      canSkip: false,
    },
    {
      number: 4,
      title: 'Materials',
      description: 'Manage your materials',
      warning: null,
      canSkip: false,
    },
    {
      number: 5,
      title: 'Tasks',
      description: 'Manage your tasks',
      warning: null,
      canSkip: false,
    },
  ];

  const handleSkip = (step: Step) => {
    if (!skippedSteps.includes(step)) {
      setSkippedSteps([...skippedSteps, step]);
    }
    handleNext();
  };

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
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="border-b p-6 flex justify-between items-center">
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
              onClick={() => navigate('/')}
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="px-6 pt-4 pb-2">
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
            <div className="text-xs text-gray-600 text-right mt-2">
              Step {currentStep} of 5
            </div>
          </div>

          {/* Warning Section */}
          {step.warning && (
            <div className="px-6 pt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{step.warning}</p>
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {renderStepContent()}
          </div>

          {/* Footer */}
          <div className="border-t p-6 bg-gray-50 flex justify-between items-center gap-4">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex gap-3">
              {step.canSkip && (
                <button
                  onClick={() => handleSkip(currentStep)}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Skip this step
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                {currentStep === 5 ? 'Complete Setup' : 'Next'}
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
                Congratulations!
              </h2>
              <p className="text-gray-600 mb-8">
                You're set up with the most important things in the app.
              </p>
              {skippedSteps.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 text-left">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> You skipped {skippedSteps.length} step{skippedSteps.length > 1 ? 's' : ''}. You can complete them anytime from the Setup page.
                  </p>
                </div>
              )}
              <button
                onClick={handleComplete}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CompanySetupWizard;
