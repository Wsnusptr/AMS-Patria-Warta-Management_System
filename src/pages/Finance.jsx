import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit3, Trash2, Wallet, TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';

// CATEGORIES are now dynamic based on Clients

export default function Finance() {
  const { currentUser, userRole } = useAuth();
  const hasAccess = ['admin', 'admin_ops', 'admin_finance'].includes(userRole);
  
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    type: 'pemasukan',
    category: 'Iklan/Ads',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    
    // Fetch clients for dropdown
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const activeClients = snapshot.docs
        .map(d => d.data())
        .filter(c => c.status === 'Aktif')
        .map(c => c.name)
        .sort((a,b) => a.localeCompare(b));
      setClients(activeClients);
    });

    const q = query(collection(db, 'finance_records'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setRecords(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
      unsubClients();
    };
  }, [hasAccess]);

  const categoriesMap = {
    pemasukan: [...clients, 'Adsense', 'Sponsorship', 'Donasi', 'Lainnya'],
    pengeluaran: ['Operasional', 'Gaji Tim', 'Hosting/Domain', 'Liputan/Transport', 'Peralatan', 'Lainnya']
  };

  if (!hasAccess) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>Anda tidak memiliki akses ke modul Keuangan.</p>
        </div>
      </div>
    );
  }

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        type: item.type,
        category: item.category,
        amount: item.amount,
        description: item.description || '',
        date: item.date
      });
    } else {
      setEditingItem(null);
      setFormData({
        type: 'pemasukan',
        category: 'Iklan/Ads',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setFormData({
      ...formData,
      type: newType,
      category: categoriesMap[newType][0]
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
        recordedBy: currentUser.email,
        updatedAt: serverTimestamp()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'finance_records', editingItem.id), payload);
      } else {
        await addDoc(collection(db, 'finance_records'), {
          ...payload,
          createdAt: serverTimestamp()
        });
        
        await addDoc(collection(db, 'activity_log'), {
          userName: currentUser.email.split('@')[0],
          userEmail: currentUser.email,
          action: `Mencatat ${formData.type} keuangan: Rp ${Number(formData.amount).toLocaleString('id-ID')}`,
          timestamp: serverTimestamp()
        });
      }
      closeModal();
    } catch (error) {
      console.error("Error saving finance record:", error);
      alert('Terjadi kesalahan saat menyimpan data keuangan.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Hapus catatan keuangan ini?')) {
      await deleteDoc(doc(db, 'finance_records', id));
      closeModal();
    }
  };

  const formatRupiah = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  // Calculate Summaries
  const totalPemasukan = records.filter(r => r.type === 'pemasukan').reduce((acc, curr) => acc + curr.amount, 0);
  const totalPengeluaran = records.filter(r => r.type === 'pengeluaran').reduce((acc, curr) => acc + curr.amount, 0);
  const saldo = totalPemasukan - totalPengeluaran;

  if (loading) return <div className="page-content">Memuat data...</div>;

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '16px' }}>
      
      {/* HEADER */}
      <div className="finance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 2px 0', color: '#111827' }}>Keuangan & Kas</h1>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>Pantau arus kas, pemasukan, dan pengeluaran operasional</p>
        </div>

        <button 
          onClick={() => openModal()} 
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
        >
          <Plus size={14} /> Catat Transaksi
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="finance-summary-grid">
        <div className="stat-card-minimal">
          <div className="stat-card-icon gold"><Wallet size={16} /></div>
          <div>
            <div className="stat-card-label">Saldo Kas Saat Ini</div>
            <div className="stat-card-value" style={{ color: saldo < 0 ? '#DC2626' : 'inherit' }}>{formatRupiah(saldo)}</div>
          </div>
        </div>
        <div className="stat-card-minimal">
          <div className="stat-card-icon green"><TrendingUp size={16} /></div>
          <div>
            <div className="stat-card-label">Total Pemasukan</div>
            <div className="stat-card-value">{formatRupiah(totalPemasukan)}</div>
          </div>
        </div>
        <div className="stat-card-minimal">
          <div className="stat-card-icon red"><TrendingDown size={16} /></div>
          <div>
            <div className="stat-card-label">Total Pengeluaran</div>
            <div className="stat-card-value">{formatRupiah(totalPengeluaran)}</div>
          </div>
        </div>
      </div>

      {/* LIST TRANSAKSI */}
      <div className="card-minimal" style={{ padding: '16px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#111827' }}>Riwayat Transaksi</h3>
        
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
            <Activity size={24} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '12px' }}>Belum ada data transaksi keuangan.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table-compact">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Tipe</th>
                  <th>Kategori</th>
                  <th>Deskripsi</th>
                  <th>Jumlah</th>
                  <th>Dicatat</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => (
                  <tr key={record.id}>
                    <td data-label="Tanggal" style={{ whiteSpace: 'nowrap' }}>{record.date}</td>
                    <td data-label="Tipe">
                      <span className={`badge badge-compact ${record.type === 'pemasukan' ? 'badge-green' : 'badge-red'}`}>
                        {record.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                      </span>
                    </td>
                    <td data-label="Kategori" className="table-cell-bold">{record.category}</td>
                    <td data-label="Deskripsi" style={{ maxWidth: '250px' }} className="truncate" title={record.description}>{record.description || '-'}</td>
                    <td data-label="Jumlah" style={{ color: record.type === 'pemasukan' ? '#10B981' : '#EF4444', fontWeight: 600 }}>
                      {record.type === 'pemasukan' ? '+' : '-'}{formatRupiah(record.amount)}
                    </td>
                    <td data-label="Dicatat" className="table-cell-muted">{record.recordedBy.split('@')[0]}</td>
                    <td data-label="Aksi" style={{ textAlign: 'right' }}>
                      <button onClick={() => openModal(record)} className="table-action-btn-compact" title="Edit Data">
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
              <Wallet size={16} color="#111827" />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingItem ? 'Edit Transaksi' : 'Catat Transaksi'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="form-label-compact form-label-required">Tipe Transaksi</label>
                  <select className="form-input-compact" style={{ height: '32px' }} value={formData.type} onChange={handleTypeChange} required>
                    <option value="pemasukan">Pemasukan</option>
                    <option value="pengeluaran">Pengeluaran</option>
                  </select>
                </div>
                <div>
                  <label className="form-label-compact form-label-required">Tanggal</label>
                  <input type="date" className="form-input-compact" style={{ height: '32px' }} value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} required />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact form-label-required">Kategori</label>
                <select className="form-input-compact" style={{ height: '32px' }} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} required>
                  {categoriesMap[formData.type].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact form-label-required">Nominal (Rp)</label>
                <input type="number" min="0" step="1" className="form-input-compact" style={{ height: '32px' }} placeholder="0" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="form-label-compact">Deskripsi / Keterangan</label>
                <textarea className="form-input-compact" style={{ minHeight: '60px', resize: 'vertical' }} placeholder="Detail transaksi..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px' }}>
                {editingItem ? (
                  <button type="button" onClick={() => handleDelete(editingItem.id)} style={{ color: '#EF4444', background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', fontWeight: 600, padding: '4px' }}>
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
