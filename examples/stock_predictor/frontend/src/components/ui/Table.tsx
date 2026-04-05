import { ReactNode } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <th
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-400 ${
        onClick ? "cursor-pointer hover:text-surface-200" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-4 py-3 text-surface-200 ${className}`}>{children}</td>;
}
