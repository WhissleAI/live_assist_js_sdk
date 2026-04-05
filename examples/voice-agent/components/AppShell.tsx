import React, { useState } from "react";
import { navigate } from "../App";
import Icon from "./Icon";

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
  { id: "settings", route: "settings", label: "Settings", icon: "settings", section: "system" },
];

interface Props {
  activePage: string;
  children: React.ReactNode;
}

export default function AppShell({ activePage, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 6l4 12h1l3-9 3 9h1l4-12" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
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
      <aside className="sidebar-rail">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar-drawer ${mobileOpen ? "sidebar-drawer--open" : ""}`}>
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
          <span className="studio-mobile-title">Whissle Studio</span>
        </header>
        <main className="studio-main">
          {children}
        </main>
      </div>
    </div>
  );
}
