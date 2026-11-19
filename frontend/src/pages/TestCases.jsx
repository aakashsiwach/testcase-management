import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../api/client';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionsContext';
import { PRIORITIES, RESULTS, TYPES, formatDate } from '../lib/constants';
import { useDebounced, useMembers, useSuites } from '../lib/hooks';
import { useAsync } from '../lib/useAsync';
import VirtualList from '../components/VirtualList';
import { EmptyState, ErrorBanner, Modal, PriorityBadge, StatusBadge } from '../components/ui';

const PAGE_SIZE = 50;
const ROW_HEIGHT = 52;
const SORTS = [
  ['id', 'ID'],
  ['title', 'Title'],
  ['priority', 'Priority'],
  ['type', 'Type'],
  ['updated_at', 'Last updated'],
  ['last_executed_at', 'Last executed'],
  ['last_status', 'Last result'],
];

function MultiSelect({ label, options, value, onChange }) {
  return (
    <details className="multiselect">
      <summary>
        {label}
        {value.length ? <span className="count">{value.length}</span> : null}
      </summary>
      <div className="multiselect-menu">
        {options.map((o) => (
          <label key={o} className="check">
            <input type="checkbox" checked={value.includes(o)} onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))} />
            {o}
          </label>
        ))}
      </div>
    </details>
  );
}

