import React from 'react';
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom';
import { useAuth } from './store/auth.jsx';
import { useOfflineQueue } from './store/offlineQueue.jsx';
import { LoginPage } from './pages/Login.jsx';
import { ResetPage } from './pages/Reset.jsx';
import { CatalogPage } from './pages/Catalog.jsx';
import { ScanPage } from './pages/Scan.jsx';
import { IntakePage } from './pages/Intake.jsx';
import { ContractsPage } from './pages/Contracts.jsx';
import { ExpirationDashboard } from './pages/ExpirationDashboard.jsx';
import { ShippingPage } from './pages/Shipping.jsx';
import { AppealsPage } from './pages/Appeals.jsx';
import { ReportsPage } from './pages/Reports.jsx';
import { AuditPage } from './pages/Audit.jsx';
import { QueuePage } from './pages/Queue.jsx';
import { SignupPage } from './pages/Signup.jsx';
import { ServiceRequestsPage, NewServiceRequestPage, ServiceRequestDetailPage } from './pages/ServiceRequests.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="content">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  const { user, logout, hasAnyRole } = useAuth();
  const { isOnline, queue } = useOfflineQueue();
  const pending = queue.filter(q => q.status !== 'manual_review_required').length;
  const needReview = queue.filter(q => q.status === 'manual_review_required').length;

  return (
    <div className="layout">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <strong>Offline Ops Portal</strong>
          {user && (
            <nav>
              <NavLink to="/catalog">Catalog</NavLink>
              <NavLink to="/service-requests">My Requests</NavLink>
              {hasAnyRole('operations_staff','department_admin') && <NavLink to="/intake">Intake</NavLink>}
              {hasAnyRole('operations_staff','department_admin') && <NavLink to="/scan">Scan</NavLink>}
              {hasAnyRole('department_admin') && <NavLink to="/contracts">Contracts</NavLink>}
              {hasAnyRole('department_admin') && <NavLink to="/expirations">Expirations</NavLink>}
              <NavLink to="/shipping">Shipping</NavLink>
              <NavLink to="/appeals">Appeals</NavLink>
              {hasAnyRole('department_admin','security_admin') && <NavLink to="/reports">Reports</NavLink>}
              {hasAnyRole('department_admin','security_admin') && <NavLink to="/audit">Audit</NavLink>}
              <NavLink to="/queue">Queue{pending ? ` (${pending})` : ''}</NavLink>
            </nav>
          )}
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <span className={`status ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'online' : 'offline'}</span>
          {pending > 0 && <span className="status pending">{pending} pending sync</span>}
          {needReview > 0 && <span className="status offline">{needReview} need review</span>}
          {user && <span className="muted">{user.username}</span>}
          {user && <button onClick={logout}>Log out</button>}
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/" element={<RequireAuth><CatalogPage /></RequireAuth>} />
          <Route path="/catalog" element={<RequireAuth><CatalogPage /></RequireAuth>} />
          <Route path="/intake" element={<RequireAuth><IntakePage /></RequireAuth>} />
          <Route path="/scan" element={<RequireAuth><ScanPage /></RequireAuth>} />
          <Route path="/contracts" element={<RequireAuth><ContractsPage /></RequireAuth>} />
          <Route path="/expirations" element={<RequireAuth><ExpirationDashboard /></RequireAuth>} />
          <Route path="/shipping" element={<RequireAuth><ShippingPage /></RequireAuth>} />
          <Route path="/appeals" element={<RequireAuth><AppealsPage /></RequireAuth>} />
          <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
          <Route path="/audit" element={<RequireAuth><AuditPage /></RequireAuth>} />
          <Route path="/queue" element={<RequireAuth><QueuePage /></RequireAuth>} />
          <Route path="/service-requests" element={<RequireAuth><ServiceRequestsPage /></RequireAuth>} />
          <Route path="/service-request/new" element={<RequireAuth><NewServiceRequestPage /></RequireAuth>} />
          <Route path="/service-request/:id" element={<RequireAuth><ServiceRequestDetailPage /></RequireAuth>} />
          <Route path="*" element={<div>Not found — <Link to="/">home</Link></div>} />
        </Routes>
      </main>
    </div>
  );
}
