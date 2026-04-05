import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  Search,
  Brain,
  Settings,
  Activity,
  Zap,
  Trophy,
  Eye,
  Workflow,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "TRADE",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/signals", label: "Signals", icon: Zap },
      { to: "/watchlist", label: "Watchlist", icon: Eye },
    ],
  },
  {
    title: "RESEARCH",
    items: [
      { to: "/track-record", label: "Track Record", icon: Trophy },
      { to: "/predictions", label: "Predictions", icon: TrendingUp },
      { to: "/analyze", label: "Analysis", icon: Search },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { to: "/pipeline", label: "Pipeline", icon: Workflow },
      { to: "/model", label: "Model", icon: Brain },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-surface-800 bg-surface-950">
      <div className="flex h-14 items-center gap-2.5 px-5 border-b border-surface-800">
        <Activity size={20} className="text-brand-500" />
        <span className="text-sm font-bold tracking-tight text-surface-100">
          Stock Predictor
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-surface-500">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? "bg-brand-600/15 text-brand-400"
                        : "text-surface-400 hover:bg-surface-800 hover:text-surface-200"
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-surface-800 px-4 py-3">
        <p className="text-[10px] text-surface-600 uppercase tracking-widest">
          Powered by Whissle STT
        </p>
      </div>
    </aside>
  );
}
