import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, naira, num, timeAgo, LEVEL_LABEL } from '../lib/api.js';
import { Card, Status, Loading, Alert, CheckRow, Empty, Field } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const CHECK_NAMES = {
  phone: 'Phone number format',
  nin_format: 'NIN format',
  pvc_format: 'PVC / VIN format',
  account_format: 'Account number format',
  duplicates: 'Duplicate detection',
  location: 'Location inside Oyo State',
  voter_roll: 'INEC voter roll match',
  nin_identity: 'NIN identity (NIMC)',
  bank: 'Bank account name',
};

export default function MemberDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(null);

  const load = () => api.get('/members/' + id).then(setData).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); }, [id]);

  const review = async (status) => {
    setBusy(true);
    try {
      await api.post('/members/' + id + '/review', { status, note });
      setNote('');
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const recheck = async () => {
    setBusy(true);
    try { await api.post('/members/' + id + '/recheck'); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const createLogin = async () => {
    setBusy(true); setError('');
    try { setLogin(await api.post('/members/' + id + '/login')); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Loading label="Loading member" />;

  const { member: m, downline, downline_rows, eligibility: el, points, submissions } = data;
  const checks = m.checks || {};
  const flags = m.flags || [];
  const canReview = me.permissions.can_review;

  return (
    <>
      <div className="toolbar">
        <button className="btn sm secondary" onClick={() => navigate(-1)}>← Back</button>
        <div className="spacer" />
        <button className="btn sm secondary" onClick={createLogin} disabled={busy}>
          Create login
        </button>
        {me.permissions.is_admin && (
          <button className="btn sm secondary" onClick={recheck} disabled={busy}>
            Re-run checks
          </button>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
        <div>
          <Card
            title={(m.title ? m.title + ' ' : '') + m.first_name + ' ' + m.last_name}
            note={m.code + ' · ' + (LEVEL_LABEL[m.level] || m.level)}
            actions={<Status value={m.status} />}
          >
            {login && (
              <Alert type="success" title="Login created. ">
                Username: <code>{login.username}</code><br />
                Temporary password: <code>{login.password}</code><br />
                Share these details securely. The member must change the password after signing in.
              </Alert>
            )}
            <dl className="kv">
              <dt>Phone</dt><dd className="mono">{m.phone}</dd>
              <dt>Designation</dt><dd>{m.designation || '--'}</dd>
              <dt>LGA</dt><dd>{m.lga}</dd>
              <dt>Ward</dt><dd>{m.ward}</dd>
              <dt>Polling unit</dt><dd>{m.polling_unit}</dd>
              <dt>PVC / VIN</dt><dd className="mono">{m.pvc_no || '--'}</dd>
              <dt>NIN</dt><dd className="mono">{m.nin || '--'}</dd>
              <dt>Bank</dt><dd>{m.bank_name || '--'}</dd>
              <dt>Account</dt>
              <dd className="mono">
                {m.account_number || '--'}
                {m.account_name && <span className="muted"> · {m.account_name}</span>}
              </dd>
              <dt>Registered</dt><dd>{new Date(m.created_at).toLocaleString('en-NG')}</dd>
              <dt>GPS</dt>
              <dd className="mono">
                {m.lat != null
                  ? m.lat.toFixed(5) + ', ' + m.lng.toFixed(5) + ' (±' + (m.accuracy || '?') + 'm)'
                  : 'not captured'}
              </dd>
              {m.review_note && (<><dt>Review note</dt><dd>{m.review_note}</dd></>)}
            </dl>
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Verification checks"
                note={'Risk score ' + m.risk_score + ' / 100'}>
            {flags.length > 0 && (
              <Alert type={m.risk_score >= 50 ? 'error' : 'warn'}
                     title={flags.length + ' issue(s) raised. '}>
                <ul>{flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
              </Alert>
            )}
            {Object.keys(checks).length === 0
              ? <Empty title="No checks recorded" />
              : Object.entries(checks).map(([k, v]) => (
                  <CheckRow key={k} name={CHECK_NAMES[k] || k} result={v} />
                ))}
          </Card>

          {canReview && (
            <>
              <div style={{ height: 14 }} />
              <Card title="Review this registration"
                    note="Verifying a member counts them toward their upline's activation total">
                <Field label="Note (optional)">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                            placeholder="Reason for the decision, or what was confirmed" />
                </Field>
                <div className="btn-row">
                  <button className="btn" disabled={busy || m.status === 'verified'}
                          onClick={() => review('verified')}>
                    {busy && <span className="spinner" />} Mark verified
                  </button>
                  <button className="btn danger" disabled={busy || m.status === 'rejected'}
                          onClick={() => review('rejected')}>
                    Reject
                  </button>
                  <button className="btn secondary" disabled={busy || m.status === 'pending'}
                          onClick={() => review('pending')}>
                    Send back to pending
                  </button>
                </div>
              </Card>
            </>
          )}
        </div>

        <div>
          <Card title="Payment eligibility"
                note={'Period ' + el.period + ' · ' + (LEVEL_LABEL[el.level] || el.level)}>
            <>
                {Object.entries(el.gates).map(([key, g]) => (
                  <div key={key} className={'gate ' + (g.pass ? 'pass' : 'fail')}>
                    <div className={'check-icon ' + (g.pass ? 'pass' : 'fail')}>
                      {g.pass ? '✓' : '✕'}
                    </div>
                    <div className="gate-text">
                      <div className="gate-title">
                        {key === 'baseline' && 'Activation baseline'}
                        {key === 'own_tasks' && 'Own mandatory tasks'}
                        {key === 'downline_tasks' && 'Downline tasks complete'}
                      </div>
                      <div className="gate-detail">{g.detail}</div>
                    </div>
                  </div>
                ))}

                <div className="grid grid-2" style={{ marginTop: 14, gap: 10 }}>
                  <div className="stat">
                    <div className="stat-label">Points this period</div>
                    <div className="stat-value">{el.capped_points}</div>
                    <div className="stat-foot">
                      cap {el.point_cap}
                      {el.capped_by_ceiling && ' · ' + el.raw_points + ' earned before cap'}
                    </div>
                  </div>
                  <div className="stat stat-accent">
                    <div className="stat-label">{el.eligible ? 'Payable' : 'Withheld'}</div>
                    <div className="stat-value">{naira(el.amount_naira)}</div>
                    <div className="stat-foot">
                      {el.eligible ? 'All gates passed'
                        : 'Would be ' + naira(el.potential_naira) + ' if gates cleared'}
                    </div>
                  </div>
                </div>

                {el.gates.downline_tasks.laggards?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="section-title">Downline still outstanding</div>
                    {el.gates.downline_tasks.laggards.slice(0, 8).map((l) => (
                      <div key={l.id} className="check-row">
                        <div className="check-icon warn">!</div>
                        <div style={{ flex: 1 }}>
                          <div className="check-label">
                            <Link to={'/members/' + l.id}>{l.name}</Link>
                          </div>
                          <div className="check-detail">
                            {l.outstanding} task(s) outstanding
                          </div>
                        </div>
                      </div>
                    ))}
                    {el.gates.downline_tasks.laggards.length > 8 && (
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                        and {el.gates.downline_tasks.laggards.length - 8} more
                      </div>
                    )}
                  </div>
                )}
            </>
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Activations"
                note={num(downline.verified) + ' verified of ' + num(downline.total) + ' registered'}
                bodyClass="">
            {downline_rows.length === 0 ? (
              <Empty title="No one activated yet">
                This member has not yet registered anyone below them.
              </Empty>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Name</th><th>Level</th><th>Polling unit</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {downline_rows.map((d) => (
                      <tr key={d.id}>
                        <td><Link to={'/members/' + d.id}>{d.first_name} {d.last_name}</Link></td>
                        <td><span className="badge">{LEVEL_LABEL[d.level] || d.level}</span></td>
                        <td className="muted">{d.polling_unit}</td>
                        <td><Status value={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Points earned" note={'Period ' + el.period} bodyClass="">
            {points.length === 0 ? (
              <Empty title="No points yet">
                Points come from approved task submissions and verified activations above 10.
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Source</th><th className="num">Entries</th><th className="num">Points</th></tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.source}>
                        <td style={{ textTransform: 'capitalize' }}>{p.source}</td>
                        <td className="num">{p.entries}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{p.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Task submissions" bodyClass="">
            {submissions.length === 0 ? <Empty title="No submissions" /> : (
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Task</th><th>Status</th><th className="num">Points</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.task_title}</td>
                        <td><Status value={s.status} /></td>
                        <td className="num">{s.points_awarded || '--'}</td>
                        <td className="muted nowrap">{timeAgo(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
