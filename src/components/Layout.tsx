import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { useCalculatorMenu } from '../contexts/CalculatorMenuContext';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { 
  LayoutDashboard, 
  FolderOpenDot, 
  CheckSquare, 
  DollarSign,
  LogOut,
  Calculator,
  Calendar,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  Wrench,
  Building2,
  ArrowLeft,
  Layers, 
  BrickWall, 
  Clock, 
  Fence, 
  Stars as Stairs, 
  Trees as Grass, 
  Rows4, 
  Grid, 
  Square, 
  Minus, 
  Pickaxe
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme, getAllThemes } from '../themes';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, theme, toggleTheme, setUser, setProfile } = useAuthStore();
  const { currentTheme, setTheme } = useTheme();
  const { t } = useTranslation(['common', 'nav']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const { showCalculatorMenu, setShowCalculatorMenu } = useCalculatorMenu();
  const allThemes = getAllThemes();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setProfile(null);
      navigate('/login', { replace: true });
    }
  };

  const isAdmin = profile?.role === 'Admin';

  const { selectedCalculatorType, setSelectedCalculatorType, selectedSubType, setSelectedSubType, expandedCategory, setExpandedCategory } = useCalculatorMenu();

  const calculatorButtons = [
    { 
      type: 'aggregate', 
      icon: Layers, 
      label: t('nav:aggregate_calculator'),
      subTypes: [
        { type: 'type1', label: t('nav:preparation') },
        { type: 'aggregate', label: t('nav:aggregate') },
        { type: 'soil_excavation', label: t('nav:soil_excavation') },
        { type: 'general', label: t('nav:mortar_calculator') }
      ]
    },
    { 
      type: 'paving', 
      icon: Square, 
      label: t('nav:paving_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:monoblock_paving') }
      ]
    },
    { 
      type: 'tile', 
      icon: Square, 
      label: t('nav:tile_installation_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:tile_installation') },
        { type: 'coping', label: t('nav:coping_installation') }
      ]
    },
    { 
      type: 'wall', 
      icon: BrickWall, 
      label: t('nav:wall_and_finish_calculator'),
      subTypes: [
        { type: 'brick', label: t('nav:brick_wall_calculator') },
        { type: 'block4', label: t('nav:block4_wall_calculator') },
        { type: 'block7', label: t('nav:block7_wall_calculator') },
        { type: 'sleeper', label: t('nav:sleeper_wall_calculator') }
      ]
    },
    { 
      type: 'slab', 
      icon: Grid, 
      label: t('nav:slab_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:slab_calculator') }
      ]
    },
    { 
      type: 'time', 
      icon: Clock, 
      label: t('nav:time_estimation_tool'),
      subTypes: [
        { type: 'task', label: t('nav:task_time_estimator') }
      ]
    },
    { 
      type: 'fence', 
      icon: Fence, 
      label: t('nav:fence_calculator'),
      subTypes: [
        { type: 'vertical', label: t('nav:vertical_fence') },
        { type: 'horizontal', label: t('nav:horizontal_fence') },
        { type: 'venetian', label: t('nav:venetian_fence') },
        { type: 'composite', label: t('nav:composite_fence') }
      ]
    },
    { 
      type: 'steps', 
      icon: Stairs, 
      label: t('nav:steps_calculator'),
      subTypes: [
        { type: 'standard', label: t('nav:standard_stairs') },
        { type: 'l_shape', label: t('nav:l_shape_stairs') }
      ]
    },
    { 
      type: 'deck', 
      icon: Rows4, 
      label: t('nav:deck_calculator'),
      subTypes: [
        { type: 'standard', label: t('nav:decking_standard') }
      ]
    },
    { 
      type: 'grass', 
      icon: Grass, 
      label: t('nav:artificial_grass_calculator'),
      subTypes: [
        { type: 'Artificial Grass', label: 'Artificial Grass' }
      ]
    },
    { 
      type: 'kerbs', 
      icon: Minus, 
      label: t('nav:kerbs_edges_calculator'),
      subTypes: [
        { type: 'kl', label: t('nav:kl_kerbs') },
        { type: 'rumbled', label: t('nav:rumbled_kerbs') },
        { type: 'flat', label: t('nav:flat_edges') },
        { type: 'sets', label: t('nav:sets') }
      ]
    },
    { 
      type: 'foundation', 
      icon: Pickaxe, 
      label: t('nav:foundation_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:foundation_excavation') }
      ]
    }
  ].sort((a, b) => a.label.localeCompare(b.label))
   .map(calc => ({
     ...calc,
     subTypes: [...calc.subTypes].sort((a, b) => a.label.localeCompare(b.label))
   }));

  const navigation = [
    { name: t('nav:dashboard'), href: '/', icon: LayoutDashboard },
    { name: t('nav:projects'), href: '/projects', icon: FolderOpenDot },
    { name: t('nav:calculator'), href: '/calculator', icon: Calculator },
    { name: t('nav:calendar'), href: '/calendar', icon: Calendar },
    { name: t('nav:tasks'), href: '/tasks', icon: CheckSquare },
    ...(isAdmin ? [
      { name: t('nav:project_management'), href: '/project-management', icon: Settings },
      { name: t('nav:setup'), href: '/setup', icon: Wrench },
      { name: t('nav:company_panel'), href: '/company-panel', icon: Building2 },
      { name: t('nav:finance'), href: '/finance', icon: DollarSign }
    ] : [])
  ];

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-white dark:bg-gray-800 shadow-md flex items-center justify-between px-4">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label={t('common:menu')}
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('common:app_name')}</h1>
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label={t('common:theme')}
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
          className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[280px] bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-200 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 lg:h-screen`}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between h-16 px-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('common:app_name')}</h2>
              <button
                onClick={toggleSidebar}
                className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={t('common:close')}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 overflow-hidden flex flex-col min-h-0">
              <div className="space-y-1 flex flex-col flex-1 overflow-hidden">
                {showCalculatorMenu ? (
                  <>
                    {/* Back to Menu Button */}
                    <button
                      onClick={() => {
                        setShowCalculatorMenu(false);
                        setSelectedCalculatorType(null);
                        setSelectedSubType(null);
                        setExpandedCategory(null);
                      }}
                      className="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 mb-4 flex-shrink-0"
                    >
                      <ArrowLeft className="w-5 h-5 mr-3 flex-shrink-0" />
                      {t('common:back')}
                    </button>

                    {/* Calculators Section Title */}
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-shrink-0">
                      {t('nav:calculator')}
                    </div>

                    {/* Calculators List with Sub-types - Scrollable */}
                    <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                      <div className="space-y-1">
                        {calculatorButtons.map((calc: any) => {
                          const Icon = calc.icon as any;
                          const isExpanded = expandedCategory === calc.type;
                          
                          return (
                            <div key={calc.type}>
                              <button
                                onClick={() => {
                                  if (calc.subTypes.length > 1) {
                                    // Toggle expansion for categories with multiple sub-types
                                    setExpandedCategory(isExpanded ? null : calc.type);
                                  } else {
                                    // Direct selection for single sub-type
                                    setSelectedCalculatorType(calc.type);
                                    setExpandedCategory(calc.type);
                                  }
                                  // Don't close menu on mobile - keep it open for calculator
                                }}
                                className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                                  selectedCalculatorType === calc.type
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                              >
                                <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                                {calc.label}
                                {calc.subTypes.length > 1 && (
                                  <span className="ml-auto" style={{ color: '#9CA3AF' }}>
                                  </span>
                                )}
                              </button>
                              
                              {/* Sub-types list */}
                              {isExpanded && calc.subTypes.map((subType: any) => {
                                const isSubTypeActive = selectedCalculatorType === calc.type && selectedSubType === subType.type;
                                return (
                                <button
                                  key={`${calc.type}-${subType.type}`}
                                  onClick={() => {
                                    setSelectedCalculatorType(calc.type);
                                    setSelectedSubType(subType.type);
                                    
                                    // Navigate first if not on calculator page
                                    if (location.pathname !== '/calculator') {
                                      navigate('/calculator');
                                      // Dispatch event after a short delay to ensure component is mounted
                                      setTimeout(() => {
                                        const event = new CustomEvent('selectSubCalculator', { 
                                          detail: { calculatorType: calc.type, subType: subType.type }
                                        });
                                        console.log('Dispatching event:', event.detail);
                                        window.dispatchEvent(event);
                                      }, 50);
                                    } else {
                                      // Already on calculator page, dispatch immediately
                                      const event = new CustomEvent('selectSubCalculator', { 
                                        detail: { calculatorType: calc.type, subType: subType.type }
                                      });
                                      console.log('Dispatching event:', event.detail);
                                      window.dispatchEvent(event);
                                    }
                                    
                                    // Close sidebar on mobile after selecting sub-calculator
                                    setIsSidebarOpen(false);
                                  }}
                                  className={`w-full flex items-center px-8 py-2 text-sm rounded-lg transition-colors ${
                                    isSubTypeActive
                                      ? 'bg-blue-600 text-white'
                                      : 'text-gray-500 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300'
                                  }`}
                                >
                                  {subType.label}
                                </button>
                              );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  navigation.map((item) => {
                    const Icon = item.icon;
                    
                    // Special handling for Calculator - use button instead of Link
                    if (item.href === '/calculator') {
                      return (
                        <button
                          key={item.name}
                          onClick={() => {
                            setShowCalculatorMenu(true);
                            setSelectedCalculatorType(null);
                            setExpandedCategory(null);
                          }}
                          className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                            showCalculatorMenu
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
                          {item.name}
                        </button>
                      );
                    }
                    
                    // Regular Link for other items
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => {
                          setIsSidebarOpen(false);
                        }}
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
                  })
                )}
              </div>
            </nav>

            {/* Theme Toggle and User Profile */}
            <div className="p-4 border-t bg-gray-50 dark:bg-gray-700/50 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4 relative">
                <button
                  onClick={() => setShowThemeDropdown(!showThemeDropdown)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <span>{currentTheme.icon}</span>
                  <span className="ml-2">{currentTheme.displayName}</span>
                </button>
                
                {showThemeDropdown && (
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-lg z-50 border border-gray-200 dark:border-gray-600">
                    {allThemes.map((themeOption) => (
                      <button
                        key={themeOption.id}
                        onClick={() => {
                          setTheme(themeOption.id);
                          setShowThemeDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors ${
                          currentTheme.id === themeOption.id
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-medium'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        <span>{themeOption.icon}</span>
                        <span>{themeOption.displayName}</span>
                        {currentTheme.id === themeOption.id && (
                          <span className="ml-auto">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="mb-4">
                <LanguageSwitcher />
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
                  aria-label={t('common:logout')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 bg-gray-100 dark:bg-gray-900 min-h-screen">
          <div className={`px-4 py-6 mt-16 lg:mt-0 lg:p-6`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
