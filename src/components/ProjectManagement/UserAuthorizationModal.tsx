import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { X, Search, CheckCircle, AlertCircle, Plus, Loader2 } from 'lucide-react';

interface CompanyMember {
  id: string;
  user_id: string;
  role: 'user' | 'Team_Leader' | 'project_manager' | 'Admin';
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
}

interface UserAuthorizationModalProps {
  onClose: () => void;
}

const UserAuthorizationModal: React.FC<UserAuthorizationModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities', 'event']);
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const [userSearch, setUserSearch] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('user');

  // Fetch company members for current user's company
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['company_members', profile?.company_id, userSearch],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Fetch company members
      let query = supabase
        .from('company_members')
        .select('id, user_id, role')
        .eq('company_id', profile.company_id)
        .eq('status', 'accepted')
        .neq('role', 'Admin')
        .order('joined_at');

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles for these members
      const userIds = data?.map(m => m.user_id) || [];
      if (userIds.length === 0) return [];

      let profileQuery = supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);

      if (userSearch) {
        profileQuery = profileQuery.ilike('full_name', `%${userSearch}%`);
      }

      const { data: profilesData, error: profileError } = await profileQuery;
      if (profileError) throw profileError;

      // Merge with member data
      return (profilesData || []).map(prof => {
        const member = data?.find(m => m.user_id === prof.id);
        return {
          ...prof,
          memberId: member?.id,
          role: member?.role || 'user'
        };
      });
    },
    enabled: !!profile?.company_id
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role, userName }: { memberId: string; role: string; userName: string }) => {
      const { error } = await supabase
        .from('company_members')
        .update({ role })
        .eq('id', memberId);

      if (error) throw error;
      
      return { role, userName };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['company_members'] });
      setUpdateSuccess(`${data.userName}'s ${t('event:role_updated')} ${data.role}.`);
      setUpdateError(null);
      
      setTimeout(() => {
        setUpdateSuccess(null);
      }, 3000);
    },
    onError: (error: Error) => {
      setUpdateError(error.message);
      setUpdateSuccess(null);
    }
  });

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      console.log('🔍 Starting invite for:', email);
      
      if (!profile?.company_id) throw new Error('Company ID not found');

      try {
        console.log('📧 Checking if user exists...');
        console.log('📧 About to query with email:', email);
        
        // Use regular select instead of maybeSingle - same style as members query which works
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, company_id, email')
          .ilike('email', email);

        console.log('📧 Query done!', { profileData, profileError });

        const user = profileData && profileData.length > 0 ? profileData[0] : null;

        if (profileError) throw profileError;
        if (!user) throw new Error(t('event:user_no_account'));

        console.log('✅ Found user ID:', user.id);

        // If user already belongs to another company
        if (user.company_id) {
          throw new Error(t('event:user_another_company'));
        }

        // Add user to company members
        console.log('➕ Adding to company_members...');
        const { data: memberData, error: memberError } = await supabase
          .from('company_members')
          .insert({
            company_id: profile.company_id,
            user_id: user.id,
            status: 'accepted',
            joined_at: new Date().toISOString(),
            role: role
          })
          .select();

        if (memberError) {
          console.error('❌ Member insert error:', memberError);
          throw memberError;
        }

        console.log('✅ User added to company_members');

        // Update user's company_id
        console.log('🔄 Updating profiles.company_id...');
        const { data: updateData, error: updateError } = await supabase
          .from('profiles')
          .update({ company_id: profile.company_id })
          .eq('id', user.id)
          .select();

        if (updateError) {
          console.error('❌ Profile update error:', updateError);
          throw updateError;
        }

        console.log('✅ User profile updated successfully');
        return { email, role };
      } catch (error: any) {
        console.error('❌ Catch block error:', error.message);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('🎉 Success:', data);
      queryClient.invalidateQueries({ queryKey: ['company_members'] });
      setUpdateSuccess(`User ${data.email} ${t('event:user_invited_success')}`);
      setUpdateError(null);
      setInviteEmail('');
      setInviteRole('user');
      setShowAddUserModal(false);
      
      setTimeout(() => {
        setUpdateSuccess(null);
      }, 3000);
    },
    onError: (error: Error) => {
      console.error('💥 Error:', error.message);
      setUpdateError(error.message);
      setUpdateSuccess(null);
    }
  });

  const handleInviteUser = () => {
    if (!inviteEmail.trim()) {
      setUpdateError(t('event:please_enter_email'));
      return;
    }

    inviteUserMutation.mutate({
      email: inviteEmail.trim(),
      role: inviteRole
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b dark:border-slate-700 flex-none">
          <h2 className="text-xl font-semibold dark:text-white">{t('event:user_authorization_title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Add User Button */}
          <div className="mb-4">
            <button
              onClick={() => setShowAddUserModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              {t('event:add_user_button')}
            </button>
          </div>

          {/* Search - Sticky at top */}
          <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 pb-4 mb-4 border-b dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('event:search_user_authorization')}</label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('event:total_users_label')} {members.length}
              </p>
            </div>
            <div className="mt-1 relative">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_user_name_auth')}
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('event:admin_note')}
            </p>
          </div>

          {/* Success message */}
          {updateSuccess && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              {updateSuccess}
            </div>
          )}

          {/* Error message */}
          {updateError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {updateError}
            </div>
          )}

          {/* User List - Scrollable */}
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-center py-4 dark:text-gray-400">{t('event:loading_users_auth')}</p>
            ) : members.length === 0 ? (
              <p className="text-center py-4 dark:text-gray-400">{t('event:no_users_found_auth')}</p>
            ) : (
              members.map((member: any) => (
                <div key={member.id} className="bg-gray-50 dark:bg-slate-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium dark:text-white">{member.full_name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{member.email}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('event:current_role_label')} <span className="font-medium text-gray-700 dark:text-gray-300">{member.role}</span></p>
                    </div>
                    <div>
                      <select
                        value={member.role}
                        onChange={(e) => {
                          updateRoleMutation.mutate({
                            memberId: member.memberId,
                            role: e.target.value,
                            userName: member.full_name
                          });
                        }}
                        className="rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-600 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
                      >
                        <option value="user">{t('event:role_user_option')}</option>
                        <option value="Team_Leader">{t('event:role_team_leader_option')}</option>
                        <option value="project_manager">{t('event:role_project_manager_option')}</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[51] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-700">
              <h3 className="text-lg font-semibold dark:text-white">{t('event:add_user_to_company')}</h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('event:user_email_label')}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('event:user_email_placeholder')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={inviteUserMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('event:role_label_auth')}
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={inviteUserMutation.isPending}
                >
                  <option value="user">{t('event:role_user_option')}</option>
                  <option value="Team_Leader">{t('event:role_team_leader_option')}</option>
                  <option value="project_manager">{t('event:role_project_manager_option')}</option>
                </select>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('event:user_account_note')}
              </p>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  disabled={inviteUserMutation.isPending}
                >
                  {t('event:cancel_button')}
                </button>
                <button
                  onClick={handleInviteUser}
                  disabled={inviteUserMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {inviteUserMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {inviteUserMutation.isPending ? t('event:adding_user') : t('event:add_user_final')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAuthorizationModal;
