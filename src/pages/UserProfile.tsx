import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Save, AlertCircle, Loader2, BarChart, ClipboardList, Package, FileText, Truck } from 'lucide-react';
import BackButton from '../components/BackButton';
import TaskPerformanceModal from '../components/TaskPerformanceModal';
import AdditionalTasksModal from '../components/AdditionalTasksModal';
import MaterialAddedModal from '../components/MaterialAddedModal';
import AdditionalMaterialsModal from '../components/AdditionalMaterialsModal';
import DayNotesModal from '../components/DayNotesModal';
import CheckWeeklyHoursModal from '../components/CheckWeeklyHoursModal';

const UserProfile = () => {
  const { t } = useTranslation(['common', 'dashboard', 'form']);
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
      setError(error.message || 'Failed to update name');
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

      console.log('🚪 Starting abandon team for user:', user.id);

      // Pobierz token z timeoutem
      console.log('🔑 Getting session...');
      
      const sessionPromise = supabase.auth.getSession();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      
      const { data: sessionData } = await Promise.race([sessionPromise, timeout]) as any;
      console.log('🔑 Got session:', !!sessionData?.session);
      
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error('No auth token');
      
      console.log('🔑 Token length:', token.length);

      // DELETE przez REST API
      console.log('🔄 Deleting from company_members...');
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

      console.log('🔄 Delete response status:', deleteResponse.status);

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(`Delete failed: ${JSON.stringify(errorData)}`);
      }

      console.log('🔄 Delete completed');

      // UPDATE przez REST API
      console.log('🔄 Updating profiles.company_id to null...');
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

      console.log('🔄 Update response status:', updateResponse.status);

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(`Update failed: ${JSON.stringify(errorData)}`);
      }

      console.log('✅ Successfully left team');
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
      setError(error.message || 'Failed to leave team');
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

      console.log('🗑️ Starting delete company for company:', profile.company_id);

      // Get session
      const sessionPromise = supabase.auth.getSession();
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      );
      
      const { data: sessionData } = await Promise.race([sessionPromise, timeout]) as any;
      const token = sessionData?.session?.access_token;

      if (!token) throw new Error('No auth token');

      // DELETE company through REST API
      console.log('🗑️ Deleting company...');
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

      console.log('🗑️ Delete response status:', deleteResponse.status);

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json();
        throw new Error(`Delete failed: ${JSON.stringify(errorData)}`);
      }

      console.log('✅ Successfully deleted company');
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
      </div>

      {/* User Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="ml-4">
              {isEditing ? (
                <div className="flex items-center">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border rounded-md px-3 py-2 text-lg font-medium dark:bg-gray-700 dark:border-gray-600"
                    placeholder={t('common:enter_your_name')}
                  />
                  <button
                    onClick={handleUpdateName}
                    className="ml-2 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    disabled={updateNameMutation.isPending}
                  >
                    {updateNameMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                  </button>
                </div>
              ) : (
                <h2 className="text-xl font-semibold">{profile?.full_name || t('common:user_fallback')}</h2>
              )}
              <p className="text-gray-600 dark:text-gray-400">{profile?.email}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">{t('common:role')}: {profile?.role}</p>
            </div>
          </div>
          
          <div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                {t('common:change_name')}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md">
            {success}
          </div>
        )}

        {/* First row of buttons - original style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <button
            onClick={handleAbandonTeamClick}
            disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending}
            className="px-4 py-3 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors disabled:opacity-50 flex items-center justify-center"
          >
            {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
            {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) ? (isAdmin ? t('common:deleting_company') : t('common:leaving')) : (isAdmin ? t('common:delete_company') : t('common:abandon_team'))}
          </button>
          
          <button
            onClick={handleLogout}
            className="px-4 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center justify-center"
          >
            <LogOut className="h-5 w-5 mr-2" />
            {t('common:logout')}
          </button>
        </div>
      </div>

      {/* Feature Cards - ProjectManagement style */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Check Weekly Hours Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" onClick={() => setShowCheckWeeklyHoursModal(true)}>
          <div className="flex items-center mb-4">
            <BarChart className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:check_weekly_hours')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:check_weekly_hours_desc')}
          </p>
          <button className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
            {t('common:check_hours')}
          </button>
        </div>

        {/* Task Performance Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <BarChart className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:your_task_performance')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:task_performance_desc')}
          </p>
          <button
            onClick={() => setShowTaskPerformanceModal(true)}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('common:view_performance')}
          </button>
        </div>

        {/* Additional Tasks Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <ClipboardList className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:additional_tasks')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:additional_tasks_desc')}
          </p>
          <button
            onClick={() => setShowAdditionalTasksModal(true)}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            {t('common:view_tasks')}
          </button>
        </div>

        {/* Material Added Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Truck className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:material_added')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:material_added_desc')}
          </p>
          <button
            onClick={() => setShowMaterialAddedModal(true)}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            {t('common:view_materials')}
          </button>
        </div>

        {/* Additional Materials Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Package className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:additional_materials')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:additional_materials_desc')}
          </p>
          <button
            onClick={() => setShowAdditionalMaterialsModal(true)}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t('common:view_materials')}
          </button>
        </div>

        {/* Day Notes Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <FileText className="w-6 h-6 text-teal-600 mr-3" />
            <h2 className="text-xl font-semibold">{t('common:day_notes')}</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {t('common:day_notes_desc')}
          </p>
          <button
            onClick={() => setShowDayNotesModal(true)}
            className="w-full bg-teal-600 text-white py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors"
          >
            {t('common:view_notes')}
          </button>
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

      {/* Abandon Team Confirmation Modal */}
      {showAbandonConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold dark:text-white mb-4">
              {isAdmin ? t('common:delete_company_confirm') : t('common:leave_team_confirm')}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {isAdmin 
                ? t('common:delete_company_confirm_msg')
                : t('common:leave_team_confirm_msg')
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandonConfirmation(false)}
                disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {isAdmin ? t('common:no_keep_company') : t('common:no_stay')}
              </button>
              <button
                onClick={() => {
                  if (isAdmin) {
                    deleteCompanyMutation.mutate();
                  } else {
                    abandonTeamMutation.mutate();
                  }
                }}
                disabled={isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {(isAdmin ? deleteCompanyMutation.isPending : abandonTeamMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {isAdmin ? t('common:yes_delete') : t('common:yes_leave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
