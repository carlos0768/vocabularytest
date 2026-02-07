'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };

    setToasts((prev) => {
      // Deduplicate: skip if a toast with the same message is already visible
      if (prev.some((t) => t.message === toast.message)) return prev;
      return [...prev, newToast];
    });

    // Auto-dismiss after duration (default 3 seconds)
    const duration = toast.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}

      {/* Toast container */}
      <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto bg-[#1A1A2E] text-white px-4 py-3 rounded-[var(--radius-lg)] shadow-card',
              'flex items-center gap-3 max-w-sm w-full',
              'animate-in slide-in-from-bottom-4 fade-in duration-200',
              toast.type === 'warning' && 'bg-[#f59e0b] text-[#1A1A2E]',
              toast.type === 'success' && 'bg-[#22c55e] text-white',
              toast.type === 'error' && 'bg-[#ef4444]'
            )}
          >
            <span className="text-sm flex-1">{toast.message}</span>

            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  hideToast(toast.id);
                }}
                className="flex items-center gap-1 text-sm font-medium text-white/90 hover:text-white shrink-0"
              >
                {toast.action.label}
                <Icon name="chevron_right" size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
