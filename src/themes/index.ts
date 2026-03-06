// src/themes/index.ts
// Design system + theme switcher (ThemeProvider/useTheme).
// DEPRECATED: themeUtils, getCardStyle, getButtonStyle etc. — use designTokens + uiComponents instead.

export { ThemeProvider, useTheme } from './ThemeContext';
export { themes, getTheme, getAllThemes, getThemeIds, applyTheme } from './themeDefinitions';
export type { ThemeConfig } from './themeDefinitions';

// Design system — tokens + UI components (używaj TYLKO tego do budowy UI)
export {
  colors,
  fonts,
  fontSizes,
  fontWeights,
  spacing,
  radii,
  shadows,
  gradients,
  transitions,
  opacity,
  animationKeyframes,
  layout,
  globalStyles,
  NAV_ITEMS,
  accentAlpha,
} from './designTokens';
export {
  GlobalStyles,
  AppShell,
  Sidebar,
  PageHeader,
  NavBtn,
  Card,
  SectionHeader,
  Modal,
  Accordion,
  TextInput,
  SelectDropdown,
  Checkbox,
  ChipToggle,
  Label,
  HelperText,
  Badge,
  StatusBadge,
  InfoBanner,
  SummaryBar,
  DataTable,
  Button,
  EventCard,
  DayColumn,
  EmptyState,
  ExpandableSection,
  StatCard,
  Spinner,
  BackButton,
  NumberInput,
  Textarea,
  RadioGroup,
  Tabs,
  Stepper,
  Tooltip,
  AlertBanner,
  ConfirmDialog,
  Skeleton,
  Dropdown,
} from './uiComponents';
