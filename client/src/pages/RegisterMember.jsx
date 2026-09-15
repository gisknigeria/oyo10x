import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, LEVEL_LABEL } from '../lib/api.js';
import { Card, Field, Alert, Loading, Status } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

const TITLES = ['Mr', 'Mrs', 'Miss', 'Dr', 'Engr', 'Chief', 'Alhaji', 'Alhaja', 'Pastor', 'Imam'];
const DESIGNATIONS = [
  'None',
  'Polling Unit Agent', 'Ward Supervisor', 'Community Mobiliser', 'Youth Leader',
  'Women Leader',
];

const BLANK = {
  level: '', first_name: '', last_name: '', phone: '', title: '', designation: '',
  lga: '', ward: '', polling_unit: '', pvc_no: '', nin: '',
  bank_name: '', account_number: '', account_name: '',
};

const BLANK_ROW = { title: '', first_name: '', last_name: '', phone: '', pvc_no: '', nin: '',
  bank_name: '', account_number: '', account_name: '' };
const INITIAL_ROWS = 10;

function BulkRegisterTable({ geo, lockedLocation }) {
  const [level, setLevel] = useState(geo.levels[0] || '');
  const [lga, setLga] = useState(lockedLocation?.lga || '');
  const [ward, setWard] = useState(lockedLocation?.ward || '');
  const [pollingUnit, setPollingUnit] = useState(lockedLocation?.pollingUnit || '');
  const [rows, setRows] = useState(() => Array.from({ length: INITIAL_ROWS }, () => ({ ...BLANK_ROW })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);

  const wards = geo.wards[lga] || [];
  const pollingUnits = (geo.polling_units?.[lga]?.[ward]) || [];
  const locked = !!lockedLocation;

  const setRow = (i, patch) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...BLANK_ROW }]);
  const addTen = () => setRows((rs) => [...rs, ...Array.from({ length: 10 }, () => ({ ...BLANK_ROW }))]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));
  const clearAll = () => {
    setRows(Array.from({ length: INITIAL_ROWS }, () => ({ ...BLANK_ROW })));
    setResults(null);
  };

  const filledRows = rows
    .map((r, i) => ({ ...r, _index: i }))
    .filter((r) => r.first_name.trim() || r.last_name.trim() || r.phone.trim());

  const ready = level && lga && ward && pollingUnit && filledRows.length > 0
    && filledRows.every((r) => r.first_name.trim() && r.last_name.trim() && r.phone.trim());

  const save = async () => {
    setBusy(true); setError(''); setResults(null);
    try {
      const res = await api.post('/members/bulk', {
        level, lga, ward, polling_unit: pollingUnit,
        rows: filledRows.map(({ _index, ...r }) => r),
      });
      setResults(res.rows.map((r, i) => ({ ...r, input: filledRows[i] })));
      if (res.failed === 0) {
        setRows(Array.from({ length: INITIAL_ROWS }, () => ({ ...BLANK_ROW })));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copyAllCredentials = () => {
    const lines = (results || []).filter((r) => r.ok).map((r) =>
      r.name + ': ' + r.login.username + ' / ' + r.login.password);
    navigator.clipboard?.writeText(lines.join('\n'));
  };

  return (
    <Card title="Add many people at once"
          note="Fill as many rows as you need — everyone gets their own login automatically.">
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

      {results && (
        <Alert type={results.every((r) => r.ok) ? 'success' : 'warn'}
               title={results.filter((r) => r.ok).length + ' of ' + results.length + ' saved. '}
               onClose={() => setResults(null)}>
          {results.some((r) => r.ok) && (
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn sm secondary" onClick={copyAllCredentials}>
                Copy all usernames &amp; passwords
              </button>
            </div>
          )}
        </Alert>
      )}

      <div className="section-title">Where these people are</div>
      <div className="grid grid-3" style={{ marginBottom: 4 }}>
        <Field label="Level" required>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {geo.levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l] || l}</option>)}
          </select>
        </Field>
        <Field label="LGA" required>
          <select value={lga} disabled={locked} onChange={(e) => { setLga(e.target.value); setWard(''); setPollingUnit(''); }}>
            <option value="">Select an LGA</option>
            {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Ward" required>
          <select value={ward} disabled={locked || !lga} onChange={(e) => { setWard(e.target.value); setPollingUnit(''); }}>
            <option value="">Select a ward</option>
            {wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Polling unit" required>
        <select value={pollingUnit} onChange={(e) => setPollingUnit(e.target.value)} disabled={locked || !ward}>
          <option value="">Select a polling unit</option>
          {pollingUnits.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </Field>

      <div className="section-title">People — {filledRows.length} filled of {rows.length} rows</div>
      <div className="table-wrap">
        <table className="bulk-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>Title</th><th>First name *</th><th>Last name *</th><th>Phone *</th>
              <th>PVC/VIN</th><th>NIN</th><th>Bank</th><th>Account No.</th><th>Account name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rowResult = results?.[filledRows.findIndex((f) => f._index === i)];
              return (
                <tr key={i} className={rowResult ? (rowResult.ok ? 'row-ok' : 'row-fail') : ''}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <select value={r.title} onChange={(e) => setRow(i, { title: e.target.value })}>
                      <option value="">--</option>
                      {['Mr', 'Mrs', 'Miss', 'Chief', 'Alhaji', 'Alhaja'].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="text" value={r.first_name}
                             onChange={(e) => setRow(i, { first_name: e.target.value })} /></td>
                  <td><input type="text" value={r.last_name}
                             onChange={(e) => setRow(i, { last_name: e.target.value })} /></td>
                  <td><input type="text" value={r.phone} placeholder="0803..."
                             onChange={(e) => setRow(i, { phone: e.target.value })} /></td>
                  <td><input type="text" value={r.pvc_no}
                             onChange={(e) => setRow(i, { pvc_no: e.target.value.toUpperCase() })} /></td>
                  <td><input type="text" value={r.nin}
                             onChange={(e) => setRow(i, { nin: e.target.value })} /></td>
                  <td>
                    <select value={r.bank_name} onChange={(e) => setRow(i, { bank_name: e.target.value })}>
                      <option value="">--</option>
                      {geo.banks.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={r.account_number}
                             onChange={(e) => setRow(i, { account_number: e.target.value })} /></td>
                  <td><input type="text" value={r.account_name}
                             onChange={(e) => setRow(i, { account_name: e.target.value })} /></td>
                  <td>
                    <button type="button" className="btn sm secondary" onClick={() => removeRow(i)}
                            title="Remove row">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {results && (
        <div style={{ marginTop: 8 }}>
          {results.filter((r) => !r.ok).map((r, i) => (
            <div key={i} className="error-text" style={{ marginBottom: 3 }}>
              Row {r.input?._index + 1}: {r.error}
              {r.flags?.length ? ' — ' + r.flags.map((f) => f.message).join('; ') : ''}
            </div>
          ))}
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn secondary sm" onClick={addRow}>+ Add row</button>
        <button type="button" className="btn secondary sm" onClick={addTen}>+ Add 10 rows</button>
        <div className="spacer" />
        <button type="button" className="btn secondary" onClick={clearAll} disabled={busy}>
          Clear
        </button>
        <button className="btn" onClick={save} disabled={!ready || busy}>
          {busy && <span className="spinner" />}
          {busy ? 'Saving' : 'Save all'}
        </button>
      </div>
      {!ready && (
        <div className="hint" style={{ marginTop: 6 }}>
          Choose the level and location above, and fill first name, last name and
          phone for at least one row.
        </div>
      )}
    </Card>
  );
}

export default function RegisterMember() {
  const { me } = useAuth();
  const [geo, setGeo] = useState(null);
  const [mode, setMode] = useState('single');
  const [form, setForm] = useState(BLANK);
  const [gps, setGps] = useState(null);
  const [gpsState, setGpsState] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [accountState, setAccountState] = useState('idle');
  const [accountError, setAccountError] = useState('');
  const [draftLink, setDraftLink] = useState('');

  useEffect(() => {
    api.get('/geo').then((g) => {
      setGeo(g);
      const parts = me.user.role === 'mobiliser' && !me.permissions.is_coordinator
        ? String(me.user.scope_value || '').split('|') : [];
      setForm((f) => ({ ...f, level: g.levels[0] || '',
        ...(parts.length === 3 ? { lga: parts[0], ward: parts[1], polling_unit: parts[2] } : {}) }));
    }).catch((e) => setError(e.message));
  }, [me]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => (k === 'lga' ? { ...f, lga: v, ward: '' } : { ...f, [k]: v }));
    setConflict(null);
    if (k === 'bank_name' || k === 'account_number') {
      setAccountState('idle');
      setAccountError('');
    }
  };

  const resolveAccount = async () => {
    setAccountState('loading');
    setAccountError('');
    try {
      const result = await api.post('/bank/resolve', {
        bank_name: form.bank_name,
        account_number: form.account_number,
      });
      setForm((current) => ({ ...current, account_name: result.account_name }));
      setAccountState('resolved');
    } catch (err) {
      setAccountState('error');
      setAccountError(err.data?.reason || err.data?.error || err.message);
    }
  };

  const createDraftLink = async () => {
    setBusy(true); setError('');
    try {
      const draft = await api.post('/registration-drafts', form);
      const link = window.location.origin + '/complete-registration/' + draft.token;
      setDraftLink(link);
      await navigator.clipboard?.writeText(link);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsState('unsupported'); return; }
    setGpsState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsState('ok');
      },
      () => setGpsState('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => { captureGps(); }, []);

  const submit = async (force = false) => {
    setBusy(true);
    setError('');
    setConflict(null);
    try {
      const body = { ...form, ...(gps || {}) };
      const res = await api.post('/members' + (force ? '?force=1' : ''), body);
      setResult(res);
      setForm({ ...BLANK, level: form.level, lga: form.lga, ward: form.ward,
        polling_unit: form.polling_unit });
    } catch (err) {
      if (err.status === 409) setConflict(err.data);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !geo) return <Alert type="error">{error}</Alert>;
  if (!geo) return <Loading label="Loading constituency data" />;

  if (!geo.levels.length) {
    return (
      <Alert type="warn" title="Your account cannot register members. ">
        Registration is carried out by Candidates and Mobilisers.
        Contact the programme office if this is wrong.
      </Alert>
    );
  }

  const wards = geo.wards[form.lga] || [];
  const pollingUnits = (geo.polling_units?.[form.lga]?.[form.ward]) || [];
  const lockedLocation = me.user.role === 'mobiliser' && !me.permissions.is_coordinator
    ? (() => { const [lga, ward, pollingUnit] = String(me.user.scope_value || '').split('|');
      return lga && ward && pollingUnit ? { lga, ward, pollingUnit } : null; })()
    : null;
  const required = ['first_name', 'last_name', 'phone', 'lga', 'ward', 'polling_unit'];
  const ready = required.every((k) => String(form[k] || '').trim());

  const modeToggle = (
    <div className="pill-row" style={{ marginBottom: 14 }}>
      <button className={'pill' + (mode === 'single' ? ' active' : '')}
              onClick={() => setMode('single')}>One person at a time</button>
      <button className={'pill' + (mode === 'bulk' ? ' active' : '')}
              onClick={() => setMode('bulk')}>Add many at once</button>
    </div>
  );

  if (mode === 'bulk') {
    return (
      <>
        {modeToggle}
        <BulkRegisterTable geo={geo} lockedLocation={lockedLocation} />
      </>
    );
  }

  return (
    <>
      {modeToggle}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16 }}>
      <div>
        {result && (
          <Alert type="success" title="Member registered. " onClose={() => setResult(null)}>
            <div style={{ marginTop: 4 }}>
              Reference <strong className="mono">{result.code}</strong> — status{' '}
              <Status value={result.status} />
              {result.flags?.length > 0 && (
                <ul>{result.flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
              )}
              <div style={{ marginTop: 6 }}>
                The polling unit and ward are kept so you can add the next person
                quickly.
              </div>
              {result.login && (
                <div className="login-credentials">
                  <strong>Member login</strong><br />
                  Username: <code>{result.login.username}</code><br />
                  Temporary password: <code>{result.login.password}</code><br />
                  <span className="muted">The member must change this password after signing in.</span>
                </div>
              )}
            </div>
          </Alert>
        )}

        {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}

        {conflict && (
          <Alert type="error" title="This entry did not pass validation. ">
            <ul>{conflict.flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn sm secondary" onClick={() => setConflict(null)}>
                Correct the details
              </button>
              {me.permissions.is_admin && (
                <button className="btn sm danger" onClick={() => submit(true)}>
                  Override and save as flagged
                </button>
              )}
            </div>
          </Alert>
        )}

        <Card title="Register a community member"
              note="Every entry is tagged with your login, the time and your location.">
          <form onSubmit={(e) => { e.preventDefault(); submit(false); }}>

            <div className="section-title">Position in the network</div>
            <div className="grid grid-2">
              <Field label="Level in the 10X network" required
                     hint="Determines who this person may go on to activate">
                <select value={form.level} onChange={set('level')}>
                  {geo.levels.map((l) => (
                    <option key={l} value={l}>{LEVEL_LABEL[l] || l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Designation" hint="Optional role description">
                <select value={form.designation} onChange={set('designation')}>
                  {DESIGNATIONS.map((d) => <option key={d} value={d === 'None' ? '' : d}>{d}</option>)}
                </select>
              </Field>
            </div>
            <div className="btn-row" style={{ marginBottom: 16 }}>
              <button type="button" className="btn sm secondary"
                      onClick={createDraftLink}
                      disabled={busy || !form.first_name.trim() || !form.last_name.trim() || !form.level}>
                Generate self-completion link
              </button>
              {draftLink && <span className="muted" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                Link copied: {draftLink}
              </span>}
            </div>

            <div className="section-title">Location</div>
            <div className="grid grid-2">
              <Field label="Local Government Area" required
                     hint={geo.lgas.length + ' LGA(s) available to your account'}>
                <select value={form.lga} disabled={!!lockedLocation} onChange={set('lga')}>
                  <option value="">Select an LGA</option>
                  {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
              <Field label="Ward" required
                     hint={form.lga ? wards.length + ' wards in ' + form.lga
                                    : 'Choose an LGA first'}>
                <select value={form.ward} onChange={set('ward')} disabled={!!lockedLocation || !form.lga}>
                  <option value="">Select a ward</option>
                  {wards.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Polling unit" required
                   hint={form.ward ? pollingUnits.length + ' polling units in this ward' : 'Choose a ward first'}>
              <select value={form.polling_unit} onChange={set('polling_unit')} disabled={!!lockedLocation || !form.ward}>
                <option value="">Select a polling unit</option>
                {pollingUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </Field>

            <div className="section-title">Personal details</div>
            <div className="grid grid-3">
              <Field label="Title">
                <select value={form.title} onChange={set('title')}>
                  <option value="">--</option>
                  {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="First name" required>
                <input type="text" value={form.first_name} onChange={set('first_name')} />
              </Field>
              <Field label="Last name" required>
                <input type="text" value={form.last_name} onChange={set('last_name')} />
              </Field>
            </div>
            <div className="grid grid-3">
              <Field label="Phone number" required hint="Nigerian mobile, 11 digits">
                <input type="text" value={form.phone} onChange={set('phone')}
                       placeholder="08031234567" maxLength={14} />
              </Field>
              <Field label="PVC / VIN" hint="19 characters from the voter's card">
                <input type="text" value={form.pvc_no} onChange={set('pvc_no')}
                       placeholder="90F5A78901234567890" maxLength={19}
                       style={{ textTransform: 'uppercase' }} />
              </Field>
              <Field label="NIN" hint="11 digits">
                <input type="text" value={form.nin} onChange={set('nin')}
                       placeholder="12345678901" maxLength={11} />
              </Field>
            </div>

            <div className="section-title">Payment details</div>
            <div className="grid grid-3">
              <Field label="Bank">
                <select value={form.bank_name} onChange={set('bank_name')}>
                  <option value="">Select a bank</option>
                  {geo.banks.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Account number" hint="10-digit NUBAN">
                <input type="text" value={form.account_number}
                       onChange={set('account_number')} maxLength={10} />
              </Field>
              <Field label="Account name"
                     hint="Must match the person's own name">
                <input type="text" value={form.account_name} onChange={set('account_name')} />
                <button type="button" className="btn sm secondary"
                        style={{ marginTop: 7 }}
                        onClick={resolveAccount}
                        disabled={accountState === 'loading'
                          || !form.bank_name || !/^\d{10}$/.test(form.account_number)}>
                  {accountState === 'loading' ? 'Resolving...' : 'Resolve account name'}
                </button>
                {accountState === 'resolved' && (
                  <div className="hint" style={{ color: 'var(--green-700)' }}>
                    Name returned by the bank provider.
                  </div>
                )}
                {accountError && <div className="error-text">{accountError}</div>}
              </Field>
            </div>

            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn" disabled={!ready || busy}>
                {busy && <span className="spinner" />}
                {busy ? 'Checking and saving' : 'Register member'}
              </button>
              <button type="button" className="btn secondary"
                      onClick={() => { setForm({ ...BLANK, level: form.level }); setConflict(null); }}>
                Clear form
              </button>
              {!ready && (
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Fill the required fields marked *
                </span>
              )}
            </div>
          </form>
        </Card>
      </div>

      <div>
        <Card title="Location capture"
              note="Attached to the record as field evidence">
          {gpsState === 'ok' && gps ? (
            <>
              <div className="kv">
                <dt>Latitude</dt><dd className="mono">{gps.lat.toFixed(5)}</dd>
                <dt>Longitude</dt><dd className="mono">{gps.lng.toFixed(5)}</dd>
                <dt>Accuracy</dt><dd>±{gps.accuracy} m</dd>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className="badge green"><span className="dot" />Location captured</span>
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                {gpsState === 'locating' && 'Finding your location...'}
                {gpsState === 'denied' && 'Location permission was declined. The record will be saved without GPS and flagged for review.'}
                {gpsState === 'unsupported' && 'This browser does not support location capture.'}
                {gpsState === 'idle' && 'Location not captured yet.'}
              </p>
              <button className="btn sm secondary" style={{ marginTop: 10 }}
                      onClick={captureGps}>Try again</button>
            </>
          )}
        </Card>

      </div>
    </div>
    </>
  );
}
