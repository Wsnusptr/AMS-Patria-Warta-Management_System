import React, { useState } from 'react';
import { Outlet, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  ClipboardList,
  Share2,
  Wallet,
  Users,
  LogOut,
  Menu,
  LineChart,
  Building,
  FileText
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/insight', label: 'Insight', icon: LineChart },
  { to: '/board/lapangan', label: 'Board Lapangan', icon: ClipboardList },
  { to: '/board/sosmed', label: 'Board Sosmed', icon: Share2 },
];

const MANAGEMENT_ITEMS = [
  {
    to: '/clients',
    label: 'Data Klien',
    icon: Building,
    roles: ['admin', 'admin_ops', 'admin_finance'],
  },
  {
    to: '/announcements',
    label: 'Pengumuman',
    icon: ClipboardList,
    roles: ['admin', 'admin_ops', 'admin_finance'],
  },
  {
    to: '/finance',
    label: 'Keuangan',
    icon: Wallet,
    roles: ['admin', 'admin_ops', 'admin_finance'],
  },
  {
    to: '/reports',
    label: 'Laporan & Rekap',
    icon: FileText,
    roles: ['admin', 'admin_ops', 'admin_finance'],
  },
  {
    to: '/users',
    label: 'Tim & Akun',
    icon: Users,
    roles: ['admin', 'admin_ops'],
  },
];

const ADMIN_ROLES = ['admin', 'admin_ops', 'admin_finance'];

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/insight': 'Insight',
  '/board/lapangan': 'Board Lapangan',
  '/board/sosmed': 'Board Sosmed',
  '/clients': 'Data Klien',
  '/announcements': 'Manajemen Pengumuman',
  '/finance': 'Keuangan',
  '/reports': 'Laporan & Rekap',
  '/users': 'Tim & Akun',
};

export default function Layout() {
  const { currentUser, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Gagal logout', error);
    }
  };

  const closeSidebar = () => setSidebarOpen(false);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Dashboard';
  const emailInitial = currentUser.email ? currentUser.email.charAt(0).toUpperCase() : '?';
  const showManagement = ADMIN_ROLES.includes(userRole);

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay visible" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside className="sidebar" style={{ transform: sidebarOpen ? 'translateX(0)' : '' }}>
        {/* Brand */}
        <div className="sidebar-brand">
          <img src="/logo.png" alt="Patria Warta" style={{ maxWidth: '100%', maxHeight: '32px', objectFit: 'contain' }} />
        </div>

          {/* User info */}
        <div className="sidebar-user-info">
          <div className="sidebar-user-avatar">{emailInitial}</div>
          <div className="sidebar-user-details">
            <p className="sidebar-user-name">{currentUser.email}</p>
            <span className="sidebar-user-role">{userRole ? userRole.replace('_', ' ') : 'Guest'}</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' active' : ''}`
              }
            >
              <item.icon className="sidebar-nav-item-icon" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {showManagement && (
            <>
              <div className="sidebar-section-label">Manajemen</div>
              {MANAGEMENT_ITEMS.map((item) =>
                item.roles.includes(userRole) ? (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      `sidebar-nav-item${isActive ? ' active' : ''}`
                    }
                  >
                    <item.icon className="sidebar-nav-item-icon" />
                    <span>{item.label}</span>
                  </NavLink>
                ) : null
              )}
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="sidebar-logout">
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <LogOut className="sidebar-nav-item-icon" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="topbar-title">{pageTitle}</h1>
          </div>
          <div className="topbar-right">
             <div className="topbar-icon-btn" style={{ borderRadius: '50%', color: 'var(--pw-gold)', borderColor: 'var(--pw-gold)' }}>
               {emailInitial}
             </div>
          </div>
        </header>

        {/* Dynamic Outlet */}
        <Outlet />
      </div>
    </div>
  );
}
