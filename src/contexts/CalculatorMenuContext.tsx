import React, { createContext, useContext, useState } from 'react';

interface CalculatorMenuContextType {
  showCalculatorMenu: boolean;
  setShowCalculatorMenu: (show: boolean) => void;
  selectedCalculatorType: string | null;
  setSelectedCalculatorType: (type: string | null) => void;
  selectedSubType: string | null;
  setSelectedSubType: (type: string | null) => void;
  expandedCategory: string | null;
  setExpandedCategory: (category: string | null) => void;
  keepSidebarOpenFor: string | null;
  setKeepSidebarOpenFor: (path: string | null) => void;
}

const CalculatorMenuContext = createContext<CalculatorMenuContextType | undefined>(undefined);

export const CalculatorMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showCalculatorMenu, setShowCalculatorMenu] = useState(false);
  const [selectedCalculatorType, setSelectedCalculatorType] = useState<string | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [keepSidebarOpenFor, setKeepSidebarOpenFor] = useState<string | null>(null);

  return (
    <CalculatorMenuContext.Provider 
      value={{ 
        showCalculatorMenu, 
        setShowCalculatorMenu,
        selectedCalculatorType,
        setSelectedCalculatorType,
        selectedSubType,
        setSelectedSubType,
        expandedCategory,
        setExpandedCategory,
        keepSidebarOpenFor,
        setKeepSidebarOpenFor
      }}
    >
      {children}
    </CalculatorMenuContext.Provider>
  );
};

export const useCalculatorMenu = () => {
  const context = useContext(CalculatorMenuContext);
  if (!context) {
    throw new Error('useCalculatorMenu must be used within CalculatorMenuProvider');
  }
  return context;
};
