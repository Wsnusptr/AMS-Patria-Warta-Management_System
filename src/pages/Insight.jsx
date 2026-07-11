import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  LineChart, Line, AreaChart, Area, ComposedChart, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Download, Loader2, X } from 'lucide-react';
import './Dashboard.css'; // Reuse some dashboard CSS
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import autoTable from 'jspdf-autotable';

export default function Insight() {
  const [loading, setLoading] = useState(true);
  const [activeDetail, setActiveDetail] = useState(null); // Modal state
  const chartsRef = React.useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Dropdown Filter State
  const [timeFilter, setTimeFilter] = useState('30 hari terakhir');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Data States
  const [rawDocs, setRawDocs] = useState(null);
  const [cashFlowData, setCashFlowData] = useState([]);
  const [socialData, setSocialData] = useState([]);
  const [teamWorkload, setTeamWorkload] = useState([]);
  const [clientContribution, setClientContribution] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    saldo: 0,
    posting: 0,
    tugasTepatWaktu: 0,
    klienAktif: 0
  });

  useEffect(() => {
    setLoading(true);
    const unsubTrans = onSnapshot(collection(db, 'finance_records'), (snap) => {
      setRawDocs(prev => ({ ...(prev || {postsDocs:[], tasksDocs:[]}), transDocs: snap.docs }));
      setLoading(false);
    });
    const unsubPosts = onSnapshot(collection(db, 'social_posts'), (snap) => {
      setRawDocs(prev => ({ ...(prev || {transDocs:[], tasksDocs:[]}), postsDocs: snap.docs }));
    });
    const unsubTasks = onSnapshot(collection(db, 'field_tasks'), (snap) => {
      setRawDocs(prev => ({ ...(prev || {transDocs:[], postsDocs:[]}), tasksDocs: snap.docs }));
    });
    return () => {
      unsubTrans();
      unsubPosts();
      unsubTasks();
    };
  }, []);

  useEffect(() => {
    if (rawDocs) {
      processData(rawDocs.transDocs || [], rawDocs.postsDocs || [], rawDocs.tasksDocs || []);
    }
  }, [timeFilter, rawDocs]);

  function processData(transDocs, postsDocs, tasksDocs) {
    const formatRupiah = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
    const now = new Date();
    let startDate = new Date(0); // Semua waktu
    let groupBy = 'month'; // 'day' or 'month'

    if (timeFilter === '7 hari terakhir') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      groupBy = 'day';
    } else if (timeFilter === '30 hari terakhir') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      groupBy = 'day';
    } else if (timeFilter === 'Bulan ini') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      groupBy = 'day';
    } else if (timeFilter === '3 bulan terakhir') {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      groupBy = 'month';
    } else if (timeFilter === 'Tahun ini') {
      startDate = new Date(now.getFullYear(), 0, 1);
      groupBy = 'month';
    }

    const filterByDate = (docs, dateField = 'createdAt') => docs.filter(doc => {
      const data = doc.data();
      if (!data[dateField]) return true;
      const docDate = data[dateField].toDate ? data[dateField].toDate() : new Date(data[dateField]);
      return docDate >= startDate;
    });

    const filteredTrans = filterByDate(transDocs, 'date');
    const filteredPosts = filterByDate(postsDocs, 'date');
    const filteredTasks = tasksDocs; 

    // 1. Cash Flow
    const cashFlowMap = {};
    let totalIncome = 0;
    
    // Pre-fill timeline so chart always has points
    const prefillTimeline = (map) => {
      if (timeFilter === 'Semua waktu') return;
      
      if (groupBy === 'day') {
        let sd = new Date(now);
        let ed = new Date(now);
        if (timeFilter === 'Bulan ini') {
          sd = new Date(now.getFullYear(), now.getMonth(), 1);
          ed = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
        } else if (timeFilter === '7 hari terakhir') {
          sd = new Date(now); sd.setDate(now.getDate() - 6);
        } else if (timeFilter === '30 hari terakhir') {
          sd = new Date(now); sd.setDate(now.getDate() - 29);
        }

        let current = new Date(sd);
        current.setHours(0,0,0,0);
        ed.setHours(23,59,59,999);
        while (current <= ed) {
          const key = current.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
          map[key] = { name: key, Pemasukan: 0, Pengeluaran: 0, Instagram: 0, TikTok: 0, Facebook: 0, YouTube: 0, details: [], rawDate: new Date(current) };
          current.setDate(current.getDate() + 1);
        }
      } else {
        let sd = new Date(now);
        let ed = new Date(now);
        if (timeFilter === 'Tahun ini') {
          sd = new Date(now.getFullYear(), 0, 1);
          ed = new Date(now.getFullYear(), 11, 31);
        } else if (timeFilter === '3 bulan terakhir') {
          sd = new Date(now); sd.setMonth(now.getMonth() - 2);
        }

        let currentY = sd.getFullYear();
        let currentM = sd.getMonth();
        let endY = ed.getFullYear();
        let endM = ed.getMonth();

        while (currentY < endY || (currentY === endY && currentM <= endM)) {
          const d = new Date(currentY, currentM, 1);
          const key = d.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
          map[key] = { name: key, Pemasukan: 0, Pengeluaran: 0, Instagram: 0, TikTok: 0, Facebook: 0, YouTube: 0, details: [], rawDate: d };
          currentM++;
          if (currentM > 11) { currentM = 0; currentY++; }
        }
      }
    };

    prefillTimeline(cashFlowMap);
    
    filteredTrans.forEach(doc => {
      const data = doc.data();
      const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
      const key = groupBy === 'day' ? date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : date.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
      const amount = Number(data.amount) || 0;
      
      if (!cashFlowMap[key]) {
        cashFlowMap[key] = { name: key, Pemasukan: 0, Pengeluaran: 0, details: [], rawDate: date };
      }
      
      const formattedDate = date.toLocaleDateString('id-ID');
      if (data.type === 'pemasukan') {
        cashFlowMap[key].Pemasukan += amount;
        totalIncome += amount;
        cashFlowMap[key].details.push({ tanggal: formattedDate, deskripsi: data.description || data.category || 'Pemasukan', nominal: `+ ${formatRupiah(amount)}` });
      } else if (data.type === 'pengeluaran') {
        cashFlowMap[key].Pengeluaran += amount;
        cashFlowMap[key].details.push({ tanggal: formattedDate, deskripsi: data.description || data.category || 'Pengeluaran', nominal: `- ${formatRupiah(amount)}` });
      }
    });
    
    const cashFlow = Object.values(cashFlowMap).sort((a,b) => a.rawDate - b.rawDate);
    
    // Add 7-day moving average for trend lines
    cashFlow.forEach((item, index) => {
      let pSum = 0, eSum = 0, count = 0;
      for (let i = Math.max(0, index - 3); i <= Math.min(cashFlow.length - 1, index + 3); i++) {
        pSum += cashFlow[i].Pemasukan;
        eSum += cashFlow[i].Pengeluaran;
        count++;
      }
      item['Tren Pemasukan'] = pSum / count;
      item['Tren Pengeluaran'] = eSum / count;
    });

    setCashFlowData(cashFlow);

    // 2. Social Media
    const socialMap = {};
    prefillTimeline(socialMap);

    filteredPosts.forEach(doc => {
      const data = doc.data();
      const date = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date();
      const key = groupBy === 'day' ? date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : date.toLocaleString('id-ID', { month: 'short', year: 'numeric' });
      
      if (!socialMap[key]) {
        socialMap[key] = { name: key, Instagram: 0, TikTok: 0, Facebook: 0, YouTube: 0, details: [], rawDate: date };
      }
      const platform = data.platform || 'Instagram';
      if (socialMap[key][platform] !== undefined) {
        socialMap[key][platform] += 1;
      } else {
        socialMap[key][platform] = 1;
      }
      socialMap[key].details.push({ 
        tanggal: date.toLocaleDateString('id-ID'),
        platform: platform, 
        konten: data.content || 'Konten',
        pelapor: data.assigneeEmail ? data.assigneeEmail.split('@')[0] : '-',
        status: data.status || 'Published', 
        views: data.metrics?.views || data.views || 0,
        likes: data.metrics?.likes || 0,
        comments: data.metrics?.comments || 0,
        linkBukti: data.proofLink || '-'
      });
    });
    const social = Object.values(socialMap).sort((a,b) => a.rawDate - b.rawDate);
    setSocialData(social);

    // 3. Team Workload
    const teamMap = {};
    let completedTasks = 0;
    filteredTasks.forEach(doc => {
      const data = doc.data();
      if (data.status === 'done' || data.status === 'selesai' || data.status === 'Selesai') completedTasks++;
      
      const emails = [data.assigneeEmail, ...(data.coAssignees || [])].filter(Boolean);
      emails.forEach(email => {
        const name = email.split('@')[0];
        if (!teamMap[name]) {
          teamMap[name] = { name, Tugas: 0, Selesai: 0, details: [] };
        }
        if (data.status !== 'done' && data.status !== 'selesai' && data.status !== 'Selesai') {
           teamMap[name].Tugas += 1;
        } else {
           teamMap[name].Selesai += 1;
        }
        teamMap[name].details.push({
          Tanggal: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString('id-ID') : new Date(data.createdAt).toLocaleDateString('id-ID')) : '-',
          Reporter: name,
          Tugas: data.title || 'Tugas',
          Lokasi: data.location || '-',
          Status: data.status ? data.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Aktif'
        });
      });
    });
    const workload = Object.values(teamMap).sort((a,b) => (b.Tugas + b.Selesai) - (a.Tugas + a.Selesai));
    setTeamWorkload(workload.length ? workload : [{ name: 'Data Kosong', Tugas: 0, details: [] }]);

    // 4. Kategori Pemasukan
    const categoryRevenue = {};
    filteredTrans.forEach(doc => {
      const data = doc.data();
      if (data.type === 'pemasukan' && data.category) {
        if (!categoryRevenue[data.category]) {
          categoryRevenue[data.category] = { name: data.category, total: 0, details: [] };
        }
        categoryRevenue[data.category].total += Number(data.amount) || 0;
        categoryRevenue[data.category].details.push({
           tanggal: data.date ? (data.date.toDate ? data.date.toDate().toLocaleDateString('id-ID') : new Date(data.date).toLocaleDateString('id-ID')) : '-',
           layanan: data.description || data.category,
           nilai: formatRupiah(Number(data.amount) || 0)
        });
      }
    });
    const categories = Object.values(categoryRevenue).map(c => {
      const percentage = totalIncome > 0 ? (c.total / totalIncome) * 100 : 0;
      return {
        name: c.name,
        Kontribusi: Number(percentage.toFixed(1)),
        details: c.details
      };
    }).sort((a,b) => b.Kontribusi - a.Kontribusi);
    setClientContribution(categories.length ? categories : [{ name: 'Data Kosong', Kontribusi: 0, details: [] }]);

    // Update Top Stats
    let totalPemasukanFiltered = 0;
    let totalPengeluaranFiltered = 0;
    filteredTrans.forEach(doc => {
      const data = doc.data();
      if (data.type === 'pemasukan') totalPemasukanFiltered += Number(data.amount) || 0;
      if (data.type === 'pengeluaran') totalPengeluaranFiltered += Number(data.amount) || 0;
    });

    const saldoValue = totalPemasukanFiltered - totalPengeluaranFiltered;

    setStats({
      saldo: formatRupiah(saldoValue),
      posting: filteredPosts.length,
      tugasTepatWaktu: filteredTasks.length ? completedTasks : 0,
      klienAktif: Object.keys(categoryRevenue).length
    });
  }

  if (loading) {
    return (
      <div className="page-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Loader2 className="spinning" size={48} color="var(--pw-gold)" />
      </div>
    );
  }

  const handleExportPDF = async () => {
    if (!chartsRef.current) return;
    setIsExporting(true);
    
    try {
      const loadImg = (src) => new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = () => { img.failed = true; resolve(img); };
      });

      const [headerImg, stempelImg, ttdImg] = await Promise.all([
        loadImg('/kop-surat.png'),
        loadImg('/stempel.png'),
        loadImg('/ttd.png')
      ]);

      // Capture the charts
      const canvas = await html2canvas(chartsRef.current, { scale: 2, backgroundColor: '#ffffff' });
      const chartsImg = canvas.toDataURL('image/png');

      const doc = new jsPDF('p', 'mm', 'a4');
      let currentY = 40;

      if (headerImg && !headerImg.failed) {
        doc.addImage(headerImg, 'PNG', 0, 0, 210, 35);
      }

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont("times", "bold");
      doc.text(`Laporan Insight & Analitik: ${timeFilter}`, 14, currentY);
      doc.setFontSize(10);
      doc.setFont("times", "normal");
      doc.text("Seluruh rangkaian rekapan merupakan diambil dari data langsung sistem Patria Warta.", 14, currentY + 7);

      const imgWidth = 182;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      doc.addImage(chartsImg, 'PNG', 14, currentY + 15, imgWidth, imgHeight);
      
      currentY += 15 + imgHeight + 5;

      // Check if we need new page for summary
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      // NARRATIVE SUMMARY
      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text("Ringkasan Eksekutif & Penjelasan Grafik:", 14, currentY);
      currentY += 6;
      
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      const summaryLines = [
        `• Saldo Kas Saat Ini: ${stats.saldo} (Perhitungan keseluruhan arus kas).`,
        `• Total Posting Sosmed: ${stats.posting} konten berhasil dipublikasikan.`,
        `• Liputan Lapangan Selesai: ${stats.tugasTepatWaktu} liputan (Indikator produktivitas tim).`,
        `• Sumber Pemasukan Aktif: ${stats.klienAktif} klien yang berkontribusi.`,
        ``,
        `Keterangan Grafik:`,
        `1. Arus Kas: Fluktuasi rasio pemasukan terhadap pengeluaran sepanjang waktu.`,
        `2. Konsistensi Posting: Kuantitas persebaran konten berita di berbagai platform media sosial.`,
        `3. Beban Kerja Tim: Distribusi jumlah penugasan lapangan serta rasio penyelesaian setiap divisi/tim.`,
        `4. Sumber Pemasukan: Skala persentase dan kontribusi dari masing-masing klien/sumber dana.`
      ];

      summaryLines.forEach(line => {
         if (currentY > 275) {
            doc.addPage();
            currentY = 20;
         }
         doc.text(line, 14, currentY);
         currentY += 5;
      });

      currentY += 10;

      const checkY = (needed) => {
        if (currentY + needed > 280) { doc.addPage(); currentY = 20; }
      }

      // TABLE 1: Arus Kas
      const cashDetails = cashFlowData.flatMap(c => c.details || []);
      if (cashDetails.length > 0) {
        checkY(20);
        doc.setFontSize(12); doc.setFont("times", "bold");
        doc.text("Rincian Transaksi Arus Kas", 14, currentY);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Tanggal', 'Deskripsi', 'Nominal']],
          body: cashDetails.map(d => [d.tanggal, d.deskripsi, d.nominal]),
          theme: 'striped', styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0] }, headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] }
        });
        currentY = doc.lastAutoTable.finalY + 15;
      }

      // TABLE 2: Sosmed
      const socialDetails = socialData.flatMap(s => s.details || []);
      if (socialDetails.length > 0) {
        checkY(20);
        doc.setFontSize(12); doc.setFont("times", "bold");
        doc.text("Rincian Publikasi Konten Sosial Media", 14, currentY);
        doc.setFont("times", "normal"); doc.setFontSize(9);
        doc.text(`Total ${socialDetails.length} postingan dipublikasikan pada periode ini.`, 14, currentY + 6);
        autoTable(doc, {
          startY: currentY + 10,
          head: [['Tanggal', 'Platform', 'Judul / Konten', 'Pelapor', 'Views', 'Likes', 'Komentar', 'Link Bukti']],
          body: socialDetails.map(d => [
            d.tanggal,
            d.platform,
            d.konten,
            d.pelapor || '-',
            (d.views || 0).toLocaleString('id-ID'),
            (d.likes || 0).toLocaleString('id-ID'),
            (d.comments || 0).toLocaleString('id-ID'),
            d.linkBukti || '-'
          ]),
          theme: 'striped',
          styles: { font: 'times', fontSize: 8, textColor: [0, 0, 0] },
          headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255], fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 20 },
            2: { cellWidth: 50 },
            3: { cellWidth: 22 },
            4: { cellWidth: 16 },
            5: { cellWidth: 14 },
            6: { cellWidth: 18 },
            7: { cellWidth: 22 }
          }
        });
        currentY = doc.lastAutoTable.finalY + 15;
      }

      // TABLE 3: Team
      const teamDetails = teamWorkload.flatMap(t => (t.details || []).map(d => ({ ...d, assignee: t.name })));
      if (teamDetails.length > 0 && teamWorkload[0].name !== 'Data Kosong') {
        checkY(20);
        doc.setFontSize(12); doc.setFont("times", "bold");
        doc.text("Rincian Penugasan Tim", 14, currentY);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Anggota Tim', 'Tanggal', 'Tugas', 'Lokasi', 'Status']],
          body: teamDetails.map(d => [d.assignee, d.Tanggal, d.Tugas, d.Lokasi, d.Status]),
          theme: 'striped', styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0] }, headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] }
        });
        currentY = doc.lastAutoTable.finalY + 15;
      }

      // TABLE 4: Klien
      const clientDetails = clientContribution.flatMap(c => (c.details || []).map(d => ({ ...d, clientName: c.name })));
      if (clientDetails.length > 0 && clientContribution[0].name !== 'Data Kosong') {
        checkY(20);
        doc.setFontSize(12); doc.setFont("times", "bold");
        doc.text("Rincian Sumber Pemasukan (Klien)", 14, currentY);
        autoTable(doc, {
          startY: currentY + 5,
          head: [['Nama Klien', 'Kontribusi', 'Layanan', 'Nilai']],
          body: clientDetails.map(d => [d.clientName, d.Kontribusi + '%', d.layanan, d.nilai]),
          theme: 'striped', styles: { font: 'times', fontSize: 9, textColor: [0, 0, 0] }, headStyles: { fillColor: [212, 175, 55], font: 'times', textColor: [255, 255, 255] }
        });
        currentY = doc.lastAutoTable.finalY + 15;
      }

      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }

      // FOOTER
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
        doc.addImage(stempelImg, 'PNG', 122, currentY + 26, 35, 35);
      }

      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Dicetak secara otomatis oleh Sistem Patria Warta pada ${new Date().toLocaleString('id-ID')}`, 14, doc.internal.pageSize.height - 10);

      doc.save(`Laporan_Insight_PatriaWarta.pdf`);
    } catch (e) {
      console.error(e);
      alert('Gagal mengekspor PDF.');
    }
    
    setIsExporting(false);
  };

  const openDetail = (title, data) => {
    if (!data || !data.details) return;
    setActiveDetail({ title, details: data.details });
  };

  const openFullDetail = (title, dataArray) => {
    const allDetails = dataArray.flatMap(item => item.details || []);
    if (allDetails.length === 0) return;
    setActiveDetail({ title, details: allDetails });
  };

  const handleFilterChange = (filter) => {
    setTimeFilter(filter);
    setShowFilterDropdown(false);
  };

  const filterOptions = [
    '7 hari terakhir',
    '30 hari terakhir',
    'Bulan ini',
    '3 bulan terakhir',
    'Tahun ini',
    'Semua waktu'
  ];

  return (
    <div className="page-content insight-page">
      <div className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-greeting" style={{ fontSize: '2rem', marginBottom: '4px' }}>Insight</h1>
          <p className="dashboard-date">Ringkasan performa agency bulan ini</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              style={{ 
                backgroundColor: '#ffffff', 
                border: '1px solid #D1D5DB', 
                padding: '8px 16px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontWeight: 500,
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
            >
              {timeFilter}
              <span style={{ fontSize: '10px' }}>▼</span>
            </button>

            {showFilterDropdown && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                marginTop: '8px', 
                backgroundColor: '#ffffff', 
                border: '1px solid #E5E7EB', 
                borderRadius: '8px', 
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', 
                width: '180px', 
                zIndex: 50 
              }}>
                <ul style={{ listStyle: 'none', padding: '4px 0', margin: 0 }}>
                  {filterOptions.map(option => (
                    <li key={option}>
                      <button 
                        onClick={() => handleFilterChange(option)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 16px',
                          background: timeFilter === option ? '#F3F4F6' : 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: timeFilter === option ? '#111827' : '#4B5563',
                          fontWeight: timeFilter === option ? 600 : 400,
                          fontSize: '14px'
                        }}
                        onMouseEnter={(e) => {
                          if (timeFilter !== option) e.target.style.backgroundColor = '#F9FAFB';
                        }}
                        onMouseLeave={(e) => {
                          if (timeFilter !== option) e.target.style.backgroundColor = 'transparent';
                        }}
                      >
                        {option}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button 
            onClick={handleExportPDF} 
            disabled={isExporting}
            className="btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '14px', borderRadius: '8px', fontWeight: 600, height: '100%', opacity: isExporting ? 0.7 : 1 }}
          >
            {isExporting ? <Loader2 size={16} className="spinning" /> : <Download size={16} />} 
            {isExporting ? 'Memproses...' : 'Unduh PDF'}
          </button>
        </div>
      </div>

      {/* 4 STAT CARDS */}
          <div className="stat-card-grid" style={{ marginBottom: '24px' }}>
            <div className="card stat-card">
              <div className="stat-card-body" style={{ width: '100%' }}>
                <span className="stat-card-label">Saldo kas</span>
                <span className="stat-card-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.saldo}</span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-card-body" style={{ width: '100%' }}>
                <span className="stat-card-label">Posting sosmed</span>
                <span className="stat-card-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.posting}</span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-card-body" style={{ width: '100%' }}>
                <span className="stat-card-label">Liputan Lapangan (Selesai)</span>
                <span className="stat-card-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.tugasTepatWaktu}</span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-card-body" style={{ width: '100%' }}>
                <span className="stat-card-label">Sumber Pemasukan</span>
                <span className="stat-card-value" style={{ fontSize: '24px', fontWeight: 'bold' }}>{stats.klienAktif}</span>
              </div>
            </div>
          </div>

          {/* CHARTS GRID */}
          <div className="insight-charts-grid" ref={chartsRef} style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '12px' }}>
            
            {/* ROW 1: Arus Kas (Full Width) */}
            <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.2rem' }}>Arus kas</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6B7280' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }}></span>
                    Pemasukan & Tren
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6B7280' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F87171' }}></span>
                    Pengeluaran & Tren
                  </div>
                  <button 
                    onClick={() => openFullDetail('Rincian Arus Kas (Semua Bulan)', cashFlowData)}
                    className="btn-secondary" 
                    style={{ backgroundColor: 'var(--pw-bg-card)', border: '1px solid #E5E7EB', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px', marginLeft: '8px' }}
                  >
                    Lihat rincian ➔
                  </button>
                </div>
              </div>
              <div style={{ height: 300, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cashFlowData}>
                    <defs>
                      <linearGradient id="colorPemasukan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPengeluaran" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F87171" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#F87171" stopOpacity={0}/>
                      </linearGradient>
                      <filter id="shadowGreen" height="130%">
                        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#10B981" floodOpacity="0.4"/>
                      </filter>
                      <filter id="shadowRed" height="130%">
                        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#F87171" floodOpacity="0.4"/>
                      </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis dataKey="name" axisLine={{ stroke: '#3B82F6', strokeWidth: 1 }} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dy={12} />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6B7280', fontSize: 13 }}
                      tickFormatter={(val) => {
                        if (val >= 1000000) return `Rp ${(val/1000000).toFixed(val % 1000000 === 0 ? 0 : 1)}jt`;
                        if (val >= 1000) return `Rp ${(val/1000).toFixed(0)}k`;
                        return `Rp ${val}`;
                      }} 
                      width={80} 
                      dx={-10} 
                      allowDecimals={false} 
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      itemStyle={{ color: '#111827', fontWeight: 500 }}
                    />
                    {/* Actual data spikes as thin areas */}
                    <Area type="linear" dataKey="Pemasukan" stroke="#6EE7B7" strokeWidth={2} fillOpacity={1} fill="url(#colorPemasukan)" dot={false} activeDot={{ r: 6, cursor: 'pointer', onClick: (e, payload) => openDetail(`Arus Kas: ${payload.payload.name}`, payload.payload) }} />
                    <Area type="linear" dataKey="Pengeluaran" stroke="#FCA5A5" strokeWidth={2} fillOpacity={1} fill="url(#colorPengeluaran)" dot={false} activeDot={{ r: 6, cursor: 'pointer', onClick: (e, payload) => openDetail(`Arus Kas: ${payload.payload.name}`, payload.payload) }} />
                    
                    {/* Moving average trend as thick continuous lines with glow */}
                    <Line type="linear" dataKey="Tren Pemasukan" stroke="#10B981" strokeWidth={3} dot={false} activeDot={false} filter="url(#shadowGreen)" />
                    <Line type="linear" dataKey="Tren Pengeluaran" stroke="#F87171" strokeWidth={3} dot={false} activeDot={false} filter="url(#shadowRed)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ROW 2: 2 Charts side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Konsistensi posting */}
              <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Konsistensi posting</h3>
                    <p style={{ color: 'var(--pw-text-secondary)', fontSize: '13px' }}>Jumlah posting per minggu</p>
                  </div>
                  <button 
                    onClick={() => openFullDetail('Rincian Posting Sosmed', socialData)}
                    className="btn-secondary" 
                    style={{ backgroundColor: 'var(--pw-bg-card)', border: '1px solid #E5E7EB', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' }}
                  >
                    Lihat rincian ➔
                  </button>
                </div>
                <div style={{ height: 250, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={socialData}>
                      <CartesianGrid strokeDasharray="0" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: '#F3F4F6' }}
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Legend verticalAlign="bottom" align="left" wrapperStyle={{ bottom: -10 }} iconType="circle" />
                      <Bar dataKey="Instagram" fill="var(--pw-accent-blue)" radius={[4, 4, 0, 0]} barSize={12} onClick={(data) => openDetail(`Posting: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="Facebook" fill="#1877F2" radius={[4, 4, 0, 0]} barSize={12} onClick={(data) => openDetail(`Posting: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="TikTok" fill="var(--pw-green)" radius={[4, 4, 0, 0]} barSize={12} onClick={(data) => openDetail(`Posting: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="YouTube" fill="#FF0000" radius={[4, 4, 0, 0]} barSize={12} onClick={(data) => openDetail(`Posting: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Beban kerja tim */}
              <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Beban kerja tim</h3>
                    <p style={{ color: 'var(--pw-text-secondary)', fontSize: '13px' }}>Tugas aktif dan selesai per orang</p>
                  </div>
                  <button 
                    onClick={() => openFullDetail('Rincian Tugas Tim', teamWorkload)}
                    className="btn-secondary" 
                    style={{ backgroundColor: 'var(--pw-bg-card)', border: '1px solid #E5E7EB', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' }}
                  >
                    Lihat rincian ➔
                  </button>
                </div>
                <div style={{ height: 250, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teamWorkload} layout="vertical">
                      <CartesianGrid strokeDasharray="0" horizontal={false} stroke="#E5E7EB" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dy={10} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dx={-10} width={70} />
                      <Tooltip 
                        cursor={{ fill: '#F3F4F6' }}
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      />
                      <Legend verticalAlign="bottom" align="center" wrapperStyle={{ bottom: -10 }} iconType="circle" />
                      <Bar dataKey="Tugas" name="Aktif" stackId="a" fill="#4F46E5" radius={[0, 0, 0, 0]} barSize={20} onClick={(data) => openDetail(`Beban Kerja: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="Selesai" stackId="a" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} onClick={(data) => openDetail(`Beban Kerja: ${data.name}`, data)} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ROW 3: Kategori Pemasukan */}
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Sumber Pemasukan</h3>
                  <p style={{ color: 'var(--pw-text-secondary)', fontSize: '13px' }}>Persentase pemasukan berdasarkan kategori</p>
                </div>
                <button 
                  onClick={() => openFullDetail('Rincian Sumber Pemasukan', clientContribution)}
                  className="btn-secondary" 
                  style={{ backgroundColor: 'var(--pw-bg-card)', border: '1px solid #E5E7EB', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', borderRadius: '6px' }}
                >
                  Lihat rincian ➔
                </button>
              </div>
              <div style={{ height: 250, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientContribution} layout="vertical">
                    <CartesianGrid strokeDasharray="0" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} tickFormatter={(val) => `${val}%`} dy={10} domain={[0, 45]} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 13 }} dx={-10} width={120} />
                    <Tooltip 
                      cursor={{ fill: '#F3F4F6' }}
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                      formatter={(value) => [`${value}%`, 'Kontribusi']}
                    />
                    <Bar dataKey="Kontribusi" fill="var(--pw-accent-blue)" radius={[0, 4, 4, 0]} barSize={20} onClick={(data) => openDetail(`Klien: ${data.name}`, data)} style={{ cursor: 'pointer' }}>
                      {clientContribution.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--pw-accent-blue)' : '#60A5FA'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

      {/* MODAL RINCIAN */}
      {activeDetail && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', width: '100%', maxWidth: '700px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#111827' }}>{activeDetail.title}</h3>
              <button onClick={() => setActiveDetail(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {activeDetail.details.length === 0 ? (
                <p style={{ color: '#6B7280', textAlign: 'center' }}>Tidak ada rincian data.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      {Object.keys(activeDetail.details[0]).map((key, idx) => (
                        <th key={idx} style={{ padding: '12px 8px', borderBottom: '2px solid #E5E7EB', color: '#6B7280', fontWeight: 600, textTransform: 'capitalize' }}>
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeDetail.details.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: idx === activeDetail.details.length - 1 ? 'none' : '1px solid #F3F4F6' }}>
                        {Object.values(row).map((val, colIdx) => (
                          <td key={colIdx} style={{ padding: '12px 8px', color: colIdx === 0 ? '#111827' : '#4B5563', fontWeight: colIdx === 0 ? 500 : 400 }}>
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ padding: '16px 24px', backgroundColor: '#F9FAFB', borderTop: '1px solid #E5E7EB', textAlign: 'right' }}>
              <button onClick={() => setActiveDetail(null)} className="btn-secondary" style={{ backgroundColor: '#ffffff', border: '1px solid #D1D5DB', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
