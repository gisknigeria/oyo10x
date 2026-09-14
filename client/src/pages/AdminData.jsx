import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, num, timeAgo } from '../lib/api.js';
import { Card, Loading, Alert, Empty, CheckRow, Stat } from '../components/ui.jsx';

export default function AdminData() {
  const [status, setStatus] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankResult, setBankResult] = useState(null);
  const fileRef = useRef();
  const bankRef = useRef();

  const load = () => {
    api.get('/admin/status').then(setStatus).catch((e) => setError(e.message));
    api.get('/admin/audit').then((d) => setAudit(d.rows)).catch(() => {});
  };
  useEffect(load, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.form('/admin/voter-roll', fd);
      setMsg(num(r.loaded) + ' voter records loaded (' + num(r.total)
        + ' in the register). Registrations are now matched against this extract.');
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const uploadBank = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBankBusy(true); setError(''); setMsg(''); setBankResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setBankResult(await api.form('/admin/reconcile-bank', fd));
      load();
    } catch (err) { setError(err.message); }
    finally { setBankBusy(false); if (bankRef.current) bankRef.current.value = ''; }
  };

  const clearRoll = async () => {
    try {
      const r = await api.post('/admin/voter-roll/clear');
      setMsg(num(r.cleared) + ' voter records removed.');
      load();
    } catch (err) { setError(err.message); }
  };

  if (!status) return <Loading label="Loading configuration" />;

  const p = status.providers;

  return (
    <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {msg && <Alert type="success" onClose={() => setMsg('')}>{msg}</Alert>}

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Voter records loaded" value={num(status.voter_roll_rows)}
              accent={status.voter_roll_rows > 0}
              foot={status.voter_roll_rows ? 'PVC matching active' : 'PVC matching inactive'} />
        <Stat label="Audit entries" value={num(status.audit_entries)}
              foot="Every login, registration and approval" />
        <Stat label="External checks"
              value={[
                p.bank_resolution === 'configured',
                String(p.nin_verification).startsWith('configured'),
                status.voter_roll_rows > 0,
              ].filter(Boolean).length + ' / 3'}
              foot="Providers currently connected" />
      </div>

      <div className="grid grid-2">
        <div>
          <Card title="Identity verification"
                note="What can and cannot be checked automatically">
            <CheckRow name="Bank account name (Paystack)" result={
              p.bank_resolution === 'configured'
                ? { status: 'pass', reason: 'Account numbers resolve to the registered account name' }
                : { status: 'not_configured',
                    reason: 'Set PAYSTACK_SECRET_KEY in the server environment' }} />
            <CheckRow name="NIN identity (NIMC via aggregator)" result={
              String(p.nin_verification).startsWith('configured')
                ? { status: 'pass', reason: p.nin_verification }
                : { status: 'not_configured',
                    reason: 'Set KYC_PROVIDER (dojah or prembly) and KYC_API_KEY' }} />
            <CheckRow name="PVC / VIN against INEC" result={
              status.voter_roll_rows
                ? { status: 'pass', reason: p.pvc_verification }
                : { status: 'not_configured', reason: p.pvc_verification }} />

            <Alert type="warn" title="On INEC verification. ">
              INEC publishes no public API for verifying a voter's card number, so
              no software can check a PVC live. The workable route is to load the
              INEC register extract for your wards below — the platform then matches
              each submitted VIN against it and flags anyone whose polling unit does
              not agree with the register.
            </Alert>
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Load an INEC register extract"
                note="CSV columns: vin, last_name, first_name, lga, ward, polling_unit">
            <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              Each row carries a voter identification number and the ward and
              polling unit it belongs to. Once loaded, every registration is matched
              against it and the platform flags any VIN that is absent, or that the
              register places at a different polling unit from the one claimed.
            </p>
            <input type="file" accept=".csv" ref={fileRef} onChange={upload} disabled={busy} />
            {busy && (
              <div style={{ marginTop: 10 }}>
                <span className="spinner dark" /> Loading extract...
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn sm secondary"
                      onClick={() => downloadCsv('/admin/voter-roll/sample.csv',
                        'sample-inec-extract.csv')}>
                Download a sample extract
              </button>
              {status.voter_roll_rows > 0 && (
                <button className="btn sm secondary" onClick={clearRoll}>
                  Clear loaded register
                </button>
              )}
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              The sample is generated from your own registered members so the
              matching workflow can be demonstrated before the real extract
              arrives. It deliberately omits some people and moves others to a
              different polling unit, which is exactly what the matcher catches.
            </div>
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Bank reconciliation — account names without an API key"
                note="CSV columns: account_number, account_name">
            <Alert type="info">
              After you pay people, your bank's payment-confirmation file or
              statement lists the <strong>real beneficiary name</strong> for every
              account it paid. Upload it here and those names are recorded against
              each member — the same answer a paid resolution API gives, sourced
              from the bank itself, at no cost.
            </Alert>
            <input type="file" accept=".csv" ref={bankRef} onChange={uploadBank}
                   disabled={bankBusy} />
            {bankBusy && (
              <div style={{ marginTop: 10 }}>
                <span className="spinner dark" /> Reconciling...
              </div>
            )}
            {bankResult && (
              <div style={{ marginTop: 14 }}>
                <div className="grid grid-3" style={{ gap: 10 }}>
                  <Stat label="Rows" value={num(bankResult.rows)} />
                  <Stat label="Name confirmed" value={num(bankResult.confirmed)} accent />
                  <Stat label="Mismatched" value={num(bankResult.mismatched.length)} />
                </div>
                {bankResult.mismatched.length > 0 && (
                  <>
                    <div className="section-title">
                      Paid to a different name than registered
                    </div>
                    {bankResult.mismatched.slice(0, 10).map((x) => (
                      <div key={x.id} className="check-row">
                        <div className="check-icon fail">✕</div>
                        <div style={{ flex: 1 }}>
                          <div className="check-label">
                            <Link to={'/members/' + x.id}>{x.registered_as}</Link>
                          </div>
                          <div className="check-detail">
                            Bank paid “{x.bank_says}” · account {x.account_number}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card title="Controls always applied"
                note="These run with no external provider and no configuration">
            <CheckRow name="Duplicate detection" result={{ status: 'pass',
              reason: 'Phone, NIN, PVC and bank account matched across every record' }} />
            <CheckRow name="NUBAN check digit" result={{ status: 'pass',
              reason: 'CBN checksum proves an account number is well-formed — no key needed' }} />
            <CheckRow name="Account name match" result={{ status: 'pass',
              reason: 'Typed account name compared against the registered name' }} />
            <CheckRow name="Format validation" result={{ status: 'pass',
              reason: '11-digit NIN, 19-character VIN, 10-digit NUBAN, Nigerian mobile' }} />
            <CheckRow name="Geographic consistency" result={{ status: 'pass',
              reason: 'Capture GPS compared against the Oyo State boundary' }} />
            <CheckRow name="Family padding detection" result={{ status: 'pass',
              reason: 'Three or more of the same surname at one polling unit is flagged' }} />
            <CheckRow name="Shared bank accounts" result={{ status: 'pass',
              reason: 'One account number reused across members is flagged' }} />
            <CheckRow name="Bulk-entry detection" result={{ status: 'pass',
              reason: 'More than 15 registrations in ten minutes is flagged' }} />
            <CheckRow name="Full audit trail" result={{ status: 'pass',
              reason: 'Every action is recorded against the login that performed it' }} />
          </Card>

          <div style={{ height: 14 }} />

          <Card title="Recent activity" note="Last 200 audited actions" bodyClass="">
            {!audit || audit.length === 0 ? <Empty title="No activity yet" /> : (
              <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr><th>Action</th><th>By</th><th>Entity</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {audit.slice(0, 80).map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.action.replace(/_/g, ' ')}</td>
                        <td className="mono">{a.actor || '--'}</td>
                        <td className="muted">
                          {a.entity ? a.entity + ' #' + a.entity_id : '--'}
                        </td>
                        <td className="muted nowrap">{timeAgo(a.created_at)}</td>
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
