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
  Wrench,
  Building2,
  ArrowLeft,
  ChevronRight,
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
  Pickaxe,
  Activity
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme, getAllThemes } from '../themes';
import { colors, spacing, radii, fontSizes, fontWeights, transitions, layout, shadows, gradients, accentAlpha } from '../themes/designTokens';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, setUser, setProfile } = useAuthStore();
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
        { type: 'default', label: t('nav:slab_calculator') },
        { type: 'concreteSlabs', label: t('nav:concrete_slabs_calculator') }
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
        { type: 'l_shape', label: t('nav:l_shape_stairs') },
        { type: 'u_shape', label: t('nav:u_shape_stairs') }
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
        { type: 'default', label: t('nav:artificial_grass') }
      ]
    },
    { 
      type: 'turf', 
      icon: Grass, 
      label: t('nav:natural_turf_calculator'),
      subTypes: [
        { type: 'default', label: t('nav:natural_turf') }
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
    { name: t('nav:project_management'), href: '/project-management', icon: Settings },
    { name: t('nav:setup'), href: '/setup', icon: Wrench },
    { name: t('nav:company_panel'), href: '/company-panel', icon: Building2 },
    { name: t('nav:finance'), href: '/finance', icon: DollarSign }
  ];

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div style={{ minHeight: '100vh', background: colors.bgApp }}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 shadow-md flex items-center justify-between px-4" style={{ background: colors.bgSidebar }}>
        <button
          onClick={toggleSidebar}
          style={{ padding: spacing.md, borderRadius: radii.lg, transition: transitions.fast, background: 'transparent' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          aria-label={t('common:menu')}
        >
          <Menu className="w-6 h-6" />
        </button>
        <h1 style={{ fontSize: fontSizes.xl, fontWeight: fontWeights.bold, color: colors.textPrimary }}>{t('common:app_name')}</h1>
        <div style={{ width: 40, flexShrink: 0 }} aria-hidden="true" />
      </div>

      {/* Main Layout */}
      <div className="flex h-screen">
        {/* Sidebar Backdrop */}
        {isSidebarOpen && (
          <div
            style={{ position: 'fixed', inset: 0, background: colors.bgModalBackdrop, zIndex: 40, transition: 'opacity 0.2s' }}
            className="lg:hidden"
            onClick={toggleSidebar}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed lg:sticky top-0 left-0 z-50 h-screen shadow-lg transform transition-transform duration-200 ease-in-out ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 lg:h-screen`}
          style={{ background: colors.bgSidebar, width: layout.sidebarWidth, borderRight: `1px solid ${colors.borderDefault}`, flexShrink: 0, overflow: 'hidden', height: '100vh' }}
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* Sidebar Header - Logo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 18px', borderBottom: `1px solid ${colors.borderDefault}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
                <div style={{ width: 34, height: 34, borderRadius: radii.lg, background: gradients.blueLogo, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: fontWeights.extrabold, color: '#fff', fontFamily: 'Rajdhani, sans-serif', boxShadow: shadows.blue }}>LM</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: fontWeights.bold, color: colors.textPrimary, fontFamily: 'Rajdhani, sans-serif', lineHeight: 1.1 }}>Landscape</div>
                  <div style={{ fontSize: 11, color: colors.textDim, fontFamily: 'Exo 2, sans-serif', fontWeight: fontWeights.normal, letterSpacing: '1px', textTransform: 'uppercase' }}>Manager</div>
                </div>
              </div>
              <button
                onClick={toggleSidebar}
                className="lg:hidden"
                style={{ padding: spacing.md, borderRadius: radii.lg, transition: transitions.fast, background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: spacing.md, padding: '10px 12px', borderRadius: radii.xl, border: 'none', cursor: 'pointer', fontSize: fontSizes.base, fontWeight: fontWeights.medium, color: colors.textSubtle, background: 'transparent', textAlign: 'left', marginBottom: spacing.sm, flexShrink: 0, fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <ArrowLeft style={{ width: 16, height: 16, flexShrink: 0 }} />
                      {t('common:back')}
                    </button>

                    {/* Calculators Section Title */}
                    <div style={{ padding: '4px 12px 8px', fontSize: fontSizes.xs, fontWeight: fontWeights.semibold, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1.2, flexShrink: 0 }}>
                      {t('nav:calculator')}
                    </div>

                    {/* Calculators List with Sub-types - Scrollable */}
                    <div className="flex-1 overflow-y-auto min-h-0 pr-2">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {calculatorButtons.map((calc: any) => {
                          const Icon = calc.icon as any;
                          const isExpanded = expandedCategory === calc.type;
                          const hasMultipleSubTypes = calc.subTypes.length > 1;
                          const hasSubTypes = calc.subTypes.length >= 1;
                          const hasChildren = hasSubTypes; // alias for compatibility
                          const isActive = selectedCalculatorType === calc.type && !selectedSubType;
                          const isActiveOrExpanded = isActive || isExpanded;
                          
                          return (
                            <div key={calc.type}>
                              <button
                                onClick={() => {
                                  if (hasMultipleSubTypes) {
                                    setExpandedCategory(isExpanded ? null : calc.type);
                                  } else {
                                    setSelectedCalculatorType(calc.type);
                                    setExpandedCategory(calc.type);
                                  }
                                }}
                                style={{
                                  width: '100%', display: 'flex', alignItems: 'center', gap: spacing.xl, padding: '10px 12px', borderRadius: radii.xl, border: 'none', cursor: 'pointer', fontSize: fontSizes.base, fontWeight: isActiveOrExpanded ? fontWeights.semibold : fontWeights.normal, color: isActiveOrExpanded ? colors.textPrimary : colors.textSubtle, background: isActive && !isExpanded ? `linear-gradient(135deg, ${accentAlpha(0.18)}, ${accentAlpha(0.08)})` : 'transparent', boxShadow: isActive && !isExpanded ? `0 0 0 1px ${accentAlpha(0.3)} inset` : 'none', transition: transitions.fast, textAlign: 'left', fontFamily: 'inherit',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive || isExpanded) (e.currentTarget as HTMLElement).style.background = colors.bgHover;
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive || isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                }}
                              >
                                <span style={{ opacity: isActiveOrExpanded ? 1 : 0.6, display: 'flex', flexShrink: 0 }}>
                                  <Icon size={18} style={{ color: 'inherit' }} />
                                </span>
                                <span style={{ flex: 1, lineHeight: 1.35 }}>{calc.label}</span>
                                {hasMultipleSubTypes && (
                                  <ChevronRight
                                    size={14}
                                    style={{ opacity: 0.4, transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
                                  />
                                )}
                              </button>
                              
                              {/* Sub-types list */}
                              {hasSubTypes && isExpanded && (
                                <div style={{ marginLeft: spacing["5xl"], borderLeft: `1px solid ${accentAlpha(0.4)}`, paddingLeft: 0, marginTop: 2, marginBottom: spacing.sm }}>
                                  {calc.subTypes.map((subType: any) => {
                                    const isSubTypeActive = selectedCalculatorType === calc.type && selectedSubType === subType.type;
                                    return (
                                      <button
                                        key={`${calc.type}-${subType.type}`}
                                        onClick={() => {
                                          setSelectedCalculatorType(calc.type);
                                          setSelectedSubType(subType.type);
                                          if (location.pathname !== '/calculator') {
                                            navigate('/calculator');
                                            setTimeout(() => {
                                              window.dispatchEvent(new CustomEvent('selectSubCalculator', { detail: { calculatorType: calc.type, subType: subType.type, subTypeLabel: subType.label } }));
                                            }, 50);
                                          } else {
                                            window.dispatchEvent(new CustomEvent('selectSubCalculator', { detail: { calculatorType: calc.type, subType: subType.type, subTypeLabel: subType.label } }));
                                          }
                                          setIsSidebarOpen(false);
                                        }}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center', gap: spacing.lg, padding: '8px 12px', borderRadius: radii.lg, border: 'none', cursor: 'pointer', fontSize: fontSizes.sm, fontWeight: isSubTypeActive ? fontWeights.semibold : fontWeights.normal, color: isSubTypeActive ? colors.accentBlue : colors.textSubtle, background: isSubTypeActive ? colors.accentBlueBg : 'transparent', transition: transitions.fast, textAlign: 'left', fontFamily: 'inherit', lineHeight: 1.35,
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isSubTypeActive) (e.currentTarget as HTMLElement).style.background = colors.bgHover;
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isSubTypeActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                                        }}
                                      >
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: isSubTypeActive ? colors.accentBlue : colors.textDim, opacity: isSubTypeActive ? 1 : 0.7, flexShrink: 0 }} />
                                        {subType.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  navigation.map((item, index) => {
                    const Icon = item.icon;
                    
                    // Special handling for Calculator - use button instead of Link
                    if (item.href === '/calculator') {
                      const isActive = showCalculatorMenu || location.pathname === '/calculator';
                      return (
                        <button
                          key={item.name}
                          onClick={() => {
                            setShowCalculatorMenu(true);
                            setSelectedCalculatorType(null);
                            setExpandedCategory(null);
                          }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10, marginBottom: 2, fontSize: fontSizes.base, fontWeight: isActive ? fontWeights.semibold : fontWeights.normal, borderRadius: radii.lg, transition: transitions.fast,
                            background: isActive ? colors.accentBlueBg : 'transparent',
                            borderLeft: `3px solid ${isActive ? colors.accentBlue : 'transparent'}`,
                            color: isActive ? colors.textSecondary : colors.navTextInactive,
                          }}
                          onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textSecondary; } }}
                          onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.navTextInactive; } }}
                        >
                          <Icon size={20} style={{ flexShrink: 0, color: isActive ? colors.accentBlue : colors.navIconInactive }} />
                          {item.name}
                        </button>
                      );
                    }
                    
                    // Regular Link for other items
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => {
                          setIsSidebarOpen(false);
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10, marginBottom: 2, fontSize: fontSizes.base, fontWeight: isActive ? fontWeights.semibold : fontWeights.normal, borderRadius: radii.lg, transition: transitions.fast,
                          background: isActive ? colors.accentBlueBg : 'transparent',
                          borderLeft: `3px solid ${isActive ? colors.accentBlue : 'transparent'}`,
                          color: isActive ? colors.textSecondary : colors.navTextInactive,
                          animation: `slideIn 0.3s ease ${index * 0.04}s both`,
                        }}
                        onMouseEnter={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textSecondary; } }}
                        onMouseLeave={(e) => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.navTextInactive; } }}
                      >
                        <Icon size={20} style={{ flexShrink: 0, color: isActive ? colors.accentBlue : colors.navIconInactive }} />
                        {item.name}
                      </Link>
                    );
                  })
                )}
              </div>
            </nav>

            {/* Theme Toggle and User Profile */}
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${colors.borderDefault}` }}>
              <div className="flex items-center justify-between mb-4 relative">
                <button
                  onClick={() => setShowThemeDropdown(!showThemeDropdown)}
                  style={{ display: 'flex', alignItems: 'center', padding: `${spacing.md}px ${spacing.lg}px`, fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textPrimary, borderRadius: radii.lg, transition: transitions.fast, background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span>{currentTheme.icon}</span>
                  <span className="ml-2">{t(`common:theme_${currentTheme.id}`)}</span>
                </button>
                
                {showThemeDropdown && (
                  <div
                    style={{
                      position: 'absolute', bottom: '100%', left: 0, marginBottom: spacing.sm,
                      width: 192, zIndex: 50,
                      background: colors.bgElevated,
                      border: `1px solid ${colors.borderDefault}`,
                      borderRadius: radii.lg,
                      boxShadow: shadows.xl,
                      overflow: 'hidden',
                    }}
                  >
                    {allThemes.map((themeOption) => (
                      <button
                        key={themeOption.id}
                        onClick={() => {
                          setTheme(themeOption.id);
                          setShowThemeDropdown(false);
                        }}
                        style={{
                          width: '100%', textAlign: 'left', padding: `${spacing.md}px ${spacing.lg}px`, fontSize: fontSizes.sm, display: 'flex', alignItems: 'center', gap: spacing.md, transition: transitions.fast,
                          background: currentTheme.id === themeOption.id ? colors.accentBlueBg : 'transparent',
                          color: currentTheme.id === themeOption.id ? colors.textPrimary : colors.textMuted,
                          fontWeight: currentTheme.id === themeOption.id ? fontWeights.medium : fontWeights.normal,
                        }}
                        onMouseEnter={(e) => {
                          if (currentTheme.id !== themeOption.id) {
                            (e.currentTarget as HTMLElement).style.background = colors.bgHover;
                            (e.currentTarget as HTMLElement).style.color = colors.textPrimary;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentTheme.id !== themeOption.id) {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = colors.textMuted;
                          }
                        }}
                      >
                        <span>{themeOption.icon}</span>
                        <span>{t(`common:theme_${themeOption.id}`)}</span>
                        {currentTheme.id === themeOption.id && (
                          <span style={{ marginLeft: 'auto', color: colors.accentBlue }}>✓</span>
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
                    style={{ fontSize: fontSizes.sm, fontWeight: fontWeights.medium, color: colors.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: transitions.fast, cursor: 'pointer' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = colors.accentBlue; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = colors.textPrimary; }}
                  >
                    {profile?.full_name}
                  </Link>
                  <p style={{ fontSize: fontSizes.xs, color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {profile?.role}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  style={{ marginLeft: spacing.md, padding: spacing.md, color: colors.textDim, borderRadius: radii.lg, transition: transitions.fast, background: 'transparent' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; (e.currentTarget as HTMLElement).style.color = colors.textPrimary; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = colors.textDim; }}
                  aria-label={t('common:logout')}
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        {(() => {
          const isCanvasRoute = location.pathname.includes('create-canvas');
          const isCalculatorRoute = location.pathname === '/calculator';
          return (
            <main
              className={`flex-1 min-w-0 min-h-0 pt-16 lg:pt-0 ${isCanvasRoute ? 'overflow-hidden flex flex-col' : 'overflow-auto'}`}
              style={{ background: colors.bgMain, position: 'relative' }}
            >
              <div style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                backgroundImage: layout.gridPattern, backgroundSize: layout.gridPatternSize,
                pointerEvents: 'none', zIndex: 0,
              }} className="left-0 lg:left-[240px]" />
              <div
                className={isCanvasRoute ? 'flex-1 min-h-0 min-w-0 flex flex-col' : 'layout-content-wrapper px-4 py-6'}
                style={{
                  padding: isCanvasRoute ? 0 : layout.contentPadding,
                  position: 'relative',
                  zIndex: 1,
                  ...(isCanvasRoute ? { overflow: 'hidden' } : {}),
                }}
                data-route={isCalculatorRoute ? 'calculator' : undefined}
              >
                <Outlet />
              </div>
            </main>
          );
        })()}
      </div>
    </div>
  );
};

export default Layout;
