export type ThemeMode = 'light' | 'dark';

export const lightColors = {
  background: '#FFFFFF',
  surface: '#F7F8FA',
  card: '#FFFFFF',
  border: '#DDE2E8',
  text: '#101418',
  muted: '#69717D',
  primary: '#168A4A',
  primaryDark: '#0F6B39',
  danger: '#C6362E',
  warning: '#B7791F',
};

export const darkColors = {
  background: '#101418',
  surface: '#171D24',
  card: '#1D252E',
  border: '#303946',
  text: '#F4F7FA',
  muted: '#A6B0BD',
  primary: '#43C27D',
  primaryDark: '#2A9B60',
  danger: '#FF6B61',
  warning: '#F2B84B',
};

export const colors = { ...lightColors };

export function getThemeColors(mode: ThemeMode) {
  return mode === 'dark' ? darkColors : lightColors;
}

export function applyTheme(mode: ThemeMode) {
  Object.assign(colors, getThemeColors(mode));
}

export const shadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
