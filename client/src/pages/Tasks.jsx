import React, { useEffect, useState } from 'react';
import { api, num, LEVEL_LABEL } from '../lib/api.js';
import { Card, Status, Loading, Empty, Alert, Field, Modal, Stat } from '../components/ui.jsx';
import { useAuth } from '../App.jsx';
import Submissions from './Submissions.jsx';

const TYPES = [
  { v: 'rally', label: 'Rally attendance', points: 5 },
  { v: 'canvass', label: 'Household canvass', points: 5 },
  { v: 'survey', label: 'Survey / questionnaire', points: 5 },
  { v: 'follow_up', label: 'Follow-up call', points: 3 },
  { v: 'issue_report', label: 'Community issue report', points: 10 },
  { v: 'meeting', label: 'Community meeting', points: 10 },
  { v: 'service', label: 'Community service activity', points: 15 },
  { v: 'training', label: 'Training session', points: 5 },
];

const BLANK_TASK = {
  title: '', description: '', type: 'canvass', points: 5, mandatory: true,
  requires_photo: false, requires_location: true, target_level: 'all',
  target_scope_type: 'state', target_scope_value: '', questions: [],
};

function TaskSubmissionForm({ task, onClose, onSubmitted }) {
  const { me } = useAuth();
  const [answers, setAnswers] = useState(() => Object.fromEntries((task.questions || []).map((q) => [q.id, ''])));
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [location, setLocation] = useState({ lat: null, lng: null, accuracy: null });

  useEffect(() => {
    if (!task.requires_location || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => setError('Location access was blocked. Please allow location access or the task cannot be submitted.')
    );
  }, [task]);

  const setAnswer = (qid, value) => {
    setAnswers((s) => ({ ...s, [qid]: value }));
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('member_id', String(me.user.member_id || ''));
      form.append('answers', JSON.stringify(answers));
      if (note) form.append('note', note);
      if (photo) form.append('photo', photo);
      if (location.lat != null && location.lng != null) {
        form.append('lat', String(location.lat));
        form.append('lng', String(location.lng));
        if (location.accuracy != null) form.append('accuracy', String(location.accuracy));
      }
      await api.form('/tasks/' + task.id + '/submit', form);
      onSubmitted();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={task.title} onClose={onClose} footer={
      <div className="btn-row">
        <button className="btn" onClick={submit} disabled={busy}>
          {busy && <span className="spinner" />} Submit task
        </button>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
      </div>
    }>
      {error && <Alert type="error">{error}</Alert>}

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{task.type.replace(/_/g, ' ')}</div>
        <div style={{ fontWeight: 600 }}>{task.description || 'Complete the required task evidence below.'}</div>
      </div>

      {(task.questions || []).map((q, index) => (
        <Field key={q.id || index} label={q.label || 'Question ' + (index + 1)} required>
          {q.type === 'select' ? (
            <select value={answers[q.id] || ''} onChange={(e) => setAnswer(q.id, e.target.value)}>
              <option value="">Select an answer</option>
              {(q.options || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <textarea
              value={answers[q.id] || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="Type your answer here..."
            />
          )}
        </Field>
      ))}

      {task.requires_photo && (
        <Field label="Photo evidence" required>
          <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </Field>
      )}

      {task.requires_location && (
        <div className="card" style={{ padding: 10, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {location.lat != null && location.lng != null
              ? `Location captured: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
              : 'Capturing your current location...'}
          </div>
        </div>
      )}

      <Field label="Notes">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the reviewer" />
      </Field>
    </Modal>
  );
}

function TaskForm({ geo, onSave, onClose }) {
  const [t, setT] = useState(BLANK_TASK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setT((s) => {
      const next = { ...s, [k]: v };
      if (k === 'type') next.points = (TYPES.find((x) => x.v === v) || {}).points || 5;
      if (k === 'target_scope_type') next.target_scope_value = '';
      return next;
    });
  };

  const addQuestion = () =>
    setT((s) => ({ ...s, questions: [...s.questions,
      { id: 'q' + (s.questions.length + 1), label: '', type: 'text', options: [] }] }));

  const setQuestion = (i, patch) =>
    setT((s) => ({ ...s, questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/tasks', { ...t, points: Number(t.points) });
      onSave();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <Modal title="Create a task" onClose={onClose} footer={
      <div className="btn-row">
        <button className="btn" onClick={save} disabled={busy || !t.title.trim()}>
          {busy && <span className="spinner" />} Create task
        </button>
        <button className="btn secondary" onClick={onClose}>Cancel</button>
      </div>
    }>
      {error && <Alert type="error">{error}</Alert>}

      <Field label="Task title" required>
        <input type="text" value={t.title} onChange={set('title')}
               placeholder="e.g. Attend the ward mobilisation rally" />
      </Field>
      <Field label="Instructions">
        <textarea value={t.description} onChange={set('description')}
                  placeholder="What exactly should the field agent do?" />
      </Field>

      <div className="grid grid-2">
        <Field label="Activity type">
          <select value={t.type} onChange={set('type')}>
            {TYPES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
          </select>
        </Field>
        <Field label="Points awarded" hint="1 point = ₦100 of approved field support">
          <input type="number" value={t.points} onChange={set('points')} min="0" max="50" />
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Who must do this">
          <select value={t.target_level} onChange={set('target_level')}>
            <option value="all">Everyone</option>
            <option value="ambassador">Ambassadors only</option>
            <option value="champion">Champions only</option>
            <option value="mobiliser">Mobilisers only</option>
            <option value="participant">Participants only</option>
          </select>
        </Field>
        <Field label="Where">
          <select value={t.target_scope_type} onChange={set('target_scope_type')}>
            <option value="state">Whole state</option>
            <option value="lga">A single LGA</option>
          </select>
        </Field>
      </div>

      {t.target_scope_type === 'lga' && geo && (
        <Field label="Local Government Area" required>
          <select value={t.target_scope_value} onChange={set('target_scope_value')}>
            <option value="">Select an LGA</option>
            {geo.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
      )}

      <div className="section-title">Requirements</div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={t.mandatory} onChange={set('mandatory')}
               style={{ width: 'auto' }} />
        <span>Mandatory — payment is withheld until this is approved</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={t.requires_photo} onChange={set('requires_photo')}
               style={{ width: 'auto' }} />
        <span>Photo evidence required</span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="checkbox" checked={t.requires_location} onChange={set('requires_location')}
               style={{ width: 'auto' }} />
        <span>GPS location required</span>
      </label>

      <div className="section-title">Survey questions (optional)</div>
      {t.questions.map((q, i) => (
        <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
          <Field label={'Question ' + (i + 1)}>
            <input type="text" value={q.label}
                   onChange={(e) => setQuestion(i, { label: e.target.value })}
                   placeholder="What do you want to ask?" />
          </Field>
          <div className="grid grid-2">
            <Field label="Answer type">
              <select value={q.type} onChange={(e) => setQuestion(i, { type: e.target.value })}>
                <option value="text">Free text</option>
                <option value="select">Choose one</option>
              </select>
            </Field>
            {q.type === 'select' && (
              <Field label="Options" hint="Separate with commas">
                <input type="text" value={(q.options || []).join(', ')}
                       onChange={(e) => setQuestion(i, {
                         options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                       })} placeholder="Roads, Water, Electricity" />
              </Field>
            )}
          </div>
        </div>
      ))}
      <button className="btn sm secondary" onClick={addQuestion}>+ Add a question</button>
    </Modal>
  );
}

export default function Tasks() {
  const { me } = useAuth();
  const [data, setData] = useState(null);
  const [geo, setGeo] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const load = () => api.get('/tasks').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); api.get('/geo').then(setGeo).catch(() => {}); }, []);

  const toggle = async (t) => {
    try {
      await api.patch('/tasks/' + t.id, { status: t.status === 'open' ? 'closed' : 'open' });
      load();
    } catch (e) { setError(e.message); }
  };

  if (error) return <Alert type="error" onClose={() => setError('')}>{error}</Alert>;
  if (!data) return <Loading label="Loading tasks" />;

  const open = data.rows.filter((t) => t.status === 'open').length;
  const mandatory = data.rows.filter((t) => t.mandatory).length;
  const totalSubs = data.rows.reduce((a, t) => a + t.submissions, 0);
  const approved = data.rows.reduce((a, t) => a + t.approved, 0);

  return (
    <>
      {creating && (
        <TaskForm geo={geo} onClose={() => setCreating(false)}
                  onSave={() => { setCreating(false); load(); }} />
      )}
      {selectedTask && (
        <TaskSubmissionForm task={selectedTask} onClose={() => setSelectedTask(null)}
                           onSubmitted={() => { setSelectedTask(null); load(); }} />
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Tasks this period" value={data.rows.length}
              foot={open + ' open · ' + mandatory + ' mandatory'} accent />
        <Stat label="Submissions" value={num(totalSubs)} />
        <Stat label="Approved" value={num(approved)}
              foot={totalSubs ? Math.round((approved / totalSubs) * 100) + '% approval rate' : ''} />
        <Stat label="Period" value={data.period} foot="Points reset each month" />
      </div>

      <div className="toolbar">
        <div className="spacer" />
        {me.permissions.is_admin && (
          <button className="btn sm" onClick={() => setCreating(true)}>+ Create task</button>
        )}
      </div>

      <Card title="Tasks"
            note="Mandatory tasks gate monthly payment for the member and their upline"
            bodyClass="">
        {data.rows.length === 0 ? (
          <Empty title="No tasks for this period">
            {me.permissions.is_admin
              ? 'Create the first task to start field activity.'
              : 'The programme office has not published tasks yet.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th><th>Type</th><th>Who</th>
                  <th className="num">Points</th><th>Requires</th>
                  <th className="num">Submitted</th><th className="num">Approved</th>
                  <th>Status</th>
                  {me.permissions.is_admin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{t.description}</div>
                      {t.questions.length > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {t.questions.length} survey question(s)
                        </div>
                      )}
                    </td>
                    <td><span className="badge">{t.type.replace(/_/g, ' ')}</span></td>
                    <td>
                      {t.target_level === 'all' ? 'Everyone'
                        : (LEVEL_LABEL[t.target_level] || t.target_level) + 's'}
                      {t.target_scope_value && (
                        <div className="muted" style={{ fontSize: 12 }}>{t.target_scope_value}</div>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{t.points}</td>
                    <td>
                      {t.mandatory
                        ? <span className="badge amber">mandatory</span>
                        : <span className="badge">optional</span>}
                      {t.requires_photo ? <span className="badge blue" style={{ marginLeft: 4 }}>photo</span> : null}
                      {t.requires_location ? <span className="badge blue" style={{ marginLeft: 4 }}>GPS</span> : null}
                    </td>
                    <td className="num">{num(t.submissions)}</td>
                    <td className="num">{num(t.approved)}</td>
                    <td><Status value={t.status} /></td>
                    {!me.permissions.is_admin && (
                      <td className="task-action-cell">
                        <button className="btn sm secondary task-action-btn" onClick={() => setSelectedTask(t)}>
                          Open task
                        </button>
                      </td>
                    )}
                    {me.permissions.is_admin && (
                      <td className="task-action-cell">
                        <button className="btn sm secondary task-action-btn" onClick={() => toggle(t)}>
                          {t.status === 'open' ? 'Close' : 'Reopen'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 22 }}>
        <Submissions compact />
      </div>
    </>
  );
}
