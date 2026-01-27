import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { 
  LayoutDashboard, 
  FolderOpenDot, 
  CheckSquare, 
  Package, 
  Truck, 
  DollarSign,
  LogOut,
  Calculator,
  Calendar,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const Layout = () => {
  const location = useLocation();
  const { profile, theme, toggleTheme } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = async () => {
    console.log('Logout START');
    try {
      console.log('Calling signOut...');
      
      // Create timeout promise
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.log('SignOut timeout - forcing redirect');
          resolve('timeout');
        }, 2000);
      });
      
      // Race between signOut and timeout
      const result = await Promise.race([
        supabase.auth.signOut(),
        timeoutPromise
      ]);
      
      console.log('SignOut result:', result);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always redirect regardless of signOut result
      console.log('Redirecting to login...');
      window.location.href = '/login';
    }
  };

  const isAdmin = profile?.role === 'Admin' || profile?.role === 'boss';

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderOpenDot },
    { name: 'Task Requirements', href: '/tasks', icon: CheckSquare },
    { name: 'Calendar', href: '/calendar', icon: Calendar },
    { name: 'Materials', href: '/materials', icon: Package },
    { name: 'Equipment', href: '/equipment', icon: Truck },
    { name: 'Calculator', href: '/calculator', icon: Calculator },
    ...(isAdmin ? [
      { name: 'Finance', href: '/finance', icon: DollarSign },
      { name: 'Project Management', href: '/project-management', icon: Settings }
    ] : [])
  ];

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col"
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-white dark:bg-gray-800 shadow-md flex items-center justify-between px-4">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Landscaper Manager</h1>
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex min-h-screen lg:min-h-full">
        {/* Sidebar Backdrop */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:sticky top-0 left-0 z-50 h-full w-[280px] bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-200 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
        >
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">Landscaper Manager</h2>
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Close menu"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 overflow-y-auto">
              <div className="space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                        location.pathname === item.href
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </nav>

            {/* Theme Toggle and User Profile */}
            <div className="p-4 border-t bg-gray-50 dark:bg-gray-700/50 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={toggleTheme}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4 mr-2" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 mr-2" />
                      Dark Mode
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <Link 
                    to="/user-profile" 
                    className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    {profile?.full_name}
                  </Link>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {profile?.role}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-2 p-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  aria-label="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
          <div className={`px-4 py-6 mt-16 lg:mt-0 lg:p-6 ${location.pathname === '/calculator' ? 'h-full overflow-hidden' : ''} flex-1 overflow-y-auto`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
