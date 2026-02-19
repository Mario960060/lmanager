import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Mail, ArrowRight, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

const NoTeamPage = () => {
  const { t } = useTranslation(['common', 'form', 'dashboard']);
  const navigate = useNavigate();
  const [selectedOption, setSelectedOption] = useState<'create' | 'wait' | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      {/* Logout Button - Top Right */}
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="fixed top-6 right-6 flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        <LogOut className="w-4 h-4" />
        {isLoggingOut ? t('dashboard:logging_out') : t('dashboard:logout_button')}
      </button>

      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{t('common:welcome_title')}</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            {t('dashboard:no_team_description')}
          </p>
        </div>

        {/* Premium Notice */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-8 border-l-4 border-blue-600 dark:border-blue-500">
          <p className="text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-blue-600 dark:text-blue-400">💳 {t('dashboard:premium_notice')}</span> {t('dashboard:premium_desc')}
          </p>
        </div>

        {/* Options Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Team Option */}
          <div
            onClick={() => setSelectedOption('create')}
            className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 cursor-pointer transition-all transform hover:scale-105 ${
              selectedOption === 'create' 
                ? 'ring-2 ring-blue-600 dark:ring-blue-500 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 dark:bg-blue-900 rounded-full p-4">
                <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">{t('dashboard:create_team')}</h2>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
              {t('dashboard:create_team_desc')}
            </p>
            <div className="bg-blue-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900 dark:text-blue-300 font-semibold">
                {t('dashboard:create_team_features')}
              </p>
              <ul className="text-sm text-blue-800 dark:text-blue-300 mt-2 space-y-1">
                <li>✓ {t('dashboard:full_control')}</li>
                <li>✓ {t('dashboard:invite_members')}</li>
                <li>✓ {t('dashboard:manage_projects')}</li>
                <li>✓ {t('dashboard:setup_equipment')}</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/create-team')}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
            >
              {t('dashboard:create_team')} <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Wait for Invitation Option */}
          <div
            onClick={() => setSelectedOption('wait')}
            className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 cursor-pointer transition-all transform hover:scale-105 ${
              selectedOption === 'wait' 
                ? 'ring-2 ring-green-600 dark:ring-green-500 shadow-xl' 
                : 'hover:shadow-xl'
            }`}
          >
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 dark:bg-green-900 rounded-full p-4">
                <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-3">{t('dashboard:wait_invitation')}</h2>
            <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
              {t('dashboard:wait_invitation_desc')}
            </p>
            <div className="bg-green-50 dark:bg-slate-700 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-900 dark:text-green-300 font-semibold">
                {t('dashboard:how_it_works')}
              </p>
              <ul className="text-sm text-green-800 dark:text-green-300 mt-2 space-y-1">
                <li>✓ {t('dashboard:ask_team_admin')}</li>
                <li>✓ {t('dashboard:invitation_email')}</li>
                <li>✓ {t('dashboard:click_link')}</li>
                <li>✓ {t('dashboard:gain_access')}</li>
              </ul>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>ℹ️ {t('dashboard:team_admin_tip')}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center text-gray-600 dark:text-gray-400">
          <p>
            {t('dashboard:contact_support')}{' '}
            <a href="mailto:support@example.com" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
              support@example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default NoTeamPage;
