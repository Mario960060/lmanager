import React, { startTransition, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import { Users, UserMinus, X, BarChart } from 'lucide-react';
import BackButton from '../components/BackButton';
import PageInfoModal from '../components/PageInfoModal';
import UserAuthorizationModal from '../components/ProjectManagement/UserAuthorizationModal';
import DeleteUserModal from '../components/ProjectManagement/DeleteUserModal';
import CompanyTaskPerformanceModal from '../components/ProjectManagement/CompanyTaskPerformanceModal';
import { RLSPermissionsTable } from '../data/RLSTable';
import { Spinner, Button, Card } from '../themes';
import { colors, spacing, radii, fontSizes, fontWeights } from '../themes/designTokens';

const CompanyPanel = () => {
  const { t } = useTranslation(['common', 'dashboard']);
  const { profile } = useAuthStore();
  const [showUserAuthorization, setShowUserAuthorization] = React.useState(false);
  const [showDeleteUser, setShowDeleteUser] = React.useState(false);
  const [showPermissionsTable, setShowPermissionsTable] = React.useState(false);
  const [showTaskPerformance, setShowTaskPerformance] = React.useState(false);

  const hasCompanyPanelAccess = profile?.role === 'Admin' || profile?.role === 'boss' || profile?.role === 'project_manager';

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

  const handleTaskPerformanceClick = () => {
    if (!hasCompanyPanelAccess) {
      show403Modal();
      return;
    }
    startTransition(() => setShowTaskPerformance(true));
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: spacing['6xl'], display: 'flex', flexDirection: 'column', gap: spacing['6xl'] }}>
      <BackButton />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing['4xl'], flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <h1 style={{ fontSize: fontSizes['3xl'], fontWeight: fontWeights.bold, color: colors.textPrimary, margin: 0 }}>
            {t('common:company_panel_title')}
          </h1>
          <PageInfoModal
            description={t('common:company_panel_info_description')}
            title={t('common:company_panel_info_title')}
            quickTips={[]}
          />
        </div>
        <Button variant="secondary" onClick={handlePermissionsTableClick}>
          {t('common:permissions_table')}
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing['6xl'], alignItems: 'stretch' }}>
        <Card padding={`${spacing['6xl']}px`} style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing['4xl'], gap: spacing.lg }}>
              <Users style={{ width: 24, height: 24, color: colors.purple }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textSecondary, margin: 0 }}>
                {t('common:user_authorization')}
              </h2>
            </div>
            <p style={{ color: colors.textMuted, flex: 1, marginBottom: 0, fontSize: fontSizes.base, lineHeight: 1.5 }}>
              {t('common:user_authorization_desc')}
            </p>
          </div>
          <Button variant="primary" fullWidth onClick={handleUserAuthClick} style={{ background: `linear-gradient(135deg, ${colors.purple}, ${colors.purpleLight})` }}>
            {t('common:manage_users')}
          </Button>
        </Card>

        <Card padding={`${spacing['6xl']}px`} style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing['4xl'], gap: spacing.lg }}>
              <BarChart style={{ width: 24, height: 24, color: colors.accentBlue }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textSecondary, margin: 0 }}>
                {t('common:company_task_performance')}
              </h2>
            </div>
            <p style={{ color: colors.textMuted, flex: 1, marginBottom: 0, fontSize: fontSizes.base, lineHeight: 1.5 }}>
              {t('common:company_task_performance_desc')}
            </p>
          </div>
          <Button variant="primary" fullWidth onClick={handleTaskPerformanceClick} style={{ background: `linear-gradient(135deg, ${colors.accentBlue}, ${colors.accentBlueDark})` }}>
            {t('common:view_employees_performance')}
          </Button>
        </Card>

        <Card padding={`${spacing['6xl']}px`} style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing['4xl'], gap: spacing.lg }}>
              <UserMinus style={{ width: 24, height: 24, color: colors.red }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textSecondary, margin: 0 }}>
                {t('common:delete_user')}
              </h2>
            </div>
            <p style={{ color: colors.textMuted, flex: 1, marginBottom: 0, fontSize: fontSizes.base, lineHeight: 1.5 }}>
              {t('common:delete_user_desc')}
            </p>
          </div>
          <Button variant="primary" fullWidth onClick={handleDeleteUserClick} style={{ background: `linear-gradient(135deg, ${colors.red}, ${colors.redLight})` }}>
            {t('common:delete_user')}
          </Button>
        </Card>
      </div>

      {/* Modals */}
      {showUserAuthorization && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: colors.bgModalBackdrop, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: colors.bgCard, padding: 32, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><Spinner size={32} /><span style={{ color: colors.textMuted }}>{t('common:loading')}</span></div></div>}>
          <UserAuthorizationModal onClose={() => setShowUserAuthorization(false)} />
        </Suspense>
      )}
      {showDeleteUser && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: colors.bgModalBackdrop, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: colors.bgCard, padding: 32, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><Spinner size={32} /><span style={{ color: colors.textMuted }}>{t('common:loading')}</span></div></div>}>
          <DeleteUserModal onClose={() => setShowDeleteUser(false)} />
        </Suspense>
      )}
      {showTaskPerformance && (
        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: colors.bgModalBackdrop, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ background: colors.bgCard, padding: 32, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}><Spinner size={32} /><span style={{ color: colors.textMuted }}>{t('common:loading')}</span></div></div>}>
          <CompanyTaskPerformanceModal onClose={() => setShowTaskPerformance(false)} />
        </Suspense>
      )}
      {showPermissionsTable && (
        <div style={{ position: 'fixed', inset: 0, background: colors.bgModalBackdrop, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: spacing['4xl'] }}>
          <div style={{ width: '100%', maxWidth: 1280, display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.sm }}>
            <button
              onClick={() => setShowPermissionsTable(false)}
              style={{ padding: spacing.md, borderRadius: radii.full, background: colors.bgElevated, color: colors.textPrimary, border: `1px solid ${colors.borderDefault}`, cursor: 'pointer' }}
              aria-label={t('common:close')}
            >
              <X style={{ width: 20, height: 20 }} />
            </button>
          </div>
          <div style={{ width: '100%', maxWidth: 1280, maxHeight: '90vh', overflow: 'auto', borderRadius: radii.lg, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            <RLSPermissionsTable />
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyPanel;