const Row = memo(function Row({ tc, style, selected, onToggle, selectable }) {
  return (
    <div className={`tc-row ${selected ? 'selected' : ''}`} style={style} role="row">
      {selectable && (
        <span role="cell">
          <input type="checkbox" aria-label={`Select test case ${tc.id}`} checked={selected} onChange={() => onToggle(tc.id)} />
        </span>
      )}
      <span role="cell" className="muted mono">
        #{tc.id}
      </span>
      <span role="cell" className="tc-title">
        <Link to={`/testcases/${tc.id}`}>{tc.title}</Link>
        <span className="tc-tags">
          {tc.tags.slice(0, 3).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </span>
      </span>
      <span role="cell">
        <PriorityBadge priority={tc.priority} />
      </span>
      <span role="cell" className="hide-sm">
        {tc.type}
      </span>
      <span role="cell" className="hide-sm">
        {tc.assignee_name || <span className="muted">Unassigned</span>}
      </span>
      <span role="cell">
        <StatusBadge status={tc.last_status} />
      </span>
      <span role="cell" className="muted hide-sm">
        {formatDate(tc.last_executed_at)}
      </span>
    </div>
  );
});

export default function TestCases() {
  const { projectId } = useProject();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [filters, setFilters] = useState(() => ({
    priority: params.get('priority')?.split(',').filter(Boolean) || [],
    type: params.get('type')?.split(',').filter(Boolean) || [],
    lastResult: params.get('lastResult')?.split(',').filter(Boolean) || [],
    tags: params.get('tags')?.split(',').filter(Boolean) || [],
    suiteId: params.get('suiteId') || '',
    assignedTo: params.get('assignedTo') || '',
    sort: params.get('sort') || 'id',
    order: params.get('order') || 'desc',
  }));
  const debouncedQ = useDebounced(q);
  const [list, setList] = useState({ items: [], total: 0, page: 0, loading: false, error: null });
  const [quick, setQuick] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState(null);
  const requestId = useRef(0);

  const { data: members } = useMembers(projectId);
  const { data: suites } = useSuites(projectId);
  const { data: tags } = useAsync(() => api.get('/api/testcases/tags', { projectId }).then((r) => r.data), [projectId]);

  const query = useMemo(() => ({ projectId, q: debouncedQ, ...filters, pageSize: PAGE_SIZE }), [projectId, debouncedQ, filters]);

  // Keep filters in the URL so views can be shared / bookmarked.
  useEffect(() => {
    const next = {};
    Object.entries({ q: debouncedQ, ...filters }).forEach(([k, v]) => {
      const s = Array.isArray(v) ? v.join(',') : v;
      if (s && !(k === 'sort' && s === 'id') && !(k === 'order' && s === 'desc')) next[k] = s;
    });
    setParams(next, { replace: true });
  }, [debouncedQ, filters, setParams]);

  const loadPage = useCallback(
    async (page) => {
      const id = ++requestId.current;
      setList((l) => ({ ...l, loading: true, error: null, ...(page === 1 ? { items: [], total: 0, page: 0 } : {}) }));
      try {
        const res = await api.get('/api/testcases', { ...query, page });
        if (id !== requestId.current) return;
        setList((l) => ({ items: page === 1 ? res.data : [...l.items, ...res.data], total: res.total, page, loading: false, error: null }));
      } catch (error) {
        if (id === requestId.current) setList((l) => ({ ...l, loading: false, error }));
      }
    },
    [query]
  );

  useEffect(() => {
    setSelected(new Set());
    loadPage(1);
  }, [loadPage]);

  const hasMore = list.items.length < list.total;
  const loadMore = useCallback(() => {
    if (!list.loading && hasMore) loadPage(list.page + 1);
  }, [list.loading, list.page, hasMore, loadPage]);

  // Instant client-side refinement of the loaded rows (no extra API calls), memoised.
  const visible = useMemo(() => {
    const needle = quick.trim().toLowerCase();
    if (!needle) return list.items;
    return list.items.filter((tc) => tc.title.toLowerCase().includes(needle) || tc.tags.some((t) => t.toLowerCase().includes(needle)) || String(tc.id) === needle);
  }, [list.items, quick]);

  const selectedStats = useMemo(() => {
    const rows = list.items.filter((tc) => selected.has(tc.id));
    return { count: rows.length, critical: rows.filter((r) => r.priority === 'Critical').length };
  }, [list.items, selected]);

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const allVisibleSelected = visible.length > 0 && visible.every((tc) => selected.has(tc.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((tc) => tc.id)));

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => {
    setQ('');
    setFilters({ priority: [], type: [], lastResult: [], tags: [], suiteId: '', assignedTo: '', sort: 'id', order: 'desc' });
  };

  const selectable = can('testcase:bulk');
  const renderRow = useCallback(
    (tc, i, style) => <Row key={tc.id} tc={tc} style={style} selected={selected.has(tc.id)} onToggle={toggle} selectable={selectable} />,
    [selected, toggle, selectable]
  );

  const runBulk = async (body) => {
    try {
      const res = await api.post('/api/testcases/bulk', { projectId, ids: [...selected], ...body });
      setNotice(`${res.affected} test case(s) updated (${body.action}).`);
      setBulk(null);
      setSelected(new Set());
      loadPage(1);
    } catch (err) {
      setNotice(errorText(err));
    }
  };

  const exportCsv = () => api.download('/api/testcases/export', { projectId }, 'testcases.csv').catch((err) => setNotice(errorText(err)));

  const filterCount = filters.priority.length + filters.type.length + filters.lastResult.length + filters.tags.length + (filters.suiteId ? 1 : 0) + (filters.assignedTo ? 1 : 0) + (q ? 1 : 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Test Cases</h1>
          <p className="muted">
            {list.total} matching · {list.items.length} loaded
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn btn-sm" onClick={exportCsv}>
            Export CSV
          </button>
          {can('testcase:import') && (
            <button type="button" className="btn btn-sm" onClick={() => setShowImport(true)}>
              Import CSV
            </button>
          )}
          {can('testcase:create') && (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/testcases/new')}>
              + New test case
            </button>
          )}
        </div>
      </div>

      <div className="filters card">
        <input className="search" type="search" placeholder="Search title, description or #id…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search test cases" />
        <MultiSelect label="Priority" options={PRIORITIES} value={filters.priority} onChange={setFilter('priority')} />
        <MultiSelect label="Type" options={TYPES} value={filters.type} onChange={setFilter('type')} />
        <MultiSelect label="Last result" options={[...RESULTS, 'Pending']} value={filters.lastResult} onChange={setFilter('lastResult')} />
        <MultiSelect label="Tags" options={tags || []} value={filters.tags} onChange={setFilter('tags')} />
        <select value={filters.suiteId} onChange={(e) => setFilter('suiteId')(e.target.value)} aria-label="Suite">
          <option value="">All suites</option>
          {(suites || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={filters.assignedTo} onChange={(e) => setFilter('assignedTo')(e.target.value)} aria-label="Assignee">
          <option value="">Any assignee</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          {(members || []).filter((m) => m.role !== 'read-only').map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={filters.sort} onChange={(e) => setFilter('sort')(e.target.value)} aria-label="Sort by">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              Sort: {l}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => setFilter('order')(filters.order === 'asc' ? 'desc' : 'asc')} aria-label="Toggle sort order">
          {filters.order === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
        {filterCount > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearFilters}>
            Clear ({filterCount})
          </button>
        )}
      </div>

      {notice && (
        <div className="alert alert-info" role="status">
          <span>{notice}</span>
          <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <ErrorBanner error={list.error} onRetry={() => loadPage(list.page + 1 || 1)} />

      {selectable && selected.size > 0 && (
        <div className="bulk-bar card" role="region" aria-label="Bulk actions">
          <strong>{selectedStats.count} selected</strong>
          {selectedStats.critical > 0 && <span className="muted">({selectedStats.critical} critical)</span>}
          <button type="button" className="btn btn-sm" onClick={() => setBulk('update-priority')}>
            Change priority
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setBulk('add-to-suite')}>
            Add to suite
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setBulk('assign')}>
            Assign
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setBulk('delete')}>
            Delete
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      <div className="card table-card">
        <div className="tc-toolbar">
          <input type="search" className="quick-filter" placeholder="Quick filter loaded rows…" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label="Quick filter" />
          <span className="muted small">Virtual scrolling · more rows load as you scroll</span>
        </div>
        <div className={`tc-row tc-head ${selectable ? '' : 'no-select'}`} role="row">
          {selectable && (
            <span>
              <input type="checkbox" aria-label="Select all loaded" checked={allVisibleSelected} onChange={toggleAll} />
            </span>
          )}
          <span>ID</span>
          <span>Title</span>
          <span>Priority</span>
          <span className="hide-sm">Type</span>
          <span className="hide-sm">Assignee</span>
          <span>Last result</span>
          <span className="hide-sm">Executed</span>
        </div>
        {!list.loading && !visible.length ? (
          <EmptyState title="No test cases match">{filterCount ? 'Try clearing some filters.' : can('testcase:create') ? 'Create the first one.' : ''}</EmptyState>
        ) : (
          <div className={selectable ? '' : 'no-select'}>
            <VirtualList
              items={visible}
              rowHeight={ROW_HEIGHT}
              height={Math.min(600, Math.max(visible.length, 4) * ROW_HEIGHT + 8)}
              renderRow={renderRow}
              hasMore={hasMore && !quick}
              loadingMore={list.loading}
              onEndReached={loadMore}
              footer={list.loading ? <div className="list-footer muted">Loading…</div> : null}
            />
          </div>
        )}
      </div>

      {bulk && <BulkModal action={bulk} count={selected.size} members={members || []} suites={suites || []} onClose={() => setBulk(null)} onSubmit={runBulk} />}
      {showImport && (
        <ImportModal
          projectId={projectId}
          onClose={() => setShowImport(false)}
          onDone={(n) => {
            setShowImport(false);
            setNotice(`Imported ${n} test case(s).`);
            loadPage(1);
          }}
        />
      )}
    </div>
  );
}

function BulkModal({ action, count, members, suites, onClose, onSubmit }) {
  const [value, setValue] = useState(action === 'update-priority' ? 'High' : '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const body = { action };
    if (action === 'update-priority') body.priority = value;
    if (action === 'add-to-suite') body.suiteId = Number(value);
    if (action === 'assign') body.assigneeId = value === '' ? null : Number(value);
    await onSubmit(body);
    setBusy(false);
  };
  const titles = { 'update-priority': 'Change priority', 'add-to-suite': 'Add to suite', assign: 'Assign test cases', delete: 'Delete test cases' };
  const disabled = busy || (action === 'add-to-suite' && !value);
  return (
    <Modal
      title={`${titles[action]} (${count})`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={`btn ${action === 'delete' ? 'btn-danger' : 'btn-primary'}`} disabled={disabled} onClick={submit}>
            {action === 'delete' ? 'Delete permanently' : 'Apply'}
          </button>
        </>
      }
    >
      {action === 'delete' && <p>This deletes {count} test case(s) with their steps and execution history. This cannot be undone.</p>}
      {action === 'update-priority' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Priority">
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      )}
      {action === 'add-to-suite' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Suite">
          <option value="">Choose a suite…</option>
          {suites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {action === 'assign' && (
        <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Assignee">
          <option value="">Unassign</option>
          {members.filter((m) => m.role !== 'read-only').map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.role})
            </option>
          ))}
        </select>
      )}
    </Modal>
  );
}

function ImportModal({ projectId, onClose, onDone }) {
  const [csv, setCsv] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800 * 1024) return setError('File is larger than 800 KB');
    file.text().then(setCsv);
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/api/testcases/import', { projectId, csv });
      onDone(res.imported);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Import test cases from CSV"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!csv || busy} onClick={submit}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <p className="muted small">
        Columns: <code>title</code> (required), <code>description</code>, <code>priority</code>, <code>type</code>, <code>preconditions</code>, <code>postconditions</code>,{' '}
        <code>tags</code> (separated by <code>;</code>), <code>steps</code> (one per line: <code>action -&gt; expected</code>). The export format can be re-imported.
      </p>
      <ErrorBanner error={error} />
      <input type="file" accept=".csv,text/csv" onChange={onFile} />
      <textarea rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'title,priority,type,tags,steps\n"Login works",High,Functional,auth;smoke,"Open login -> Form shown"'} />
    </Modal>
  );
}
