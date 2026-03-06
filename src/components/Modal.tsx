import React, { ReactNode } from 'react';
import { Modal as DesignModal } from '../themes/uiComponents';

interface ModalProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
}

/** Wrapper around design system Modal. Use when you need title + onClose + children API. */
const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
  return (
    <DesignModal open={true} onClose={onClose} title={title} width={672}>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(85vh - 120px)' }}>
        {children}
      </div>
    </DesignModal>
  );
};

export default Modal;
