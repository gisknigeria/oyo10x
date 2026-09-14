import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, naira, num, LEVEL_LABEL } from '../lib/api.js';
import { Card, Loading, Empty, Alert, Stat } from '../components/ui.jsx';

const GATE_LABEL = {
  baseline: 'under 10 activations',
  own_tasks: 'own tasks outstanding',
  downline_tasks: 'downline tasks outstanding',
};

export default function Payroll() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [level, setLevel] = useState('');

  useEffect(() => {
    api.get('/payroll').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Loading label="Calculating points and eligibility" />;

  const rows = data.rows.filter((r) => {
    if (level && r.level !== level) return false;
    if (filter === 'eligible') return r.eligible;
    if (filter === 'blocked') return !r.eligible;
    return true;
  });

  const withheld = data.rows.filter((r) => !r.eligible)
    .reduce((a, r) => a + r.capped_points * data.naira_per_point, 0);

  const blockCounts = data.rows.filter((r) => !r.eligible)
    .flatMap((r) => r.blocked_by)
    .reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {});

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="On the payroll" value={num(data.summary.members)}
              foot="Verified Ambassadors, Champions and Mobilisers" />
        <Stat label="Eligible for payment" value={num(data.summary.eligible)} accent
              foot={num(data.summary.blocked) + ' blocked by an unmet gate'}
              progress={data.summary.members
                ? (data.summary.eligible / data.summary.members) * 100 : 0} />
        <Stat label="Payable this period" value={naira(data.summary.total_naira)}
              foot={num(data.summary.total_points) + ' verified points'} />
        <Stat label="Withheld" value={naira(withheld)}
              foot="Points earned but gates not cleared" />
      </div>

      <Alert type="info" title="How payment is decided. ">
        A member is paid only when all three gates pass: at least{' '}
        <strong>10 verified activations</strong>, all of their own{' '}
        <strong>mandatory tasks approved</strong>, and every one of their verified
        downline members has <strong>cleared their tasks too</strong>. Points are
        then capped by level — Mobiliser {data.caps.mobiliser.points}, Champion{' '}
        {data.caps.champion.points}, Ambassador {data.caps.ambassador.points} points
        per month. Unearned points are never paid.
      </Alert>

      <div className="toolbar">
        <div className="pill-row">
          {[['all', 'All'], ['eligible', 'Eligible'], ['blocked', 'Blocked']].map(([v, l]) => (
            <button key={v} className={'pill' + (filter === v ? ' active' : '')}
                    onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Any level</option>
          {data.levels.map((l) => (
            <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
          ))}
        </select>
        <div className="spacer" />
        <span className="muted">{num(rows.length)} shown</span>
        <button className="btn sm secondary"
                onClick={() => downloadCsv('/export/payroll.csv',
                  'oyo10x-payroll-' + data.period + '.csv')}>
          Export payment schedule
        </button>
      </div>

      {Object.keys(blockCounts).length > 0 && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          {Object.entries(blockCounts).map(([k, n]) => (
            <Stat key={k} label={'Blocked — ' + GATE_LABEL[k]} value={num(n)} />
          ))}
        </div>
      )}

      <Card title={'Payment schedule · ' + data.period}
            note="Bank details are shown so the schedule can be handed to finance"
            bodyClass="">
        {rows.length === 0 ? (
          <Empty title="Nobody matches this filter" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th><th>Level</th><th>LGA / Ward</th>
                  <th className="num">Activated</th>
                  <th className="num">Points</th>
                  <th>Blocked by</th>
                  <th>Bank</th>
                  <th className="num">Payable</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 400).map((r) => (
                  <tr key={r.member_id}>
                    <td>
                      <Link to={'/members/' + r.member_id} style={{ fontWeight: 600 }}>
                        {r.name}
                      </Link>
                      <div className="muted mono" style={{ fontSize: 12 }}>{r.code}</div>
                    </td>
                    <td><span className="badge">{LEVEL_LABEL[r.level]}</span></td>
                    <td>
                      <div>{r.lga}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.ward}</div>
                    </td>
                    <td className="num">
                      <span className={'badge ' + (r.verified_downline >= 10 ? 'green' : 'amber')}>
                        {r.verified_downline}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {r.capped_points}
                      {r.raw_points > r.capped_points && (
                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>
                          {r.raw_points} before cap
                        </div>
                      )}
                    </td>
                    <td>
                      {r.eligible
                        ? <span className="badge green"><span className="dot" />clear</span>
                        : r.blocked_by.map((b) => (
                            <div key={b} className="badge amber" style={{ marginBottom: 2 }}>
                              {GATE_LABEL[b]}
                            </div>
                          ))}
                    </td>
                    <td>
                      <div style={{ fontSize: 12 }}>{r.bank_name}</div>
                      <div className="muted mono" style={{ fontSize: 12 }}>{r.account_number}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 700,
                        color: r.eligible ? 'var(--green-700)' : 'var(--ink-400)' }}>
                      {naira(r.amount_naira)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 400 && (
              <div className="card-body muted">
                Showing the first 400 rows. Export the CSV for the full schedule.
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
