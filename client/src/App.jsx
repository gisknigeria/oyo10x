import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { api, getToken, clearToken, ROLE_LABEL } from './lib/api.js';
import { Loading } from './components/ui.jsx';
import { Crest, CAMPAIGN } from './components/Brand.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RegisterMember from './pages/RegisterMember.jsx';
import Members from './pages/Members.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Network from './pages/Network.jsx';
import Tasks from './pages/Tasks.jsx';
import Submissions from './pages/Submissions.jsx';
import Payroll from './pages/Payroll.jsx';
import Users from './pages/Users.jsx';
import AdminData from './pages/AdminData.jsx';
import Verification from './pages/Verification.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = [
  { group: 'Programme' },
  { to: '/', label: 'Dashboard', icon: '▤', end: true },
  { to: '/network', label: 'My 10X network', icon: '⑃' },
  { group: 'Field work' },
  { to: '/register', label: 'Register member', icon: '＋', needs: 'register' },
  { to: '/members', label: 'Members', icon: '☰' },
  { to: '/tasks', label: 'Tasks', icon: '✓' },
  { to: '/submissions', label: 'Review queue', icon: '⚑', needs: 'review' },
  { to: '/verification', label: 'Verification', icon: '⚖' },
  { group: 'Performance' },
  { to: '/payroll', label: 'Points & payment', icon: '₦' },
  { group: 'Administration', admin: true },
  { to: '/users', label: 'Logins', icon: '⚿', admin: true },
  { to: '/admin/data', label: 'Data sources', icon: '⚙', admin: true },
];

function Shell({ children }) {
  const { me, signOut } = useAuth();
  const location = useLocation();
  const isAdmin = me.permissions.is_admin;
  const canRegister = me.permissions.can_register_levels.length > 0;
  const canReview = me.permissions.can_review;

  const visible = NAV.filter((item) => {
    if (item.admin && !isAdmin) return false;
    if (item.needs === 'register' && !canRegister) return false;
    if (item.needs === 'review' && !canReview) return false;
    return true;
  });

  const current = visible.find((i) => i.to && (i.end
    ? location.pathname === i.to
    : location.pathname.startsWith(i.to)));

  const scope = me.user.scope_value || 'Oyo State (all 33 LGAs)';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Crest size={38} />
          <div>
            <div className="brand-mark">OYO<em>10X</em></div>
            <div className="brand-sub">{CAMPAIGN.strapline}</div>
          </div>
        </div>
        <nav className="nav">
          {visible.map((item, i) => item.group ? (
            <div className="nav-group" key={'g' + i}>{item.group}</div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">{me.user.full_name}</div>
          <div className="sidebar-role">
            {me.user.office || ROLE_LABEL[me.user.role] || me.user.role}
          </div>
          <button className="signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbar-title">{current?.label || 'OYO 10X'}</div>
            <div className="topbar-sub">{scope}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="topbar-strap">
              {CAMPAIGN.party}
              <span>{CAMPAIGN.tagline}</span>
            </div>
            <span className="badge green">
              <span className="dot" />{ROLE_LABEL[me.user.role] || me.user.role}
            </span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    if (!getToken()) { setLoading(false); return; }
    try {
      setMe(await api.get('/me'));
    } catch {
      clearToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const signIn = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('oyo10x.token', res.token);
    setMe(await api.get('/me'));
    navigate('/');
  };

  const signOut = () => {
    clearToken();
    setMe(null);
    navigate('/login');
  };

  if (loading) return <Loading label="Starting OYO 10X" />;

  if (!me) {
    return (
      <Routes>
        <Route path="*" element={<Login onSignIn={signIn} />} />
      </Routes>
    );
  }

  const isAdmin = me.permissions.is_admin;

  return (
    <AuthContext.Provider value={{ me, signOut, reload: load }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/network" element={<Network />} />
          <Route path="/register" element={<RegisterMember />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/submissions" element={<Submissions />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/payroll" element={<Payroll />} />
          {isAdmin && <Route path="/users" element={<Users />} />}
          {isAdmin && <Route path="/admin/data" element={<AdminData />} />}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthContext.Provider>
  );
}
