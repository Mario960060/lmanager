import React, { useState, startTransition, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { 
  Users, 
  UserMinus
} from 'lucide-react';
import BackButton from '../components/BackButton';
import UserAuthorizationModal from '../components/ProjectManagement/UserAuthorizationModal';
import DeleteUserModal from '../components/ProjectManagement/DeleteUserModal';

const CompanyPanel = () => {
  const { t } = useTranslation(['common', 'dashboard']);
  const { profile } = useAuthStore();
  const [showUserAuthorization, setShowUserAuthorization] = React.useState(false);
  const [showDeleteUser, setShowDeleteUser] = React.useState(false);

  // Redirect if not Admin/boss
  if (profile?.role !== 'Admin' && profile?.role !== 'boss') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">{t('common:company_panel_title')}</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* User Authorization */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Users className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:user_authorization')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('common:user_authorization_desc')}
          </p>
          <button
            onClick={() => startTransition(() => setShowUserAuthorization(true))}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            {t('common:manage_users')}
          </button>
        </div>

        {/* Delete User */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <UserMinus className="w-6 h-6 text-red-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:delete_user')}</h2>
          </div>
          <p className="text-gray-600 mb-4">
            {t('common:delete_user_desc')}
          </p>
          <button
            onClick={() => startTransition(() => setShowDeleteUser(true))}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            {t('common:delete_user')}
          </button>
        </div>
      </div>

      {/* Modals */}
      {showUserAuthorization && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-slate-800 rounded-lg p-8 animate-pulse">Loading...</div></div>}>
          <UserAuthorizationModal onClose={() => setShowUserAuthorization(false)} />
        </Suspense>
      )}
      {showDeleteUser && (
        <Suspense fallback={<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"><div className="bg-white dark:bg-slate-800 rounded-lg p-8 animate-pulse">Loading...</div></div>}>
          <DeleteUserModal onClose={() => setShowDeleteUser(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default CompanyPanel;
