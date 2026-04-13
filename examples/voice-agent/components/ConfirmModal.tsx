import React, { useState, useEffect, useRef, useCallback } from "react";

interface ConfirmState {
  title: string;
  message: string;
}

let _setConfirm: React.Dispatch<React.SetStateAction<ConfirmState | null>> | null = null;
let _resolve: ((value: boolean) => void) | null = null;

export function confirmAction(title: string, message: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    _resolve = resolve;
    _setConfirm?.({ title, message });
  });
}

export function ConfirmModalContainer() {
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  _setConfirm = setConfirm;

  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const close = useCallback((value: boolean) => {
    _resolve?.(value);
    _resolve = null;
    setConfirm(null);
  }, []);

  useEffect(() => {
    if (confirm) {
      confirmBtnRef.current?.focus();
    }
  }, [confirm]);

  useEffect(() => {
    if (!confirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close(false);
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, close]);

  useEffect(() => {
    return () => {
      _setConfirm = null;
    };
  }, []);

  if (!confirm) return null;

  return (
    <div className="confirm-overlay" onClick={() => close(false)}>
      <div
        className="confirm-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="confirm-modal-title" id="confirm-modal-title">{confirm.title}</h2>
        <p className="confirm-modal-message">{confirm.message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="confirm-modal-cancel" onClick={() => close(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-modal-confirm"
            ref={confirmBtnRef}
            onClick={() => close(true)}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
