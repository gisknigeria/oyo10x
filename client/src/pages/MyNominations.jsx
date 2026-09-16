import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, num, timeAgo } from '../lib/api.js';
import { Card, Stat, Status, Loading, Empty, Alert, Field } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const BLANK = {
  first_name: '', last_name: '', phone: '', lga: '', ward: '', polling_unit: '',
  pvc_no: '', nin: '', bank_name: '', account_number: '', account_name: '',
};

function NominationTracker({ nomination, onNominated }) {
  if (!nomination) return null;
  const percent = nomination.quota ? Math.min(100, (nomination.count / nomination.quota) * 100) : 0;

  return (
    <div style={{ marginBottom: 16 }}>
      <Card title="Unit Promoter nominations"
            note="Required by the Campaign Council directive of 9 September 2026">
        <div className="grid grid-2" style={{ gap: 20, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1,
                          color: nomination.complete ? 'var(--green-700)' : 'var(--ink-900)' }}>
              {nomination.count}
              <span style={{ fontSize: 17, color: 'var(--ink-500)', fontWeight: 500 }}>
                {' '}of {nomination.quota} nominated
              </span>
            </div>
            <div className="progress" style={{ marginTop: 10 }}>
              <div className={'progress-bar' + (nomination.complete ? '' : ' warn')}
                   style={{ width: percent + '%' }} />
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              {nomination.complete
                ? 'Requirement complete.'
                : nomination.remaining + ' more nomination(s) needed to meet your quota.'}
            </div>
          </div>
          <div>
            {nomination.complete ? (
              <Alert type="success">
                You have nominated the required number of Unit Promoters.
              </Alert>
            ) : (
              <Alert type="warn">
                Nominate {nomination.remaining} more Unit Promoter{nomination.remaining === 1 ? '' : 's'} —
                with LGA, Ward, Polling Unit, PVC number and account details for each.
              </Alert>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function AddNomineeForm({ geo, onAdded }) {
  const [form, setForm] = useState(BLANK);
  const [gps, setGps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude,
                         accuracy: Math.round(pos.coords.accuracy) }),
      () => {}
    );
  }, []);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => (k === 'lga' ? { ...f, lga: v, ward: '' } : { ...f, [k]: v }));
  };

  const wards = geo.wards[form.lga] || [];
  const pollingUnits = (geo.polling_units?.[form.lga]?.[form.ward]) || [];
  const required = ['first_name', 'last_name', 'phone', 'lga', 'ward', 'polling_unit'];
  const ready = required.every((k) => String(form[k] || '').trim());

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api.post('/members', { ...form, level: 'mobiliser', ...(gps || {}) });
      setResult(res);
      setForm(BLANK);
      onAdded();
    } catch (err) {
      setError(err.data?.flags?.map((f) => f.message).join(' · ') || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add a nominee"
          note="Every nominee gets their own login automatically, shown once below">
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {result && (
        <Alert type="success" title="Nominee added. " onClose={() => setResult(null)}>
          <div style={{ marginTop: 4 }}>
            Reference <strong className="mono">{result.code}</strong> — status{' '}
            <Status value={result.status} />
            {result.login && (
              <div className="login-credentials">
                <strong>Nominee login</strong><br />
                Username: <code>{result.login.username}</code><br />
                Temporary password: <code>{result.login.password}</code><br />
                <span className="muted">Share this with them — it is shown only once.</span>
              </div>
            )}
          </div>
        </Alert>
      )}

      <form onSubmit={submit}>
        <div className="grid grid-3">
          <Field label="First name" required>
            <input type="text" value={form.first_name} onChange={set('first_name')} />
          </Field>
          <Field label="Last name" required>
            <input type="text" value={form.last_name} onChange={set('last_name')} />
          </Field>
          <Field label="Phone number" required hint="Nigerian mobile">
            <input type="text" value={form.phone} onChange={set('phone')}
                   placeholder="08031234567" maxLength={14} />
          </Field>
        </div>
        <div className="grid grid-3">
          <Field label="LGA" required>
            <select value={form.lga} onChange={set('lga')}>
              <option value="">Select an LGA</option>
              {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Ward" required>
            <select value={form.ward} onChange={set('ward')} disabled={!form.lga}>
              <option value="">Select a ward</option>
              {wards.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </Field>
          <Field label="Polling unit" required>
            <select value={form.polling_unit}
                    onChange={(e) => setForm((f) => ({ ...f, polling_unit: e.target.value }))}
                    disabled={!form.ward}>
              <option value="">Select a polling unit</option>
              {pollingUnits.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-3">
          <Field label="PVC / VIN" hint="19 characters">
            <input type="text" value={form.pvc_no}
                   onChange={(e) => setForm((f) => ({ ...f, pvc_no: e.target.value.toUpperCase() }))}
                   maxLength={19} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Bank">
            <select value={form.bank_name} onChange={set('bank_name')}>
              <option value="">Select a bank</option>
              {geo.banks.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Account number" hint="10-digit NUBAN">
            <input type="text" value={form.account_number} onChange={set('account_number')} maxLength={10} />
          </Field>
        </div>
        <Field label="Account name">
          <input type="text" value={form.account_name} onChange={set('account_name')} />
        </Field>

        <button className="btn" disabled={!ready || busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving' : 'Add nominee'}
        </button>
      </form>
    </Card>
  );
}

function MyNomineesList({ rows }) {
  return (
    <Card title="Your nominees" bodyClass="" style={{ marginTop: 16 }}>
      {rows.length === 0 ? (
        <Empty title="No nominees added yet">
          Use the form above to add your first Unit Promoter.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>LGA</th><th>Ward</th><th>Polling unit</th>
                <th>Status</th><th>Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={'/members/' + m.id}>{m.first_name} {m.last_name}</Link>
                    <div className="muted mono" style={{ fontSize: 11 }}>{m.code}</div>
                  </td>
                  <td>{m.lga}</td>
                  <td className="muted">{m.ward}</td>
                  <td className="muted">{m.polling_unit}</td>
                  <td><Status value={m.status} /></td>
                  <td className="muted nowrap">{timeAgo(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function DisparityReportForm() {
  const [report, setReport] = useState(undefined);
  const [disparities, setDisparities] = useState('');
  const [challenges, setChallenges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/disparity-report').then((d) => {
      setReport(d.report);
      setDisparities(d.report?.disparities || '');
      setChallenges(d.report?.challenges || '');
    }).catch((e) => setError(e.message));
  }, []);

  const submit = async () => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const d = await api.post('/disparity-report', { disparities, challenges });
      setReport(d.report);
      setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (report === undefined) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Card title="Report disparities & challenges"
            note="Required by the Campaign Council directive — due 16 September 2026">
        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        {saved && (
          <Alert type="success" onClose={() => setSaved(false)}>
            Submitted. The Campaign Council can now see this.
          </Alert>
        )}
        {report?.reviewed_at && (
          <Alert type="info">
            Reviewed by leadership{report.review_note ? ': "' + report.review_note + '"' : '.'}
          </Alert>
        )}
        <Field label="Party / candidate disparities"
               hint="Issues relating to disparities between the party and its candidates, or anything else affecting your campaign's effectiveness">
          <textarea value={disparities} onChange={(e) => setDisparities(e.target.value)}
                    rows={4} placeholder="Describe the disparities affecting your campaign..." />
        </Field>
        <Field label="Challenges in your constituency"
               hint="Challenges confronting you, in enough detail for the Council to assess and intervene">
          <textarea value={challenges} onChange={(e) => setChallenges(e.target.value)}
                    rows={4} placeholder="Describe the challenges you're facing..." />
        </Field>
        <button className="btn" onClick={submit}
                disabled={busy || (!disparities.trim() && !challenges.trim())}>
          {busy && <span className="spinner" />} {report ? 'Update submission' : 'Submit to Campaign Council'}
        </button>
        {report?.updated_at && (
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Last updated {timeAgo(report.updated_at)}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function MyNominations() {
  const { me, reload } = useAuth();
  const [geo, setGeo] = useState(null);
  const [nominees, setNominees] = useState(null);
  const [error, setError] = useState('');

  const loadNominees = () =>
    api.get('/members?mine=1&level=mobiliser&limit=500')
      .then((d) => setNominees(d.rows)).catch((e) => setError(e.message));

  useEffect(() => {
    api.get('/geo').then(setGeo).catch((e) => setError(e.message));
    loadNominees();
  }, []);

  const onAdded = () => { loadNominees(); reload(); };

  if (error && !geo) return <Alert type="error">{error}</Alert>;
  if (!geo || !nominees) return <Loading label="Loading your nominations" />;

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow">OYO 10X programme</div>
        <h1>My nominations</h1>
        <div className="card-note">
          Nominate your Unit Promoters and report to the Campaign Council from here.
        </div>
      </div>

      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      <NominationTracker nomination={me.nomination} />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Nominees added" value={num(nominees.length)} accent />
        <Stat label="Verified" value={num(nominees.filter((n) => n.status === 'verified').length)} />
        <Stat label="Awaiting review"
              value={num(nominees.filter((n) => n.status === 'pending' || n.status === 'flagged').length)} />
        <Stat label="Rejected" value={num(nominees.filter((n) => n.status === 'rejected').length)} />
      </div>

      <AddNomineeForm geo={geo} onAdded={onAdded} />
      <MyNomineesList rows={nominees} />
      <DisparityReportForm />
    </>
  );
}
