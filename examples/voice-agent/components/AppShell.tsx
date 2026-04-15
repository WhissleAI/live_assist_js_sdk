import React, { useState, useEffect, useCallback } from "react";
import { navigate } from "../App";
import { getStoredTheme, applyTheme, saveTheme, cycleTheme, getThemeIcon, getThemeLabel } from "../lib/theme";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import Icon from "./Icon";
import WhissleLogo from "./WhissleLogo";

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
  const isOnline = useOnlineStatus();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleCycleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = cycleTheme(prev);
      saveTheme(next);
      return next;
    });
  }, []);

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

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
        <button type="button" className="sidebar-brand-text" onClick={() => handleNav("")}>
          Whissle <span className="sidebar-brand-sub">Studio</span>
        </button>
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
        onClick={handleCycleTheme}
        title={`Theme: ${getThemeLabel(theme)}`}
        aria-label={`Switch theme, currently ${getThemeLabel(theme)}`}
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
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} role="presentation" aria-hidden="true" />
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
            aria-label="Open navigation menu"
          >
            <Icon name="menu" size={20} />
          </button>
          <span className="studio-mobile-title">
            <WhissleLogo size={18} />
            Whissle Studio
          </span>
        </header>
        {!isOnline && (
          <div className="offline-banner" role="alert">
            <Icon name="wifi-off" size={16} />
            You are offline. Some features may be unavailable.
          </div>
        )}
        <main className="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
