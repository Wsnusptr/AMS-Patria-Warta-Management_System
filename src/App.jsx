import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Insight from './pages/Insight';
import BoardSosmed from './pages/BoardSosmed';
import BoardLapangan from './pages/BoardLapangan';
import Pengumuman from './pages/Pengumuman';
import Finance from './pages/Finance';
import UsersPage from './pages/UsersPage';
import ClientsPage from './pages/ClientsPage';
import Reports from './pages/Reports';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="insight" element={<Insight />} />
            <Route path="board/lapangan" element={<BoardLapangan />} />
            <Route path="board/sosmed" element={<BoardSosmed />} />
            <Route path="clients" element={<ClientsPage />} />
            <Route path="announcements" element={<Pengumuman />} />
            <Route path="finance" element={<Finance />} />
            <Route path="reports" element={<Reports />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
