import React from 'react';
import { Card, Stat, Bar } from './ui.jsx';
import { num, pct } from '../lib/api.js';

export default function OperationalReport({ data, isAdmin = false }) {
  const report = data.report;
  if (!report) return null;
  function exportReport() {
    const rows = [
      ['Metric', 'Count'],
      ['Registered members', report.total],
      ...report.statuses.map((s) => ['Status: ' + s.status, s.n]),
      ['Reviews waiting over 7 days', report.overdue_reviews],
      ['Missing phone', report.missing_phone],
      ...data.submissions.map((s) => ['Submission status: ' + s.status, s.n]),
    ];
    const csv = rows.map((r) => r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'administrative-report-' + report.generated_at.slice(0, 10) + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div style={{ marginBottom: 20 }}>
    <Card title={isAdmin ? 'Statewide administrative intelligence' : 'Jurisdiction administrative intelligence'}
      note={(isAdmin ? 'All jurisdictions' : 'Your authorised jurisdiction') + ' · All registered records · Updated ' + new Date(report.generated_at).toLocaleString()}
      actions={<button className="btn sm secondary" onClick={exportReport}>Download summary</button>}>
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <Stat label="Registered people" value={num(report.total)} foot="All registered records" />
        <Stat label="Verification rate" value={pct(data.totals.verified, report.total) + '%'} foot={num(data.totals.verified) + ' verified records'} />
        <Stat label="Reviews over 7 days" value={num(report.overdue_reviews)} foot="Pending or flagged since registration" />
        <Stat label="High verification risk" value={num(data.high_risk)} foot="Automated check score ≥ 50; requires review" />
      </div>
      <h3>Submission review status</h3>
      <p className="muted">All recorded submissions for members in this scope.</p>
      {data.submissions.length ? data.submissions.map((s) => <Bar key={s.status} label={s.status}
        value={s.n} max={data.submissions.reduce((total, item) => total + item.n, 0)} display={num(s.n)} />)
        : <p className="muted">No submissions recorded yet.</p>}
    </Card>
  </div>;
}
