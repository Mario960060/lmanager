import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { 
  Users, 
  UserMinus
} from 'lucide-react';
import BackButton from '../components/BackButton';
import UserAuthorizationModal from '../components/ProjectManagement/UserAuthorizationModal';
import DeleteUserModal from '../components/ProjectManagement/DeleteUserModal';

const CompanyPanel = () => {
  const { profile } = useAuthStore();
  const [showUserAuthorization, setShowUserAuthorization] = React.useState(false);
  const [showDeleteUser, setShowDeleteUser] = React.useState(false);

  // Redirect if not Admin/boss
  if (profile?.role !== 'Admin' && profile?.role !== 'boss') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">Company Panel</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* User Authorization */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Users className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">User Authorization</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Manage user roles and access permissions.
          </p>
          <button
            onClick={() => setShowUserAuthorization(true)}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Manage Users
          </button>
        </div>

        {/* Delete User */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <UserMinus className="w-6 h-6 text-red-600 mr-3" />
            <h2 className="text-xl font-semibold">Delete User</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Remove users from the system permanently.
          </p>
          <button
            onClick={() => setShowDeleteUser(true)}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete User
          </button>
        </div>
      </div>

      {/* Modals */}
      {showUserAuthorization && (
        <UserAuthorizationModal onClose={() => setShowUserAuthorization(false)} />
      )}
      {showDeleteUser && (
        <DeleteUserModal onClose={() => setShowDeleteUser(false)} />
      )}
    </div>
  );
};

export default CompanyPanel;
