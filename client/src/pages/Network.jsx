import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, num, LEVEL_LABEL } from '../lib/api.js';
import { Card, Status, Loading, Empty, Alert, Stat } from '../components/ui.jsx';

function Node({ node, baseline, depth }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = node.children.length > 0 || node.truncated;

  return (
    <div className={'tree-node' + (depth === 0 ? ' root' : '')}>
      <div className="tree-row" onClick={() => hasKids && setOpen(!open)}>
        <span className={'tree-toggle' + (hasKids ? '' : ' empty')}>
          {open ? '−' : '+'}
        </span>
        <span className="tree-name">
          <Link to={'/members/' + node.id} onClick={(e) => e.stopPropagation()}>
            {node.name}
          </Link>
        </span>
        <span className="badge">{LEVEL_LABEL[node.level] || node.level}</span>
        <Status value={node.status} />
        <span className="tree-meta">{node.ward} · {node.polling_unit}</span>
        <span className="spacer" style={{ flex: 1 }} />
        {node.level !== 'participant' && (
          <span className={'badge ' + (node.meets_baseline ? 'green' : 'amber')}>
            {node.verified_downline} / {baseline} activated
          </span>
        )}
      </div>

      {open && node.children.map((c) => (
        <Node key={c.id} node={c} baseline={baseline} depth={depth + 1} />
      ))}
      {open && node.truncated > 0 && (
        <div className="tree-node">
          <div className="tree-row muted">
            <span className="tree-toggle empty" />
            <Link to={'/network?root=' + node.id}>
              {node.truncated} more below — open this branch
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Network() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const root = new URLSearchParams(location.search).get('root');

  useEffect(() => {
    setData(null);
    api.get('/network' + (root ? '?root=' + root : ''))
      .then(setData).catch((e) => setError(e.message));
  }, [root]);

  if (error) return <Alert type="error">{error}</Alert>;
  if (!data) return <Loading label="Building your network tree" />;

  const flat = [];
  const walk = (n) => { flat.push(n); n.children.forEach(walk); };
  data.roots.forEach(walk);

  const byLevel = flat.reduce((a, n) => { a[n.level] = (a[n.level] || 0) + 1; return a; }, {});
  const meeting = flat.filter((n) => n.level !== 'participant' && n.meets_baseline).length;
  const fieldAgents = flat.filter((n) => n.level !== 'participant').length;

  return (
    <>
      {root && (
        <div className="toolbar">
          <Link className="btn sm secondary" to="/network">← Back to my full network</Link>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="People in view" value={num(flat.length)}
              foot="Across up to four levels" accent />
        <Stat label="Ambassadors" value={num(byLevel.ambassador || 0)} />
        <Stat label="Champions" value={num(byLevel.champion || 0)} />
        <Stat label="Mobilisers" value={num(byLevel.mobiliser || 0)} />
      </div>

      <Alert type="info">
        The 10X model requires every field agent to activate at least{' '}
        <strong>{data.baseline}</strong> people at the level below.{' '}
        <strong>{meeting}</strong> of <strong>{fieldAgents}</strong> agents in this view
        have met that baseline.
      </Alert>

      <Card title="10X activation tree"
            note="Click a row to expand. Names link to the full record.">
        {data.roots.length === 0 ? (
          <Empty title="Your network is empty">
            People you register appear here, along with everyone they go on to activate.
          </Empty>
        ) : (
          <div className="tree">
            {data.roots.map((n) => (
              <Node key={n.id} node={n} baseline={data.baseline} depth={0} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
