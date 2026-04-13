import React, { useState, useEffect, useCallback } from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

let _setToasts: React.Dispatch<React.SetStateAction<Toast[]>> | null = null;
let _nextId = 0;

export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const id = ++_nextId;
  _setToasts?.((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((t) => t.id !== id));
  }, 4000);
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  return (
    <div className={`toast toast--${toast.type}`} role="alert">
      <div className="toast-content">
        <span className="toast-message">{toast.message}</span>
        <button type="button" className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
          &times;
        </button>
      </div>
      <div className="toast-progress" />
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  _setToasts = setToasts;

  const handleDismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      _setToasts = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
