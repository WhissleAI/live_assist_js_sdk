const THEME_KEY = "whissle_theme";

export const THEME_OPTIONS = ["system", "light", "dark"] as const;
export type ThemeOption = (typeof THEME_OPTIONS)[number];

export function getStoredTheme(): ThemeOption {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

export function applyTheme(theme: ThemeOption): void {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function saveTheme(theme: ThemeOption): void {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function cycleTheme(current: string): ThemeOption {
  const idx = THEME_OPTIONS.indexOf(current as ThemeOption);
  return THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
}

export function getThemeIcon(theme: string): string {
  if (theme === "light") return "sun";
  if (theme === "dark") return "moon";
  return "monitor";
}

export function getThemeLabel(theme: string): string {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "System";
}
