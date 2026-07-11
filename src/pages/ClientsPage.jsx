import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Users, Plus, Edit3, Trash2, Building, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function ClientsPage() {
  const { currentUser, userRole } = useAuth();
  const hasAccess = ['admin', 'admin_ops', 'admin_finance'].includes(userRole);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    status: 'Aktif'
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const clientData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // Sort by name
      clientData.sort((a, b) => a.name.localeCompare(b.name));
      setClients(clientData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching clients: ", error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const openModal = (client = null) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name || '',
        contactPerson: client.contactPerson || '',
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || '',
        status: client.status || 'Aktif'
      });
    } else {
      setEditingClient(null);
      setFormData({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        address: '',
        status: 'Aktif'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      let docId = editingClient ? editingClient.id : null;
      let logAction = '';

      if (docId) {
        // Edit existing
        await setDoc(doc(db, 'clients', docId), {
          ...formData,
          updatedAt: serverTimestamp()
        }, { merge: true });
        logAction = `Mengubah data klien: ${formData.name}`;
      } else {
        // Add new
        const docRef = await addDoc(collection(db, 'clients'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser.email
        });
        docId = docRef.id;
        logAction = `Menambahkan klien baru: ${formData.name}`;
      }

      // Record Activity Log
      await addDoc(collection(db, 'activity_log'), {
        userName: currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        action: logAction,
        module: 'Manajemen Klien',
        timestamp: serverTimestamp()
      });

      closeModal();
    } catch (error) {
      console.error("Error saving client: ", error);
      alert("Gagal menyimpan data klien.");
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`Hapus data klien ${name} dari sistem? Peringatan: Menghapus klien tidak akan menghapus riwayat keuangan yang sudah tercatat dengan nama ini, namun klien ini tidak akan bisa dipilih lagi ke depannya.`)) {
      try {
        await deleteDoc(doc(db, 'clients', id));
        
        await addDoc(collection(db, 'activity_log'), {
          userName: currentUser.email.split('@')[0],
          userEmail: currentUser.email,
          action: `Menghapus klien: ${name}`,
          module: 'Manajemen Klien',
          timestamp: serverTimestamp()
        });
        
        if (editingClient && editingClient.id === id) {
          closeModal();
        }
      } catch (error) {
        console.error("Error deleting client: ", error);
        alert("Gagal menghapus klien.");
      }
    }
  };

  if (loading) return <div className="page-content">Memuat data klien...</div>;

  if (!hasAccess) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>Anda tidak memiliki akses ke modul Data Klien.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '16px' }}>
      
      {/* HEADER */}
      <div className="finance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 2px 0', color: '#111827' }}>Data Klien</h1>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>Kelola daftar perusahaan atau klien agensi</p>
        </div>

        <button 
          onClick={() => openModal()} 
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
        >
          <Plus size={14} /> Tambah Klien
        </button>
      </div>

      {/* SUMMARY */}
      <div className="finance-summary-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card-minimal">
          <div className="stat-card-icon gold"><Building size={16} /></div>
          <div>
            <div className="stat-card-label">Total Klien</div>
            <div className="stat-card-value">{clients.length}</div>
          </div>
        </div>
        <div className="stat-card-minimal">
          <div className="stat-card-icon green"><Activity size={16} /></div>
          <div>
            <div className="stat-card-label">Klien Aktif</div>
            <div className="stat-card-value">{clients.filter(c => c.status === 'Aktif').length}</div>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="card-minimal" style={{ padding: '16px' }}>
        {clients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
            <Building size={24} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '12px' }}>Belum ada master data klien.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table-compact">
              <thead>
                <tr>
                  <th>Nama Perusahaan / Klien</th>
                  <th>Kontak Person</th>
                  <th>Telepon</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(client => (
                  <tr key={client.id}>
                    <td className="table-cell-bold">{client.name}</td>
                    <td>{client.contactPerson || '-'}</td>
                    <td>{client.phone || '-'}</td>
                    <td>{client.email || '-'}</td>
                    <td>
                      <span className={`badge badge-compact ${client.status === 'Aktif' ? 'badge-green' : 'badge-gray'}`}>
                        {client.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => openModal(client)} className="table-action-btn-compact" title="Edit Klien">
                        <Edit3 size={12} />
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
          <div className="card-minimal" style={{ width: '100%', maxWidth: '400px', margin: '16px', background: '#ffffff' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#ffffff' }}>
              <Building size={16} color="#111827" />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingClient ? 'Edit Data Klien' : 'Tambah Klien Baru'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact form-label-required">Nama Perusahaan / Klien</label>
                <input type="text" className="form-input-compact" style={{ height: '32px' }} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="Contoh: PT Teknologi Bangsa" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label-compact">Nama Kontak (PIC)</label>
                  <input type="text" className="form-input-compact" style={{ height: '32px' }} value={formData.contactPerson} onChange={e => setFormData({...formData, contactPerson: e.target.value})} placeholder="Nama perwakilan" />
                </div>
                <div>
                  <label className="form-label-compact">No. Telepon / WA</label>
                  <input type="text" className="form-input-compact" style={{ height: '32px' }} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="0812..." />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact">Email</label>
                <input type="email" className="form-input-compact" style={{ height: '32px' }} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="email@klien.com" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label-compact">Alamat Lengkap</label>
                  <input type="text" className="form-input-compact" style={{ height: '32px' }} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Alamat kantor..." />
                </div>
                <div>
                  <label className="form-label-compact form-label-required">Status</label>
                  <select className="form-input-compact" style={{ height: '32px' }} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} required>
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                {editingClient ? (
                  <button type="button" onClick={() => handleDelete(editingClient.id, editingClient.name)} style={{ color: '#EF4444', background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: 600, padding: '4px' }}>
                    Hapus
                  </button>
                ) : <div></div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={closeModal} className="btn-secondary btn-sm">Batal</button>
                  <button type="submit" className="btn-primary btn-sm">Simpan</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientsPage;
