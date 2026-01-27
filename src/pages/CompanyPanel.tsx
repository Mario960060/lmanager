import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { 
  Building2, 
  Users, 
  UserMinus, 
  Settings,
  LogOut
} from 'lucide-react';
import BackButton from '../components/BackButton';

const CompanyPanel = () => {
  const { profile } = useAuthStore();

  // Redirect if not Admin/boss
  if (profile?.role !== 'Admin' && profile?.role !== 'boss') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">Company Panel</h1>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Company Settings */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Building2 className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">Company Settings</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Edit company information and basic settings.
          </p>
          <button
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Edit Company
          </button>
        </div>

        {/* Manage Team Members */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Users className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">Manage Team</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Add, edit, or manage team members.
          </p>
          <button
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            Manage Team Members
          </button>
        </div>

        {/* Remove Users */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <UserMinus className="w-6 h-6 text-red-600 mr-3" />
            <h2 className="text-xl font-semibold">Remove Users</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Remove users from the company.
          </p>
          <button
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            Remove Users
          </button>
        </div>

        {/* Roles & Permissions */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Settings className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">Roles & Permissions</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Configure user roles and access permissions.
          </p>
          <button
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Manage Roles
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyPanel;
