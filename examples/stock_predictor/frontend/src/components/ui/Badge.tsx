import { ReactNode } from "react";

type Variant = "up" | "down" | "neutral" | "correct" | "wrong" | "pending" | "info";

const VARIANTS: Record<Variant, string> = {
  up: "bg-up/15 text-up border-up/30",
  down: "bg-down/15 text-down border-down/30",
  neutral: "bg-surface-700/50 text-surface-300 border-surface-600",
  correct: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  wrong: "bg-red-500/15 text-red-400 border-red-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  info: "bg-brand-500/15 text-brand-400 border-brand-500/30",
};

export function Badge({
  variant = "neutral",
  children,
  className = "",
}: {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
