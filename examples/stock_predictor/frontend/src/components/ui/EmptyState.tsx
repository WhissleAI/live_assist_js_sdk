import { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 text-surface-600">{icon || <Inbox size={48} />}</div>
      <h3 className="text-lg font-semibold text-surface-300">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-surface-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
