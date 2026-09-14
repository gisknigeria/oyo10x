import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, num, pct, timeAgo, LEVEL_LABEL } from '../lib/api.js';
import { Card, Stat, Status, Loading, Empty, Bar, Alert } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';

export default function Dashboard() {
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Loading label="Loading programme data" />;

  const { totals, coverage, targets, by_level, by_lga, recent, tasks, submissions } = data;
  const levelMap = Object.fromEntries(by_level.map((r) => [r.level, r.n]));
  const pendingReview = (submissions.find((s) => s.status === 'pending') || {}).n || 0;
  const verifyRate = pct(totals.verified, totals.total);

  return (
    <>
      {totals.total === 0 && (
        <Alert type="info" title="No members registered yet. ">
          Use <Link to="/register">Register member</Link> to add your first
          people, or seed demonstration data with <code>npm run seed</code>.
        </Alert>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat
          label="Members registered" value={num(totals.total)} accent
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
          label="Engagement target" value={pct(totals.verified, targets.engagements) + '%'}
          foot={num(totals.verified) + ' of ' + num(targets.engagements) + ' verified engagements'}
          progress={pct(totals.verified, targets.engagements)}
          progressTone="warn"
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card title="10X network structure"
              note="Each level activates at least 10 people at the level below">
          <Bar label="Ambassadors" value={levelMap.ambassador || 0} max={33}
               display={(levelMap.ambassador || 0) + ' / 33'} />
          <Bar label="Champions" value={levelMap.champion || 0} max={351}
               display={(levelMap.champion || 0) + ' / 351'} />
          <Bar label="Mobilisers" value={levelMap.mobiliser || 0} max={3510}
               display={num(levelMap.mobiliser || 0) + ' / 3,510'} />
          <Bar label="Participants" value={levelMap.participant || 0} max={35100}
               display={num(levelMap.participant || 0) + ' / 35,100'} />
        </Card>

        <Card title="Verification & integrity"
              note="Data quality controls applied to every registration">
          <div className="grid grid-2" style={{ gap: 10 }}>
            <Stat label="Verified" value={num(totals.verified)} />
            <Stat label="Awaiting review" value={num(totals.pending)} />
            <Stat label="Flagged high-risk" value={num(data.high_risk)} />
            <Stat label="Rejected" value={num(totals.rejected)} />
          </div>
          {data.voter_roll_loaded === 0 && (
            <div style={{ marginTop: 14 }}>
              <Alert type="warn">
                No INEC register extract is loaded, so PVC/VIN numbers are
                format-checked but not matched against the voter roll.
                {me.permissions.is_admin && <> <Link to="/admin/data">Load an extract</Link>.</>}
              </Alert>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <Card
          title="Coverage by Local Government Area"
          note={by_lga.length + ' LGAs with registered members'}
          bodyClass=""
          actions={<Link className="btn sm secondary" to="/members">View all members</Link>}
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
                    </td>
                    <td className="muted nowrap">{timeAgo(m.created_at)}</td>
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
