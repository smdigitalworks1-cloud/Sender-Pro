import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Crown, Loader, ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
    const { adminLogin, adminVerifyOtp, forgotPassword } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // login | forgot
    const [step, setStep] = useState(1); // 1 = credentials, 2 = OTP
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '', otp: '' });

    const handleResendOtp = async () => {
        setLoading(true);
        try {
            await adminLogin(formData.email, formData.password);
            toast.success('A new Admin OTP has been sent! 🔒');
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
                    const res = await adminLogin(formData.email, formData.password);
                    if (res.requiresOtp) {
                        setStep(2);
                        toast.success('Admin Verification Sent! 🔒');
                    } else {
                        navigate('/admin');
                    }
                } else {
                    await adminVerifyOtp(formData.email, formData.otp);
                    toast.success('Welcome Back, Super Admin! 👑');
                    navigate('/admin');
                }
            } else {
                const data = await forgotPassword(formData.email);
                toast.success(data?.message || 'Password reset link sent to your email.');
                setMode('login');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'Action Failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#09090b', color: '#fff' }}>
            <div style={{ position: 'absolute', top: 24, left: 24 }}>
                <button onClick={() => navigate('/login')} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: 20 }}>
                    <ArrowLeft size={16} /> Back to User Login
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ maxWidth: 400, width: '100%', padding: 40, background: '#18181b', borderRadius: 24, border: '1px solid #f59e0b33', boxShadow: '0 0 80px rgba(245,158,11,0.1)' }}>
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #f59e0b, #b45309)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Crown size={32} color="#fff" />
                        </div>
                        <h2 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-head)', marginBottom: 8, color: '#f59e0b' }}>
                            {step === 2 ? 'Verify Admin Access' : 'Super Admin Portal'}
                        </h2>
                        <p style={{ color: 'var(--text3)', fontSize: 14 }}>
                            {step === 2 ? `Enter the verification code sent to your email` : (mode === 'login' ? 'Restricted Access. Software Owner Only.' : 'Enter your email to reset password.')}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {step === 1 ? (
                            <>
                                <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text2)', letterSpacing: '0.05em' }}>ADMIN EMAIL</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        style={{ width: '100%', padding: '14px 16px', background: '#27272a', border: '1px solid #3f3f46', borderRadius: 12, outline: 'none', color: '#fff', fontSize: 15 }}
                                    />
                                </div>
                                {mode === 'login' && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.05em' }}>PASSWORD</label>
                                            <button type="button" onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                                                Forgot password?
                                            </button>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                                style={{ width: '100%', padding: '14px 16px', paddingRight: 40, background: '#27272a', border: '1px solid #3f3f46', borderRadius: 12, outline: 'none', color: '#fff', fontSize: 15 }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4 }}
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 8, color: 'var(--text2)', letterSpacing: '0.05em' }}>VERIFICATION CODE (OTP)</label>
                                <div style={{ position: 'relative' }}>
                                    <ShieldCheck size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#f59e0b' }} />
                                    <input
                                        required
                                        maxLength={6}
                                        value={formData.otp}
                                        onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                                        placeholder="000000"
                                        style={{ width: '100%', padding: '16px 16px 16px 48px', background: '#27272a', border: '1px solid #f59e0b55', borderRadius: 12, outline: 'none', color: '#fff', fontSize: 24, letterSpacing: '8px', fontWeight: 800 }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                                    <button type="button" onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                                        ← Change Email
                                    </button>
                                    <button type="button" onClick={handleResendOtp} disabled={loading} style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: 13, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                                        {loading ? 'Sending...' : 'Resend OTP'}
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%', padding: '16px', background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 16,
                                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: 8,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
                            }}
                        >
                            {loading ? <Loader size={20} className="spin" /> : (
                                step === 2 ? 'Verify & Enter' : (mode === 'login' ? <><Crown size={20} /> Continue</> : 'Send Reset Link')
                            )}
                        </button>

                        {mode === 'forgot' && step === 1 && (
                            <button type="button" onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer', marginTop: -10 }}>
                                Back to Login
                            </button>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
