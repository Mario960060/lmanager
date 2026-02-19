// src/themes/index.ts
// Centralne exporty dla systemu tematów

export { ThemeProvider, useTheme, getThemeClass } from './ThemeContext';
export { themes, getTheme, getAllThemes, getThemeIds } from './themeDefinitions';
export type { Theme, ThemeColors, ThemeAnimations, ThemeEffects } from './themeDefinitions';
export {
  getButtonPrimaryClass,
  getButtonPrimaryBgStyle,
  getButtonPrimaryHoverStyle,
  getCardStyle,
  getModalOverlayStyle,
  getModalStyle,
  getInputStyle,
  getInputFocusStyle,
  getTableHeaderStyle,
  getTableRowStyle,
  getTextStyle,
  getStatusColor,
  getStatusStyle,
  getBorderStyle,
  getShadowStyle,
  getTransitionStyle,
  getCardWithShadowStyle,
  getButtonStyle,
  getHoverStyle,
  getButtonHoverStyle,
} from './themeUtils';
