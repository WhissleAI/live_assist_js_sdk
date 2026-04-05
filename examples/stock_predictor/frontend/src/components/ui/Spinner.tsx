export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-600 border-t-brand-500" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner />
    </div>
  );
}
