import { memo, useCallback, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { STATUS_COLORS } from '../../lib/constants';

const axis = { stroke: 'var(--muted)', fontSize: 12 };
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' },
  labelStyle: { color: 'var(--text)', fontWeight: 600 },
};

// Legend click toggles a series on/off.
function useToggle() {
  const [hidden, setHidden] = useState(() => new Set());
  const toggle = useCallback((key) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  return [hidden, toggle];
}

// Legend labels are struck through when their series is hidden.
const legendFormatter = (hidden) =>
  function LegendLabel(value, entry) {
    const key = entry?.dataKey ?? value;
    const off = hidden.has(key);
    return <span style={{ color: off ? 'var(--muted)' : 'var(--text)', textDecoration: off ? 'line-through' : 'none' }}>{value}</span>;
  };

export const StatusPie = memo(function StatusPie({ summary }) {
  const [hidden, toggle] = useToggle();
  const data = useMemo(
    () => ['Pass', 'Fail', 'Blocked', 'Skipped', 'Pending'].map((s) => ({ name: s, value: hidden.has(s) ? 0 : summary[s] || 0 })),
    [summary, hidden]
  );
  const legendPayload = useMemo(() => ['Pass', 'Fail', 'Blocked', 'Skipped', 'Pending'].map((s) => ({ value: s, type: 'circle', color: STATUS_COLORS[s], id: s })), []);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={STATUS_COLORS[d.name]} stroke="var(--surface)" />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} test cases`, n]} />
        <Legend payload={legendPayload} onClick={(e) => toggle(e.value)} formatter={legendFormatter(hidden)} wrapperStyle={{ cursor: 'pointer' }} />
      </PieChart>
    </ResponsiveContainer>
  );
});

export const TrendLine = memo(function TrendLine({ trend, mode }) {
  const [hidden, toggle] = useToggle();
  const data = useMemo(() => trend.map((t) => ({ ...t, label: t.date.slice(5) })), [trend]);
  const series = mode === 'rate' ? [['passRate', 'Pass rate %', STATUS_COLORS.Pass]] : [['Pass', 'Pass', STATUS_COLORS.Pass], ['Fail', 'Fail', STATUS_COLORS.Fail], ['Blocked', 'Blocked', STATUS_COLORS.Blocked], ['Skipped', 'Skipped', STATUS_COLORS.Skipped]];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={axis} stroke="var(--border)" interval="preserveStartEnd" minTickGap={16} />
        <YAxis tick={axis} stroke="var(--border)" allowDecimals={false} domain={mode === 'rate' ? [0, 100] : [0, 'auto']} />
        <Tooltip {...tooltipStyle} />
        <Legend onClick={(e) => toggle(e.dataKey)} formatter={legendFormatter(hidden)} wrapperStyle={{ cursor: 'pointer' }} />
        {series.map(([key, name, color]) => (
          <Line key={key} type="monotone" dataKey={key} name={name} stroke={color} strokeWidth={2} dot={false} hide={hidden.has(key)} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
});

export const RateBar = memo(function RateBar({ rows, dimension }) {
  const [hidden, toggle] = useToggle();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={dimension} tick={axis} stroke="var(--border)" />
        <YAxis tick={axis} stroke="var(--border)" unit="%" domain={[0, 100]} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v}%`, n]} />
        <Legend onClick={(e) => toggle(e.dataKey)} formatter={legendFormatter(hidden)} wrapperStyle={{ cursor: 'pointer' }} />
        <Bar dataKey="passRate" name="Pass rate" fill={STATUS_COLORS.Pass} radius={[4, 4, 0, 0]} hide={hidden.has('passRate')} isAnimationActive={false} />
        <Bar dataKey="failRate" name="Fail rate" fill={STATUS_COLORS.Fail} radius={[4, 4, 0, 0]} hide={hidden.has('failRate')} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
});

export const TesterBar = memo(function TesterBar({ rows }) {
  const [hidden, toggle] = useToggle();
  const data = useMemo(() => rows.map((r) => ({ ...r, pending: Math.max(r.assigned - r.executed, 0) })), [rows]);
  const series = [
    ['passed', 'Passed', STATUS_COLORS.Pass],
    ['failed', 'Failed', STATUS_COLORS.Fail],
    ['blocked', 'Blocked', STATUS_COLORS.Blocked],
    ['skipped', 'Skipped', STATUS_COLORS.Skipped],
    ['pending', 'Not executed', STATUS_COLORS.Pending],
  ];
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 44 + 80)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={axis} stroke="var(--border)" allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axis} stroke="var(--border)" width={96} />
        <Tooltip {...tooltipStyle} />
        <Legend onClick={(e) => toggle(e.dataKey)} formatter={legendFormatter(hidden)} wrapperStyle={{ cursor: 'pointer' }} />
        {series.map(([key, name, color]) => (
          <Bar key={key} dataKey={key} name={name} stackId="t" fill={color} hide={hidden.has(key)} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
});

export const DefectBar = memo(function DefectBar({ rows }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="priority" tick={axis} stroke="var(--border)" />
        <YAxis tick={axis} stroke="var(--border)" allowDecimals />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [v, n]} />
        <Bar dataKey="density" name="Defects per test case" fill="#7c3aed" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
});
