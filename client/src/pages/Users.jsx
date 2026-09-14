import React, { useEffect, useState } from 'react';
import { api, num, timeAgo, ROLE_LABEL } from '../lib/api.js';
import { Card, Status, Loading, Empty, Alert, Field, Modal, Stat } from '../components/ui.jsx';

const ROLES = ['candidate', 'ambassador', 'champion', 'mobiliser', 'admin'];
const SCOPES = [
  { v: 'state', label: 'Whole state (all 33 LGAs)' },
  { v: 'senatorial', label: 'Senatorial district' },
  { v: 'federal', label: 'Federal constituency' },
  { v: 'state_const', label: 'State constituency' },
  { v: 'lga', label: 'Single LGA' },
  { v: 'ward', label: 'Single ward' },
];
const OFFICES = ['Governor', 'Deputy Governor', 'Senator',
  'House of Representatives', 'House of Assembly'];

function NewUser({ geo, onClose, onSaved }) {
  const [u, setU] = useState({
    username: '', full_name: '', phone: '', role: 'candidate',
    office: 'Senator', scope_type: 'senatorial', scope_value: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const set = (k) => (e) => {
    const v = e.target.value;
    setU((s) => ({ ...s, [k]: v, ...(k === 'scope_type' ? { scope_value: '' } : {}) }));
  };

  const options = !geo ? [] :
    u.scope_type === 'senatorial' ? geo.senatorial :
    u.scope_type === 'federal' ? geo.federal :
    u.scope_type === 'state_const' ? geo.state_const :
    u.scope_type === 'lga' ? geo.all_lgas :
    u.scope_type === 'ward' ? Object.values(geo.wards).flat() : [];

  const save = async () => {
    setBusy(true); setError('');
    try { setCreated(await api.post('/users', u)); onSaved(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (created) {
    return (
      <Modal title="Login created" onClose={onClose}>
        <Alert type="success" title="Share these details with the account holder. ">
          They will be asked to change the password after signing in.
        </Alert>
        <dl className="kv">
          <dt>Username</dt><dd className="mono">{created.username}</dd>
          <dt>Password</dt><dd className="mono">{created.password}</dd>
        </dl>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(
            'OYO 10X login\nUsername: ' + created.username + '\nPassword: ' + created.password)}>
            Copy details
          </button>
          <button className="btn secondary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create a login" onClose={onClose} footer={
      <div className="btn-row">
        <button className="btn" onClick={save}
                disabled={busy || !u.username.trim() || !u.full_name.trim()}>
          {busy && <span className="spinner" />} Create login
        </button>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
      </div>
    }>
      {error && <Alert type="error">{error}</Alert>}
      <Alert type="info">
        A password is generated automatically and shown once. The account
        holder can share it with their own staff to enter names on their behalf.
      </Alert>

      <div className="grid grid-2">
        <Field label="Username" required hint="Lowercase, no spaces">
          <input type="text" value={u.username} onChange={set('username')}
                 placeholder="sen.oyo-central" />
        </Field>
        <Field label="Full name" required>
          <input type="text" value={u.full_name} onChange={set('full_name')} />
        </Field>
      </div>
      <div className="grid grid-2">
        <Field label="Role">
          <select value={u.role} onChange={set('role')}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
          </select>
        </Field>
        <Field label="Phone">
          <input type="text" value={u.phone} onChange={set('phone')} />
        </Field>
      </div>
      {u.role === 'candidate' && (
        <Field label="Office contested">
          <select value={u.office} onChange={set('office')}>
            {OFFICES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-2">
        <Field label="Data they can see">
          <select value={u.scope_type} onChange={set('scope_type')}>
            {SCOPES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </Field>
        {u.scope_type !== 'state' && (
          <Field label="Which one" required>
            <select value={u.scope_value} onChange={set('scope_value')}>
              <option value="">Select</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function Users() {
  const [rows, setRows] = useState(null);
  const [geo, setGeo] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [reset, setReset] = useState(null);
  const [q, setQ] = useState('');

  const load = () => api.get('/users').then((d) => setRows(d.rows)).catch((e) => setError(e.message));
  useEffect(() => { load(); api.get('/geo').then(setGeo).catch(() => {}); }, []);

  const doReset = async (u) => {
    try {
      const r = await api.post('/users/' + u.id + '/reset-password');
      setReset({ username: u.username, password: r.password });
    } catch (e) { setError(e.message); }
  };

  const toggle = async (u) => {
    try {
      await api.patch('/users/' + u.id, {
        status: u.status === 'active' ? 'suspended' : 'active',
      });
      load();
    } catch (e) { setError(e.message); }
  };

  if (!rows) return <Loading label="Loading logins" />;

  const filtered = rows.filter((u) =>
    !q || (u.username + ' ' + u.full_name + ' ' + (u.scope_value || ''))
      .toLowerCase().includes(q.toLowerCase()));

  const byRole = rows.reduce((a, u) => { a[u.role] = (a[u.role] || 0) + 1; return a; }, {});

  return (
    <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {creating && <NewUser geo={geo} onClose={() => setCreating(false)}
                            onSaved={load} />}
      {reset && (
        <Modal title="Password reset" onClose={() => setReset(null)}>
          <Alert type="success">
            A new password has been issued for <strong>{reset.username}</strong>.
          </Alert>
          <dl className="kv">
            <dt>Username</dt><dd className="mono">{reset.username}</dd>
            <dt>New password</dt><dd className="mono">{reset.password}</dd>
          </dl>
        </Modal>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Total logins" value={num(rows.length)} accent />
        <Stat label="Candidates" value={num(byRole.candidate || 0)}
              foot="Gov, Deputy, Senators, Reps, Assembly" />
        <Stat label="Field logins"
              value={num((byRole.ambassador || 0) + (byRole.champion || 0) + (byRole.mobiliser || 0))} />
        <Stat label="Suspended"
              value={num(rows.filter((u) => u.status !== 'active').length)} />
      </div>

      <div className="toolbar">
        <input type="text" placeholder="Search username, name or constituency"
               value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 280 }} />
        <div className="spacer" />
        <button className="btn sm" onClick={() => setCreating(true)}>+ Create login</button>
      </div>

      <Card title="Platform logins"
            note="Only these accounts can submit names. Every entry is traced back to one of them."
            bodyClass="">
        {filtered.length === 0 ? <Empty title="No logins match" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th><th>Name</th><th>Role / Office</th>
                  <th>Sees</th><th className="num">Registered</th>
                  <th>Last login</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.full_name}</td>
                    <td>
                      <span className="badge">{ROLE_LABEL[u.role] || u.role}</span>
                      {u.office && (
                        <div className="muted" style={{ fontSize: 12 }}>{u.office}</div>
                      )}
                    </td>
                    <td className="muted">
                      {u.scope_value || 'All 33 LGAs'}
                      <div style={{ fontSize: 11 }}>{u.scope_type.replace(/_/g, ' ')}</div>
                    </td>
                    <td className="num">{num(u.registered)}</td>
                    <td className="muted nowrap">
                      {u.last_login ? timeAgo(u.last_login) : 'never'}
                      {u.must_reset === 1 && (
                        <div><span className="badge amber">must reset</span></div>
                      )}
                    </td>
                    <td><Status value={u.status} /></td>
                    <td>
                      <div className="btn-row">
                        <button className="btn sm secondary" onClick={() => doReset(u)}>
                          Reset password
                        </button>
                        {u.role !== 'superadmin' && (
                          <button className="btn sm secondary" onClick={() => toggle(u)}>
                            {u.status === 'active' ? 'Suspend' : 'Restore'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
