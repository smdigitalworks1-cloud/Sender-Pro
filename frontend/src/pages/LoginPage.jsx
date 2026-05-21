import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Zap, Mail, Lock, User, ArrowRight, Eye, EyeOff, ShieldCheck, Phone } from 'lucide-react';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [step, setStep] = useState(1); // 1 = credentials, 2 = OTP
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', whatsappNumber: '', otp: '' });
  const [loading, setLoading] = useState(false);
  const { login, verifyOtp, register, forgotPassword } = useAuth();
  const navigate = useNavigate();

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('A new OTP has been sent to your email! 📧');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        if (step === 1) {
          const res = await login(form.email, form.password);
          if (res.requiresOtp) {
            setStep(2);
            toast.success('OTP sent to your email! 📧');
          } else {
            navigate('/dashboard');
          }
        } else {
          await verifyOtp(form.email, form.otp);
          toast.success('Login Successful! ✅');
          navigate('/dashboard');
        }
      } else if (mode === 'register') {
        await register(form.name, form.email, form.password, form.whatsappNumber);
        navigate('/dashboard');
      } else if (mode === 'forgot') {
        const data = await forgotPassword(form.email);
        toast.success(data?.message || 'Reset link ready');
        setMode('login');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Something went wrong');
      if (err.message?.includes('OTP')) setStep(2);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,132,252,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 10 }}>
        <button onClick={() => navigate('/admin-login')} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: 20, borderColor: '#f59e0b55', color: '#f59e0b' }}>
          👑 Admin Login
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={22} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 22, background: 'linear-gradient(135deg,#c084fc,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sender Pro</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 30, fontWeight: 800, marginBottom: 8 }}>
            {step === 2 ? 'Verify OTP' : (mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create account' : 'Reset password')}
          </h1>
          <p style={{ color: 'var(--text3)', marginBottom: 32 }}>
            {step === 2 ? `Enter the code sent to ${form.email}` : (mode === 'login' ? 'Sign in to manage your campaigns' : mode === 'register' ? 'Start sending messages at scale' : 'Enter your email to get a reset link')}
          </p>

          <form onSubmit={handleSubmit}>
            {step === 1 ? (
              <>
                {mode === 'register' && (
                  <>
                    <div className="form-group">
                      <label className="label">Full Name</label>
                      <div style={{ position: 'relative' }}>
                        <User size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                        <input className="input" style={{ paddingLeft: 36 }} placeholder="John Doe" value={form.name} onChange={e => update('name', e.target.value)} required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="label">WhatsApp Number (நிர்வகிப்பவர் எண்)</label>
                      <div style={{ position: 'relative' }}>
                        <Phone size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                        <input className="input" style={{ paddingLeft: 36 }} placeholder="919000000000" value={form.whatsappNumber} onChange={e => update('whatsappNumber', e.target.value)} required />
                      </div>
                    </div>
                  </>
                )}
                <div className="form-group">
                  <label className="label">Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                    <input className="input" style={{ paddingLeft: 36 }} type="email" placeholder="you@example.com" value={form.email} onChange={e => update('email', e.target.value)} required />
                  </div>
                </div>
                {mode !== 'forgot' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="label" style={{ marginBottom: 0 }}>Password</label>
                      {mode === 'login' && (
                        <button type="button" onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', color: 'var(--accent3)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div style={{ position: 'relative', marginTop: 8 }}>
                      <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
                      <input className="input" style={{ paddingLeft: 36, paddingRight: 40 }} type={showPassword ? "text" : "password"} placeholder="••••••••" value={form.password} onChange={e => update('password', e.target.value)} required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="form-group">
                <label className="label">Security Code (OTP)</label>
                <div style={{ position: 'relative' }}>
                  <ShieldCheck size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#7c3aed' }} />
                  <input className="input" style={{ paddingLeft: 40, fontSize: 20, letterSpacing: '8px', fontWeight: 800, color: '#7c3aed' }} placeholder="000000" maxLength={6} value={form.otp} onChange={e => update('otp', e.target.value)} required />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                    ← Back to Email
                  </button>
                  <button type="button" onClick={handleResendOtp} disabled={loading} style={{ background: 'none', border: 'none', color: 'var(--accent3)', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                    {loading ? 'Sending...' : 'Resend OTP'}
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: 8, fontSize: 15 }} disabled={loading}>
              {loading ? 'Processing...' : (step === 2 ? 'Verify & Login' : (mode === 'login' ? 'Continue' : mode === 'register' ? 'Create Account' : 'Send Reset Link'))}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {step === 1 && (
            <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text3)', fontSize: 13 }}>
              {mode === 'login' ? "Don't have an account? " : mode === 'register' ? 'Already have an account? ' : 'Remember your password? '}
              <button type="button" onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
                style={{ color: 'var(--accent3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {mode === 'login' ? 'Register' : 'Sign In'}
              </button>
            </p>
          )}
        </div>
      </div>

      <div style={{ flex: 1, background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(192,132,252,0.05) 100%)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>🚀</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 26, fontWeight: 800, marginBottom: 16, lineHeight: 1.3 }}>
            WhatsApp Marketing<br />Made Simple
          </h2>
          <p style={{ color: 'var(--text3)', lineHeight: 1.7 }}>
            Send bulk messages, auto-reply to customers, grab group contacts, and schedule campaigns — all from one powerful dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
