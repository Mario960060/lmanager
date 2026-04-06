import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebarSectionReset } from '../hooks/useSidebarSectionReset';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import PageInfoModal from '../components/PageInfoModal';
import BackButton from '../components/BackButton';
import { colors, fonts, fontSizes, fontWeights, spacing } from '../themes/designTokens';
import { Button, Card } from '../themes/uiComponents';
import WeeklyWorkerHoursModal from '../components/ProjectManagement/WeeklyWorkerHoursModal';
import CreateProjectChoiceModal from '../components/ProjectManagement/CreateProjectChoiceModal';
import PlansListModal from '../components/ProjectManagement/PlansListModal';
import RemovingRecords from './ProjectManagement/RemovingRecords';

const ProjectManagement = () => {
  const { t } = useTranslation(['common', 'dashboard', 'project']);
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const [showWorkerHours, setShowWorkerHours] = React.useState(false);
  const [showRemovingRecords, setShowRemovingRecords] = useState(false);
  const [showCreateProjectChoice, setShowCreateProjectChoice] = useState(false);
  const [showPlansList, setShowPlansList] = useState(false);

  useSidebarSectionReset('/project-management', () => {
    setShowWorkerHours(false);
    setShowRemovingRecords(false);
    setShowCreateProjectChoice(false);
    setShowPlansList(false);
  });

  const hasProjectManagementAccess = profile?.role === 'Admin' || profile?.role === 'boss';
  const hasPlansAccess = profile?.role === 'Admin' || profile?.role === 'boss' || profile?.role === 'project_manager' || profile?.role === 'Team_Leader';

  const handleCreateProject = () => {
    if (!hasProjectManagementAccess) {
      show403Modal();
      return;
    }
    setShowCreateProjectChoice(true);
  };

  const handleWorkerHours = () => {
    if (!hasProjectManagementAccess) {
      show403Modal();
      return;
    }
    setShowWorkerHours(true);
  };

  const handleProjectPerformance = () => {
    if (!hasProjectManagementAccess) {
      show403Modal();
      return;
    }
    navigate('/project-performance');
  };

  const handleRemovingRecords = () => {
    if (!hasProjectManagementAccess) {
      show403Modal();
      return;
    }
    setShowRemovingRecords(true);
  };

  const handlePlansList = () => {
    if (!hasPlansAccess) {
      show403Modal();
      return;
    }
    setShowPlansList(true);
  };

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: spacing["6xl"], display: 'flex', flexDirection: 'column', gap: spacing["6xl"], fontFamily: fonts.body }}>
      <BackButton />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <h1 style={{ fontSize: fontSizes["3xl"], fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:project_management_title')}</h1>
        <PageInfoModal
          description={t('project:project_management_info_description')}
          title={t('project:project_management_info_title')}
          quickTips={[]}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: spacing["6xl"], alignItems: 'stretch' }}>
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0, marginBottom: spacing["3xl"] }}>{t('project:create_project_heading')}</h2>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, fontSize: fontSizes.base, lineHeight: 1.5, flex: 1, marginBottom: spacing["3xl"] }}>
              {t('project:create_project_description')}
            </p>
          </div>
          <Button fullWidth onClick={handleCreateProject}>
            {t('project:create_project_button')}
          </Button>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0, marginBottom: spacing["3xl"] }}>{t('project:plans_canvases_heading')}</h2>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, fontSize: fontSizes.base, lineHeight: 1.5, flex: 1, marginBottom: spacing["3xl"] }}>
              {t('project:plans_canvases_description')}
            </p>
          </div>
          <Button fullWidth onClick={handlePlansList}>
            {t('project:plans_canvases_button')}
          </Button>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0, marginBottom: spacing["3xl"] }}>{t('project:weekly_worker_hours_heading')}</h2>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, fontSize: fontSizes.base, lineHeight: 1.5, flex: 1, marginBottom: spacing["3xl"] }}>
              {t('project:weekly_worker_hours_description')}
            </p>
          </div>
          <Button fullWidth onClick={handleWorkerHours}>
            {t('project:check_hours_button')}
          </Button>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0, marginBottom: spacing["3xl"] }}>{t('project:project_performance_heading')}</h2>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, fontSize: fontSizes.base, lineHeight: 1.5, flex: 1, marginBottom: spacing["3xl"] }}>
              {t('project:project_performance_description')}
            </p>
          </div>
          <Button fullWidth onClick={handleProjectPerformance}>
            {t('project:view_performance_button')}
          </Button>
        </Card>

        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0, marginBottom: spacing["3xl"] }}>{t('project:removing_records_heading')}</h2>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, fontSize: fontSizes.base, lineHeight: 1.5, flex: 1, marginBottom: spacing["3xl"] }}>
              {t('project:removing_records_description')}
            </p>
          </div>
          <Button variant="danger" fullWidth onClick={handleRemovingRecords}>
            {t('project:manage_requests_button')}
          </Button>
        </Card>
      </div>

      {/* Modals */}
      {showCreateProjectChoice && (
        <CreateProjectChoiceModal onClose={() => setShowCreateProjectChoice(false)} />
      )}
      {showPlansList && (
        <PlansListModal onClose={() => setShowPlansList(false)} />
      )}
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
