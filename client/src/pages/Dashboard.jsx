import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, num, pct, timeAgo, LEVEL_LABEL, isCandidateRole, normalizeRole } from '../lib/api.js';
import { Card, Stat, Status, Loading, Empty, Bar, Alert, Modal } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';
import Verification from './Verification.jsx';
import OperationalReport from '../components/OperationalReport.jsx';

const FIELD_ROLES = new Set(['unit_promoter', 'mobiliser', 'grassroot']);

function hasFlag(member, code) {
  try {
    return JSON.parse(member.risk_flags || '[]').some((flag) => flag.code === code);
  } catch {
    return false;
  }
}

function DashboardHeading({ title, note }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="eyebrow">OYO 10X programme</div>
      <h1>{title}</h1>
      <div className="card-note">{note}</div>
    </div>
  );
}

function LocationBreakdown({ by_lga, by_ward }) {
  // A single LGA-scoped candidate gets a ward table (more useful than a
  // one-row LGA table); anyone covering several LGAs gets the LGA table,
  // which is the more legible summary at that span.
  const singleLga = by_lga.length === 1;
  const rows = singleLga ? by_ward : by_lga;

  return (
    <Card
      title="Where your people are"
      note={singleLga
        ? by_ward.length + ' ward(s) with registrations in ' + by_lga[0].lga
        : by_lga.length + ' LGA(s) with registrations in your constituency'}
      bodyClass=""
    >
      {rows.length === 0 ? (
        <Empty title="No registrations yet">
          Once people are added, this breaks down exactly which areas they come from.
        </Empty>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                {singleLga ? <th>Ward</th> : <th>LGA</th>}
                <th className="num">People</th>
                <th className="num">Verified</th>
                <th className="num">{singleLga ? 'Polling units' : 'Wards'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={singleLga ? r.ward : r.lga}>
                  <td style={{ fontWeight: 600 }}>{singleLga ? r.ward : r.lga}</td>
                  <td className="num">{num(r.total)}</td>
                  <td className="num">{num(r.verified)}</td>
                  <td className="num">{singleLga ? r.units : r.wards}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PeopleWithLocation({ rows }) {
  return (
    <Card title="People under you" note="Most recently added first, with exactly where each one is from"
          bodyClass=""
          actions={<Link className="btn sm secondary" to="/network">View full network</Link>}>
      {rows.length === 0 ? <Empty title="Nobody registered yet" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Level</th>
                <th>LGA</th><th>Ward</th><th>Polling unit</th>
                <th>Status</th><th>Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={'/members/' + m.id}>{m.first_name} {m.last_name}</Link>
                  </td>
                  <td className="mono muted">{m.phone}</td>
                  <td><span className="badge">{LEVEL_LABEL[m.level] || m.level}</span></td>
                  <td>{m.lga}</td>
                  <td className="muted">{m.ward}</td>
                  <td className="muted">{m.polling_unit}</td>
                  <td>
                    <Status value={m.status} />
                    {m.risk_score >= 50 && (
                      <span className="badge red" style={{ marginLeft: 4 }}>risk {m.risk_score}</span>
                    )}
                      {hasFlag(m, 'account_name_mismatch') && (
                        <span className="badge amber" style={{ marginLeft: 4 }}>
                          account name validation
                        </span>
                      )}
                  </td>
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

function SurveyDesk({ surveys = [], notifications = [] }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {notifications.length > 0 && (
        <Alert type="info" title={notifications.length + ' new survey' + (notifications.length === 1 ? '' : 's') + ' published'}>
          Review the questions below and use the Tasks page to monitor responses.
        </Alert>
      )}
      <Card
        title="Survey desk"
        note="Live questions from your current jurisdiction"
        actions={<Link className="btn sm secondary" to="/tasks">Open tasks</Link>}
        bodyClass=""
      >
        {surveys.length === 0 ? (
          <Empty title="No open surveys yet">
            When a survey is published, it will appear here with its questions and response progress.
          </Empty>
        ) : (
          <div className="grid grid-2" style={{ gap: 12 }}>
            {surveys.slice(0, 4).map((survey) => (
              <div key={survey.id} className="card" style={{ padding: 14, border: '1px solid var(--ink-200)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{survey.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      {survey.target_scope_value || 'Whole programme'} · {survey.points} points
                    </div>
                  </div>
                  <span className="badge blue">survey</span>
                </div>
                {survey.description && <p className="muted" style={{ fontSize: 13 }}>{survey.description}</p>}
                <div className="section-title" style={{ marginTop: 12 }}>Questions</div>
                {(survey.questions || []).slice(0, 3).map((question, index) => (
                  <div key={question.id || index} className="check-row" style={{ padding: '7px 0' }}>
                    <div className="check-icon none">{index + 1}</div>
                    <div className="check-label">{question.label || 'Question ' + (index + 1)}</div>
                  </div>
                ))}
                {(!survey.questions || survey.questions.length === 0) && (
                  <div className="muted" style={{ fontSize: 13 }}>No questions added yet.</div>
                )}
                <div className="hint" style={{ marginTop: 10 }}>
                  {num(survey.submissions)} response(s) · {num(survey.pending)} awaiting review
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NominationPointer({ me }) {
  const nomination = me.nomination;
  if (!nomination) return null; // Governor/Deputy Governor carry no quota

  return (
    <div style={{ marginBottom: 16 }}>
      <Card bodyClass="">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Unit Promoter nominations:{' '}
              <span style={{ color: nomination.complete ? 'var(--green-700)' : 'var(--amber-600)' }}>
                {nomination.count} of {nomination.quota}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              {nomination.complete
                ? 'Requirement complete.'
                : nomination.remaining + ' more needed — plus your disparities & challenges report,'
                  + ' due 16 September 2026.'}
            </div>
          </div>
          <Link className="btn" to="/my-nominations">Manage nominations</Link>
        </div>
      </Card>
    </div>
  );
}

function CandidateNominationTracker({ rows = [] }) {
  if (!rows.length) {
    return (
      <Card title="Candidate nomination tracker" note="No candidates currently mapped to this quota requirement">
        <Empty title="No nomination records yet" />
      </Card>
    );
  }

  return (
    <Card title="Candidate nomination tracker" note="Live progress for each candidate against the nominee quota" bodyClass="">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Office</th>
              <th className="num">Nominated</th>
              <th className="num">Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ fontWeight: 600 }}>{row.full_name || row.username}</td>
                <td>{row.office}</td>
                <td className="num">{row.count} / {row.quota}</td>
                <td className="num">{row.remaining}</td>
                <td>
                  {row.complete ? (
                    <span className="badge green">Complete</span>
                  ) : (
                    <span className="badge amber">In progress</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const CANDIDATE_OFFICES = ['Governor', 'Deputy Governor', 'Senator',
  'House of Representatives', 'House of Assembly'];
const candidateScopeType = (office) => {
  const value = String(office || '').toLowerCase();
  if (value.includes('governor')) return 'state';
  if (value.includes('senator')) return 'senatorial';
  if (value.includes('representative')) return 'federal';
  if (value.includes('assembly')) return 'state_const';
  return 'state';
};

function DgAddPanel() {
  const [tab, setTab] = useState('candidate');
  const [geo, setGeo] = useState(null);
  const [nominationRows, setNominationRows] = useState([]);
  const [candidateId, setCandidateId] = useState('');
  const [rows, setRows] = useState([{ full_name: '', office: 'Senator', scope_value: '' }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    api.get('/geo').then(setGeo).catch(() => {});
    api.get('/nominations').then((result) => setNominationRows(result.rows || [])).catch(() => {});
  }, []);

  const options = (office) => {
    if (!geo) return [];
    const type = candidateScopeType(office);
    return type === 'state' ? [] : type === 'senatorial' ? geo.senatorial
      : type === 'federal' ? geo.federal : geo.state_const;
  };
  const setRow = (index, patch) => setRows((items) => items.map((row, i) => i === index ? { ...row, ...patch } : row));
  const addRow = () => setRows((items) => [...items, { full_name: '', office: 'Senator', scope_value: '' }]);
  const saveCandidates = async () => {
    const filled = rows.filter((row) => row.full_name.trim());
    if (!filled.length) return setError('Add at least one candidate name.');
    setBusy(true); setError(''); setMessage('');
    try {
      const accounts = await Promise.all(filled.map((row) => api.post('/users', {
        role: 'candidate', full_name: row.full_name.trim(), office: row.office,
        scope_type: candidateScopeType(row.office), scope_value: row.scope_value,
      })));
      setRows([{ full_name: '', office: 'Senator', scope_value: '' }]);
      setCreated(accounts);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Card title="Add to the platform" note="Add candidates individually or in a table, or register Unit Promoters for candidates.">
      {created && (
        <Modal title="Candidate accounts created" onClose={() => setCreated(null)} footer={
          <div className="btn-row">
            <button className="btn sm secondary" title="Copy all login details"
              aria-label="Copy all login details" onClick={() => navigator.clipboard?.writeText(
                'Login link: ' + window.location.origin + '/login\n'
                + created.map((account) => 'Username: ' + account.username + '\nPassword: ' + account.password).join('\n'))}>
              ⧉ Copy all login details
            </button>
            <button className="btn secondary" onClick={() => setCreated(null)}>Done</button>
          </div>
        }>
          <Alert type="success" title="Share these details now. They are shown only once.">
            {created.map((account) => (
              <div key={account.username} style={{ marginBottom: 10 }}>
                <strong>{account.username}</strong><br />
                Temporary password: <code>{account.password}</code>
              </div>
            ))}
            Login link: <code>{window.location.origin + '/login'}</code>
          </Alert>
        </Modal>
      )}
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={'tab' + (tab === 'candidate' ? ' active' : '')} onClick={() => setTab('candidate')}>Add candidate</button>
        <button className={'tab' + (tab === 'nominee' ? ' active' : '')} onClick={() => setTab('nominee')}>Add nominee</button>
      </div>
      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      {tab === 'candidate' ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Full name</th><th>Office contested</th><th>Which one</th></tr></thead>
              <tbody>{rows.map((row, index) => (
                <tr key={index}>
                  <td><input value={row.full_name} onChange={(e) => setRow(index, { full_name: e.target.value })} placeholder="Candidate name" /></td>
                  <td><select value={row.office} onChange={(e) => setRow(index, { office: e.target.value, scope_value: '' })}>
                    {CANDIDATE_OFFICES.map((office) => <option key={office}>{office}</option>)}
                  </select></td>
                  <td>{candidateScopeType(row.office) === 'state' ? <span className="muted">Whole state</span> : (
                    <select value={row.scope_value} onChange={(e) => setRow(index, { scope_value: e.target.value })}>
                      <option value="">Select constituency</option>
                      {options(row.office).map((option) => <option key={option}>{option}</option>)}
                    </select>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn sm secondary" onClick={addRow} disabled={busy}>+ Add row</button>
            <button className="btn" onClick={saveCandidates} disabled={busy}>{busy && <span className="spinner" />} Create candidate accounts</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Select the candidate whose list you received. Every nominee will count against that candidate's fixed quota.</p>
          <div className="grid grid-2" style={{ marginBottom: 12 }}>
            <label>Candidate
              <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
                <option value="">Select a candidate</option>
                {nominationRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.full_name} · {row.office} · {row.count}/{row.quota}
                  </option>
                ))}
              </select>
            </label>
            <div className="hint" style={{ alignSelf: 'end' }}>
              {candidateId
                ? 'Nominees will be recorded under the selected candidate.'
                : 'Choose a candidate before opening registration.'}
            </div>
          </div>
          <Link className="btn" to={candidateId
            ? '/register?level=unit_promoter&candidate_id=' + candidateId
            : '#'} onClick={(event) => { if (!candidateId) event.preventDefault(); }}>
            Open nominee registration
          </Link>
        </>
      )}
    </Card>
  );
}

function NumbersDashboard({ data, me }) {
  const counts = data.platform_counts || {};
  const byLga = data.by_lga || [];
  const byWard = data.by_ward || [];
  const coverage = data.coverage || {};

  return (
    <>
      <DashboardHeading
        title={normalizeRole(me.user.role) === 'campaign_admin'
          ? 'DG numbers dashboard' : 'Governor numbers dashboard'}
        note="Programme totals and geographic coverage at a glance."
      />
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <Stat label="Candidates" value={num(counts.candidates)} accent />
        <Stat label="Nominees" value={num(counts.nominees)} />
        <Stat label="Grassroots" value={num(counts.grassroots)} />
        <Stat label="Wards covered" value={num(coverage.wards)} />
        <Stat label="LGAs covered" value={num(coverage.lgas)} />
        <Stat label="Polling units covered" value={num(coverage.units)} />
        <Stat label="Total accounts" value={num(counts.total)} />
      </div>

      <div className="grid grid-2">
        <Card title="Coverage by LGA" note="Registered people, verified records, wards, and polling units" bodyClass="">
          {byLga.length === 0 ? <Empty title="No LGA coverage yet" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>LGA</th><th className="num">People</th><th className="num">Wards</th><th className="num">Units</th></tr></thead>
                <tbody>{byLga.map((row) => (
                  <tr key={row.lga}>
                    <td style={{ fontWeight: 600 }}>{row.lga}</td>
                    <td className="num">{num(row.total)}</td>
                    <td className="num">{num(row.wards)}</td>
                    <td className="num">{num(row.units)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Coverage by ward" note="Ward-level registration totals" bodyClass="">
          {byWard.length === 0 ? <Empty title="No ward coverage yet" /> : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>LGA</th><th>Ward</th><th className="num">People</th><th className="num">Units</th></tr></thead>
                <tbody>{byWard.map((row) => (
                  <tr key={row.lga + row.ward}>
                    <td>{row.lga}</td>
                    <td style={{ fontWeight: 600 }}>{row.ward}</td>
                    <td className="num">{num(row.total)}</td>
                    <td className="num">{num(row.units)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function CampaignAdminDashboard({ data, me, users = [] }) {
  const [nominations, setNominations] = useState([]);

  useEffect(() => {
    api.get('/nominations').then((d) => setNominations(d.rows || [])).catch(() => setNominations([]));
  }, []);

  const counts = users.reduce((acc, user) => {
    const role = normalizeRole(user.role);
    if (role === 'candidate') acc.candidate += 1;
    if (role === 'unit_promoter' || role === 'mobiliser') acc.unit_promoter += 1;
    if (role === 'grassroot') acc.grassroot += 1;
    acc.total += 1;
    return acc;
  }, { candidate: 0, unit_promoter: 0, grassroots: 0, total: 0, grassroot: 0 });
  const totalPeople = data?.totals?.total || 0;
  const nominationCoverage = data?.by_level?.find((entry) => entry.level === 'mobiliser')?.n || 0;

  return (
    <>
      <DashboardHeading
        title="DG command dashboard"
        note="Track candidate activation, nominee coverage, grassroots reach, and total programme accounts from one place."
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Candidates added" value={num(counts.candidate)} accent
          foot={num(totalPeople) + ' total people in view'} />
        <Stat label="Nominees / Unit Promoters" value={num(Math.max(counts.unit_promoter, nominationCoverage))}
          foot="Accounts and field nominees in the network" />
        <Stat label="Grassroots" value={num(counts.grassroot)}
          foot="Community-level platform accounts" />
        <Stat label="Total accounts" value={num(counts.total)}
          foot="All active accounts currently on the platform" />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <DgAddPanel />
        <Card title="Coverage snapshot" note="Current network totals and platform scope">
          <Bar label="Candidates" value={counts.candidate || 0} max={Math.max(counts.candidate || 0, 10)} display={num(counts.candidate || 0)} />
          <Bar label="Nominees" value={Math.max(counts.unit_promoter, nominationCoverage)} max={Math.max(Math.max(counts.unit_promoter, nominationCoverage), 10)} display={num(Math.max(counts.unit_promoter, nominationCoverage))} />
          <Bar label="Grassroots" value={counts.grassroot || 0} max={Math.max(counts.grassroot || 0, 10)} display={num(counts.grassroot || 0)} />
        </Card>
      </div>

      <div style={{ marginBottom: 16 }}>
        <CandidateNominationTracker rows={nominations} />
      </div>

      <OperationalReport data={data} isAdmin={me.permissions.is_admin} />
      <SurveyDesk surveys={data.survey_tasks || []} notifications={data.survey_notifications || []} />
    </>
  );
}

function CandidateDashboard({ data, me }) {
  const { totals, coverage, targets, by_level, by_lga, by_ward, recent, tasks, submissions,
    survey_tasks, survey_notifications } = data;
  const levels = Object.fromEntries(by_level.map((r) => [r.level, r.n]));
  const pendingReview = (submissions.find((s) => s.status === 'pending') || {}).n || 0;

  return (
    <>
      <DashboardHeading
        title="Constituency command centre"
        note={'Your view covers ' + (me.user.scope_value || 'the full state') + '. Track growth, reviews, and field activity from here.'}
      />
      <NominationPointer me={me} />
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <Stat label="Nomination quota" value={me.nomination ? me.nomination.quota : 0} accent
          foot={me.nomination ? me.nomination.count + ' already nominated' : 'No quota for this office'} />
        <Stat label="Total Unit Promoters" value={num(levels.mobiliser || 0)}
          foot={num(totals.total) + ' total people under your scope'} progress={pct(levels.mobiliser || 0, totals.total)} />
        <Stat label="People under your scope" value={num(totals.total)}
          foot={num(totals.pending) + ' awaiting review'} progress={pct(totals.verified, totals.total)} />
        <Stat label="Wards reached" value={coverage.wards + ' / ' + targets.wards}
          foot={coverage.units + ' polling units active'} progress={pct(coverage.wards, targets.wards)} />
        <Stat label="Pending reviews" value={num(pendingReview)}
          foot="Submissions needing attention" />
        <Stat label="Open tasks" value={num(tasks.open || 0)}
          foot={(tasks.total || 0) + ' tasks this period'} />
      </div>
      <SurveyDesk surveys={survey_tasks} notifications={survey_notifications} />
      <OperationalReport data={data} />
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="Your network" note="People currently registered under you, by role">
          <Bar label="Unit Promoters" value={levels.mobiliser || 0} max={Math.max(levels.mobiliser || 0, 10)}
               display={num(levels.mobiliser || 0)} />
        </Card>
        <Card title="Next actions" note="Keep the network moving">
          <div className="btn-row" style={{ marginBottom: 12 }}>
            <Link className="btn" to="/register?level=unit_promoter">Add nominee</Link>
            <Link className="btn secondary" to="/tasks">View tasks</Link>
          </div>
          <Alert type="info">
            {pendingReview ? 'Review pending submissions so approved work can release points.'
              : 'Candidates can only add nominees in their assigned area.'}
          </Alert>
        </Card>
      </div>
      <div style={{ marginBottom: 16 }}>
        <LocationBreakdown by_lga={by_lga} by_ward={by_ward} />
      </div>
      <PeopleWithLocation rows={recent} />
    </>
  );
}

function FieldDashboard({ data, me }) {
  const { totals, coverage, by_level, recent, people_added, tasks } = data;
  const levels = Object.fromEntries(by_level.map((r) => [r.level, r.n]));
  const nextLevel = me.permissions.can_register_levels[0];
  const areaLabel = 'Assigned polling unit';
  const areaValue = coverage.units || 0;
  const areaFoot = num(totals.verified) + ' verified registrations';

  return (
    <>
      <DashboardHeading
        title="Your field dashboard"
        note={'Focused on ' + (me.user.scope_value || 'your assigned network') + '. Add Grassroots and complete your assigned tasks.'}
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Your registrations" value={num(totals.total)} accent
          foot={num(totals.verified) + ' verified'} progress={pct(totals.verified, totals.total)} />
        <Stat label="Awaiting review" value={num(totals.pending)}
          foot="Records needing supervisor action" />
        <Stat label={areaLabel} value={areaValue}
          foot={areaFoot} />
        <Stat label="Tasks open" value={num(tasks.open || 0)}
          foot="Check your assigned work" />
      </div>
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="Your network" note="The levels currently visible in your branch">
          {Object.entries(levels).map(([level, count]) => (
            <Bar key={level} label={LEVEL_LABEL[level] || level} value={count} max={Math.max(count, 10)} display={num(count)} />
          ))}
          {!Object.keys(levels).length && <Empty title="No registrations yet" />}
        </Card>
        <Card title="Today’s work" note="The quickest way to make progress">
          <div className="btn-row" style={{ marginBottom: 12 }}>
            {nextLevel && <Link className="btn" to="/register">Add Grassroot</Link>}
            <Link className="btn secondary" to="/tasks">View tasks</Link>
          </div>
          <Alert type="info">
            Verified registrations and approved task submissions count toward your performance.
          </Alert>
        </Card>
      </div>
      <RecentRegistrations rows={people_added || recent}
                           title="People you added"
                           note="Grassroots registered directly by you" />
    </>
  );
}

function RecentRegistrations({ rows, title = 'Recent registrations', note }) {
  return (
    <Card title={title} note={note} bodyClass="">
      {rows.length === 0 ? <Empty title="Nothing registered yet" /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Level</th><th>LGA</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id}>
                <td className="mono">{m.code}</td>
                <td style={{ fontWeight: 600 }}>{m.first_name} {m.last_name}</td>
                <td><span className="badge">{LEVEL_LABEL[m.level] || m.level}</span></td>
                <td>{m.lga}</td>
                <td><Status value={m.status} /></td>
                <td className="muted nowrap">{timeAgo(m.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RecentActivity({ rows }) {
  return (
    <Card title="Recent activity" note="Last 200 audited actions" bodyClass="">
      {!rows || rows.length === 0 ? <Empty title="No activity yet" /> : (
        <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr><th>Action</th><th>By</th><th>Entity</th><th>When</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((a) => (
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
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [activity, setActivity] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
    if (me.permissions.is_admin) {
      api.get('/users').then((d) => setUsers(d.rows || [])).catch(() => setUsers([]));
      api.get('/admin/audit').then((d) => setActivity(d.rows)).catch(() => setActivity([]));
    }
  }, [me.permissions.is_admin]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Loading label="Loading programme data" />;

  const { totals, coverage, targets, by_level, by_lga, recent, tasks, submissions,
    survey_tasks, survey_notifications } = data;
  const levelMap = Object.fromEntries(by_level.map((r) => [r.level, r.n]));
  const pendingReview = (submissions.find((s) => s.status === 'pending') || {}).n || 0;
  const verifyRate = pct(totals.verified, totals.total);

  if (normalizeRole(me.user.role) === 'campaign_admin') return <CampaignAdminDashboard data={data} me={me} users={users} />;
  if (isCandidateRole(me.user.role) && me.user.office === 'Governor') return <NumbersDashboard data={data} me={me} />;
  if (isCandidateRole(me.user.role)) return <CandidateDashboard data={data} me={me} />;
  if (FIELD_ROLES.has(normalizeRole(me.user.role))) return <FieldDashboard data={data} me={me} />;

  return (
    <>
      <DashboardHeading title="Programme administration" note="Full dashboard across all jurisdictions." />
      <OperationalReport data={data} isAdmin={me.permissions.is_admin} />
      {totals.total === 0 && (
        <Alert type="info" title="No members registered yet. ">
          Use <Link to="/register">Register member</Link> to add your first
          people, or seed demonstration data with <code>npm run seed</code>.
        </Alert>
      )}

      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        <Stat
          label="Total Unit Promoters" value={num(levelMap.mobiliser || 0)} accent
          foot={num(totals.total) + ' total people in view'}
          progress={pct(levelMap.mobiliser || 0, totals.total)}
        />
        <Stat
          label="Members registered" value={num(totals.total)}
          foot={num(totals.verified) + ' verified · ' + num(totals.pending) + ' awaiting review'}
          progress={verifyRate}
        />
        <Stat
          label="LGA coverage" value={coverage.lgas + ' / ' + targets.lgas}
          foot={pct(coverage.lgas, targets.lgas) + '% of Local Government Areas reached'}
          progress={pct(coverage.lgas, targets.lgas)}
          progressTone={coverage.lgas < targets.lgas / 2 ? 'warn' : ''}
        />
        <Stat
          label="Ward coverage" value={coverage.wards + ' / ' + targets.wards}
          foot={num(coverage.units) + ' polling units active'}
          progress={pct(coverage.wards, targets.wards)}
          progressTone={coverage.wards < targets.wards / 2 ? 'warn' : ''}
        />
        <Stat
          label="Polling units reached" value={num(coverage.units)}
          foot="Active polling units in the programme"
          progress={pct(coverage.units, targets.polling_units)}
        />
        <Stat
          label="Engagement target" value={pct(totals.verified, targets.engagements) + '%'}
          foot={num(totals.verified) + ' of ' + num(targets.engagements) + ' verified engagements'}
          progress={pct(totals.verified, targets.engagements)}
          progressTone="warn"
        />
      </div>

      <SurveyDesk surveys={survey_tasks} notifications={survey_notifications} />

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="10X network structure"
              note="Each level activates at least 10 people at the level below">
          <Bar label="Unit Promoters" value={levelMap.mobiliser || 0} max={3510}
               display={num(levelMap.mobiliser || 0) + ' / 3,510'} />
        </Card>

        <Card title="Verification">
          <Verification compact />
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Coverage by Local Government Area"
          note={by_lga.length + ' LGAs with registered members'}
          bodyClass=""
        >
          {by_lga.length === 0 ? <Empty title="No coverage yet" /> : (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>LGA</th>
                    <th className="num">Members</th>
                    <th className="num">Verified</th>
                    <th className="num">Wards</th>
                    <th className="num">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {by_lga.map((r) => (
                    <tr key={r.lga}>
                      <td style={{ fontWeight: 600 }}>{r.lga}</td>
                      <td className="num">{num(r.total)}</td>
                      <td className="num">{num(r.verified)}</td>
                      <td className="num">{r.wards}</td>
                      <td className="num">{r.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Task activity"
          note={'Period ' + data.period}
          actions={<Link className="btn sm secondary" to="/tasks">Manage tasks</Link>}
        >
          <div className="grid grid-2" style={{ gap: 10, marginBottom: 14 }}>
            <Stat label="Tasks open" value={tasks.open || 0}
                  foot={(tasks.total || 0) + ' created this period'} />
            <Stat label="Pending review" value={num(pendingReview)}
                  foot="Submissions awaiting approval" />
          </div>
          {submissions.length === 0 ? (
            <Empty title="No submissions yet">
              Field agents submit evidence against tasks from the Tasks page.
            </Empty>
          ) : submissions.map((s) => (
            <Bar key={s.status} label={s.status}
                 value={s.n} max={submissions.reduce((a, x) => a + x.n, 0)}
                 display={num(s.n)} />
          ))}
        </Card>
      </div>

      <Card title="Recent registrations" bodyClass=""
            actions={<Link className="btn sm secondary" to="/members">See all</Link>}>
        {recent.length === 0 ? <Empty title="Nothing registered yet" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Level</th>
                  <th>Polling unit</th><th>LGA</th><th>Status</th><th>Added</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((m) => (
                  <tr key={m.id}>
                    <td className="mono">{m.code}</td>
                    <td style={{ fontWeight: 600 }}>
                      <Link to={'/members/' + m.id}>{m.first_name} {m.last_name}</Link>
                    </td>
                    <td><span className="badge">{LEVEL_LABEL[m.level] || m.level}</span></td>
                    <td className="muted">{m.polling_unit}</td>
                    <td>{m.lga}</td>
                    <td>
                      <Status value={m.status} />
                      {m.risk_score >= 50 && (
                        <span className="badge red" style={{ marginLeft: 4 }}>
                          risk {m.risk_score}
                        </span>
                      )}
                      {hasFlag(m, 'account_name_mismatch') && (
                        <span className="badge amber" style={{ marginLeft: 4 }}>
                          account name validation
                        </span>
                      )}
                    </td>
                    <td className="muted nowrap">{timeAgo(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 16 }}>
        <RecentActivity rows={activity} />
      </div>
    </>
  );
}
