import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { Clock, BarChart2, Trash2, FolderPlus } from 'lucide-react';
import BackButton from '../components/BackButton';
import WeeklyWorkerHoursModal from '../components/ProjectManagement/WeeklyWorkerHoursModal';
import RemovingRecords from './ProjectManagement/RemovingRecords';

const ProjectManagement = () => {
  const { t } = useTranslation(['common', 'dashboard', 'project']);
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [showWorkerHours, setShowWorkerHours] = React.useState(false);
  const [showRemovingRecords, setShowRemovingRecords] = useState(false);

  // Redirect if not Admin/boss
  if (profile?.role !== 'Admin' && profile?.role !== 'boss') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">{t('project:project_management_title')}</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Project Creation */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <FolderPlus className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('project:create_project_heading')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('project:create_project_description')}
          </p>
          <button
            onClick={() => navigate('/project-management/create')}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('project:create_project_button')}
          </button>
        </div>

        {/* Weekly Worker Hours */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Clock className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('project:weekly_worker_hours_heading')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('project:weekly_worker_hours_description')}
          </p>
          <button
            onClick={() => setShowWorkerHours(true)}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('project:check_hours_button')}
          </button>
        </div>

        {/* Project Performance */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <BarChart2 className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('project:project_performance_heading')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('project:project_performance_description')}
          </p>
          <button
            onClick={() => navigate('/project-performance')}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            {t('project:view_performance_button')}
          </button>
        </div>


        {/* Removing Records */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Trash2 className="w-6 h-6 text-red-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('project:removing_records_heading')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('project:removing_records_description')}
          </p>
          <button
            onClick={() => setShowRemovingRecords(true)}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            {t('project:manage_requests_button')}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showWorkerHours && (
        <WeeklyWorkerHoursModal onClose={() => setShowWorkerHours(false)} />
      )}
      {showRemovingRecords && (
        <RemovingRecords onClose={() => setShowRemovingRecords(false)} />
      )}
    </div>
  );
};

export default ProjectManagement;
