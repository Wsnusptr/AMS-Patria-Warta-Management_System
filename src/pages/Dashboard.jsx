import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { ClipboardList, CheckCircle, Clock, Users, Plus } from 'lucide-react';
import './Dashboard.css';

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const time = timestamp.toDate ? timestamp.toDate().getTime() : new Date(timestamp).getTime();
  const diff = now - time;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit yang lalu`;
  if (hours < 24) return `${hours} jam yang lalu`;
  if (days < 7) return `${days} hari yang lalu`;
  const weeks = Math.floor(days / 7);
  return `${weeks} minggu yang lalu`;
}

function getIndonesianDate() {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const now = new Date();
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'admin': return 'badge badge-admin';
    case 'admin_ops': return 'badge badge-ops';
    case 'admin_finance': return 'badge badge-finance';
    case 'reporter': return 'badge badge-reporter';
    default: return 'badge badge-guest';
  }
}

function getRoleLabel(role) {
  switch (role) {
    case 'admin': return 'Administrator';
    case 'admin_ops': return 'Admin Operasional';
    case 'admin_finance': return 'Admin Keuangan';
    case 'reporter': return 'Tim Patria Warta';
    default: return 'Tamu / Guest';
  }
}

export default function Dashboard() {
  const { currentUser, userRole, userName } = useAuth();

  const [totalTasks, setTotalTasks] = useState(0);
  const [doneTasks, setDoneTasks] = useState(0);
  const [inProgressTasks, setInProgressTasks] = useState(0);
  const [activeTeam, setActiveTeam] = useState(0);
  const [activities, setActivities] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);

  useEffect(() => {
    setLoadingStats(true);
    const unsubTasks = onSnapshot(collection(db, 'field_tasks'), (snapshot) => {
      const allTasks = snapshot.docs;
      setTotalTasks(allTasks.length);
      setDoneTasks(allTasks.filter(doc => doc.data().status === 'selesai' || doc.data().status === 'done').length);
      setInProgressTasks(
        allTasks.filter(doc => {
          const status = doc.data().status;
          return status !== 'selesai' && status !== 'done';
        }).length
      );
      setLoadingStats(false);
    }, () => setLoadingStats(false));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setActiveTeam(snapshot.size);
    });

    setLoadingActivities(true);
    const qActivity = query(collection(db, 'activity_log'), orderBy('timestamp', 'desc'), limit(5));
    const unsubActivities = onSnapshot(qActivity, (snapshot) => {
      setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingActivities(false);
    }, () => setLoadingActivities(false));

    setLoadingAnnouncements(true);
    const qAnnounce = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(5));
    const unsubAnnouncements = onSnapshot(qAnnounce, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingAnnouncements(false);
    }, () => setLoadingAnnouncements(false));

    return () => {
      unsubTasks();
      unsubUsers();
      unsubActivities();
      unsubAnnouncements();
    };
  }, []);

  const statCards = [
    {
      icon: ClipboardList,
      value: totalTasks,
      label: 'Total Task',
      colorVar: '--pw-accent-blue',
      bgColor: 'rgba(59, 130, 246, 0.1)',
    },
    {
      icon: CheckCircle,
      value: doneTasks,
      label: 'Selesai',
      colorVar: '--pw-green',
      bgColor: 'rgba(16, 185, 129, 0.1)',
    },
    {
      icon: Clock,
      value: inProgressTasks,
      label: 'Dalam Proses',
      colorVar: '--pw-gold',
      bgColor: 'rgba(212, 175, 55, 0.1)',
    },
    {
      icon: Users,
      value: activeTeam,
      label: 'Tim Aktif',
      colorVar: '--pw-text-primary',
      bgColor: 'var(--pw-border-light)',
    },
  ];

  const canCreateTask =
    userRole === 'admin' || userRole === 'admin_ops' || userRole === 'admin_finance';

  return (
    <div className="page-content">
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-greeting">
            Selamat datang, <span className="text-gold">{userName || (currentUser?.email ? currentUser.email.split('@')[0] : 'User')}</span>
          </h1>
          <p className="dashboard-date">{getIndonesianDate()}</p>
        </div>
      </div>

      <div className="stat-card-grid">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div className="stat-card card" key={card.label}>
              <div
                className="stat-card-icon"
                style={{ backgroundColor: card.bgColor, color: `var(${card.colorVar})` }}
              >
                <Icon size={22} />
              </div>
              <div className="stat-card-body">
                <span className="stat-card-label">{card.label}</span>
                {loadingStats ? (
                  <span className="loading-spinner" />
                ) : (
                  <span className="stat-card-value">{card.value}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-col-main">
          <div className="card dashboard-section">
            <h2 className="section-header">Aktivitas Terbaru</h2>
            {loadingActivities ? (
              <div className="empty-state">
                <span className="loading-spinner" />
              </div>
            ) : activities.length === 0 ? (
              <div className="empty-state">
                <p>Belum ada aktivitas tercatat.</p>
              </div>
            ) : (
              <div className="activity-list">
                {activities.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div className="activity-item-dot" />
                    <div className="activity-item-content">
                      <p className="activity-item-text">
                        <strong>{item.userName || item.user || 'Pengguna'}</strong>{' '}
                        {item.action || item.description || ''}
                      </p>
                      <span className="activity-item-time">
                        {getRelativeTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-col-side">
          <div className="card dashboard-section">
            <h2 className="section-header" style={{ marginBottom: '0' }}>Pengumuman</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
              {loadingAnnouncements ? (
                <div className="empty-state" style={{ padding: '16px 0' }}>
                  <span className="loading-spinner" />
                </div>
              ) : announcements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '6px', border: '1px dashed #D1D5DB' }}>
                  <p style={{ margin: 0, fontSize: '12px' }}>Belum ada pengumuman.</p>
                </div>
              ) : (
                announcements.map(item => (
                  <div key={item.id} style={{ padding: '12px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', color: '#111827', fontWeight: 600 }}>{item.title}</h4>
                      <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                        {item.createdAt ? getRelativeTime(item.createdAt) : 'Baru saja'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#4B5563', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {item.content}
                    </p>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
