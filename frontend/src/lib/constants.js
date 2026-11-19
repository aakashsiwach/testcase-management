export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const TYPES = ['Functional', 'Integration', 'Regression', 'Smoke', 'UI', 'API'];
export const RESULTS = ['Pass', 'Fail', 'Blocked', 'Skipped'];
export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const DEFECT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];
export const PROJECT_STATUSES = ['active', 'on-hold', 'completed', 'archived'];
export const ROLES = ['admin', 'test-lead', 'tester', 'read-only'];

// Chart / badge colours (validated for contrast in both themes)
export const STATUS_COLORS = {
  Pass: '#16a34a',
  Fail: '#dc2626',
  Blocked: '#d97706',
  Skipped: '#64748b',
  Pending: '#94a3b8',
};
export const PRIORITY_COLORS = { Critical: '#b91c1c', High: '#ea580c', Medium: '#2563eb', Low: '#64748b' };

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 10) / 10}%`);
export const formatBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

// Pass rate over executed cases, as a percentage.
export const passRate = (counts) => {
  const executed = (counts.Pass || 0) + (counts.Fail || 0) + (counts.Blocked || 0) + (counts.Skipped || 0);
  return executed ? ((counts.Pass || 0) / executed) * 100 : 0;
};

// Human-readable summary of an audit entry's details ({field: {from, to}} or plain values).
export const describeDetails = (details) => {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => (v && typeof v === 'object' && 'from' in v ? `${k}: ${fmtValue(v.from)} → ${fmtValue(v.to)}` : `${k}: ${fmtValue(v)}`))
    .join(' · ');
};
const fmtValue = (v) => (Array.isArray(v) ? v.join(', ') || '∅' : v === null || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 80));

