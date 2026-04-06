import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Save, AlertCircle, BarChart, ClipboardList, Package, FileText, Truck, Loader2 } from 'lucide-react';
import BackButton from '../components/BackButton';
import PageInfoModal from '../components/PageInfoModal';
import TaskPerformanceModal from '../components/TaskPerformanceModal';
import AdditionalTasksModal from '../components/AdditionalTasksModal';
import MaterialAddedModal from '../components/MaterialAddedModal';
import AdditionalMaterialsModal from '../components/AdditionalMaterialsModal';
import DayNotesModal from '../components/DayNotesModal';
import CheckWeeklyHoursModal from '../components/CheckWeeklyHoursModal';
import { Spinner, Button } from '../themes/uiComponents';
import { colors } from '../themes/designTokens';

const UserProfile = () => {
  const { t } = useTranslation(['common', 'dashboard', 'form', 'event', 'calculator', 'material', 'utilities']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, setProfile } = useAuthStore();
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Modal states
  const [showTaskPerformanceModal, setShowTaskPerformanceModal] = useState(false);
  const [showAdditionalTasksModal, setShowAdditionalTasksModal] = useState(false);
  const [showMaterialAddedModal, setShowMaterialAddedModal] = useState(false);
  const [showAdditionalMaterialsModal, setShowAdditionalMaterialsModal] = useState(false);
  const [showDayNotesModal, setShowDayNotesModal] = useState(false);
  const [showCheckWeeklyHoursModal, setShowCheckWeeklyHoursModal] = useState(false);

  // Fetch user's role in company
  const { data: userRole } = useQuery({
    queryKey: ['userRole', user?.id, profile?.company_id],
    queryFn: async () => {
      if (!user?.id || !profile?.company_id) return null;
      
      const { data, error } = await supabase
        .from('company_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('company_id', profile.company_id)
        .single();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      return data?.role;
    },
    enabled: !!user?.id && !!profile?.company_id
  });

  useEffect(() => {
    setIsAdmin(userRole === 'Admin');
  }, [userRole]);

  // Update user name mutation
  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: newName })
        .eq('id', user.id)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update the profile in the store
      if (profile) {
        setProfile({
          ...profile,
          full_name: data.full_name
        });
      }
      
      setIsEditing(false);
      setSuccess(t('common:success'));
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: any) => {
      setError(error.message || t('common:failed_update_name'));
    }
  });

  const handleUpdateName = () => {
    if (!newName.trim()) {
      setError(t('common:error'));
      return;
    }
    
    setError(null);
    updateNameMutation.mutate(newName);
  };

  const [showAbandonConfirmation, setShowAbandonConfirmation] = useState(false);

  // Abandon team mutation
  const abandonTeamMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      if (!profile?.company_id) throw new Error('Not part of any company');

      // Pobierz token z timeoutem
      const sessionPromise = supabase.auth.getSession();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      
      const { data: sessionData } = await Promise.race([sessionPromise, timeout]) as any;
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error('No auth token');

      // DELETE przez REST API
      const deleteResponse = await fetch(
        `https://trtlrllpgbxwnpqzcarz.supabase.co/rest/v1/company_members?user_id=eq.${user.id}&company_id=eq.${profile.company_id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        }
      );

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(`Delete failed: ${JSON.stringify(errorData)}`);
      }

      // UPDATE przez REST API
      const updateResponse = await fetch(
        `https://trtlrllpgbxwnpqzcarz.supabase.co/rest/v1/profiles?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ company_id: null })
        }
      );

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(`Update failed: ${JSON.stringify(errorData)}`);
      }

      return true;
    },
    onSuccess: () => {
      // Update the profile in the store
      if (profile) {
        setProfile({
          ...profile,
          company_id: null
        });
      }

      setSuccess(t('common:success'));
      setError(null);
      setShowAbandonConfirmation(false);

      // Redirect to no-team page after 2 seconds
      setTimeout(() => {
        navigate('/no-team');
      }, 2000);
    },
    onError: (error: any) => {
      console.error('❌ Abandon team error:', error);
      setError(error.message || t('common:failed_leave_team'));
    }
  });

  const handleAbandonTeamClick = () => {
    setShowAbandonConfirmation(true);
  };

  // Delete company mutation (for admins only)
  const deleteCompanyMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      if (!profile?.company_id) throw new Error('Not part of any company');
      if (!isAdmin) throw new Error('Only admins can delete a company');

      // Get session
      const sessionPromise = supabase.auth.getSession();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      
      const { data: sessionData } = await Promise.race([sessionPromise, timeout]) as any;
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error('No auth token');

      // DELETE company through REST API
      const deleteResponse = await fetch(
        `https://trtlrllpgbxwnpqzcarz.supabase.co/rest/v1/companies?id=eq.${profile.company_id}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          }
        }
      );

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(`Delete failed: ${JSON.stringify(errorData)}`);
      }

      return true;
    },
    onSuccess: () => {
      // Update the profile in the store
      if (profile) {
        setProfile({
          ...profile,
          company_id: null
        });
      }

      setSuccess(t('common:success'));
      setError(null);
      setShowAbandonConfirmation(false);

      // Redirect to no-team page after 2 seconds
      setTimeout(() => {
        navigate('/no-team');
      }, 2000);
    },
    onError: (error: any) => {
      console.error('❌ Delete company error:', error);
      setError(error.message || 'Failed to delete company');
    }
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center mb-6">
        <BackButton />
        <h1 className="text-2xl font-bold ml-2">{t('common:user_profile_title')}</h1>
        <PageInfoModal
          description={t('common:profile_info_description')}
          title={t('common:profile_info_title')}
          quickTips={[]}
        />
      </div>

      {/* User Info Card */}
      <div className="rounded-lg shadow-md p-6 mb-6" style={{ backgroundColor: colors.bgCard }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.accentBlueBg }}>
              <User className="h-8 w-8" style={{ color: colors.accentBlue }} />
            </div>
            <div className="ml-4">
              {isEditing ? (
                <div className="flex items-center">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border rounded-md px-3 py-2 text-lg font-medium"
                    style={{ backgroundColor: colors.bgElevated, borderColor: colors.borderDefault }}
                    placeholder={t('common:enter_your_name')}
                  />
                  <Button variant="primary" onClick={handleUpdateName} disabled={updateNameMutation.isPending} style={{ padding: 8, marginLeft: 8 }}>
                    {updateNameMutation.isPending ? (
                      <Spinner size={20} />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              ) : (
                <h2 className="text-xl font-semibold">{profile?.full_name || t('common:user_fallback')}</h2>
              )}
              <p style={{ color: colors.textSubtle }}>{profile?.email}</p>
              <p className="text-sm" style={{ color: colors.textSubtle }}>{t('common:role')}: {profile?.role ? t(`common:role_${profile.role === 'Team_Leader' ? 'team_leader' : profile.role.toLowerCase()}`) : '-'}</p>
            </div>
          </div>
          
          <div>
            {!isEditing && (
              <Button variant="primary" onClick={() => setIsEditing(true)}>{t('common:change_name')}</Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md flex items-center" style={{ backgroundColor: colors.redLight, color: colors.red }}>
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-md" style={{ backgroundColor: colors.greenBg, color: colors.green }}>
            {success}
          </div>
        )}

        {/* First row of buttons - original style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Button variant="danger" fullWidth onClick={handleAbandonTeamClick} disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) && <Loader2 className="h-5 w-5 animate-spin" />}
            {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) ? (isAdmin ? t('common:deleting_company') : t('common:leaving')) : (isAdmin ? t('common:delete_company') : t('common:abandon_team'))}
          </Button>
          <Button variant="danger" fullWidth onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <LogOut className="h-5 w-5" />
            {t('common:logout')}
          </Button>
        </div>
      </div>

      {/* Feature Cards - ProjectManagement style */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Check Weekly Hours Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <BarChart className="w-6 h-6 mr-3" style={{ color: colors.accentBlue }} />
            <h2 className="text-xl font-semibold">{t('common:check_weekly_hours')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:check_weekly_hours_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowCheckWeeklyHoursModal(true)}>{t('common:check_hours')}</Button>
        </div>

        {/* Task Performance Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <BarChart className="w-6 h-6 mr-3" style={{ color: colors.accentBlue }} />
            <h2 className="text-xl font-semibold">{t('common:your_task_performance')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:task_performance_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowTaskPerformanceModal(true)}>{t('common:view_performance')}</Button>
        </div>

        {/* Additional Tasks Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <ClipboardList className="w-6 h-6 mr-3" style={{ color: colors.green }} />
            <h2 className="text-xl font-semibold">{t('common:additional_tasks')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:additional_tasks_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowAdditionalTasksModal(true)}>{t('common:view_tasks')}</Button>
        </div>

        {/* Material Added Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <Truck className="w-6 h-6 mr-3" style={{ color: colors.purple }} />
            <h2 className="text-xl font-semibold">{t('common:material_added')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:material_added_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowMaterialAddedModal(true)}>{t('common:view_materials')}</Button>
        </div>

        {/* Additional Materials Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <Package className="w-6 h-6 mr-3" style={{ color: colors.accentBlue }} />
            <h2 className="text-xl font-semibold">{t('common:additional_materials')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:additional_materials_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowAdditionalMaterialsModal(true)}>{t('common:view_materials')}</Button>
        </div>

        {/* Day Notes Card */}
        <div className="p-6 rounded-lg shadow-lg flex flex-col" style={{ backgroundColor: colors.bgCard }}>
          <div className="flex items-center mb-4">
            <FileText className="w-6 h-6 mr-3" style={{ color: colors.teal }} />
            <h2 className="text-xl font-semibold">{t('common:day_notes')}</h2>
          </div>
          <p className="flex-1 mb-4" style={{ color: colors.textSubtle }}>
            {t('common:day_notes_desc')}
          </p>
          <Button variant="primary" fullWidth onClick={() => setShowDayNotesModal(true)}>{t('common:view_notes')}</Button>
        </div>
      </div>
      
      {/* Modals */}
      {showTaskPerformanceModal && (
        <TaskPerformanceModal onClose={() => setShowTaskPerformanceModal(false)} />
      )}
      
      {showAdditionalTasksModal && (
        <AdditionalTasksModal onClose={() => setShowAdditionalTasksModal(false)} />
      )}
      
      {showMaterialAddedModal && (
        <MaterialAddedModal onClose={() => setShowMaterialAddedModal(false)} />
      )}
      
      {showAdditionalMaterialsModal && (
        <AdditionalMaterialsModal onClose={() => setShowAdditionalMaterialsModal(false)} />
      )}
      
      {showDayNotesModal && (
        <DayNotesModal onClose={() => setShowDayNotesModal(false)} />
      )}
      
      {showCheckWeeklyHoursModal && (
        <CheckWeeklyHoursModal open={showCheckWeeklyHoursModal} onClose={() => setShowCheckWeeklyHoursModal(false)} />
      )}

      {/* Abandon Team / Delete Company Confirmation Modal */}
      {showAbandonConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-lg max-w-md w-full px-3 py-3 md:p-6" style={{ backgroundColor: colors.bgCard }}>
            {isAdmin && (
              <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={{ backgroundColor: colors.amberBg, color: colors.amber }}>
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm font-medium">{t('common:delete_company_confirm_msg')}</span>
              </div>
            )}
            <h3 className={`text-lg font-semibold ${isAdmin ? 'mb-6' : 'mb-4'}`} style={{ color: colors.textPrimary }}>
              {isAdmin ? t('common:delete_company_confirm') : t('common:leave_team_confirm')}
            </h3>
            {!isAdmin && (
              <p className="mb-6" style={{ color: colors.textSubtle }}>
                {t('common:leave_team_confirm_msg')}
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setShowAbandonConfirmation(false)} disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending}>
                {isAdmin ? t('common:no_keep_company') : t('common:no_stay')}
              </Button>
              <Button variant="danger" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => { if (isAdmin) deleteCompanyMutation.mutate(); else abandonTeamMutation.mutate(); }} disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending}>
                {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) && <Spinner size={16} />}
                {isAdmin ? t('common:yes_delete') : t('common:yes_leave')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
