import React, { createContext, useContext, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { api, getToken, clearToken, ROLE_LABEL, isCandidateRole, isUnitPromoterRole, normalizeRole } from './lib/api.js';
import { Loading } from './components/ui.jsx';
import { Crest, CAMPAIGN } from './components/Brand.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import RegisterMember from './pages/RegisterMember.jsx';
import MemberDetail from './pages/MemberDetail.jsx';
import Network from './pages/Network.jsx';
import Tasks from './pages/Tasks.jsx';
import FieldWork from './pages/FieldWork.jsx';
import Payroll from './pages/Payroll.jsx';
import Users from './pages/Users.jsx';
import Compliance from './pages/Compliance.jsx';
import MyNominations from './pages/MyNominations.jsx';
import PublicRegistration from './pages/PublicRegistration.jsx';
import Profile from './pages/Profile.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const NAV = [
  { group: 'Programme' },
  { to: '/', label: 'Dashboard', icon: '▤', end: true },
  { to: '/network', label: 'My 10X network', icon: '⑃', needs: 'network' },
  { to: '/my-nominations', label: 'My nominations', icon: '⚑', needs: 'candidate' },
  { to: '/profile', label: 'My profile', icon: '●' },
  { group: 'Field work' },
  { to: '/register', label: 'Register network', icon: '＋', needs: 'register' },
  { to: '/tasks', label: 'Tasks & reports', icon: '✓' },
  { group: 'Performance' },
  { to: '/payroll', label: 'Points & payment', icon: '₦' },
  { group: 'Administration', admin: true },
  { to: '/users', label: 'Platform accounts', icon: '⚿', admin: true },
  { group: 'Oversight', needs: 'compliance' },
  { to: '/compliance', label: 'Reports & challenges', icon: '⚑', needs: 'compliance' },
];

