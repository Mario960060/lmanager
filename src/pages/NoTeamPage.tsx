import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { colors } from '../themes/designTokens';
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(to bottom right, ${colors.accentBlueBg}, var(--bg-subtle))` }}>
      {/* Logout Button - Top Right */}
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="fixed top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        style={{ backgroundColor: colors.red, color: colors.textOnAccent }}
      >
        <LogOut className="w-4 h-4" />
        {isLoggingOut ? t('dashboard:logging_out') : t('dashboard:logout_button')}
      </button>

      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: colors.textPrimary }}>{t('common:welcome_title')}</h1>
          <p className="text-xl" style={{ color: colors.textMuted }}>
            {t('dashboard:no_team_description')}
          </p>
        </div>

        {/* Premium Notice */}
        <div className="rounded-lg shadow-lg p-6 mb-8 border-l-4" style={{ backgroundColor: colors.bgCard, borderColor: colors.accentBlue }}>
          <p style={{ color: colors.textSecondary }}>
            <span className="font-semibold" style={{ color: colors.accentBlue }}>💳 {t('dashboard:premium_notice')}</span> {t('dashboard:premium_desc')}
          </p>
        </div>

        {/* Options Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Create Team Option */}
          <div
            onClick={() => setSelectedOption('create')}
            className="rounded-lg shadow-lg p-8 cursor-pointer transition-all transform hover:scale-105"
            style={{
              backgroundColor: colors.bgCard,
              ...(selectedOption === 'create' ? { boxShadow: 'var(--shadow-xl)', outline: `2px solid ${colors.accentBlue}` } : {})
            }}
          >
            <div className="flex justify-center mb-4">
              <div className="rounded-full p-4" style={{ backgroundColor: colors.accentBlueBg }}>
                <Building2 className="w-8 h-8" style={{ color: colors.accentBlue }} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center mb-3" style={{ color: colors.textPrimary }}>{t('dashboard:create_team')}</h2>
            <p className="text-center mb-4" style={{ color: colors.textMuted }}>
              {t('dashboard:create_team_desc')}
            </p>
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: colors.bgSubtle }}>
              <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                {t('dashboard:create_team_features')}
              </p>
              <ul className="text-sm mt-2 space-y-1" style={{ color: colors.textSecondary }}>
                <li>✓ {t('dashboard:full_control')}</li>
                <li>✓ {t('dashboard:invite_members')}</li>
                <li>✓ {t('dashboard:manage_projects')}</li>
                <li>✓ {t('dashboard:setup_equipment')}</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/create-team')}
              className="w-full py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 font-semibold"
              style={{ backgroundColor: colors.accentBlue, color: colors.textOnAccent }}
            >
              {t('dashboard:create_team')} <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Wait for Invitation Option */}
          <div
            onClick={() => setSelectedOption('wait')}
            className="rounded-lg shadow-lg p-8 cursor-pointer transition-all transform hover:scale-105"
            style={{
              backgroundColor: colors.bgCard,
              ...(selectedOption === 'wait' ? { boxShadow: 'var(--shadow-xl)', outline: `2px solid ${colors.green}` } : {})
            }}
          >
            <div className="flex justify-center mb-4">
              <div className="rounded-full p-4" style={{ backgroundColor: colors.greenBg }}>
                <Mail className="w-8 h-8" style={{ color: colors.green }} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center mb-3" style={{ color: colors.textPrimary }}>{t('dashboard:wait_invitation')}</h2>
            <p className="text-center mb-4" style={{ color: colors.textMuted }}>
              {t('dashboard:wait_invitation_desc')}
            </p>
            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: colors.bgSubtle }}>
              <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>
                {t('dashboard:how_it_works')}
              </p>
              <ul className="text-sm mt-2 space-y-1" style={{ color: colors.textSecondary }}>
                <li>✓ {t('dashboard:ask_team_admin')}</li>
                <li>✓ {t('dashboard:invitation_email')}</li>
                <li>✓ {t('dashboard:click_link')}</li>
                <li>✓ {t('dashboard:gain_access')}</li>
              </ul>
            </div>
            <div className="rounded-lg p-4" style={{ backgroundColor: colors.amberBg, borderWidth: 1, borderStyle: 'solid', borderColor: colors.amber }}>
              <p className="text-sm" style={{ color: colors.amber }}>
                <strong>ℹ️ {t('dashboard:team_admin_tip')}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-12 text-center" style={{ color: colors.textMuted }}>
          <p>
            {t('dashboard:contact_support')}{' '}
            <a href="mailto:support@example.com" className="hover:underline font-semibold" style={{ color: colors.accentBlue }}>
              support@example.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default NoTeamPage;
