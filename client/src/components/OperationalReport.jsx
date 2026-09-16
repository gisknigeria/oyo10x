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
      ['Incomplete location', report.missing_location],
      ['Incomplete payment details', report.incomplete_payment],
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
        <Stat label="Registered people" value={num(report.total)} foot="All verification statuses" />
        <Stat label="Verification rate" value={pct(data.totals.verified, report.total) + '%'} foot={num(data.totals.verified) + ' verified records'} />
        <Stat label="Reviews over 7 days" value={num(report.overdue_reviews)} foot="Pending or flagged since registration" />
        <Stat label="High verification risk" value={num(data.high_risk)} foot="Automated check score ≥ 50; requires review" />
      </div>
      <div className="grid grid-2">
        <div>
          <h3>Verification status</h3>
          {report.statuses.length ? report.statuses.map((s) => <Bar key={s.status} label={s.status} value={s.n} max={report.total} display={num(s.n)} />)
            : <p className="muted">No registered records in this scope.</p>}
        </div>
        <div>
          <h3>Record completeness</h3>
          <Bar label="Missing phone" value={report.missing_phone} max={report.total} display={num(report.missing_phone)} />
          <Bar label="Incomplete location" value={report.missing_location} max={report.total} display={num(report.missing_location)} />
          <Bar label="Incomplete payment details" value={report.incomplete_payment} max={report.total} display={num(report.incomplete_payment)} />
          <p className="muted">Counts may overlap. Completeness does not confirm validity.</p>
          <p className="muted">Oldest outstanding registration: {report.oldest_review ? new Date(report.oldest_review).toLocaleDateString() : 'None'}.</p>
        </div>
      </div>
      <h3>Submission review status</h3>
      <p className="muted">All recorded submissions for members in this scope.</p>
      {data.submissions.length ? data.submissions.map((s) => <Bar key={s.status} label={s.status}
        value={s.n} max={data.submissions.reduce((total, item) => total + item.n, 0)} display={num(s.n)} />)
        : <p className="muted">No submissions recorded yet.</p>}
    </Card>
  </div>;
}
