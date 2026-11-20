import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface ToastContextValue {
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  confirmAction: (opts: ConfirmDialogState) => void;
}

const ToastContext = createContext<ToastContextValue>({
  notify: () => {},
  confirmAction: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmDialogState | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirmAction = useCallback((opts: ConfirmDialogState) => {
    setDialog(opts);
  }, []);

  return (
    <ToastContext.Provider value={{ notify, confirmAction }}>
      {children}

      {/* Toast stack */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.65)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Non-blocking Confirmation Modal */}
      {dialog && (
        <div className="modal-overlay" onClick={() => setDialog(null)}>
          <div
            className="modal"
            style={{ maxWidth: '420px', padding: '22px 24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title" style={{ marginBottom: '8px' }}>
              {dialog.title}
            </h3>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {dialog.description}
            </p>
            <div className="modal-actions" style={{ marginTop: '18px', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-sm ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => {
                  const fn = dialog.onConfirm;
                  setDialog(null);
                  fn();
                }}
              >
                {dialog.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};
