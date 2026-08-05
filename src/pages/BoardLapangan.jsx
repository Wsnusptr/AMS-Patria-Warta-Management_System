import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, MapPin, User, FileText, CheckCircle2, Link as LinkIcon, Edit3, ChevronRight, Activity, Zap, Check, AlertCircle, Users, StickyNote, FileCheck, Camera, X, Trash2 } from 'lucide-react';
import './BoardLapangan.css';

// STAGES IN PIPELINE
const STAGES = [
  { id: 'tugas_baru', label: 'Tugas Baru' },
  { id: 'sedang_liputan', label: 'Liputan' },
  { id: 'draft_berita', label: 'Penulisan' },
  { id: 'siap_terbit', label: 'Antrean' },
  { id: 'selesai', label: 'Terbit' }
];

export default function BoardLapangan() {
  const { currentUser, userRole, userName } = useAuth();
  const isAdmin = ['admin', 'admin_ops'].includes(userRole);
  const isReporter = userRole === 'reporter';
  const hasAccess = isAdmin || isReporter;
  
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  
  // Create/Edit Task Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState('assigned'); // 'assigned' or 'inisiatif'
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    title: '', location: '', description: '', assigneeEmail: '', status: 'tugas_baru', type: 'assigned', client: '', coAssignees: []
  });

  // Advance Stage Modal
  const [advanceModal, setAdvanceModal] = useState({
    isOpen: false,
    task: null,
    nextStatus: '',
    teamMembers: '',
    fieldNotes: '',
    draftTitle: '',
    proofLink: '',
    uploadFiles: [],
    isUploading: false
  });

  // Lightbox
  const [lightboxImg, setLightboxImg] = useState(null);

  useEffect(() => {
    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const activeClients = snapshot.docs.map(d => d.data()).filter(c => c.status === 'Aktif').map(c => c.name).sort((a,b) => a.localeCompare(b));
      setClients(activeClients);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ email: d.id, ...d.data() })));
    });

    const q = query(collection(db, 'field_tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      setTasks(data);
      setLoading(false);
    });
    return () => {
      unsubscribe();
      unsubClients();
      unsubUsers();
    };
  }, []);

  // --- HANDLERS FOR CREATING/EDITING TASKS ---

  const openModal = (type = 'assigned', task = null) => {
    setModalType(type);
    if (task) {
      setEditingTask(task);
      setFormData({
        title: task.title || '',
        location: task.location || '',
        description: task.description || '',
        assigneeEmail: task.assigneeEmail || '',
        status: task.status || 'tugas_baru',
        type: task.type || 'assigned',
        client: task.client || '',
        coAssignees: task.coAssignees || []
      });
    } else {
      setEditingTask(null);
      setFormData({
        title: '', location: '', description: '',
        assigneeEmail: type === 'inisiatif' ? currentUser.email : '',
        status: 'tugas_baru', type: type, client: '', coAssignees: []
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTask) {
        const taskRef = doc(db, 'field_tasks', editingTask.id);
        await updateDoc(taskRef, { ...formData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'field_tasks'), {
          ...formData, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'activity_log'), {
          userName: userName || currentUser.email.split('@')[0],
          userEmail: currentUser.email,
          action: modalType === 'inisiatif' ? `Berinisiatif liputan: ${formData.title}` : `Menugaskan liputan: ${formData.title}`,
          timestamp: serverTimestamp()
        });
      }
      closeModal();
    } catch (error) {
      console.error("Error saving task:", error);
      alert('Terjadi kesalahan saat menyimpan tugas.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Hapus tugas ini dari sistem?')) {
      await deleteDoc(doc(db, 'field_tasks', id));
      closeModal();
    }
  };

  // --- HANDLERS FOR ADVANCING TASKS (STAGE-GATES) ---

  const triggerAdvance = (task) => {
    const currentIndex = STAGES.findIndex(s => s.id === task.status);
    if (currentIndex === -1 || currentIndex === STAGES.length - 1) return;
    
    const nextStatus = STAGES[currentIndex + 1].id;
    
    setAdvanceModal({
      isOpen: true,
      task: task,
      nextStatus: nextStatus,
      teamMembers: task.teamMembers || '',
      fieldNotes: task.fieldNotes || '',
      draftTitle: task.draftTitle || '',
      proofLink: task.proofLink || '',
      uploadFiles: [],
      isUploading: false
    });
  };

  const handleAdvanceSubmit = async (e) => {
    e.preventDefault();
    const { task, nextStatus, teamMembers, fieldNotes, draftTitle, proofLink, uploadFiles } = advanceModal;
    
    try {
      setAdvanceModal({ ...advanceModal, isUploading: true });
      const taskRef = doc(db, 'field_tasks', task.id);
      const updatePayload = { status: nextStatus, updatedAt: serverTimestamp() };
      let actionLog = '';

      if (nextStatus === 'sedang_liputan') {
        updatePayload.teamMembers = teamMembers;
        actionLog = `Berangkat meliput: ${task.title}. Tim: ${teamMembers}`;
      } else if (nextStatus === 'draft_berita') {
        updatePayload.fieldNotes = fieldNotes;
        
        // Handle Supabase Image Upload (Multi-Upload + Signed URLs)
        if (uploadFiles && uploadFiles.length > 0) {
          const urls = [];
          
          for (let i = 0; i < uploadFiles.length; i++) {
            const file = uploadFiles[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${task.id}-${Date.now()}-${i}.${fileExt}`;
            
            const { error } = await supabase.storage
              .from('bukti-liputan')
              .upload(fileName, file);
              
            if (error) {
              console.error("Supabase upload error:", error);
              alert(`Gagal mengunggah foto ke-${i+1}. Pastikan RLS di Supabase mengizinkan public INSERT: ` + error.message);
              continue; // Skip file if error
            }
            
            // Get Signed URL (10 years expiry) to bypass Private Bucket restriction
            const { data: urlData, error: signedError } = await supabase.storage
              .from('bukti-liputan')
              .createSignedUrl(fileName, 315360000); // 10 years in seconds
              
            if (urlData && urlData.signedUrl) {
              urls.push(urlData.signedUrl);
            }
          }
          
          if (urls.length > 0) {
            updatePayload.imageUrls = urls;
          }
        }

        actionLog = `Selesai liputan (Mulai menulis draft): ${task.title}`;
      } else if (nextStatus === 'siap_terbit') {
        updatePayload.draftTitle = draftTitle;
        actionLog = `Mengirim draft berita: ${task.title}`;
      } else if (nextStatus === 'selesai') {
        updatePayload.proofLink = proofLink;
        actionLog = `Menerbitkan berita: ${task.title}`;
      }

      await updateDoc(taskRef, updatePayload);

      await addDoc(collection(db, 'activity_log'), {
        userName: userName || currentUser.email.split('@')[0],
        userEmail: currentUser.email,
        action: actionLog,
        timestamp: serverTimestamp()
      });
      
      setAdvanceModal({ ...advanceModal, isOpen: false, isUploading: false, uploadFiles: [] });
    } catch (error) {
      console.error("Error advancing task:", error);
      setAdvanceModal({ ...advanceModal, isUploading: false });
    }
  };

  // --- RENDER HELPERS ---

  const renderStepper = (currentStatus) => {
    const currentIndex = STAGES.findIndex(s => s.id === currentStatus);
    return (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginTop: '16px' }}>
        {STAGES.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isActive = idx === currentIndex;
          
          return (
            <React.Fragment key={stage.id}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
                <div style={{ 
                  width: '24px', height: '24px', borderRadius: '50%', 
                  backgroundColor: isCompleted ? '#10B981' : isActive ? '#3B82F6' : '#E5E7EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 2
                }}>
                  {isCompleted ? <Check size={14} /> : (isActive ? <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff' }}/> : null)}
                </div>
                <span style={{ 
                  marginTop: '8px', fontSize: '11px', fontWeight: isActive ? 600 : 500,
                  color: isCompleted ? '#10B981' : isActive ? '#111827' : '#9CA3AF', textAlign: 'center'
                }}>
                  {stage.label}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div style={{ flex: 1, height: '2px', backgroundColor: isCompleted ? '#10B981' : '#E5E7EB', transform: 'translateY(-14px)' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const getActionLabel = (status) => {
    switch (status) {
      case 'tugas_baru': return 'Berangkat ke Lokasi';
      case 'sedang_liputan': return 'Selesai Liputan';
      case 'draft_berita': return 'Kirim Draft';
      case 'siap_terbit': return 'Publikasikan Berita';
      default: return 'Selesai';
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

  const todayTasks = tasks.filter(task => {
    if (task.status !== 'selesai') return false;
    if (!task.updatedAt) return false;
    const date = task.updatedAt.toDate ? task.updatedAt.toDate() : new Date(task.updatedAt);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });

  return (
    <div className="page-content bl-container">
      
      {/* HEADER */}
      <div className="bl-header">
        <div>
          <h1 className="bl-title">Operasi Lapangan</h1>
          <p className="bl-subtitle">Pantau siklus liputan dan laporan secara aktual</p>
        </div>

        <div className="bl-header-actions">
          {isAdmin && (
            <>
              <button onClick={() => openModal('inisiatif')} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={14} color="#4B5563" /> Inisiatif Liputan
              </button>
              <button onClick={() => openModal('assigned')} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={14} /> Tugaskan Reporter
              </button>
            </>
          )}
        </div>
      </div>

      {/* LIST VIEW CONTAINER */}
      <div className="bl-list-container">
        {tasks.filter(t => t.status !== 'selesai').length === 0 ? (
          <div className="bl-empty-state">
            <Activity size={32} className="bl-empty-icon" />
            <p className="bl-empty-text">Belum ada aktivitas lapangan yang aktif.</p>
          </div>
        ) : (
          tasks.filter(t => t.status !== 'selesai').map(task => (
            <div key={task.id} className="card bl-task-card">
              
              {/* Top Row: Meta Info & Edit */}
              <div className="bl-task-top-row">
                
                <div className="bl-task-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={task.type === 'inisiatif' ? 'bl-badge-inisiatif' : 'bl-badge-penugasan'}>
                      {task.type === 'inisiatif' ? 'Inisiatif' : 'Penugasan'}
                    </span>
                    <h3 className="bl-task-title-text">{task.title}</h3>
                  </div>

                  <div className="bl-task-meta">
                    <div className="bl-task-meta-item"><MapPin size={16} />{task.location || '-'}</div>
                    <div className="bl-task-meta-item"><User size={16} /><span className="bl-task-assignee-text">{task.assigneeEmail ? task.assigneeEmail.split('@')[0] : '-'}</span></div>
                    {task.client && <div className="bl-task-client-badge"><strong>Klien:</strong> {task.client}</div>}
                  </div>
                  
                  {task.description && (
                    <div className="bl-instruction-box">
                      <p className="bl-instruction-text"><strong>Instruksi:</strong> {task.description}</p>
                    </div>
                  )}

                  {/* ⚠️ ANTI-CONFLICT: WARNING BOX IF ALREADY IN FIELD OR LATER */}
                  {task.status !== 'tugas_baru' && task.teamMembers && (
                    <div className="bl-conflict-box">
                      <Users size={16} color="#DC2626" />
                      Sedang diliput oleh: {task.teamMembers}
                    </div>
                  )}

                  {/* 📝 FIELD NOTES PREVIEW */}
                  {(task.status === 'draft_berita' || task.status === 'siap_terbit' || task.status === 'selesai') && task.fieldNotes && (
                    <div className="bl-fieldnotes-box">
                      <div className="bl-fieldnotes-header">
                        <StickyNote size={16} color="#059669" className="bl-fieldnotes-icon" />
                        <div>
                          <strong>Catatan Lapangan:</strong> {task.fieldNotes}
                        </div>
                      </div>
                      
                      {/* --- LEGACY SINGLE IMAGE / NEW MULTI IMAGE RENDER --- */}
                      {(task.imageUrls?.length > 0 || task.imageUrl) && (
                        <div style={{ marginTop: '4px' }}>
                          <div className="bl-photo-evidence-title">
                            <Camera size={14} /> Foto Bukti Liputan {task.imageUrls?.length > 1 ? `(${task.imageUrls.length})` : ''}:
                          </div>
                          <div className="bl-photo-gallery">
                            {(task.imageUrls || [task.imageUrl]).map((url, idx) => (
                              <img key={idx} src={url} alt={`Bukti ${idx+1}`} onClick={() => setLightboxImg(url)} className="bl-photo-img" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {task.proofLink && (
                    <div className="bl-proof-link-container">
                      <a href={task.proofLink} target="_blank" rel="noreferrer" className="bl-proof-link">
                        <LinkIcon size={14} /> Lihat Berita Terbit
                      </a>
                    </div>
                  )}
                </div>

                {isAdmin && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => openModal(task.type, task)} className="bl-edit-btn" title="Edit Data">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => handleDelete(task.id)} className="bl-delete-btn" title="Hapus Tugas">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Row: Tracker & Action */}
              <div className="bl-task-bottom-row">
                <div className="bl-stepper-container">{renderStepper(task.status)}</div>
                <div className="bl-action-btn-container">
                  {task.status !== 'selesai' ? (
                    <button onClick={() => triggerAdvance(task)} className="btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%' }}>
                      {getActionLabel(task.status)}
                      <ChevronRight size={14} />
                    </button>
                  ) : (
                    <div className="bl-completed-badge">
                      <CheckCircle2 size={18} /> Tugas Selesai
                    </div>
                  )}
                </div>
              </div>

            </div>
          ))
        )}
      </div>

      {/* --- MONITORING SELESAI HARI INI --- */}
      <div className="bl-monitoring-section">
        <h2 className="bl-monitoring-title">
          <Activity size={20} color="var(--pw-primary)" />
          Informasi Monitoring Pengerjaan (Selesai Hari Ini)
        </h2>
        {todayTasks.length === 0 ? (
          <div className="card bl-monitoring-empty">
            Belum ada liputan yang selesai hari ini.
          </div>
        ) : (
          <div className="card bl-monitoring-list">
            <div className="bl-monitoring-list-container">
              {todayTasks.map(task => (
                <div key={task.id} className="bl-monitoring-item">
                  <div 
                    onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                    className="bl-monitoring-item-header"
                  >
                    <CheckCircle2 size={20} color="#10B981" />
                    <div className="bl-monitoring-item-info">
                      <div className="bl-monitoring-item-title">{task.title}</div>
                      <div className="bl-monitoring-item-meta">
                        <span style={{ fontWeight: 600 }}>Reporter:</span> {task.assigneeEmail ? task.assigneeEmail.split('@')[0] : '-'}
                        {task.coAssignees && task.coAssignees.length > 0 ? ` (+${task.coAssignees.length} Rekan)` : ''} | <span style={{ fontWeight: 600 }}>Lokasi:</span> {task.location}
                      </div>
                    </div>
                    <div className="bl-monitoring-item-actions">
                      <a href={task.proofLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="bl-monitoring-link">
                        <LinkIcon size={14} /> Link Berita
                      </a>
                      <div style={{ color: '#9CA3AF', transform: expandedTaskId === task.id ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                    </div>
                  </div>
                  
                  {expandedTaskId === task.id && (
                    <div style={{ padding: '16px', borderTop: '1px solid #E5E7EB', backgroundColor: '#ffffff', fontSize: '13px', color: '#4B5563' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <strong>Klien:</strong> {task.client || '-'}
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <strong>Instruksi / Catatan Tambahan:</strong><br/>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{task.description || '-'}</span>
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <strong>Catatan Lapangan Singkat:</strong><br/>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{task.fieldNotes || '-'}</span>
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <strong>Tim Lapangan (Sesuai Konfirmasi):</strong><br/>
                        {task.teamMembers || '-'}
                      </div>
                      {task.imageUrls && task.imageUrls.length > 0 && (
                        <div>
                          <strong>Bukti Foto Lapangan:</strong>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                            {task.imageUrls.map((url, i) => (
                              <img 
                                key={i} 
                                src={url} 
                                alt={`Bukti ${i+1}`} 
                                onClick={(e) => { e.stopPropagation(); setLightboxImg(url); }}
                                style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid #E5E7EB' }} 
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- CREATE/EDIT MODAL --- */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card bl-modal-card">
            <div className="bl-modal-header">
              {modalType === 'inisiatif' ? <Zap size={20} color="#4B5563" /> : <FileText size={20} color="#111827" />}
              <h3 className="bl-modal-title">
                {editingTask ? 'Edit Data Liputan' : (modalType === 'inisiatif' ? 'Inisiatif Mandiri' : 'Tugaskan Reporter')}
              </h3>
            </div>
            <form onSubmit={handleTaskSubmit} className="bl-modal-form">
              <div style={{ marginBottom: '16px' }}>
                <label className="bl-form-label">Topik / Judul</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required className="bl-form-input" />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="bl-form-label">Klien Terkait (Opsional)</label>
                <select value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} className="bl-form-select">
                  <option value="">-- Proyek Internal / Tanpa Klien --</option>
                  {clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label className="bl-form-label">Lokasi</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} color="#9CA3AF" className="bl-form-input-icon" />
                  <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required className="bl-form-input-with-icon" />
                </div>
              </div>
              {modalType === 'assigned' && isAdmin && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Tugaskan Kepada (Email)</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '12px', zIndex: 1 }} />
                    <select value={formData.assigneeEmail} onChange={e => setFormData({...formData, assigneeEmail: e.target.value})} required style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none', appearance: 'none', backgroundColor: '#fff', cursor: 'pointer' }}>
                      <option value="">Pilih Anggota Tim Lapangan</option>
                      {users.filter(u => !u.divisi || u.divisi === 'lapangan' || u.divisi === 'semua').map(u => (
                        <option key={u.email} value={u.email}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {modalType === 'inisiatif' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Rekan Tim Liputan (Opsional)</label>
                  <div style={{ border: '1px solid #D1D5DB', borderRadius: '6px', padding: '10px', maxHeight: '120px', overflowY: 'auto', backgroundColor: '#fff' }}>
                    {users.filter(u => u.email !== currentUser.email && (!u.divisi || u.divisi === 'lapangan' || u.divisi === 'semua')).length > 0 ? (
                      users.filter(u => u.email !== currentUser.email && (!u.divisi || u.divisi === 'lapangan' || u.divisi === 'semua')).map(u => (
                        <label key={u.email} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px', cursor: 'pointer', color: '#4B5563' }}>
                          <input type="checkbox" 
                            checked={formData.coAssignees.includes(u.email)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({...formData, coAssignees: [...formData.coAssignees, u.email]});
                              } else {
                                setFormData({...formData, coAssignees: formData.coAssignees.filter(email => email !== u.email)});
                              }
                            }}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {u.name || u.email.split('@')[0]}
                        </label>
                      ))
                    ) : (
                      <div style={{ fontSize: '13px', color: '#9CA3AF', fontStyle: 'italic' }}>Belum ada anggota tim lain di sistem.</div>
                    )}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Instruksi / Catatan Tambahan</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} required={modalType === 'assigned'} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none', minHeight: '80px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px' }}>
                {editingTask && isAdmin ? <button type="button" onClick={() => handleDelete(editingTask.id)} style={{ color: '#EF4444', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600, padding: '8px' }}>Hapus Data</button> : <div></div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={closeModal} className="btn-secondary btn-sm">Batal</button>
                  <button type="submit" className="btn-primary btn-sm">Simpan Data</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADVANCE / STAGE-GATE MODAL --- */}
      {advanceModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card" style={{ width: '100%', maxWidth: '450px', margin: '20px', padding: '32px 24px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ backgroundColor: '#EFF6FF', padding: '16px', borderRadius: '50%' }}>
                {advanceModal.nextStatus === 'sedang_liputan' && <Users size={32} color="#2563EB" />}
                {advanceModal.nextStatus === 'draft_berita' && <StickyNote size={32} color="#2563EB" />}
                {advanceModal.nextStatus === 'siap_terbit' && <FileCheck size={32} color="#2563EB" />}
                {advanceModal.nextStatus === 'selesai' && <CheckCircle2 size={32} color="#10B981" />}
              </div>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#111827', fontWeight: 700 }}>
                  {advanceModal.nextStatus === 'sedang_liputan' && 'Berangkat ke Lokasi'}
                  {advanceModal.nextStatus === 'draft_berita' && 'Selesai Liputan'}
                  {advanceModal.nextStatus === 'siap_terbit' && 'Kirim Draft Antrean'}
                  {advanceModal.nextStatus === 'selesai' && 'Terbitkan Berita'}
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#6B7280', lineHeight: 1.5 }}>
                  {advanceModal.nextStatus === 'sedang_liputan' && 'Sistem butuh data siapa saja tim yang akan pergi ke lapangan untuk mencegah bentrok/tugas ganda.'}
                  {advanceModal.nextStatus === 'draft_berita' && 'Tuliskan catatan singkat hasil liputan lapangan (poin-poin wawancara, kondisi lokasi, dll).'}
                  {advanceModal.nextStatus === 'siap_terbit' && 'Masukkan judul berita sementara/final untuk di-review oleh redaktur sebelum tayang.'}
                  {advanceModal.nextStatus === 'selesai' && 'Siklus berita hampir selesai! Masukkan tautan/URL berita yang telah tayang di website.'}
                </p>
              </div>
            </div>

            <form onSubmit={handleAdvanceSubmit}>
              
              {/* Dynamic Inputs Based on Stage */}
              {advanceModal.nextStatus === 'sedang_liputan' && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Nama Tim Lapangan</label>
                  <div style={{ position: 'relative' }}>
                    <Users size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input type="text" value={advanceModal.teamMembers} onChange={e => setAdvanceModal({...advanceModal, teamMembers: e.target.value})} required placeholder="Contoh: Budi (Reporter), Anto (Kameramen)" style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', fontSize: '14px', outline: 'none' }} />
                  </div>
                </div>
              )}

              {advanceModal.nextStatus === 'draft_berita' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Catatan Lapangan Singkat</label>
                    <textarea value={advanceModal.fieldNotes} onChange={e => setAdvanceModal({...advanceModal, fieldNotes: e.target.value})} required placeholder="Tuliskan poin penting yang didapat saat liputan..." style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', fontSize: '14px', outline: 'none', minHeight: '80px', resize: 'vertical' }} />
                  </div>
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Unggah Bukti Foto Lapangan (Bisa pilih &gt; 1 foto sekaligus)</label>
                    <input type="file" multiple accept="image/*" onChange={e => setAdvanceModal({...advanceModal, uploadFiles: Array.from(e.target.files)})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', fontSize: '14px', cursor: 'pointer' }} />
                  </div>
                </>
              )}

              {advanceModal.nextStatus === 'siap_terbit' && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Judul Berita (Draft)</label>
                  <input type="text" value={advanceModal.draftTitle} onChange={e => setAdvanceModal({...advanceModal, draftTitle: e.target.value})} required placeholder="Contoh: Situasi Balai Kota Ricuh" style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', fontSize: '14px', outline: 'none' }} />
                </div>
              )}

              {advanceModal.nextStatus === 'selesai' && (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Tautan Berita (Live URL)</label>
                  <div style={{ position: 'relative' }}>
                    <LinkIcon size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input type="url" value={advanceModal.proofLink} onChange={e => setAdvanceModal({...advanceModal, proofLink: e.target.value})} required placeholder="https://patriawarta.com/berita/..." style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', fontSize: '14px', outline: 'none' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" disabled={advanceModal.isUploading} onClick={() => setAdvanceModal({...advanceModal, isOpen: false})} className="btn-secondary btn-sm" style={{ flex: 1, opacity: advanceModal.isUploading ? 0.5 : 1 }}>Batal</button>
                <button type="submit" disabled={advanceModal.isUploading} className="btn-primary btn-sm" style={{ flex: 1, opacity: advanceModal.isUploading ? 0.5 : 1 }}>
                  {advanceModal.isUploading ? 'Mengunggah...' : 'Konfirmasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- LIGHTBOX MODAL --- */}
      {lightboxImg && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(5px)' }} onClick={() => setLightboxImg(null)}>
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightboxImg(null)} style={{ position: 'absolute', top: '-40px', right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px' }}>
              <X size={32} />
            </button>
            <img src={lightboxImg} alt="Enlarged Bukti" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }} />
          </div>
        </div>
      )}

    </div>
  );
}
