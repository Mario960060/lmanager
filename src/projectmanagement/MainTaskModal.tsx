import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import CalculatorModal from './CalculatorModal';

interface MainTaskModalProps {
  onClose: () => void;
  onAddTask: (task: {
    name: string;
    calculatorType: string;
    calculatorSubType: string;
    results: any;
  }) => void;
  calculatorGroups: {
    type: string;
    label: string;
    subTypes: { type: string; label: string; }[];
  }[];
}

const MainTaskModal: React.FC<MainTaskModalProps> = ({
  onClose,
  onAddTask,
  calculatorGroups
}) => {
  const { t } = useTranslation(['common', 'calculator']);
  const [selectedCalculator, setSelectedCalculator] = useState<string | null>(null);
  const [selectedSubCalculator, setSelectedSubCalculator] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  // Filter out aggregate calculators
  const filteredGroups = calculatorGroups.filter(group => group.type !== 'aggregate');

  const handleTaskSelection = (calculatorType: string, subType: string) => {
    setSelectedCalculator(calculatorType);
    setSelectedSubCalculator(subType);
    setShowCalculator(true);
  };

  const handleCalculatorResults = (results: any) => {
    if (selectedCalculator && selectedSubCalculator) {
      const selectedGroup = filteredGroups.find(g => g.type === selectedCalculator);
      const selectedSubType = selectedGroup?.subTypes.find(s => s.type === selectedSubCalculator);
      
      // Use the calculator's provided name or fall back to the selected type's label
      const taskName = results.name || selectedSubType?.label || 'Main Task';
      
      onAddTask({
        name: taskName,
        calculatorType: selectedCalculator,
        calculatorSubType: selectedSubCalculator,
        results: {
          ...results,
          name: taskName  // Ensure the name is in both places
        }
      });
    }
    setShowCalculator(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
          <div className="flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">{t('project:add_main_task_title')}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <div key={group.type} className="space-y-2">
                  <h4 className="font-medium text-gray-800">{group.label}</h4>
                  <div className="pl-4 space-y-2">
                    {group.subTypes.map((subType) => (
                      <button
                        key={subType.type}
                        onClick={() => handleTaskSelection(group.type, subType.type)}
                        className={`w-full text-left p-2 rounded-md ${
                          selectedCalculator === group.type && selectedSubCalculator === subType.type
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {subType.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium bg-gray-800 text-gray-300 rounded-md hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {showCalculator && selectedCalculator && selectedSubCalculator && (
        <CalculatorModal
          calculatorType={selectedCalculator}
          calculatorSubType={selectedSubCalculator}
          onClose={() => {
            setShowCalculator(false);
            onClose();
          }}
          onSaveResults={handleCalculatorResults}
        />
      )}
    </>
  );
};

export default MainTaskModal;
