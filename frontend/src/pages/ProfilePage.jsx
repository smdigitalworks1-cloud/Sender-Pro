import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Calendar, Shield, CreditCard, Clock, CheckCircle, AlertCircle, ArrowLeft, Edit3, Save, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

const STATUS_CONFIG = {
    active: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: <CheckCircle size={16} />, label: 'Active' },
    trial: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', icon: <Clock size={16} />, label: 'Trial' },
    expired: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: <AlertCircle size={16} />, label: 'Expired' },
    none: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: <AlertCircle size={16} />, label: 'No Plan' },
};

export default function ProfilePage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', whatsappNumber: '' });
    const [updating, setUpdating] = useState(false);

    const navigate = useNavigate();
    const { refreshUser } = useAuth();

    const fetchProfile = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return navigate('/login');

            const res = await fetch(`${API}/api/auth/profile`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await res.json();
            if (res.ok) {
                setData(d);
                setEditForm({
                    name: d.user.name,
                    whatsappNumber: d.user.whatsappNumber || ''
                });
            } else {
                toast.error(d.message || 'Failed to load profile');
            }
        } catch (err) {
            toast.error('Connection error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, [navigate]);

    const handleUpdate = async (e) => {
        e.preventDefault();
        setUpdating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/auth/update-profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(editForm)
            });
            const d = await res.json();
            if (res.ok) {
                toast.success('Profile updated! ✨');
                setIsEditing(false);
                await fetchProfile();
                await refreshUser(); // Update context/sidebar
            } else {
                toast.error(d.message || 'Update failed');
            }
        } catch (err) {
            toast.error('Connection error');
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--accent)' }}>
                <div className="spin" style={{ width: 40, height: 40, border: '4px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
            </div>
        );
    }

    if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Profile not found</div>;

    const { user, subscriptions } = data;
    const status = STATUS_CONFIG[user.subStatus] || STATUS_CONFIG.none;

    return (
        <div className="fade-in" style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
            {/* Header / Nav */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate(-1)} style={{
                        background: 'var(--bg2)', border: '1px solid var(--border)',
                        color: 'var(--text)', padding: '10px', borderRadius: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <ArrowLeft size={18} />
                    </button>
                    <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 28, fontWeight: 800, margin: 0 }}>
                        My Profile
                    </h1>
                </div>

                {!isEditing && (
                    <button onClick={() => setIsEditing(true)} className="btn btn-secondary" style={{ gap: 8 }}>
                        <Edit3 size={16} /> Edit Profile
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>

                {/* Left Column: User Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div className="card" style={{ padding: 32, position: 'relative', overflow: 'hidden' }}>
                        {/* Status Badge */}
                        <div style={{
                            position: 'absolute', top: 20, right: 20,
                            padding: '6px 14px', borderRadius: 20, backgroundColor: status.bg,
                            color: status.color, display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 12, fontWeight: 700, border: `1px solid ${status.color}33`
                        }}>
                            {status.icon} {status.label}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: 24,
                                background: 'linear-gradient(135deg, var(--accent), #a855f7)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 32, fontWeight: 800,
                                boxShadow: '0 10px 30px rgba(124,58,237,0.3)'
                            }}>
                                {user.name[0].toUpperCase()}
                            </div>
                            <div>
                                {isEditing ? (
                                    <div style={{ marginTop: 8 }}>
                                        <input
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="input"
                                            style={{ marginBottom: 4, height: 36, fontSize: 16, fontWeight: 700 }}
                                            placeholder="Your Name"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px 0' }}>{user.name}</h2>
                                        <div style={{ fontSize: 13, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Shield size={12} /> {user.role === 'superadmin' ? 'Super Admin' : (user.isAdmin ? 'Admin Administrator' : 'Pro User')}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                                    <Mail size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>EMAIL ADDRESS</div>
                                    <div style={{ color: 'var(--text)', fontWeight: 600 }}>{user.email}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                                    <Phone size={18} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>WHATSAPP NUMBER</div>
                                    {isEditing ? (
                                        <input
                                            value={editForm.whatsappNumber}
                                            onChange={e => setEditForm({ ...editForm, whatsappNumber: e.target.value })}
                                            className="input"
                                            style={{ height: 36, marginTop: 4 }}
                                            placeholder="919000000000"
                                        />
                                    ) : (
                                        <div style={{ color: 'var(--text)', fontWeight: 600 }}>{user.whatsappNumber || 'Not Linked'}</div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.05em' }}>EXPIRY DATE</div>
                                    <div style={{ color: user.subExpiry ? 'var(--text)' : 'var(--text3)', fontWeight: 600 }}>
                                        {user.subExpiry ? new Date(user.subExpiry).toLocaleDateString() : (user.role === 'superadmin' ? 'Lifetime' : 'No active subscription')}
                                    </div>
                                </div>
                            </div>


                            {isEditing && (
                                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                    <button
                                        onClick={handleUpdate}
                                        disabled={updating}
                                        className="btn btn-primary"
                                        style={{ flex: 1, justifyContent: 'center' }}
                                    >
                                        <Save size={16} /> {updating ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setEditForm({ name: user.name, whatsappNumber: user.whatsappNumber || '' });
                                        }}
                                        className="btn btn-secondary"
                                        style={{ flex: 1, justifyContent: 'center' }}
                                    >
                                        <X size={16} /> Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Stats Card */}
                    <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #1e1b4b, #13132a)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{ color: 'var(--accent)' }}><CreditCard size={20} /></div>
                            <div style={{ fontWeight: 700 }}>Membership Type</div>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                            {user.role === 'superadmin' ?
                                "சூப்பர் அட்மின் (Super Admin): நீங்கள் இந்த தளத்தின் முழுமையான கட்டுப்பாட்டைக் கொண்டுள்ளீர்கள்." :
                                (user.isAdmin ?
                                    "அட்மின் பிளான் (Admin Plan): நீங்கள் 5 சப்-அக்கவுண்ட்களை மேனேஜ் செய்யலாம் மற்றும் அட்மின் டேஷ்போர்டு வசதியைப் பயன்படுத்தலாம்." :
                                    "யூசர் பிளான் (Individual Plan): உங்கள் தனிப்பட்ட WhatsApp ஆட்டோமேஷன் தேவைகளுக்காக மட்டும் இது வடிவமைக்கப்பட்டுள்ளது."
                                )
                            }
                        </div>
                    </div>
                </div>

                {/* Right Column: Payment History */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ color: '#06b6d4' }}><Clock size={20} /></div>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Payment History</h3>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text3)' }}>{subscriptions.length} Transactions</div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: 600 }}>
                        {subscriptions.length > 0 ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <tbody>
                                    {subscriptions.map((s, i) => (
                                        <tr key={s.id} style={{ borderBottom: i === subscriptions.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                            <td style={{ padding: '20px 32px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <div style={{ fontWeight: 700, textTransform: 'capitalize', fontSize: 15 }}>{s.plan?.replace('_', ' ')} Plan</div>
                                                    <div style={{ fontWeight: 800, color: '#fff' }}>₹{(s.amount / 100).toLocaleString()}</div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                                                        {new Date(s.createdAt).toLocaleDateString()} · {s.razorpayPaymentId || 'N/A'}
                                                    </div>
                                                    <span style={{
                                                        fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                                                        background: s.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                        color: s.status === 'paid' ? '#22c55e' : '#ef4444',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {s.status}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
                                <CreditCard size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                                <div style={{ fontSize: 14 }}>No payment records found</div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
