import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setError('Gagal masuk. Periksa kembali kredensial Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      
      <div className="login-card-wrapper">
        <div className="login-card">
          {/* Logo Area */}
        <div className="login-logo-container">
          <img src="/logo.png" alt="Patria Warta" style={{ maxWidth: '100%', maxHeight: '64px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
          <p className="login-subtitle">Agency Management System (AMS)</p>
        </div>
        
        {error && <div className="login-error">{error}</div>}
        
        <div className="login-divider">
          <span>Otorisasi Akses Internal</span>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <input 
            type="email" 
            className="login-input" 
            placeholder="Email Agensi"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input 
            type="password" 
            className="login-input" 
            placeholder="Kata Sandi"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" className="btn-login-submit" disabled={loading} style={{ marginTop: '16px' }}>
            {loading ? 'Memverifikasi...' : 'Masuk ke Sistem'}
          </button>
        </form>
        
      </div>
      </div>
      
      <div className="login-copyright">
        © 2026 Patria Warta Agency. All rights reserved.
      </div>
    </div>
  );
}
