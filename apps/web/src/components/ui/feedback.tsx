"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, X, HeartPulse, AlertCircle } from "lucide-react";
const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const next = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const toast = useCallback((text: string) => {
    const id = ++next.current;
    setMessages((items) => [...items.slice(-2), { id, text }]);
    timers.current.push(
      setTimeout(
        () => setMessages((items) => items.filter((m) => m.id !== id)),
        6500,
      ),
    );
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {messages.map((m) => (
          <div className="toast" key={m.id}>
            <CheckCircle2 size={20} aria-hidden />
            <span>{m.text}</span>
            <button
              aria-label="Dismiss notification"
              className="icon-button"
              onClick={() =>
                setMessages((items) => items.filter((item) => item.id !== m.id))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card loading-state" role="status">
      <span className="state-symbol">
        <HeartPulse size={25} />
      </span>
      <p>{label}</p>
      <div aria-hidden className="skeleton-lines">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <section className="card event-state" role="alert">
      <span className="state-symbol error-symbol">
        <AlertCircle size={24} />
      </span>
      <h2>Something didn’t load</h2>
      <p>{message}</p>
      <button className="button secondary-button" onClick={retry}>
        Try again
      </button>
    </section>
  );
}
export function ConfirmDialog({
  title,
  description,
  action = "Delete",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  action?: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="delete-dialog"
      aria-labelledby="confirm-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <span className="state-symbol error-symbol">
        <AlertCircle size={24} />
      </span>
      <h2 id="confirm-heading">{title}</h2>
      <p>{description}</p>
      <div className="form-actions">
        <button
          autoFocus
          className="button secondary-button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button danger-button"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : action}
        </button>
      </div>
    </dialog>
  );
}
