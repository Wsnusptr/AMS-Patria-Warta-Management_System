import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, MapPin, User, FileText, CheckCircle2, Link as LinkIcon, Edit3, ChevronRight, Activity, Zap, Check, AlertCircle, Users, StickyNote, FileCheck, Camera, X } from 'lucide-react';

// STAGES IN PIPELINE
const STAGES = [
  { id: 'tugas_baru', label: 'Tugas Baru' },
  { id: 'sedang_liputan', label: 'Liputan' },
  { id: 'draft_berita', label: 'Penulisan' },
  { id: 'siap_terbit', label: 'Antrean' },
  { id: 'selesai', label: 'Terbit' }
];

export default function BoardLapangan() {
  const { currentUser, userRole } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'admin_ops';
  
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
          userName: currentUser.email.split('@')[0],
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
        userName: currentUser.email.split('@')[0],
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

  const todayTasks = tasks.filter(task => {
    if (task.status !== 'selesai') return false;
    if (!task.updatedAt) return false;
    const date = task.updatedAt.toDate ? task.updatedAt.toDate() : new Date(task.updatedAt);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  });

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '24px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 4px 0', color: '#111827' }}>Operasi Lapangan</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>Pantau siklus liputan dan laporan secara aktual</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => openModal('inisiatif')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#F9FAFB', border: '1px solid #D1D5DB' }}>
            <Zap size={16} color="#4B5563" /> Inisiatif Liputan
          </button>
          {isAdmin && (
            <button onClick={() => openModal('assigned')} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px' }}>
              <Plus size={16} /> Tugaskan Reporter
            </button>
          )}
        </div>
      </div>

      {/* LIST VIEW CONTAINER */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {tasks.filter(t => t.status !== 'selesai').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: '#9CA3AF', backgroundColor: '#F9FAFB', borderRadius: '12px', border: '1px dashed #D1D5DB' }}>
            <Activity size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '15px' }}>Belum ada aktivitas lapangan yang aktif.</p>
          </div>
        ) : (
          tasks.filter(t => t.status !== 'selesai').map(task => (
            <div key={task.id} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Top Row: Meta Info & Edit */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ backgroundColor: task.type === 'inisiatif' ? '#F3F4F6' : '#EFF6FF', color: task.type === 'inisiatif' ? '#4B5563' : '#1D4ED8', fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {task.type === 'inisiatif' ? 'Inisiatif' : 'Penugasan'}
                    </span>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0 }}>{task.title}</h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px', color: '#6B7280', fontSize: '13px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} />{task.location || '-'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><User size={16} /><span style={{ fontWeight: 500, color: '#374151' }}>{task.assigneeEmail ? task.assigneeEmail.split('@')[0] : '-'}</span></div>
                    {task.client && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', backgroundColor: '#D1FAE5', padding: '2px 8px', borderRadius: '4px' }}><strong>Klien:</strong> {task.client}</div>}
                  </div>
                  
                  {task.description && (
                    <div style={{ backgroundColor: '#F9FAFB', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #D1D5DB', marginTop: '8px' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: '#4B5563', lineHeight: '1.5' }}><strong>Instruksi:</strong> {task.description}</p>
                    </div>
                  )}

                  {/* ⚠️ ANTI-CONFLICT: WARNING BOX IF ALREADY IN FIELD OR LATER */}
                  {task.status !== 'tugas_baru' && task.teamMembers && (
                    <div style={{ backgroundColor: '#FEF2F2', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', color: '#991B1B', fontSize: '13px', fontWeight: 500 }}>
                      <Users size={16} color="#DC2626" />
                      Sedang diliput oleh: {task.teamMembers}
                    </div>
                  )}

                  {/* 📝 FIELD NOTES PREVIEW */}
                  {(task.status === 'draft_berita' || task.status === 'siap_terbit' || task.status === 'selesai') && task.fieldNotes && (
                    <div style={{ backgroundColor: '#F0FDF4', padding: '12px 16px', borderRadius: '8px', border: '1px solid #BBF7D0', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px', color: '#065F46', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <StickyNote size={16} color="#059669" style={{ marginTop: '2px' }} />
                        <div>
                          <strong>Catatan Lapangan:</strong> {task.fieldNotes}
                        </div>
                      </div>
                      
                      {/* --- LEGACY SINGLE IMAGE / NEW MULTI IMAGE RENDER --- */}
                      {(task.imageUrls?.length > 0 || task.imageUrl) && (
                        <div style={{ marginTop: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#047857' }}>
                            <Camera size={14} /> Foto Bukti Liputan {task.imageUrls?.length > 1 ? `(${task.imageUrls.length})` : ''}:
                          </div>
                          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', maxWidth: '100%' }}>
                            {(task.imageUrls || [task.imageUrl]).map((url, idx) => (
                              <img key={idx} src={url} alt={`Bukti ${idx+1}`} onClick={() => setLightboxImg(url)} style={{ width: '100px', height: '70px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #A7F3D0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer', flexShrink: 0 }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {task.proofLink && (
                    <div style={{ marginTop: '12px' }}>
                      <a href={task.proofLink} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563EB', fontSize: '13px', textDecoration: 'none', fontWeight: 500, backgroundColor: '#EFF6FF', padding: '6px 12px', borderRadius: '6px' }}>
                        <LinkIcon size={14} /> Lihat Berita Terbit
                      </a>
                    </div>
                  )}
                </div>

                <button onClick={() => openModal(task.type, task)} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '8px' }} title="Edit Data">
                  <Edit3 size={18} />
                </button>
              </div>

              {/* Bottom Row: Tracker & Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', borderTop: '1px solid #F3F4F6', paddingTop: '16px' }}>
                <div style={{ flex: 1 }}>{renderStepper(task.status)}</div>
                <div style={{ minWidth: '220px', display: 'flex', justifyContent: 'flex-end' }}>
                  {task.status !== 'selesai' ? (
                    <button onClick={() => triggerAdvance(task)} className="btn-primary" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', width: '100%', justifyContent: 'center' }}>
                      {getActionLabel(task.status)}
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontWeight: 600, fontSize: '14px', width: '100%', justifyContent: 'center', backgroundColor: '#F0FDF4', padding: '10px 20px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
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
      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '1.1rem', color: '#111827', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} color="var(--pw-primary)" />
          Informasi Monitoring Pengerjaan (Selesai Hari Ini)
        </h2>
        {todayTasks.length === 0 ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', color: '#6B7280', fontSize: '14px' }}>
            Belum ada liputan yang selesai hari ini.
          </div>
        ) : (
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {todayTasks.map(task => (
                <div key={task.id} style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #10B981', overflow: 'hidden' }}>
                  <div 
                    onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', cursor: 'pointer' }}
                  >
                    <CheckCircle2 size={20} color="#10B981" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>{task.title}</div>
                      <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                        <span style={{ fontWeight: 600 }}>Reporter:</span> {task.assigneeEmail.split('@')[0]} 
                        {task.coAssignees && task.coAssignees.length > 0 ? ` (+${task.coAssignees.length} Rekan)` : ''} | <span style={{ fontWeight: 600 }}>Lokasi:</span> {task.location}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <a href={task.proofLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: '13px', color: '#3B82F6', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#EFF6FF', padding: '6px 12px', borderRadius: '6px', fontWeight: 500 }}>
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
          <div className="card" style={{ width: '100%', maxWidth: '500px', margin: '20px' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#ffffff', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
              {modalType === 'inisiatif' ? <Zap size={20} color="#4B5563" /> : <FileText size={20} color="#111827" />}
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
                {editingTask ? 'Edit Data Liputan' : (modalType === 'inisiatif' ? 'Inisiatif Mandiri' : 'Tugaskan Reporter')}
              </h3>
            </div>
            <form onSubmit={handleTaskSubmit} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Topik / Judul</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} required style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Klien Terkait (Opsional)</label>
                <select value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none', backgroundColor: '#fff' }}>
                  <option value="">-- Proyek Internal / Tanpa Klien --</option>
                  {clients.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Lokasi</label>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                  <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} required style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }} />
                </div>
              </div>
              {modalType === 'assigned' && isAdmin && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Tugaskan Kepada (Email)</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} color="#9CA3AF" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                    <input type="email" value={formData.assigneeEmail} onChange={e => setFormData({...formData, assigneeEmail: e.target.value})} required style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }} />
                  </div>
                </div>
              )}
              {modalType === 'inisiatif' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Rekan Tim Liputan (Opsional)</label>
                  <div style={{ border: '1px solid #D1D5DB', borderRadius: '6px', padding: '10px', maxHeight: '120px', overflowY: 'auto', backgroundColor: '#fff' }}>
                    {users.filter(u => u.email !== currentUser.email).length > 0 ? (
                      users.filter(u => u.email !== currentUser.email).map(u => (
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
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" onClick={closeModal} className="btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: 600 }}>Batal</button>
                  <button type="submit" className="btn-primary" style={{ padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Simpan Data</button>
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

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" disabled={advanceModal.isUploading} onClick={() => setAdvanceModal({...advanceModal, isOpen: false})} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: '#fff', cursor: 'pointer', fontWeight: 600, color: '#4B5563', opacity: advanceModal.isUploading ? 0.5 : 1 }}>Batal</button>
                <button type="submit" disabled={advanceModal.isUploading} className="btn-primary" style={{ flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, opacity: advanceModal.isUploading ? 0.5 : 1 }}>
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
