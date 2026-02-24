import React, { startTransition, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import { 
  Users, 
  UserMinus,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import PageInfoModal from '../components/PageInfoModal';
import UserAuthorizationModal from '../components/ProjectManagement/UserAuthorizationModal';
import DeleteUserModal from '../components/ProjectManagement/DeleteUserModal';
import { RLSPermissionsTable } from '../data/RLSTable';

const CompanyPanel = () => {
  const { t } = useTranslation(['common', 'dashboard']);
  const { profile } = useAuthStore();
  const [showUserAuthorization, setShowUserAuthorization] = React.useState(false);
  const [showDeleteUser, setShowDeleteUser] = React.useState(false);
  const [showPermissionsTable, setShowPermissionsTable] = React.useState(false);

  const hasCompanyPanelAccess = profile?.role === 'Admin' || profile?.role === 'boss';

  const handleUserAuthClick = () => {
    if (!hasCompanyPanelAccess) {
      show403Modal();
      return;
    }
    startTransition(() => setShowUserAuthorization(true));
  };

  const handleDeleteUserClick = () => {
    if (!hasCompanyPanelAccess) {
      show403Modal();
      return;
    }
    startTransition(() => setShowDeleteUser(true));
  };

  const handlePermissionsTableClick = () => {
    if (!hasCompanyPanelAccess) {
      show403Modal();
      return;
    }
    startTransition(() => setShowPermissionsTable(true));
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('common:company_panel_title')}</h1>
          <PageInfoModal description="" quickTips={[]} />
        </div>
        <button
          onClick={handlePermissionsTableClick}
          className="shrink-0 px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          {t('common:permissions_table')}
        </button>
      </div>

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
            onClick={handleUserAuthClick}
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
            onClick={handleDeleteUserClick}
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
      {showPermissionsTable && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center p-4">
          <div className="w-full max-w-7xl flex justify-end mb-2">
            <button
              onClick={() => setShowPermissionsTable(false)}
              className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 text-white transition-colors"
              aria-label={t('common:close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="w-full max-w-7xl max-h-[90vh] overflow-auto rounded-lg shadow-2xl">
            <RLSPermissionsTable />
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyPanel;
