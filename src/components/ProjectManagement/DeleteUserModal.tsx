import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { X, Search, AlertCircle, Info } from 'lucide-react';

interface DeleteUserModalProps {
  onClose: () => void;
}

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({ onClose }) => {
  const { t } = useTranslation(['common', 'form', 'utilities']);
  const queryClient = useQueryClient();
  const { profile } = useAuthStore();
  const [userSearch, setUserSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Fetch company members for current user's company
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['company_members_delete', profile?.company_id, userSearch],
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
        .select('id, full_name, role')
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
          userId: prof.id
        };
      });
    },
    enabled: !!profile?.company_id
  });

  // Soft delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // First check if user is an Admin
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (userError) throw userError;
      
      // Prevent deleting Admin users
      if (userData.role === 'Admin' || userData.role === 'boss') {
        throw new Error(t('event:cannot_delete_admin'));
      }
      
      // Instead of deleting, mark the user as inactive
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_active: false,
          deactivated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      
      // Return success message
      return t('event:user_deactivated');
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['company_members_delete'] });
      setConfirmDelete(null);
      setDeleteError(null);
      setInfoMessage(message);
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    }
  });

  const handleDeleteClick = (userId: string) => {
    setConfirmDelete(userId);
    setDeleteError(null);
    setInfoMessage(null);
  };

  const confirmDeleteUser = () => {
    if (confirmDelete) {
      deleteUserMutation.mutate(confirmDelete);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b dark:border-slate-700 flex-none">
          <h2 className="text-xl font-semibold dark:text-white">{t('event:delete_user_title')}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Search - Sticky at top */}
          <div className="sticky top-0 bg-white dark:bg-slate-800 z-10 pb-4 mb-4 border-b dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('event:search_user')}</label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('event:total_users')} {members.length}
              </p>
            </div>
            <div className="mt-1 relative">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={t('event:enter_user_name')}
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('event:delete_user_note')}
            </p>
          </div>

          {/* Error message */}
          {deleteError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {deleteError}
            </div>
          )}

          {/* Info message */}
          {infoMessage && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md flex items-center">
              <Info className="w-5 h-5 mr-2" />
              {infoMessage}
            </div>
          )}

          {/* User List - Scrollable */}
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-center py-4 dark:text-gray-400">{t('event:loading_users')}</p>
            ) : members.length === 0 ? (
              <p className="text-center py-4 dark:text-gray-400">{t('event:no_users_found')}</p>
            ) : (
              members.map((member: any) => (
                <div key={member.userId} className="bg-gray-50 dark:bg-slate-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium dark:text-white">{member.full_name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('event:role_label')} {member.role}</p>
                    </div>
                    {confirmDelete === member.userId ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-3 py-1 bg-gray-100 dark:bg-slate-600 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-slate-500"
                        >
                          {t('common:cancel')}
                        </button>
                        <button
                          onClick={confirmDeleteUser}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                          disabled={deleteUserMutation.isPending}
                        >
                          {deleteUserMutation.isPending ? t('event:processing') : t('event:confirm_button')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(member.userId)}
                        className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                      >
                        {t('event:delete_button')}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteUserModal;
