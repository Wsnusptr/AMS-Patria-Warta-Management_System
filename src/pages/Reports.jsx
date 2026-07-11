import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { FileText, Users, Building, Activity, Download, ChevronDown, ChevronUp } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const { userRole } = useAuth();
  const hasAccess = ['admin', 'admin_finance', 'admin_ops'].includes(userRole);

  const [activeTab, setActiveTab] = useState('profitabilitas');
  const [dateRange, setDateRange] = useState('Bulan Ini');

  // Data States
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [finance, setFinance] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Expanded rows for UI
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }
    const unsubs = [];
    unsubs.push(onSnapshot(collection(db, 'clients'), (snap) => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(collection(db, 'users'), (snap) => setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(query(collection(db, 'finance_records'), orderBy('date', 'desc')), (snap) => setFinance(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(collection(db, 'field_tasks'), (snap) => setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(collection(db, 'social_posts'), (snap) => setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))));
    unsubs.push(onSnapshot(query(collection(db, 'activity_log'), orderBy('timestamp', 'desc')), (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))));

    setTimeout(() => setLoading(false), 1500);
    return () => unsubs.forEach(unsub => unsub());
  }, [hasAccess]);

  const formatRupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

  const filterByDate = (dateString, timestamp) => {
    if (dateRange === 'Semua Waktu') return true;
    const now = new Date();
    let targetDate;
    if (timestamp) {
      if (!timestamp.seconds) return true;
      targetDate = new Date(timestamp.seconds * 1000);
    } else if (dateString) {
      targetDate = new Date(dateString);
    } else {
      return true;
    }
    if (dateRange === 'Bulan Ini') {
      return targetDate.getMonth() === now.getMonth() && targetDate.getFullYear() === now.getFullYear();
    } else if (dateRange === 'Bulan Lalu') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return targetDate.getMonth() === lastMonth.getMonth() && targetDate.getFullYear() === lastMonth.getFullYear();
    }
    return true;
  };

  const toggleRow = (name) => {
    setExpandedRows(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // --- DATA PREPARATION ---
  const getProfitRows = () => {
    const filteredFinance = finance.filter(f => filterByDate(f.date));
    const profitMap = {};
    clients.forEach(c => { profitMap[c.name] = { pemasukan: 0, pengeluaran: 0, transactions: [] }; });
    filteredFinance.forEach(f => {
      const cat = f.category;
      if (!profitMap[cat]) profitMap[cat] = { pemasukan: 0, pengeluaran: 0, transactions: [] };
      if (f.type === 'pemasukan') profitMap[cat].pemasukan += f.amount;
      else profitMap[cat].pengeluaran += f.amount;
      profitMap[cat].transactions.push(f);
    });
    return Object.keys(profitMap)
      .map(k => ({ name: k, ...profitMap[k], margin: profitMap[k].pemasukan - profitMap[k].pengeluaran }))
      .filter(r => r.pemasukan > 0 || r.pengeluaran > 0)
      .sort((a,b) => b.margin - a.margin);
  };

  const getSdmRows = () => {
    const filteredTasks = tasks.filter(t => filterByDate(null, t.createdAt || t.updatedAt));
    const userStats = {};
    users.forEach(u => { userStats[u.email] = { email: u.email, name: u.name || u.email.split('@')[0], totalTugas: 0, selesai: 0, inisiatif: 0, taskList: [] }; });
    filteredTasks.forEach(t => {
      const emails = [t.assigneeEmail, ...(t.coAssignees || [])].filter(Boolean);
      emails.forEach(email => {
        if (userStats[email]) {
          userStats[email].totalTugas += 1;
          if (t.status === 'selesai') userStats[email].selesai += 1;
          if (t.type === 'inisiatif') userStats[email].inisiatif += 1;
          userStats[email].taskList.push(t);
        }
      });
    });
    return Object.values(userStats).sort((a,b) => b.selesai - a.selesai);
  };

  const getPostRows = () => {
    const filteredPosts = posts.filter(p => filterByDate(p.publishedAt?.split('T')[0] || p.dateString));
    const platformStats = {};
    filteredPosts.forEach(p => {
      if (!platformStats[p.platform]) platformStats[p.platform] = { count: 0, views: 0, likes: 0, comments: 0, postsList: [] };
      platformStats[p.platform].count += 1;
      platformStats[p.platform].views += p.metrics?.views || 0;
      platformStats[p.platform].likes += p.metrics?.likes || 0;
      platformStats[p.platform].comments += p.metrics?.comments || 0;
      platformStats[p.platform].postsList.push(p);
    });
    return platformStats;
  };

  const getLogRows = () => logs.filter(l => filterByDate(null, l.timestamp)).slice(0, 50);

  // --- PDF EXPORT LOGIC ---
  const getPeriodText = () => {
    const now = new Date();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    if (dateRange === 'Bulan Ini') {
      return `${months[now.getMonth()]} ${now.getFullYear()}`;
    } else if (dateRange === 'Bulan Lalu') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${months[lastMonth.getMonth()]} ${lastMonth.getFullYear()}`;
    }
    return 'Keseluruhan Waktu';
  };

  const handleExport = () => {
    const doExport = (headerImg, stempelImg, ttdImg) => {
      const doc = new jsPDF();
      const periodText = getPeriodText();
      let currentY = 45;
      
      const checkPageBreak = (neededHeight) => {
        if (currentY + neededHeight > 280) {
          doc.addPage();
          currentY = 20;
        }
      };

      if (headerImg && !headerImg.failed) {
        doc.addImage(headerImg, 'PNG', 0, 0, 210, 35);
      }
      
      doc.setTextColor(0, 0, 0);
      
      // === SECTION 1: LABA/RUGI ===
      doc.setFontSize(14);
      doc.setFont("times", "bold");
      doc.text(`Laporan Eksklusif Bulan ${periodText}`, 14, currentY);
      doc.setFontSize(10);
      doc.setFont("times", "normal");
      doc.text("Seluruh rangkaian rekapan merupakan diambil dari data langsung sistem Patria Warta.", 14, currentY + 7);

      const profitRows = getProfitRows();
      const profitData = [];
      let totalIn = 0, totalOut = 0;
      
      profitRows.forEach(r => {
        totalIn += r.pemasukan; totalOut += r.pengeluaran;
        profitData.push([r.name, formatRupiah(r.pemasukan), formatRupiah(r.pengeluaran), formatRupiah(r.margin)]);
        r.transactions.forEach(t => {
           profitData.push([`    - [${t.date}] ${t.type.toUpperCase()} : ${t.description || '-'}`, t.type === 'pemasukan' ? formatRupiah(t.amount) : '-', t.type === 'pengeluaran' ? formatRupiah(t.amount) : '-', '']);
        });
      });
      profitData.push(['TOTAL KESELURUHAN', formatRupiah(totalIn), formatRupiah(totalOut), formatRupiah(totalIn - totalOut)]);

      autoTable(doc, {
        startY: currentY + 12,
        head: [['Laporan Laba/Rugi', 'Pemasukan', 'Pengeluaran', 'Margin Bersih']],
        body: profitData,
        theme: 'striped',
        styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0] },
        headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] },
        willDrawCell: function(data) {
          if (data.row.raw[0] === 'TOTAL KESELURUHAN') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [240, 240, 240];
          } else if (data.row.raw[0] && data.row.raw[0].startsWith('    -')) {
            data.cell.styles.fontStyle = 'italic';
          } else {
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });
      currentY = doc.lastAutoTable.finalY + 15;

      // === SECTION 2: KINERJA TIM ===
      checkPageBreak(30);
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.text("Kinerja Tim (Tugas Lapangan)", 14, currentY);
      
      const sdmRows = getSdmRows();
      const sdmData = [];
      sdmRows.forEach((r, idx) => {
        sdmData.push([idx + 1, r.name, r.totalTugas, r.selesai, r.totalTugas - r.selesai, r.inisiatif]);
        if (r.taskList && r.taskList.length > 0) {
          r.taskList.forEach(t => {
            const dateStr = t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('id-ID') : new Date(t.createdAt).toLocaleDateString('id-ID')) : '-';
            const statusStr = t.status === 'selesai' ? 'Selesai' : t.status.replace('_', ' ').toUpperCase();
            sdmData.push(['', `    - [${dateStr}] ${t.title} (${statusStr})`, '', '', '', '']);
          });
        }
      });

      autoTable(doc, { 
        startY: currentY + 5, 
        head: [['Rank', 'Nama Tim', 'Total Tugas', 'Selesai', 'Menggantung', 'Inisiatif']], 
        body: sdmData, 
        theme: 'striped', 
        styles: { font: 'times', textColor: [0, 0, 0] }, 
        headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] },
        willDrawCell: function(data) {
          if (data.row.raw[0] === '') {
            data.cell.styles.fillColor = [255, 255, 255];
            data.cell.styles.fontStyle = 'italic';
            data.cell.styles.textColor = [0, 0, 0];
          } else {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 0, 0];
          }
        }
      });
      currentY = doc.lastAutoTable.finalY + 15;

      // === SECTION 3: PRODUKSI KONTEN ===
      checkPageBreak(30);
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.text("Produksi Konten Sosial Media", 14, currentY);

      const postStats = getPostRows();
      const allPostsList = Object.values(postStats).flatMap(s => s.postsList || []);

      doc.setFont("times", "normal"); doc.setFontSize(9);
      doc.text(`Total ${allPostsList.length} postingan dipublikasikan. Ringkasan per platform dan rincian per konten tercantum di bawah.`, 14, currentY + 6);

      // Ringkasan per platform
      const platformSummaryData = Object.keys(postStats).map(k => [
        k,
        postStats[k].count,
        postStats[k].views.toLocaleString('id-ID'),
        postStats[k].likes.toLocaleString('id-ID'),
        postStats[k].comments.toLocaleString('id-ID')
      ]);
      if (platformSummaryData.length > 0) {
        autoTable(doc, {
          startY: currentY + 10,
          head: [['Platform', 'Jml. Post', 'Total Tayangan', 'Total Suka', 'Total Komentar']],
          body: platformSummaryData,
          theme: 'striped',
          styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0], fontStyle: 'bold' },
          headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] },
        });
        currentY = doc.lastAutoTable.finalY + 8;
      }

      // Detail per postingan
      if (allPostsList.length > 0) {
        checkPageBreak(20);
        doc.setFont("times", "bold"); doc.setFontSize(10);
        doc.text("Detail Per Postingan:", 14, currentY);
        const postDetailData = allPostsList.map(p => {
          const postDate = p.date?.toDate ? p.date.toDate() : (p.dateString ? new Date(p.dateString) : null);
          const dateStr = postDate ? postDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
          return [
            dateStr,
            p.platform || '-',
            p.content || '-',
            p.assigneeEmail ? p.assigneeEmail.split('@')[0] : '-',
            (p.metrics?.views || 0).toLocaleString('id-ID'),
            (p.metrics?.likes || 0).toLocaleString('id-ID'),
            (p.metrics?.comments || 0).toLocaleString('id-ID'),
            p.proofLink || '-'
          ];
        });
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Tanggal', 'Platform', 'Judul / Konten', 'Pelapor', 'Tayangan', 'Suka', 'Komentar', 'Link Bukti']],
          body: postDetailData,
          theme: 'striped',
          styles: { font: 'times', fontSize: 7.5, textColor: [0, 0, 0] },
          headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255], fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 20 },
            2: { cellWidth: 46 },
            3: { cellWidth: 22 },
            4: { cellWidth: 16 },
            5: { cellWidth: 13 },
            6: { cellWidth: 18 },
            7: { cellWidth: 29 }
          }
        });
        currentY = doc.lastAutoTable.finalY + 15;
      }

      // === SECTION 4: LOG AKTIVITAS ===
      checkPageBreak(30);
      doc.setFont("times", "bold");
      doc.setFontSize(12);
      doc.text("Jejak Aktivitas Sistem", 14, currentY);
      
      const logRows = getLogRows();
      const logData = logRows.map(l => [l.timestamp?.seconds ? new Date(l.timestamp.seconds * 1000).toLocaleString('id-ID') : '-', l.userName || l.userEmail, l.action]);
      autoTable(doc, { startY: currentY + 5, head: [['Waktu', 'Pengguna', 'Aksi']], body: logData, theme: 'striped', styles: { font: 'times', fontSize: 8, textColor: [0, 0, 0] }, headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] } });
      currentY = doc.lastAutoTable.finalY;

      // === FOOTER (Signature & Stamp) ===
      if (currentY > 220) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(10);
      doc.setTextColor(0,0,0);
      doc.setFont("times", "normal");
      doc.text("Dikeluarkan oleh,", 140, currentY + 20);
      doc.setFont("times", "bold");
      doc.text("Sistem Patria Warta", 140, currentY + 25);
      
      if (ttdImg && !ttdImg.failed) {
        doc.addImage(ttdImg, 'PNG', 142, currentY + 28, 30, 20);
      }

      doc.setFont("times", "normal");
      doc.text("Administrator Agensi", 140, currentY + 55);

      if (stempelImg && !stempelImg.failed) {
        // Move stamp slightly left and down so it avoids the top text
        // and overlaps the signature and "Administrator Agensi" nicely.
        doc.addImage(stempelImg, 'PNG', 122, currentY + 26, 35, 35);
      }

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Dicetak secara otomatis oleh Sistem Patria Warta pada ${new Date().toLocaleString('id-ID')}`, 14, doc.internal.pageSize.height - 10);
      doc.save(`Laporan_Lengkap_Patria_Warta_${periodText.replace(/ /g, '_')}.pdf`);
    };

    const imgKop = new Image();
    const imgStempel = new Image();
    const imgTtd = new Image();
    
    imgKop.src = '/kop-surat.png';
    imgStempel.src = '/stempel.png';
    imgTtd.src = '/ttd.png';

    let loaded = 0;
    const checkLoad = () => {
      loaded++;
      if (loaded === 3) doExport(imgKop, imgStempel, imgTtd);
    };

    imgKop.onload = checkLoad;
    imgKop.onerror = () => { imgKop.failed = true; checkLoad(); };
    
    imgStempel.onload = checkLoad;
    imgStempel.onerror = () => { imgStempel.failed = true; checkLoad(); };

    imgTtd.onload = checkLoad;
    imgTtd.onerror = () => { imgTtd.failed = true; checkLoad(); };
  };

  // --- RENDER TAB CONTENTS ---
  const renderProfitabilitas = () => {
    const rows = getProfitRows();
    const totalIn = rows.reduce((acc, curr) => acc + curr.pemasukan, 0);
    const totalOut = rows.reduce((acc, curr) => acc + curr.pengeluaran, 0);
    const totalMargin = totalIn - totalOut;

    return (
      <div className="card-minimal">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#111827', display: 'flex', justifyContent: 'space-between' }}>
          Laba/Rugi per Kategori Klien
          <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#6B7280' }}>Klik baris klien untuk melihat rincian riwayat transaksi (tanggal & item)</span>
        </h3>
        <div className="data-table-container">
          <table className="data-table-compact" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Nama Klien / Kategori</th>
              <th style={{ textAlign: 'right' }}>Total Pemasukan</th>
              <th style={{ textAlign: 'right' }}>Total Biaya/Pengeluaran</th>
              <th style={{ textAlign: 'right' }}>Margin Bersih</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <React.Fragment key={row.name}>
                <tr onClick={() => toggleRow(row.name)} style={{ cursor: 'pointer', backgroundColor: expandedRows[row.name] ? '#F9FAFB' : 'transparent', transition: 'background-color 0.2s' }} className="hover-bg-gray">
                  <td style={{ textAlign: 'center', color: '#9CA3AF' }}>{expandedRows[row.name] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                  <td className="table-cell-bold">{row.name}</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>{formatRupiah(row.pemasukan)}</td>
                  <td style={{ textAlign: 'right', color: '#DC2626' }}>{formatRupiah(row.pengeluaran)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: row.margin >= 0 ? '#059669' : '#DC2626' }}>
                    {formatRupiah(row.margin)}
                  </td>
                </tr>
                {/* TRANSACTIONS BREAKDOWN EXPANDED */}
                {expandedRows[row.name] && (
                  <tr>
                    <td colSpan="5" style={{ padding: 0 }}>
                      <div style={{ backgroundColor: '#F3F4F6', padding: '12px 24px 12px 64px', borderBottom: '1px solid #E5E7EB' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#4B5563', marginBottom: '8px' }}>Rincian Transaksi:</div>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #D1D5DB', color: '#6B7280' }}>
                              <th style={{ textAlign: 'left', padding: '6px 0', width: '100px' }}>Tanggal</th>
                              <th style={{ textAlign: 'left', padding: '6px 0', width: '120px' }}>Tipe</th>
                              <th style={{ textAlign: 'left', padding: '6px 0' }}>Keterangan Item</th>
                              <th style={{ textAlign: 'right', padding: '6px 0' }}>Nominal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.transactions.sort((a,b) => new Date(b.date) - new Date(a.date)).map(t => (
                              <tr key={t.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                                <td style={{ padding: '8px 0', color: '#374151' }}>{new Date(t.date).toLocaleDateString('id-ID')}</td>
                                <td style={{ padding: '8px 0' }}>
                                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', backgroundColor: t.type === 'pemasukan' ? '#D1FAE5' : '#FEE2E2', color: t.type === 'pemasukan' ? '#065F46' : '#991B1B', fontWeight: 500 }}>
                                    {t.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 0', color: '#4B5563' }}>{t.description || '-'}</td>
                                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, color: t.type === 'pemasukan' ? '#059669' : '#DC2626' }}>
                                  {formatRupiah(t.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>Tidak ada data transaksi di periode ini.</td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: '#F9FAFB', fontWeight: 'bold' }}>
                <td colSpan="2" style={{ padding: '12px 16px' }}>TOTAL KESELURUHAN</td>
                <td style={{ textAlign: 'right', padding: '12px 16px', color: '#059669' }}>{formatRupiah(totalIn)}</td>
                <td style={{ textAlign: 'right', padding: '12px 16px', color: '#DC2626' }}>{formatRupiah(totalOut)}</td>
                <td style={{ textAlign: 'right', padding: '12px 16px', color: totalMargin >= 0 ? '#059669' : '#DC2626' }}>{formatRupiah(totalMargin)}</td>
              </tr>
            </tfoot>
          )}
          </table>
        </div>
      </div>
    );
  };

  const renderKinerjaSDM = () => {
    const rows = getSdmRows();
    return (
      <div className="card-minimal">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#111827' }}>Evaluasi & Leaderboard SDM (Tugas Lapangan)</h3>
        <div className="data-table-container">
          <table className="data-table-compact">
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>Rank</th>
              <th>Nama Tim</th>
              <th style={{ textAlign: 'center' }}>Total Tugas</th>
              <th style={{ textAlign: 'center' }}>Tugas Selesai</th>
              <th style={{ textAlign: 'center' }}>Tugas Menggantung</th>
              <th style={{ textAlign: 'center' }}>Inisiatif Pribadi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <React.Fragment key={row.email}>
                <tr onClick={() => toggleRow(row.email)} style={{ cursor: 'pointer' }}>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: idx === 0 ? '#D97706' : '#6B7280' }}>
                    {idx === 0 ? '👑 1' : idx + 1}
                  </td>
                  <td className="table-cell-bold" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ transform: expandedRows[row.email] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#9CA3AF', fontSize: '12px' }}>▶</div>
                    {row.name}
                  </td>
                  <td style={{ textAlign: 'center' }}>{row.totalTugas}</td>
                  <td style={{ textAlign: 'center', color: '#059669', fontWeight: 600 }}>{row.selesai}</td>
                  <td style={{ textAlign: 'center', color: '#DC2626' }}>{row.totalTugas - row.selesai}</td>
                  <td style={{ textAlign: 'center', color: '#2563EB' }}>{row.inisiatif}</td>
                </tr>
                {expandedRows[row.email] && (
                  <tr style={{ backgroundColor: '#F9FAFB' }}>
                    <td colSpan="6" style={{ padding: '16px 24px' }}>
                      {row.taskList.length === 0 ? (
                        <div style={{ color: '#6B7280', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>Belum ada penugasan di periode ini.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#374151' }}>Rincian Penugasan:</h4>
                          {row.taskList.map(t => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{t.title}</div>
                                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                                  Tanggal: {t.createdAt ? (t.createdAt.toDate ? t.createdAt.toDate().toLocaleDateString('id-ID') : new Date(t.createdAt).toLocaleDateString('id-ID')) : '-'} | Lokasi: {t.location}
                                </div>
                              </div>
                              <div>
                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', backgroundColor: t.status === 'selesai' ? '#D1FAE5' : '#FEF3C7', color: t.status === 'selesai' ? '#065F46' : '#92400E' }}>
                                  {t.status === 'selesai' ? 'Selesai' : t.status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderProduksiKonten = () => {
    const stats = getPostRows();
    const platforms = Object.keys(stats);
    const totalPosts = platforms.reduce((s, p) => s + stats[p].count, 0);
    const totalViews = platforms.reduce((s, p) => s + stats[p].views, 0);
    const totalLikes = platforms.reduce((s, p) => s + stats[p].likes, 0);
    const totalComments = platforms.reduce((s, p) => s + stats[p].comments, 0);

    return (
      <div className="card-minimal">
        {/* Header */}
        <div style={{ marginBottom: '20px', borderBottom: '1px solid #E5E7EB', paddingBottom: '16px' }}>
          <h3 style={{ margin: '0 0 2px 0', fontSize: '13px', fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Produksi Konten Sosial Media</h3>
          <p style={{ margin: 0, fontSize: '11px', color: '#9CA3AF' }}>Klik nama platform untuk melihat rincian per postingan</p>
        </div>

        {/* Summary Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: '#E5E7EB', border: '1px solid #E5E7EB', borderRadius: '6px', overflow: 'hidden', marginBottom: '20px' }}>
          {[
            { label: 'Total Postingan', value: totalPosts },
            { label: 'Total Tayangan', value: totalViews.toLocaleString('id-ID') },
            { label: 'Total Suka', value: totalLikes.toLocaleString('id-ID') },
            { label: 'Total Komentar', value: totalComments.toLocaleString('id-ID') },
          ].map(item => (
            <div key={item.label} style={{ backgroundColor: '#FAFAFA', padding: '14px 16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Platform Rows */}
        {platforms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#9CA3AF', fontSize: '12px', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            Belum ada data konten pada periode ini.
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: '6px', overflow: 'hidden' }}>
            {/* Table Head */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 100px) 28px', padding: '8px 16px', backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              {['Platform', 'Postingan', 'Tayangan', 'Suka', 'Komentar', ''].map((h, i) => (
                <div key={h + i} style={{ fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i >= 1 && i <= 4 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>

            {platforms.map((plat, idx) => {
              const stat = stats[plat];
              const isExpanded = expandedRows[`sosmed_${plat}`];
              return (
                <div key={plat} style={{ borderTop: idx === 0 ? 'none' : '1px solid #E5E7EB' }}>
                  {/* Platform Row */}
                  <div
                    onClick={() => toggleRow(`sosmed_${plat}`)}
                    style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 100px) 28px', padding: '11px 16px', cursor: 'pointer', alignItems: 'center', backgroundColor: isExpanded ? '#F9FAFB' : '#fff', transition: 'background 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#374151', display: 'inline-block', flexShrink: 0 }}></span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{plat}</span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>{stat.count}</div>
                    <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>{stat.views.toLocaleString('id-ID')}</div>
                    <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>{stat.likes.toLocaleString('id-ID')}</div>
                    <div style={{ textAlign: 'right', fontSize: '13px', color: '#374151' }}>{stat.comments.toLocaleString('id-ID')}</div>
                    <div style={{ textAlign: 'right', fontSize: '10px', color: '#9CA3AF', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</div>
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid #E5E7EB', backgroundColor: '#FAFAFA', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                            {['Tanggal', 'Judul Konten', 'Pelapor', 'Tayangan', 'Suka', 'Komentar', 'Tautan Bukti'].map((h, i) => (
                              <th key={h} style={{ padding: '7px 14px', textAlign: i >= 3 && i <= 5 ? 'right' : i === 6 ? 'center' : 'left', fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {stat.postsList.map((post, pidx) => {
                            const postDate = post.date?.toDate ? post.date.toDate() : (post.dateString ? new Date(post.dateString) : null);
                            const dateStr = postDate ? postDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                            return (
                              <tr key={post.id || pidx} style={{ borderTop: pidx === 0 ? 'none' : '1px solid #F3F4F6' }}>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap' }}>{dateStr}</td>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#111827', fontWeight: 500, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={post.content}>{post.content || '-'}</td>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#6B7280' }}>{post.assigneeEmail ? post.assigneeEmail.split('@')[0] : '-'}</td>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#374151', textAlign: 'right' }}>{(post.metrics?.views || 0).toLocaleString('id-ID')}</td>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#374151', textAlign: 'right' }}>{(post.metrics?.likes || 0).toLocaleString('id-ID')}</td>
                                <td style={{ padding: '8px 14px', fontSize: '12px', color: '#374151', textAlign: 'right' }}>{(post.metrics?.comments || 0).toLocaleString('id-ID')}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                  {post.proofLink ? (
                                    <a href={post.proofLink} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#374151', textDecoration: 'none', borderBottom: '1px solid #D1D5DB', paddingBottom: '1px', letterSpacing: '0.02em' }}>Lihat</a>
                                  ) : <span style={{ fontSize: '11px', color: '#D1D5DB' }}>—</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderLogAktivitas = () => {
    const logsData = getLogRows();
    return (
      <div className="card-minimal">
        <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', color: '#111827' }}>Jejak Digital Sistem (50 Terakhir)</h3>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <div className="data-table-container">
            <table className="data-table-compact">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Pengguna</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {logsData.map(log => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', color: '#6B7280' }}>
                    {log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString('id-ID') : '-'}
                  </td>
                  <td style={{ fontWeight: 500, color: '#374151' }}>{log.userName || log.userEmail?.split('@')[0]}</td>
                  <td>{log.action}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!hasAccess) return <div className="page-content">Anda tidak memiliki akses ke halaman ini.</div>;
  if (loading) return <div className="page-content">Memproses rekap data miliaran byte...</div>;

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', gap: '16px' }}>
      
      {/* HEADER */}
      <div className="finance-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 2px 0', color: '#111827' }}>Laporan & Rekap Data</h1>
          <p style={{ color: '#6B7280', fontSize: '12px', margin: 0 }}>Otomatisasi pembuatan laporan agensi secara lengkap dari semua divisi</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select 
            className="form-input-compact" 
            style={{ width: '150px', cursor: 'pointer' }}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="Bulan Ini">Bulan Ini</option>
            <option value="Bulan Lalu">Bulan Lalu</option>
            <option value="Semua Waktu">Semua Waktu</option>
          </select>

          <button onClick={handleExport} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', fontSize: '13px', borderRadius: '6px', fontWeight: 600 }}>
            <Download size={16} /> Unduh PDF
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E5E7EB', paddingBottom: '8px', marginBottom: '8px', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
        <button 
          onClick={() => setActiveTab('profitabilitas')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: activeTab === 'profitabilitas' ? '#2563EB' : '#6B7280', borderBottom: activeTab === 'profitabilitas' ? '2px solid #2563EB' : '2px solid transparent' }}
        >
          Laba / Rugi Klien
        </button>
        <button 
          onClick={() => setActiveTab('kinerja')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: activeTab === 'kinerja' ? '#2563EB' : '#6B7280', borderBottom: activeTab === 'kinerja' ? '2px solid #2563EB' : '2px solid transparent' }}
        >
          Kinerja Tim (SDM)
        </button>
        <button 
          onClick={() => setActiveTab('konten')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: activeTab === 'konten' ? '#2563EB' : '#6B7280', borderBottom: activeTab === 'konten' ? '2px solid #2563EB' : '2px solid transparent' }}
        >
          Produksi Sosmed
        </button>
        <button 
          onClick={() => setActiveTab('log')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', color: activeTab === 'log' ? '#2563EB' : '#6B7280', borderBottom: activeTab === 'log' ? '2px solid #2563EB' : '2px solid transparent' }}
        >
          Jejak Aktivitas (Audit)
        </button>
      </div>

      {/* RENDER CONTENT */}
      {activeTab === 'profitabilitas' && renderProfitabilitas()}
      {activeTab === 'kinerja' && renderKinerjaSDM()}
      {activeTab === 'konten' && renderProduksiKonten()}
      {activeTab === 'log' && renderLogAktivitas()}

    </div>
  );
}
