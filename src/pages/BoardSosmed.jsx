import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, CheckCircle2, Link as LinkIcon, Trash2, Send, AlertCircle, Award } from 'lucide-react';

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook'];

export default function BoardSosmed() {
  const { currentUser, userRole, userName } = useAuth();
  const isAdmin = ['admin', 'admin_ops'].includes(userRole);
  const isReporter = userRole === 'reporter';
  const hasAccess = isAdmin || isReporter;
  
  const [topics, setTopics] = useState([]);
  const [todaysPosts, setTodaysPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Extra Slots state (for exceeding 3 quota)
  const [extraSlotsCount, setExtraSlotsCount] = useState(0);

  // Form State for Admin Topic
  const [newTopic, setNewTopic] = useState({ title: '', description: '' });
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);

  // Form State for Karyawan/Admin Slots
  const [slotData, setSlotData] = useState({});

  useEffect(() => {
    // Fetch Topics
    const qTopics = query(collection(db, 'sosmed_topics'), orderBy('createdAt', 'desc'));
    const unsubTopics = onSnapshot(qTopics, (snapshot) => {
      const t = [];
      snapshot.forEach(doc => t.push({ id: doc.id, ...doc.data() }));
      setTopics(t);
    });

    // Fetch Today's Posts (Local Timezone)
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const qPosts = query(collection(db, 'social_posts'), where('dateString', '==', todayStr));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const p = [];
      snapshot.forEach(doc => p.push({ id: doc.id, ...doc.data() }));
      setTodaysPosts(p);
      setLoading(false);
    });

    return () => {
      unsubTopics();
      unsubPosts();
    };
  }, []);

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    if (!newTopic.title) return;
    try {
      await addDoc(collection(db, 'sosmed_topics'), {
        title: newTopic.title,
        description: newTopic.description,
        author: userName || currentUser.email,
        createdAt: serverTimestamp()
      });
      setNewTopic({ title: '', description: '' });
      setIsCreatingTopic(false);
    } catch (error) {
      console.error("Error creating topic:", error);
    }
  };

  const handleDeleteTopic = async (id) => {
    if (window.confirm("Hapus topik ini?")) {
      await deleteDoc(doc(db, 'sosmed_topics', id));
    }
  };

  const handleSlotChange = (slotIndex, field, value) => {
    setSlotData(prev => ({
      ...prev,
      [slotIndex]: {
        ...prev[slotIndex],
        [field]: value
      }
    }));
  };

  const handleSubmitSlot = async (slotIndex) => {
    const raw = slotData[slotIndex] || {};
    // Use same fallback as render: platform defaults to 'Instagram'
    const data = {
      platform: raw.platform || 'Instagram',
      content: (raw.content || '').trim(),
      proofLink: (raw.proofLink || '').trim(),
      views: raw.views || 0,
      likes: raw.likes || 0,
      comments: raw.comments || 0,
    };
    if (!data.platform || !data.content || !data.proofLink) {
      alert("Harap lengkapi Platform, Judul/Catatan, dan Link Bukti.");
      return;
    }

    try {
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      // Simpan ke social_posts (untuk Insight)
      await addDoc(collection(db, 'social_posts'), {
        dateString: todayStr,
        date: serverTimestamp(),
        platform: data.platform,
        content: data.content,
        proofLink: data.proofLink,
        status: 'done',
        assigneeEmail: currentUser.email,
        metrics: {
          views: Number(data.views) || 0,
          likes: Number(data.likes) || 0,
          comments: Number(data.comments) || 0
        }
      });

      // Simpan log aktivitas (untuk Dashboard)
      await addDoc(collection(db, 'activity_log'), {
        userName: userName || currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        action: `Mengunggah konten ${data.platform}: ${data.content}`,
        timestamp: serverTimestamp()
      });

      // Reset form slot
      setSlotData(prev => {
        const newData = { ...prev };
        delete newData[slotIndex];
        return newData;
      });
      
      // Reset extra slots count since one was just fulfilled and will now render as completed
      setExtraSlotsCount(0);

    } catch (error) {
      console.error("Error submitting post:", error);
      alert("Gagal menyimpan laporan.");
    }
  };

  if (loading) return <div className="page-content">Memuat data...</div>;

  if (!hasAccess) {
    return (
      <div className="page-content">
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '15px' }}>Anda tidak memiliki akses ke halaman ini.</p>
        </div>
      </div>
    );
  }

  // Filter post khusus untuk current user (Semua orang dapet jatah 3 slot, termasuk Admin)
  const myPostsToday = todaysPosts.filter(p => p.assigneeEmail === currentUser.email);
  
  // Group all posts by user (untuk Admin view Monitoring)
  const postsByUser = todaysPosts.reduce((acc, post) => {
    const email = post.assigneeEmail || 'Unknown';
    if (!acc[email]) acc[email] = [];
    acc[email].push(post);
    return acc;
  }, {});

  const renderMySlots = () => {
    const emptySlotsRequired = Math.max(0, 3 - myPostsToday.length);
    const totalEmptySlotsToRender = emptySlotsRequired + extraSlotsCount;

    return (
      <details className="card" open style={{ marginBottom: isAdmin ? '40px' : '0', padding: 0, overflow: 'hidden' }}>
        <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', padding: '12px', cursor: 'pointer', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', listStyle: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>▼</span>
            <h2 style={{ fontSize: '15px', margin: 0, color: '#111827' }}>Tugas Harian Anda</h2>
          </div>
          <span style={{ backgroundColor: myPostsToday.length >= 3 ? '#D1FAE5' : '#FEF3C7', color: myPostsToday.length >= 3 ? '#065F46' : '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
            {myPostsToday.length >= 3 ? `${myPostsToday.length} Konten Selesai` : `${myPostsToday.length}/3 Selesai`}
          </span>
        </summary>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Render Completed Slots */}
          {myPostsToday.map((post, index) => (
            <div key={post.id} className="card" style={{ padding: '12px', borderLeft: '4px solid #10B981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B7280' }}>
                  {index < 3 ? `Slot ${index + 1} - Selesai` : `Slot Ekstra ${index + 1} - Selesai`}
                </span>
                <CheckCircle2 size={18} color="#10B981" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600 }}>{post.platform}</span>
                <span style={{ fontSize: '13px', color: '#4B5563' }}>{post.content}</span>
                <a href={post.proofLink} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#3B82F6', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                  <LinkIcon size={14} /> Lihat Bukti Postingan
                </a>
              </div>
            </div>
          ))}

          {/* Render Empty Slots */}
          {Array.from({ length: totalEmptySlotsToRender }).map((_, index) => {
            const slotIndex = myPostsToday.length + index; // e.g., 0, 1, 2
            const currentSlotData = slotData[slotIndex] || { platform: 'Instagram', content: '', proofLink: '' };
            const isExtra = slotIndex >= 3;
            
            return (
              <div key={`empty-${slotIndex}`} className="card" style={{ padding: '12px', borderLeft: isExtra ? '4px solid #8B5CF6' : '4px solid #F59E0B' }}>
                <div style={{ marginBottom: '16px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isExtra ? '#4C1D95' : '#92400E', backgroundColor: isExtra ? '#EDE9FE' : '#FEF3C7', padding: '4px 8px', borderRadius: '4px' }}>
                    {isExtra ? `Slot Ekstra - Dalam Proses` : `Slot ${slotIndex + 1} - Dalam Proses`}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>Platform</label>
                    <select 
                      value={currentSlotData.platform} 
                      onChange={(e) => handleSlotChange(slotIndex, 'platform', e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                    >
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', marginTop: '4px' }}>Judul Topik</label>
                    <input 
                      type="text" 
                      placeholder="Sebutkan referensi topik (misal: Sesuai Instruksi Kasus X)" 
                      value={currentSlotData.content}
                      onChange={(e) => handleSlotChange(slotIndex, 'content', e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>Link URL Bukti</label>
                    <input 
                      type="text" 
                      placeholder="https://..." 
                      value={currentSlotData.proofLink}
                      onChange={(e) => handleSlotChange(slotIndex, 'proofLink', e.target.value)}
                      style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #93C5FD', backgroundColor: '#EFF6FF', fontSize: '12px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                    <div style={{ width: '100px', flexShrink: 0 }}>
                      <label style={{ fontSize: '13px', fontWeight: 500, color: '#4B5563', lineHeight: '1.2' }}>Engagement<br/><span style={{ fontSize: '10px', color: '#9CA3AF' }}>(Opsional)</span></label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                      <input 
                        type="number" min="0" placeholder="Views" value={currentSlotData.views || ''} 
                        onChange={(e) => handleSlotChange(slotIndex, 'views', e.target.value)}
                        style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                      />
                      <input 
                        type="number" min="0" placeholder="Likes" value={currentSlotData.likes || ''} 
                        onChange={(e) => handleSlotChange(slotIndex, 'likes', e.target.value)}
                        style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                      />
                      <input 
                        type="number" min="0" placeholder="Komen" value={currentSlotData.comments || ''} 
                        onChange={(e) => handleSlotChange(slotIndex, 'comments', e.target.value)}
                        style={{ width: '70px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <button 
                      onClick={() => handleSubmitSlot(slotIndex)}
                      className="btn-primary btn-sm" 
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Send size={14} /> Laporkan Selesai
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Banner Success & Extra Slot Button */}
          {myPostsToday.length >= 3 && extraSlotsCount === 0 ? (
            <div className="card" style={{ padding: '16px', textAlign: 'center', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div>
                <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto' }} />
                <p style={{ margin: '8px 0 0 0', color: '#065F46', fontWeight: 600, fontSize: '14px' }}>Luar biasa! Target 3 postingan hari ini sudah selesai.</p>
              </div>
              <button 
                onClick={() => setExtraSlotsCount(prev => prev + 1)} 
                className="btn-success btn-sm" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Award size={16} /> Lapor Konten Ekstra
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
               <button 
                onClick={() => setExtraSlotsCount(prev => prev + 1)} 
                className="btn-secondary btn-sm" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed #8B5CF6', color: '#6D28D9', backgroundColor: '#F5F3FF' }}
              >
                <Plus size={16} /> Tambah Slot Ekstra (Lembur / Rajin)
              </button>
            </div>
          )}
        </div>
      </details>
    );
  };

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '24px' }}>
      
      {/* HEADER */}
      <div style={{ borderBottom: '1px solid #E5E7EB', paddingBottom: '12px', marginBottom: '8px' }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 4px 0', color: '#111827' }}>Manajemen Konten & Sosmed</h1>
        <p style={{ margin: 0, color: '#6B7280', fontSize: '13px' }}>Sistem Penugasan Topik dan Laporan Kuota Harian</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        
        {/* PANEL KIRI: TOPIK DARI ADMIN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', margin: 0, color: '#111827' }}>Instruksi Topik Aktif</h2>
            {isAdmin && !isCreatingTopic && (
              <button onClick={() => setIsCreatingTopic(true)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={14} /> Topik Baru
              </button>
            )}
          </div>

          {isCreatingTopic && (
            <div className="card" style={{ padding: '12px', backgroundColor: '#F9FAFB' }}>
              <form onSubmit={handleCreateTopic} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="text" 
                  placeholder="Judul Topik (Contoh: Berita Politik Kasus X)" 
                  value={newTopic.title}
                  onChange={e => setNewTopic({...newTopic, title: e.target.value})}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  required
                />
                <textarea 
                  placeholder="Instruksi detail..." 
                  value={newTopic.description}
                  onChange={e => setNewTopic({...newTopic, description: e.target.value})}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #D1D5DB', minHeight: '80px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setIsCreatingTopic(false)} className="btn-secondary btn-sm">Batal</button>
                  <button type="submit" className="btn-primary btn-sm">Simpan Topik</button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {topics.length === 0 ? (
              <div className="card" style={{ padding: '16px', textAlign: 'center', color: '#6B7280' }}>Belum ada topik aktif.</div>
            ) : (
              topics.map(topic => (
                <div key={topic.id} className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', color: '#111827' }}>{topic.title}</h3>
                    {isAdmin && (
                      <button onClick={() => handleDeleteTopic(topic.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '4px' }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {topic.description && <p style={{ margin: 0, fontSize: '13px', color: '#4B5563', lineHeight: '1.5' }}>{topic.description}</p>}
                  <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Oleh: {topic.author ? topic.author.split('@')[0] : 'Admin'}</span>
                </div>
              ))
            )}
          </div>

        {/* MONITORING SELURUH TIM (HANYA MUNCUL UNTUK ADMIN) */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <h2 style={{ fontSize: '15px', margin: 0, color: '#111827' }}>Monitoring Kuota Tim Hari Ini</h2>
              <div className="card" style={{ padding: '12px' }}>
                {Object.keys(postsByUser).length === 0 ? (
                  <p style={{ margin: 0, color: '#6B7280', fontSize: '14px', textAlign: 'center', padding: '16px' }}>Belum ada tim yang menyetor laporan hari ini.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {Object.entries(postsByUser).map(([email, posts]) => {
                      const isExtra = posts.length > 3;
                      return (
                        <div key={email} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 600, color: '#111827', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {email.split('@')[0]}
                              {isExtra && <Award size={16} color="#8B5CF6" title="Karyawan Rajin (Over-target)" />}
                            </span>
                            <span style={{ backgroundColor: posts.length >= 3 ? '#D1FAE5' : '#FEF3C7', color: posts.length >= 3 ? '#065F46' : '#92400E', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                              {posts.length >= 3 ? `${posts.length} Selesai` : `${posts.length}/3 Selesai`}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {posts.map((post, idx) => (
                              <div key={post.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', backgroundColor: '#F9FAFB', padding: '8px 12px', borderRadius: '6px' }}>
                                <CheckCircle2 size={16} color="#10B981" />
                                <span style={{ fontWeight: 500, width: '70px' }}>{post.platform}</span>
                                <span style={{ flexGrow: 1, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.content}</span>
                                <a href={post.proofLink} target="_blank" rel="noreferrer" style={{ color: '#3B82F6', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                                  <LinkIcon size={14} /> Bukti
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PANEL KANAN: KUOTA HARIAN */}
        <div>
          {/* 3 SLOT MILIK USER (Muncul baik untuk Admin maupun Karyawan) */}
          {renderMySlots()}
        </div>

      </div>
    </div>
  );
}
