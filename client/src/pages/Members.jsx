import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, num, timeAgo, LEVEL_LABEL } from '../lib/api.js';
import { Card, Status, Loading, Empty, Alert } from '../components/ui.jsx';

const STATUSES = ['', 'pending', 'verified', 'flagged', 'rejected'];
const LEVELS = ['', 'ambassador', 'champion', 'mobiliser', 'participant'];
const PAGE = 100;

export default function Members() {
  const [geo, setGeo] = useState(null);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', level: '', lga: '', ward: '' });
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get('/geo').then(setGeo).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: PAGE, offset });
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    try {
      setData(await api.get('/members?' + qs));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filters, offset]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setOffset(0);
    setFilters((f) => (k === 'lga' ? { ...f, lga: v, ward: '' } : { ...f, [k]: v }));
  };

  const wards = geo && filters.lga ? (geo.wards[filters.lga] || []) : [];

  return (
    <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <div className="toolbar">
        <input type="text" placeholder="Search name, phone, code or polling unit"
               value={filters.q} onChange={set('q')} style={{ minWidth: 280 }} />
        <select value={filters.status} onChange={set('status')}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'Any status'}</option>)}
        </select>
        <select value={filters.level} onChange={set('level')}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l ? LEVEL_LABEL[l] : 'Any level'}</option>
          ))}
        </select>
        {geo && (
          <select value={filters.lga} onChange={set('lga')}>
            <option value="">Any LGA</option>
            {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {wards.length > 0 && (
          <select value={filters.ward} onChange={set('ward')}>
            <option value="">Any ward</option>
            {wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        )}
        <div className="spacer" />
        <button className="btn secondary sm"
                onClick={() => downloadCsv('/export/members.csv', 'oyo10x-members.csv')}>
          Export CSV
        </button>
      </div>

      <Card
        title={data ? num(data.total) + ' member' + (data.total === 1 ? '' : 's') : 'Members'}
        note="Records you can see are limited to your constituency or network branch"
        bodyClass=""
      >
        {loading && !data ? <Loading /> : !data || data.rows.length === 0 ? (
          <Empty title="No members match these filters">
            Adjust the filters, or register someone from the Register member page.
          </Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th><th>Name</th><th>Phone</th><th>Level</th>
                    <th>LGA / Ward</th><th>Polling unit</th>
                    <th>Registered by</th><th>Status</th><th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.code}</td>
                      <td style={{ fontWeight: 600 }}>
                        <Link to={'/members/' + m.id}>
                          {m.title ? m.title + ' ' : ''}{m.first_name} {m.last_name}
                        </Link>
                      </td>
                      <td className="mono">{m.phone}</td>
                      <td><span className="badge">{LEVEL_LABEL[m.level] || m.level}</span></td>
                      <td>
                        <div>{m.lga}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{m.ward}</div>
                      </td>
                      <td className="muted">{m.polling_unit}</td>
                      <td className="muted">{m.upline_name || '--'}</td>
                      <td>
                        <Status value={m.status} />
                        {m.risk_score >= 50 && (
                          <span className="badge red" style={{ marginLeft: 4 }}>
                            risk {m.risk_score}
                          </span>
                        )}
                      </td>
                      <td className="muted nowrap">{timeAgo(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total > PAGE && (
              <div className="card-body" style={{ borderTop: '1px solid var(--ink-200)' }}>
                <div className="btn-row">
                  <button className="btn sm secondary" disabled={offset === 0}
                          onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                    Previous
                  </button>
                  <span className="muted">
                    {offset + 1}–{Math.min(offset + PAGE, data.total)} of {num(data.total)}
                  </span>
                  <button className="btn sm secondary"
                          disabled={offset + PAGE >= data.total}
                          onClick={() => setOffset(offset + PAGE)}>
                    Next
                  </button>
                  {loading && <span className="spinner dark" />}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
