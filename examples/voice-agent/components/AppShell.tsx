import React, { useState, useEffect, useCallback } from "react";
import { navigate } from "../App";
import Icon from "./Icon";
import WhissleLogo from "./WhissleLogo";

const THEME_KEY = "whissle_theme";
const THEME_CYCLE: string[] = ["system", "light", "dark"];

function getStoredTheme(): string {
  return localStorage.getItem(THEME_KEY) || "system";
}

function applyTheme(theme: string) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function getThemeIcon(theme: string): string {
  if (theme === "light") return "sun";
  if (theme === "dark") return "moon";
  return "monitor";
}

function getThemeLabel(theme: string): string {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "System";
}

interface NavItem {
  id: string;
  route: string;
  label: string;
  icon: string;
  section: "build" | "analyze" | "system";
}

const NAV_ITEMS: NavItem[] = [
  { id: "voice-agents", route: "", label: "Voice Agents", icon: "mic", section: "build" },
  { id: "transcribe", route: "transcribe", label: "Transcribe", icon: "file-text", section: "build" },
  { id: "tts", route: "tts", label: "Text to Speech", icon: "volume2", section: "build" },
  { id: "research", route: "research", label: "Research", icon: "search", section: "build" },
  { id: "video-to-music", route: "video-to-music", label: "Video to Music", icon: "film", section: "build" },
  { id: "sessions", route: "sessions", label: "Sessions", icon: "bar-chart", section: "analyze" },
  { id: "memory", route: "memory", label: "Memory", icon: "database", section: "analyze" },
  { id: "usage", route: "usage", label: "Usage", icon: "activity", section: "analyze" },
  { id: "settings", route: "settings", label: "Settings", icon: "settings", section: "system" },
];

interface Props {
  activePage: string;
  children: React.ReactNode;
}

export default function AppShell({ activePage, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme((prev) => {
      const idx = THEME_CYCLE.indexOf(prev);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const handleNav = (route: string) => {
    navigate(route);
    setMobileOpen(false);
  };

  const buildItems = NAV_ITEMS.filter((n) => n.section === "build");
  const analyzeItems = NAV_ITEMS.filter((n) => n.section === "analyze");
  const systemItems = NAV_ITEMS.filter((n) => n.section === "system");

  const sidebarContent = (
    <>
      <div className="sidebar-brand-row">
        <button
          type="button"
          className="sidebar-logo"
          onClick={() => handleNav("")}
          title="Whissle Studio"
        >
          <WhissleLogo size={22} />
        </button>
        <span className="sidebar-brand-text" onClick={() => handleNav("")}>
          Whissle <span className="sidebar-brand-sub">Studio</span>
        </span>
      </div>

      <div className="sidebar-section-label">Build</div>
      {buildItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-nav-btn ${activePage === item.id ? "sidebar-nav-btn--active" : ""}`}
          onClick={() => handleNav(item.route)}
          title={item.label}
        >
          <span className="sidebar-nav-icon"><Icon name={item.icon} size={18} /></span>
          <span className="sidebar-nav-label">{item.label}</span>
        </button>
      ))}

      <div className="sidebar-section-label">Analyze</div>
      {analyzeItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-nav-btn ${activePage === item.id ? "sidebar-nav-btn--active" : ""}`}
          onClick={() => handleNav(item.route)}
          title={item.label}
        >
          <span className="sidebar-nav-icon"><Icon name={item.icon} size={18} /></span>
          <span className="sidebar-nav-label">{item.label}</span>
        </button>
      ))}

      <div className="sidebar-spacer" />

      <button
        type="button"
        className="sidebar-nav-btn"
        onClick={cycleTheme}
        title={`Theme: ${getThemeLabel(theme)}`}
      >
        <span className="sidebar-nav-icon"><Icon name={getThemeIcon(theme)} size={18} /></span>
        <span className="sidebar-nav-label">{getThemeLabel(theme)}</span>
      </button>

      {systemItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-nav-btn ${activePage === item.id ? "sidebar-nav-btn--active" : ""}`}
          onClick={() => handleNav(item.route)}
          title={item.label}
        >
          <span className="sidebar-nav-icon"><Icon name={item.icon} size={18} /></span>
          <span className="sidebar-nav-label">{item.label}</span>
        </button>
      ))}
    </>
  );

  return (
    <div className="studio-shell">
      <aside className="sidebar-rail" role="navigation" aria-label="Main navigation">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar-drawer ${mobileOpen ? "sidebar-drawer--open" : ""}`}>
        <button
          type="button"
          className="sidebar-drawer-close"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <Icon name="x" size={20} />
        </button>
        {sidebarContent}
      </aside>

      <div className="studio-main-wrapper">
        <header className="studio-mobile-header">
          <button
            type="button"
            className="studio-menu-btn"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" size={20} />
          </button>
          <span className="studio-mobile-title">
            <WhissleLogo size={18} />
            Whissle Studio
          </span>
        </header>
        <main className="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
