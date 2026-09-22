import React, { useEffect, useMemo, useState } from 'react';
import { api, num, timeAgo, isCandidateRole } from '../lib/api.js';
import { Card, Stat, Loading, Empty, Alert, Field, Modal } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';
import WardMap from '../components/WardMap.jsx';

const STATUS_TONE = { promised: 'amber', ongoing: '', completed: 'green' };

/* ------------------------------- add form -------------------------------- */

/**
 * Scale first, then sector, then the project. That order is the framework's,
 * not a UI preference: a borehole is a different undertaking at each scale
 * ("Repair/rehabilitation of boreholes" vs "Solar-powered boreholes" vs a
 * "Multi-community water scheme"), so the scale decides what is on offer.
 */
function AddProject({ framework, geo, onClose, onSaved }) {
  const [scale, setScale] = useState('');
  const [sector, setSector] = useState('');
  const [projectName, setProjectName] = useState('');
  const [customName, setCustomName] = useState('');
  const [title, setTitle] = useState('');
  const [lga, setLga] = useState('');
  const [ward, setWard] = useState('');
  const [sites, setSites] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [details, setDetails] = useState({ need: '', budget: '', partner: '', timeline: '' });
  const [status, setStatus] = useState('promised');
  const [sectorQuery, setSectorQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const usingCustom = projectName === '__custom__';
  const finalName = usingCustom ? customName.trim() : projectName;

  const sectors = useMemo(() => {
    const q = sectorQuery.trim().toLowerCase();
    if (!q) return framework.sectors;
    return framework.sectors.filter((s) => s.toLowerCase().includes(q)
      || Object.values(framework.framework[s] || {}).flat()
        .some((p) => p.toLowerCase().includes(q)));
  }, [sectorQuery, framework]);

  const options = (sector && scale) ? (framework.framework[sector]?.[scale] || []) : [];
  const wards = lga ? (geo.wards?.[lga] || []) : [];

  const pick = (name) => {
    setProjectName(name);
    // The framework's wording is a sensible default title; they can rename it.
    if (name !== '__custom__' && !title.trim()) setTitle(name);
  };

  const ready = title.trim() && sector && scale && finalName && lga && ward;

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/projects', {
        title: title.trim(), sector, scale, project_name: finalName,
        lga, ward, sites, quantity: sites.length || quantity, status, ...details,
      });
      onSaved(); onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add a project" onClose={onClose} footer={
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={busy || !ready}>
          {busy && <span className="spinner" />} Save project
        </button>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
      </div>
    }>
      {error && <Alert type="error">{error}</Alert>}

      {/* 1. Scale */}
      <div className="section-title">1. How big is it?</div>
      <div className="grid grid-3" style={{ gap: 8 }}>
        {framework.scales.map((s) => (
          <button key={s.id} type="button"
                  className={'scale-card' + (scale === s.id ? ' active' : '')}
                  onClick={() => { setScale(s.id); setProjectName(''); }}>
            <strong>{s.label}</strong>
            <span>{s.blurb}</span>
          </button>
        ))}
      </div>

      {/* 2. Sector */}
      {scale && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>2. Development sector</div>
          <input type="text" placeholder="Search sectors and projects — try water, school, road"
                 value={sectorQuery} onChange={(e) => setSectorQuery(e.target.value)}
                 style={{ marginBottom: 8 }} />
          <div className="pill-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {sectors.map((s) => (
              <button key={s} type="button"
                      className={'pill' + (sector === s ? ' active' : '')}
                      onClick={() => { setSector(s); setProjectName(''); }}>{s}</button>
            ))}
            {sectors.length === 0 && <span className="muted">Nothing matches that search.</span>}
          </div>
        </>
      )}

      {/* 3. Project */}
      {scale && sector && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>3. Which project?</div>
          <div className="pill-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {options.map((p) => (
              <button key={p} type="button"
                      className={'pill' + (projectName === p ? ' active' : '')}
                      onClick={() => pick(p)}>{p}</button>
            ))}
            <button type="button"
                    className={'pill' + (usingCustom ? ' active' : '')}
                    onClick={() => pick('__custom__')}>Something else…</button>
          </div>
          {usingCustom && (
            <Field label="Describe the project" required>
              <input type="text" value={customName} autoFocus
                     onChange={(e) => setCustomName(e.target.value)}
                     placeholder="Not on the framework list" />
            </Field>
          )}
        </>
      )}

      {/* 4. Title */}
      {finalName && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>4. Name it</div>
          <Field label="Project title" required
                 hint="How it will appear on reports — a place name helps">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                   placeholder="e.g. Ojoo Community Solar Borehole" />
          </Field>
        </>
      )}

      {/* 5. Where */}
      {finalName && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>5. Where does it go?</div>
          <div className="grid grid-2">
            <Field label="LGA" required>
              <select value={lga} onChange={(e) => { setLga(e.target.value); setWard(''); setSites([]); }}>
                <option value="">Select an LGA</option>
                {(geo.lgas || []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Ward" required>
              <select value={ward} disabled={!lga}
                      onChange={(e) => { setWard(e.target.value); setSites([]); }}>
                <option value="">Select a ward</option>
                {wards.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </Field>
          </div>

          {ward && (
            <>
              <WardMap lga={lga} ward={ward} sites={sites} onChange={setSites} />
              {sites.length > 0 ? (
                <Alert type="info">
                  <strong>{sites.length}</strong> location{sites.length === 1 ? '' : 's'} pinned —
                  that is the quantity for this ward.
                </Alert>
              ) : (
                <Field label="How many, if you have not pinned the spots yet?"
                       hint="Leave this if you will add exact locations later">
                  <input type="number" min="1" value={quantity}
                         onChange={(e) => setQuantity(Number(e.target.value) || 1)} />
                </Field>
              )}
            </>
          )}
        </>
      )}

      {/* 6. Optional detail */}
      {finalName && ward && (
        <>
          <div className="section-title" style={{ marginTop: 18 }}>6. Anything else? (optional)</div>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {framework.statuses.map((s) => (
                <option key={s.id} value={s.id}>{s.label} — {s.blurb}</option>
              ))}
            </select>
          </Field>
          <Field label="Problem or need being addressed">
            <textarea value={details.need} rows={2}
                      onChange={(e) => setDetails({ ...details, need: e.target.value })} />
          </Field>
          <div className="grid grid-2">
            <Field label="Indicative budget">
              <input type="text" value={details.budget}
                     onChange={(e) => setDetails({ ...details, budget: e.target.value })} />
            </Field>
            <Field label="Implementing partner">
              <input type="text" value={details.partner}
                     onChange={(e) => setDetails({ ...details, partner: e.target.value })} />
            </Field>
          </div>
          <Field label="Proposed timeline">
            <input type="text" value={details.timeline} placeholder="e.g. Q1 2027"
                   onChange={(e) => setDetails({ ...details, timeline: e.target.value })} />
          </Field>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------ detail view ------------------------------- */

function ProjectDetail({ project, framework, canEdit, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState(project.photos || []);

  const setStatus = async (status) => {
    setBusy(true); setError('');
    try { await api.patch('/projects/' + project.id, { status }); onChanged(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const upload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('photo', file);
      const added = await api.form('/projects/' + project.id + '/photos', body);
      setPhotos([...photos, added]);
      if (added.durable === false) {
        setError('Saved, but this server stores photos on temporary disk — '
               + 'it will disappear on the next deploy. Tell the programme office.');
      }
      onChanged();
    } catch (e) { setError(e.message); } finally { setBusy(false); event.target.value = ''; }
  };

  return (
    <Modal title={project.title} onClose={onClose}>
      {error && <Alert type="warn">{error}</Alert>}
      <dl className="kv">
        <dt>Project</dt><dd>{project.project_name}{project.is_custom === 1 && ' (not on the framework list)'}</dd>
        <dt>Sector</dt><dd>{project.sector}</dd>
        <dt>Scale</dt><dd style={{ textTransform: 'capitalize' }}>{project.scale}</dd>
        <dt>Where</dt><dd>{project.ward}, {project.lga}</dd>
        <dt>Quantity</dt><dd>{num(project.quantity)}</dd>
        {project.candidate_name && <><dt>Candidate</dt><dd>{project.candidate_name}</dd></>}
        {project.need && <><dt>Need</dt><dd>{project.need}</dd></>}
        {project.budget && <><dt>Budget</dt><dd>{project.budget}</dd></>}
        {project.partner && <><dt>Partner</dt><dd>{project.partner}</dd></>}
        {project.timeline && <><dt>Timeline</dt><dd>{project.timeline}</dd></>}
      </dl>

      {project.sites?.length > 0 && (
        <>
          <div className="section-title">Locations</div>
          <WardMap lga={project.lga} ward={project.ward} sites={project.sites}
                   onChange={() => {}} readOnly height={240} />
        </>
      )}

      {canEdit && (
        <>
          <div className="section-title">Status</div>
          <div className="pill-row">
            {framework.statuses.map((s) => (
              <button key={s.id} type="button" disabled={busy}
                      className={'pill' + (project.status === s.id ? ' active' : '')}
                      onClick={() => setStatus(s.id)}>{s.label}</button>
            ))}
          </div>

          <div className="section-title">Evidence photos (optional)</div>
          <p className="hint">
            Most projects are promises with nothing yet to photograph. Add before
            and after pictures once work actually begins.
          </p>
          <input type="file" accept="image/*" onChange={upload} disabled={busy} />
        </>
      )}

      {photos.length > 0 && (
        <div className="btn-row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          {photos.map((p) => (
            <a key={p.id || p.url} href={p.url} target="_blank" rel="noreferrer">
              <img src={p.url} alt={p.caption || 'Evidence'}
                   style={{ height: 72, borderRadius: 8, border: '1px solid var(--ink-100)' }} />
            </a>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------- the page -------------------------------- */

export default function Projects() {
  const { me } = useAuth();
  const [framework, setFramework] = useState(null);
  const [geo, setGeo] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState({ scale: '', sector: '', status: '' });

  const load = () => api.get('/projects').then(setData).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    api.get('/project-framework').then(setFramework).catch((e) => setError(e.message));
    api.get('/geo').then(setGeo).catch(() => {});
  }, []);

  if (error && !data) return <Alert type="error">{error}</Alert>;
  if (!data || !framework) return <Loading label="Loading projects" />;

  const canSeeAll = data.can_see_all;
  const isCandidate = isCandidateRole(me.user.role);
  const rows = data.rows.filter((r) =>
    (!filter.scale || r.scale === filter.scale)
    && (!filter.sector || r.sector === filter.sector)
    && (!filter.status || r.status === filter.status));

  const totalSites = data.rows.reduce((a, r) => a + (r.quantity || 0), 0);
  const bySector = data.rows.reduce((a, r) => { a[r.sector] = (a[r.sector] || 0) + r.quantity; return a; }, {});
  const topSector = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
      {adding && geo && (
        <AddProject framework={framework} geo={geo}
                    onClose={() => setAdding(false)} onSaved={load} />
      )}
      {open && (
        <ProjectDetail project={open} framework={framework}
                       canEdit={open.candidate_id === me.user.id || me.permissions.is_admin}
                       onClose={() => setOpen(null)}
                       onChanged={() => { load(); setOpen(null); }} />
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Projects" value={num(data.rows.length)} accent
              foot={canSeeAll ? 'Across all candidates' : 'Yours'} />
        <Stat label="Planned units" value={num(totalSites)} foot="Total quantity across wards" />
        <Stat label="Sectors covered" value={num(Object.keys(bySector).length)}
              foot={'of ' + framework.sectors.length + ' in the framework'} />
        <Stat label="Biggest focus" value={topSector ? topSector[0].split(' ')[0] : '—'}
              foot={topSector ? num(topSector[1]) + ' units' : 'Nothing yet'} />
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="pill-row">
          <button className={'pill' + (!filter.scale ? ' active' : '')}
                  onClick={() => setFilter({ ...filter, scale: '' })}>All scales</button>
          {framework.scales.map((s) => (
            <button key={s.id} className={'pill' + (filter.scale === s.id ? ' active' : '')}
                    onClick={() => setFilter({ ...filter, scale: s.id })}>{s.label}</button>
          ))}
        </div>
        <select value={filter.sector} onChange={(e) => setFilter({ ...filter, sector: e.target.value })}
                style={{ maxWidth: 260 }}>
          <option value="">All sectors</option>
          {framework.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                style={{ maxWidth: 170 }}>
          <option value="">Any status</option>
          {framework.statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="spacer" />
        {isCandidate && (
          <button className="btn sm" onClick={() => setAdding(true)}>+ Add project</button>
        )}
      </div>

      <Card title={canSeeAll ? 'All community & constituency projects' : 'My projects'}
            note={canSeeAll
              ? 'Every project entered by every candidate'
              : 'What you intend to deliver, and where'}
            bodyClass="">
        {rows.length === 0 ? (
          <Empty title="No projects yet">
            {isCandidate
              ? 'Add your first one — choose a scale, a sector, then where it goes.'
              : 'Projects appear here as candidates enter them.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>{canSeeAll && <th>Candidate</th>}
                  <th>Sector</th><th>Scale</th><th>Where</th>
                  <th className="num">Qty</th><th>Status</th><th>Added</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>
                      {r.title}
                      <div className="muted" style={{ fontSize: 11 }}>{r.project_name}</div>
                    </td>
                    {canSeeAll && (
                      <td className="muted">
                        {r.candidate_name}
                        <div style={{ fontSize: 11 }}>{r.constituency}</div>
                      </td>
                    )}
                    <td className="muted">{r.sector}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.scale}</td>
                    <td className="muted">{r.ward}<div style={{ fontSize: 11 }}>{r.lga}</div></td>
                    <td className="num">{num(r.quantity)}</td>
                    <td>
                      <span className={'badge ' + (STATUS_TONE[r.status] || '')}>{r.status}</span>
                    </td>
                    <td className="muted nowrap">{timeAgo(r.created_at)}</td>
                    <td>
                      <button className="btn sm secondary" onClick={() => setOpen(r)}>
                        {r.sites?.length ? 'Map & detail' : 'Detail'}
                      </button>
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
