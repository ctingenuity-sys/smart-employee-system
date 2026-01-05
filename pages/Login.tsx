
import React, { useState } from 'react';
import { auth } from '../firebase';
// @ts-ignore
import { signInWithEmailAndPassword } from "firebase/auth";
import { useLanguage } from '../contexts/LanguageContext';

const Login: React.FC = () => {
  const { t, toggleLanguage, language, dir } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
        setError(t('login.error'));
        return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      // Success - App.tsx or Layout will handle redirection/device check
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError(t('login.error'));
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Error: ' + err.message);
      }
      setLoading(false);
    }
  };

  const iconPosition = dir === 'rtl' ? 'right-3' : 'left-3';
  const inputPadding = dir === 'rtl' ? 'pr-10 pl-4' : 'pl-10 pr-4';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 overflow-hidden relative" dir={dir}>
      {/* Floating Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute bottom-[-50px] left-[10%] w-10 h-10 bg-white/10 rounded-full animate-bounce duration-[10s]"></div>
        <div className="absolute bottom-[-100px] left-[20%] w-20 h-20 bg-white/5 rounded-full animate-bounce duration-[15s]"></div>
      </div>

      <button 
        onClick={toggleLanguage} 
        className="absolute top-6 right-6 z-20 bg-white/10 text-white px-4 py-2 rounded-full backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors font-bold text-sm"
      >
        <i className="fas fa-globe mx-2"></i>
        {language === 'ar' ? 'English' : 'العربية'}
      </button>

      <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/20 z-10 mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
            <i className="fas fa-user-lock text-2xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">{t('login.title')}</h2>
          <p className="text-blue-200">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <i className={`fas fa-envelope absolute ${iconPosition} top-3.5 text-blue-300`}></i>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.email')}
              className={`w-full bg-white/90 rounded-xl py-3 ${inputPadding} focus:ring-4 focus:ring-blue-500/30 text-slate-800 font-bold`}
              required
            />
          </div>

          <div className="relative">
            <i className={`fas fa-lock absolute ${iconPosition} top-3.5 text-blue-300`}></i>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.password')}
              className={`w-full bg-white/90 rounded-xl py-3 ${inputPadding} focus:ring-4 focus:ring-blue-500/30 text-slate-800 font-bold`}
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-100 p-3 rounded-lg text-sm text-center font-bold animate-pulse">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:scale-[1.02] transition-all duration-200 disabled:opacity-70"
          >
            {loading ? <i className="fas fa-spinner fa-spin"></i> : t('login.button')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
