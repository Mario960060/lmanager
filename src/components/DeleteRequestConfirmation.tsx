import React from 'react';
import { X, CheckCircle } from 'lucide-react';

interface DeleteRequestConfirmationProps {
  onClose: () => void;
}

const DeleteRequestConfirmation: React.FC<DeleteRequestConfirmationProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
            Success
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Your deletion request has been sent.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteRequestConfirmation;
