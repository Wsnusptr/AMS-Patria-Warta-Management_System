import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit3, Trash2, Megaphone, Activity, AlertCircle } from 'lucide-react';

export default function Pengumuman() {
  const { currentUser, userRole } = useAuth();
  const isAdmin = ['admin'].includes(userRole);
  
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ title: '', content: '' });

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setAnnouncements(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>Anda tidak memiliki akses ke halaman ini.</p>
        </div>
      </div>
    );
  }

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ title: item.title, content: item.content });
    } else {
      setEditingItem(null);
      setFormData({ title: '', content: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'announcements', editingItem.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'announcements'), {
          ...formData,
          authorEmail: currentUser.email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        await addDoc(collection(db, 'activity_log'), {
          userName: currentUser.email.split('@')[0],
          userEmail: currentUser.email,
          action: `Membuat pengumuman: ${formData.title}`,
          timestamp: serverTimestamp()
        });
      }
      closeModal();
    } catch (error) {
      console.error("Error saving announcement:", error);
      alert('Terjadi kesalahan saat menyimpan pengumuman.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Hapus pengumuman ini secara permanen?')) {
      await deleteDoc(doc(db, 'announcements', id));
      closeModal();
    }
  };

  if (loading) return <div className="page-content">Memuat data...</div>;

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '24px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: '#111827' }}>Manajemen Pengumuman</h1>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: 0 }}>Kelola informasi dan instruksi yang tayang di Dashboard tim</p>
        </div>

        <button onClick={() => openModal()} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} /> Buat Pengumuman
        </button>
      </div>

      {/* LIST VIEW CONTAINER */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {announcements.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
            <Activity size={24} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '12px' }}>Belum ada pengumuman yang diterbitkan.</p>
          </div>
        ) : (
          announcements.map(item => (
            <div key={item.id} className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Megaphone size={16} color="#3B82F6" />
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>{item.title}</h3>
                </div>
                
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#4B5563', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#9CA3AF', fontSize: '11px' }}>
                  <span>Dibuat oleh: {item.authorEmail.split('@')[0]}</span>
                  <span>•</span>
                  <span>{item.createdAt ? new Date(item.createdAt.toDate()).toLocaleString('id-ID') : 'Baru saja'}</span>
                </div>
              </div>

              <button onClick={() => openModal(item)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '8px', marginLeft: '16px' }} title="Edit Pengumuman">
                <Edit3 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* MODAL FORM PENGUMUMAN */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px', margin: '20px' }}>
            
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
              <Megaphone size={16} color="#111827" />
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingItem ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '18px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Judul Pengumuman</label>
                <input 
                  type="text" 
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})} 
                  required 
                  placeholder="Contoh: Rapat Mingguan"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Isi Pesan / Instruksi
                </label>
                <textarea 
                  value={formData.content} 
                  onChange={e => setFormData({...formData, content: e.target.value})} 
                  required 
                  placeholder="Tuliskan informasi detail di sini..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '13px', outline: 'none', minHeight: '100px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px' }}>
                {editingItem ? (
                  <button type="button" onClick={() => handleDelete(editingItem.id)} style={{ color: '#EF4444', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600, padding: '8px' }}>
                    Hapus Permanen
                  </button>
                ) : <div></div>}
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={closeModal} className="btn-secondary btn-sm">
                    Batal
                  </button>
                  <button type="submit" className="btn-primary btn-sm">
                    Terbitkan
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
