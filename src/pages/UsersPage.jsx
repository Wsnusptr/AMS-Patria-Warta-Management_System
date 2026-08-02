import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit3, Trash2, Users, ShieldAlert, Activity, AlertCircle } from 'lucide-react';

export default function UsersPage() {
  const { currentUser, userRole, userName } = useAuth();
  const isAdmin = ['admin', 'admin_finance'].includes(userRole);
  
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    role: 'reporter',
    name: ''
  });

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setUsersList(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>Anda tidak memiliki akses ke modul Manajemen Tim.</p>
        </div>
      </div>
    );
  }

  const openModal = (user = null) => {
    if (user) {
      setEditingEmail(user.id);
      setFormData({
        email: user.id, // ID of document is email
        role: user.role || 'reporter',
        name: user.name || ''
      });
    } else {
      setEditingEmail(null);
      setFormData({
        email: '',
        role: 'reporter',
        name: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEmail(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const normalizedEmail = formData.email.trim().toLowerCase();
      
      // Save to 'users' collection with email as doc ID
      await setDoc(doc(db, 'users', normalizedEmail), {
        role: formData.role,
        name: formData.name,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, 'activity_log'), {
        userName: userName || currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        action: editingEmail ? `Mengubah akses peran untuk ${normalizedEmail}` : `Mendaftarkan akses baru untuk ${normalizedEmail}`,
        timestamp: serverTimestamp()
      });

      closeModal();
    } catch (error) {
      console.error("Error saving user data:", error);
      alert('Terjadi kesalahan saat menyimpan data akun.');
    }
  };

  const handleDelete = async (emailId) => {
    if (emailId === currentUser.email) {
      alert("Anda tidak bisa menghapus akun Anda sendiri!");
      return;
    }
    if (window.confirm(`Cabut akses dan hapus profil ${emailId} dari sistem?`)) {
      await deleteDoc(doc(db, 'users', emailId));
      
      await addDoc(collection(db, 'activity_log'), {
        userName: userName || currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        action: `Mencabut akses pengguna ${emailId}`,
        timestamp: serverTimestamp()
      });
    }
  };

  const getRoleLabel = (role) => {
    switch(role) {
      case 'admin': return 'Administrator Utama';
      case 'admin_ops': return 'Admin Operasional';
      case 'admin_finance': return 'Admin Keuangan';
      case 'reporter': return 'Tim Patria Warta';
      default: return 'Guest';
    }
  };

  const getRoleBadge = (role) => {
    switch(role) {
      case 'admin': return 'badge-danger';
      case 'admin_ops': return 'badge-gold';
      case 'admin_finance': return 'badge-blue';
      case 'reporter': return 'badge-green';
      default: return 'badge-gray';
    }
  };

  if (loading) return <div className="page-content">Memuat data...</div>;

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '24px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: '#111827' }}>Manajemen Tim & Akun</h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>Kelola peran (role) dan akses anggota tim ke sistem AMS</p>
        </div>

        <button onClick={() => openModal()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}>
          <Plus size={14} /> Daftarkan Akses Akun
        </button>
      </div>

      <div style={{ backgroundColor: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FECACA', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <ShieldAlert color="#DC2626" size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 4px 0', color: '#991B1B', fontSize: '13px' }}>Informasi Penting</h4>
          <p style={{ margin: 0, color: '#B91C1C', fontSize: '12px', lineHeight: 1.5 }}>
            Sistem pendaftaran akun asli ditangani otomatis melalui Google Login (Firebase Auth). Menambahkan email di sini bertujuan untuk memberikan peran/akses spesifik (seperti admin atau finance) sebelum atau sesudah pengguna login. Pastikan penulisan email tepat.
          </p>
        </div>
      </div>

      {/* LIST USERS */}
      <div className="card-minimal" style={{ padding: '16px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>Daftar Akses Terdaftar</h3>
        
        {usersList.length === 0 ? (
           <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
            <Activity size={24} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '12px' }}>Belum ada data anggota tim terdaftar.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table-compact">
              <thead>
                <tr>
                  <th>Nama / Profil</th>
                  <th>Alamat Email</th>
                  <th>Peran Sistem (Role)</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map(user => (
                  <tr key={user.id}>
                    <td data-label="Nama / Profil" className="table-cell-bold">{user.name || 'Belum Diatur'}</td>
                    <td data-label="Alamat Email">{user.id}</td>
                    <td data-label="Peran Sistem (Role)">
                      <span className={`badge badge-compact ${getRoleBadge(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td data-label="Aksi" style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button onClick={() => openModal(user)} className="table-action-btn-compact" title="Edit Akses">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => handleDelete(user.id)} className="table-action-btn-compact danger" title="Cabut Akses">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL FORM */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card-minimal" style={{ width: '100%', maxWidth: '400px', margin: '16px', background: '#ffffff' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff' }}>
              <Users size={16} color="#111827" />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingEmail ? 'Edit Akses Pengguna' : 'Daftarkan Akses Baru'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact form-label-required">Alamat Email Pengguna</label>
                <input 
                  type="email" 
                  className="form-input-compact" 
                  style={{ height: '32px' }} 
                  placeholder="email@example.com" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  disabled={!!editingEmail} // Cannot change email once created in this simplistic UI
                  required 
                />
                {editingEmail && <span className="form-hint">Email tidak dapat diubah (digunakan sebagai ID).</span>}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact">Nama Lengkap / Panggilan (Opsional)</label>
                <input 
                  type="text" 
                  className="form-input-compact" 
                  style={{ height: '32px' }} 
                  placeholder="Budi Reporter" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact form-label-required">Peran (Role)</label>
                <select className="form-input-compact" style={{ height: '32px' }} value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} required>
                  <option value="reporter">Tim Patria Warta</option>
                  <option value="admin_ops">Admin Operasional</option>
                  <option value="admin_finance">Admin Keuangan</option>
                  <option value="admin">Administrator Utama</option>
                </select>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#6B7280', lineHeight: 1.4 }}>
                  <strong>Catatan:</strong> Administrator dapat mengatur sistem penuh, Operasional mengurus task, Keuangan mengurus transaksi.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '24px', gap: '8px' }}>
                <button type="button" onClick={closeModal} className="btn-secondary btn-sm">Batal</button>
                <button type="submit" className="btn-primary btn-sm">Simpan Akses</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
