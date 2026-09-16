import React, { useEffect, useState } from 'react';
import Tasks from './Tasks.jsx';
import { api } from '../lib/api.js';
import { Alert, Card, Field, Loading } from '../components/ui.jsx';

function FieldReport() {
  const [report, setReport] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [disparities, setDisparities] = useState('');
  const [challenges, setChallenges] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/disparity-report').then((data) => {
      setReport(data.report);
      setDisparities(data.report?.disparities || '');
      setChallenges(data.report?.challenges || '');
      setLoaded(true);
    }).catch((err) => { setError(err.message); setLoaded(true); });
    return () => setLoaded(false);
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try {
      const data = await api.post('/disparity-report', { disparities, challenges });
      setReport(data.report);
      setMessage('Report submitted successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !report) return <Alert type="error">{error}</Alert>;
  if (!loaded && error === '') return <Loading label="Loading report" />;

  return (
    <Card title="Field report" note="Share challenges, disparities, or issues from your assigned area">
      {error && <Alert type="error">{error}</Alert>}
      {message && <Alert type="success">{message}</Alert>}
      <form onSubmit={save}>
        <Field label="Disparities">
          <textarea value={disparities} onChange={(event) => setDisparities(event.target.value)}
                    placeholder="Describe gaps in people, services, infrastructure, or support." />
        </Field>
        <Field label="Challenges">
          <textarea value={challenges} onChange={(event) => setChallenges(event.target.value)}
                    placeholder="Describe the practical challenges in your area." />
        </Field>
        <button className="btn" disabled={busy}>
          {busy && <span className="spinner" />}{report ? 'Update report' : 'Submit report'}
        </button>
      </form>
    </Card>
  );
}

export default function FieldWork() {
  const [tab, setTab] = useState('tasks');

  return (
    <>
      <div className="tabs">
        <button className={'tab' + (tab === 'tasks' ? ' active' : '')} onClick={() => setTab('tasks')}>
          Tasks
        </button>
        <button className={'tab' + (tab === 'report' ? ' active' : '')} onClick={() => setTab('report')}>
          Report
        </button>
      </div>
      {tab === 'tasks' ? <Tasks /> : <FieldReport />}
    </>
  );
}
