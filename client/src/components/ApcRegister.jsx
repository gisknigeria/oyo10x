import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, num, pct, LEVEL_LABEL } from '../lib/api.js';
import { Card, Loading, Empty, Alert, Stat } from './ui.jsx';

const PAGE = 100;
const ON_10X = [
  ['', 'Everyone'],
  ['yes', 'Also on 10X'],
  ['no', 'Not on 10X yet'],
];

/**
 * The APC membership register, compared with the 10X network. "On 10X" means
 * a 10X member has the same phone number as the APC record.
 */
export default function ApcRegister({ geo }) {
  const [filters, setFilters] = useState({ q: '', on_10x: '', lga: '', ward: '' });
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const query = useCallback((extra = {}) => {
    const qs = new URLSearchParams(extra);
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    return qs;
  }, [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Debounce typing in the search box; everything else is a click.
    const timer = setTimeout(() => {
      api.get('/apc-members?' + query({ limit: PAGE, offset }))
        .then((d) => { if (active) { setData(d); setError(''); } })
        .catch((e) => { if (active) setError(e.message); })
        .finally(() => { if (active) setLoading(false); });
    }, filters.q ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [query, offset, filters.q]);

  const set = (k, v) => {
    setOffset(0);
    setFilters((f) => (k === 'lga' ? { ...f, lga: v, ward: '' } : { ...f, [k]: v }));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const name = filters.on_10x === 'no' ? 'apc-not-on-10x.csv'
        : filters.on_10x === 'yes' ? 'apc-on-10x.csv' : 'apc-register.csv';
      await downloadCsv('/apc-members?' + query({ format: 'csv' }), name);
    } catch (e) { setError(e.message); } finally { setExporting(false); }
  };

  const wards = geo && filters.lga ? (geo.wards[filters.lga] || []) : [];
  const s = data?.summary;

  return (
    <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {s && (
        <div className="grid grid-3" style={{ marginBottom: 16 }}>
          <Stat label="On the APC register" value={num(s.total)} accent
                foot={filters.lga || filters.q ? 'matching these filters' : 'in your area'} />
          <Stat label="Also on 10X" value={num(s.on_10x)}
                foot={pct(s.on_10x, s.total) + '% of the APC register'} />
          <Stat label="Not on 10X yet" value={num(s.not_on_10x)}
                foot="people to bring into the network" />
        </div>
      )}

      <div className="pill-row" style={{ marginBottom: 12 }}>
        {ON_10X.map(([value, label]) => (
          <button key={value || 'all'} className={'pill' + (filters.on_10x === value ? ' active' : '')}
                  onClick={() => set('on_10x', value)}>
            {label}
            {s && <span className="badge tiny">
              {num(value === 'yes' ? s.on_10x : value === 'no' ? s.not_on_10x : s.total)}
            </span>}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input type="text" placeholder="Search name, phone or membership number"
               value={filters.q} onChange={(e) => set('q', e.target.value)} style={{ minWidth: 280 }} />
        {geo && (
          <select value={filters.lga} onChange={(e) => set('lga', e.target.value)}>
            <option value="">Any LGA</option>
            {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {wards.length > 0 && (
          <select value={filters.ward} onChange={(e) => set('ward', e.target.value)}>
            <option value="">Any ward</option>
            {wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        )}
        <div className="spacer" />
        <button className="btn sm secondary" onClick={exportCsv} disabled={exporting || !data?.total}>
          {exporting && <span className="spinner dark" />} Export CSV
        </button>
      </div>

      <Card title={data ? num(data.total) + ' APC member' + (data.total === 1 ? '' : 's') : 'APC register'}
            note="Matched to 10X by phone number. Loaded from the APC all-LGA membership export."
            bodyClass="">
        {loading && !data ? <Loading label="Loading the APC register" /> : !data || data.rows.length === 0 ? (
          <Empty title="Nobody matches these filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Membership no.</th><th>Name</th><th>Phone</th>
                    <th>LGA / Ward</th><th>Registered</th><th>On 10X</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.membership_no || '—'}</td>
                      <td style={{ fontWeight: 600 }}>
                        {[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')}
                      </td>
                      <td className="mono">{r.phone || '—'}</td>
                      <td>
                        <div>{r.lga}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.ward || r.ward_raw || 'Ward not given'}
                          {!r.ward && r.ward_raw && <span className="badge amber" style={{ marginLeft: 4 }}>unmatched</span>}
                        </div>
                      </td>
                      <td className="muted nowrap">{r.registered_on || '—'}</td>
                      <td>
                        {r.member ? (
                          <>
                            <span className="badge green"><span className="dot" />yes</span>
                            <div style={{ fontSize: 12 }}>
                              <Link to={'/members/' + r.member.id}>{r.member.code}</Link>
                              {' · '}{LEVEL_LABEL[r.member.level] || (r.member.level === 'grassroot' ? 'Grassroot' : r.member.level)}
                            </div>
                          </>
                        ) : <span className="badge">no</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total > PAGE && (
              <div className="card-body" style={{ borderTop: '1px solid var(--ink-200)' }}>
                <div className="btn-row">
                  <button className="btn sm secondary" disabled={offset === 0}
                          onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
                  <span className="muted">
                    {num(offset + 1)}–{num(Math.min(offset + PAGE, data.total))} of {num(data.total)}
                  </span>
                  <button className="btn sm secondary" disabled={offset + PAGE >= data.total}
                          onClick={() => setOffset(offset + PAGE)}>Next</button>
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
