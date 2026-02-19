import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

const BackButton = () => {
  const { t } = useTranslation(['common']);
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      className="absolute top-6 right-6 inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      {t('common:back')}
    </button>
  );
}

export default BackButton;
