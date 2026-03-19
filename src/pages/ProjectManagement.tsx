import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { show403Modal } from '../components/Error403Modal';
import { Clock, BarChart2, Trash2, FolderPlus, FileImage } from 'lucide-react';
import PageInfoModal from '../components/PageInfoModal';
import BackButton from '../components/BackButton';
import { colors, fonts, fontSizes, fontWeights, spacing, radii } from '../themes/designTokens';
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
        {/* Project Creation */}
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <FolderPlus style={{ width: 24, height: 24, color: colors.accentBlue, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:create_project_heading')}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"], flex: 1 }}>
              {t('project:create_project_description')}
            </p>
          </div>
          <Button onClick={handleCreateProject} style={{ width: '100%' }}>
            {t('project:create_project_button')}
          </Button>
        </Card>

        {/* Plans and Garden Canvases */}
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <FileImage style={{ width: 24, height: 24, color: colors.green, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:plans_canvases_heading')}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"], flex: 1 }}>
              {t('project:plans_canvases_description')}
            </p>
          </div>
          <Button variant="accent" color={colors.green} onClick={handlePlansList} style={{ width: '100%' }}>
            {t('project:plans_canvases_button')}
          </Button>
        </Card>

        {/* Weekly Worker Hours */}
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <Clock style={{ width: 24, height: 24, color: colors.accentBlue, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:weekly_worker_hours_heading')}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"], flex: 1 }}>
              {t('project:weekly_worker_hours_description')}
            </p>
          </div>
          <Button onClick={handleWorkerHours} style={{ width: '100%' }}>
            {t('project:check_hours_button')}
          </Button>
        </Card>

        {/* Project Performance */}
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <BarChart2 style={{ width: 24, height: 24, color: colors.green, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:project_performance_heading')}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"], flex: 1 }}>
              {t('project:project_performance_description')}
            </p>
          </div>
          <Button variant="accent" color={colors.green} onClick={handleProjectPerformance} style={{ width: '100%' }}>
            {t('project:view_performance_button')}
          </Button>
        </Card>

        {/* Removing Records */}
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing["5xl"] }}>
              <Trash2 style={{ width: 24, height: 24, color: colors.red, marginRight: spacing.base }} />
              <h2 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, color: colors.textPrimary, fontFamily: fonts.display, margin: 0 }}>{t('project:removing_records_heading')}</h2>
            </div>
            <p style={{ color: colors.textDim, fontFamily: fonts.body, marginBottom: spacing["5xl"], flex: 1 }}>
              {t('project:removing_records_description')}
            </p>
          </div>
          <Button variant="accent" color={colors.red} onClick={handleRemovingRecords} style={{ width: '100%' }}>
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
