import { useEffect, useRef } from 'react';
import { errorText } from '../api/client';
import { PRIORITY_COLORS, STATUS_COLORS } from '../lib/constants';

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{typeof error === 'string' ? error : errorText(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const s = status || 'Pending';
  return (
    <span className="badge" style={{ '--badge': STATUS_COLORS[s] || STATUS_COLORS.Pending }}>
      {s}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <span className="badge badge-outline" style={{ '--badge': PRIORITY_COLORS[priority] || '#64748b' }}>
      {priority}
    </span>
  );
}

export function Badge({ children, color = '#64748b' }) {
  return (
    <span className="badge badge-outline" style={{ '--badge': color }}>
      {children}
    </span>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function ProgressBar({ value, total, label }) {
  const pctValue = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress" title={`${value} / ${total}`}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pctValue}%` }} />
      </div>
      <span className="progress-label">{label ?? `${value}/${total} (${pctValue}%)`}</span>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Prev
      </button>
      <span className="muted">
        Page {page} of {pages} · {total} items
      </span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next ›
      </button>
    </div>
  );
}