function Shell({ children }) {
  const { me, signOut, loggingOut } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAdmin = me.permissions.is_admin;
  const isCandidate = isCandidateRole(me.user.role);
  const isField = ['unit_promoter', 'mobiliser', 'grassroot'].includes(normalizeRole(me.user.role));
  const isGovernorCandidate = isCandidate && me.user.office === 'Governor';
  const canRegister = me.permissions.can_register_levels.length > 0;
  const canReview = me.permissions.can_review;
  const canSeeCompliance = me.permissions.can_see_compliance;

  const visible = NAV.filter((item) => {
    if (isAdmin && item.to && ['/network', '/register', '/payroll'].includes(item.to)) return false;
    if (isField && item.to && !['/', '/tasks', '/profile'].includes(item.to)) return false;
    if (isGovernorCandidate && item.to && item.to !== '/' && item.to !== '/profile') return false;
    if (item.admin && !isAdmin) return false;
    if (item.needs === 'register' && (!canRegister || isCandidate)) return false;
    if (item.needs === 'review' && !canReview) return false;
    if (item.needs === 'compliance' && !canSeeCompliance) return false;
    if (item.needs === 'network' && isCandidate) return false;
    if (item.needs === 'candidate' && !isCandidate) return false;
    if (item.to === '/register' && isCandidate) return false;
    return true;
  }).filter((item, index, items) => !item.group || items[index + 1]?.to);

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

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
              <span className="nav-icon">{item.icon}</span>
              {item.to === '/register' && isCandidate ? 'Add nominee' : item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user">{me.user.full_name}</div>
          <div className="sidebar-role">
            {me.user.office || ROLE_LABEL[normalizeRole(me.user.role)] || me.user.role}
          </div>
          <button className="signout" onClick={signOut} disabled={loggingOut}>
            {loggingOut && <span className="spinner" />}
            {loggingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-nav-toggle"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen((value) => !value)}
            >
              ☰
            </button>
            <div>
              <div className="topbar-title">{current?.label || 'OYO 10X'}</div>
              <div className="topbar-sub">{scope}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-strap">
              {CAMPAIGN.party}
              <span>{CAMPAIGN.tagline}</span>
            </div>
            <span className="badge green">
              <span className="dot" />{ROLE_LABEL[normalizeRole(me.user.role)] || me.user.role}
            </span>
          </div>
        </header>

        <div className={`mobile-backdrop ${mobileNavOpen ? 'visible' : ''}`} onClick={() => setMobileNavOpen(false)} />
        <nav className={`mobile-nav-panel nav ${mobileNavOpen ? 'open' : ''}`}>
          <div className="mobile-nav-head">
            <div>
              <div className="brand-mark">OYO<em>10X</em></div>
              <div className="brand-sub">{CAMPAIGN.strapline}</div>
            </div>
            <button className="mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">✕</button>
          </div>
          {visible.map((item, i) => item.group ? (
            <div className="nav-group" key={'g' + i}>{item.group}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.to === '/register' && isCandidate ? 'Add nominee' : item.label}
            </NavLink>
          ))}
          <button className="signout mobile-signout" onClick={signOut} disabled={loggingOut}>
            {loggingOut && <span className="spinner" />}
            {loggingOut ? 'Signing out' : 'Sign out'}
          </button>
        </nav>

        <div className="content">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    if (!getToken()) { setMe(null); setLoading(false); return; }
    try {
      setMe(await api.get('/me'));
    } catch {
      // Invalid or expired token -- without clearing `me` here, a stale
      // authenticated value stays in state even though the account is no
      // longer signed in, which is exactly what let a bfcache-restored page
      // keep rendering as authenticated.
      clearToken();
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Back/forward can restore an earlier page from the browser's bfcache --
  // the full JS state exactly as it was at that point in history, with no
  // remount and no effects re-running. If that earlier snapshot was taken
  // while signed in and the user has since signed out, this is what would
  // otherwise show a fully authenticated page for an account that is no
  // longer signed in. `pageshow` with `event.persisted` is the one reliable
  // signal a page was served from that cache rather than freshly loaded, so
  // re-validate against the current token whenever it fires.
  useEffect(() => {
    const onPageShow = (event) => {
      if (!event.persisted) return;
      // Show the loading screen immediately rather than the stale cached
      // page for the instant it takes load() to resolve -- otherwise an
      // already-signed-out user would still briefly see the old authenticated
      // view rendered from the cached state, even though it corrects itself
      // a moment later.
      setLoading(true);
      load();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const signIn = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    localStorage.setItem('oyo10x.token', res.token);
    setMe(await api.get('/me'));
    navigate('/');
  };

  const signOut = async () => {
    setLoggingOut(true);
    try {
      // Best-effort -- record the logout in the audit trail, but don't let a
      // slow or failing request keep someone signed in against their will.
      await api.post('/auth/logout', {});
    } catch { /* sign them out locally regardless */ }
    clearToken();
    setMe(null);
    setLoggingOut(false);
    navigate('/login');
  };

  if (loading) return <Loading label="Starting OYO 10X" />;

  if (!me) {
    return (
      <Routes>
        <Route path="/complete-registration/:token" element={<PublicRegistrationRoute />} />
        <Route path="*" element={<Login onSignIn={signIn} />} />
      </Routes>
    );
  }

  const isAdmin = me.permissions.is_admin;
  const isCandidate = isCandidateRole(me.user.role);
  const isGovernorCandidate = isCandidate && me.user.office === 'Governor';
  const isField = ['unit_promoter', 'mobiliser', 'grassroot'].includes(normalizeRole(me.user.role));

  return (
    <AuthContext.Provider value={{ me, signOut, loggingOut, reload: load }}>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {!isCandidate && !isField && <Route path="/network" element={<Network />} />}
          {isCandidate && !isGovernorCandidate && <Route path="/my-nominations" element={<MyNominations />} />}
          <Route path="/profile" element={<Profile />} />
          {!isCandidate && <Route path="/register" element={<RegisterMember />} />}
          {isCandidate && !isGovernorCandidate && <Route path="/register" element={<Navigate to="/my-nominations" replace />} />}
          {!isField && <Route path="/members/:id" element={<MemberDetail />} />}
          {isField ? <Route path="/tasks" element={<FieldWork />} />
            : !isGovernorCandidate && <Route path="/tasks" element={<Tasks />} />}
          {!isField && !isGovernorCandidate && <Route path="/payroll" element={<Payroll />} />}
          {isAdmin && <Route path="/users" element={<Users />} />}
          {me.permissions.can_see_compliance
            && <Route path="/compliance" element={<Compliance />} />}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AuthContext.Provider>
  );
}

function PublicRegistrationRoute() {
  const location = window.location.pathname;
  return <PublicRegistration token={location.split('/').pop()} />;
}
