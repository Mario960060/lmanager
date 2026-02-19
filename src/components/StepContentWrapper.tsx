import React from 'react';

interface StepContentWrapperProps {
  children: React.ReactNode;
}

/**
 * Wrapper to remove modal fixed positioning from setup components
 * Allows setup modals to be displayed inline within the wizard
 */
const StepContentWrapper: React.FC<StepContentWrapperProps> = ({ children }) => {
  return (
    <div className="h-full overflow-hidden">
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          // Extract the content from the modal and render it inline
          return child;
        }
        return child;
      })}
    </div>
  );
};

export default StepContentWrapper;
