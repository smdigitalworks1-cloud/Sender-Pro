import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users, CreditCard, TrendingUp, ShieldCheck,
    Trash2, Edit2, Check, X, Crown, RefreshCw, Search,
    UserCheck, UserX, Calendar, Shield, Eye, EyeOff, Plus, UploadCloud, Zap, MessageCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import SupportPage from './SupportPage';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

const STATUS_BADGE = {
    active: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Active' },
    trial: { bg: 'rgba(234,179,8,0.12)', color: '#eab308', label: 'Trial' },
    expired: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Expired' },
    none: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', label: 'No Sub' },
};

function StatCard({ icon, label, value, color, sub, onClick }) {
    return (
        <div className="card" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.1s', ':hover': { transform: onClick ? 'translateY(-2px)' : 'none' } }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-head)', color }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
                {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{sub}</div>}
            </div>
        </div>
    );
}

/* ─── Edit User Modal ─────────────────────────────────────────── */
function EditModal({ user, onClose, onSave, isSuperAdmin, admins }) {
    const [form, setForm] = useState({
        name: user.name || '',
        email: user.email || '',
        whatsappNumber: user.whatsappNumber || '',
        password: '', // blank unless specified
        subStatus: user.subStatus || 'none',
        subExpiry: user.subExpiry ? new Date(user.subExpiry).toISOString().slice(0, 10) : '',
        isAdmin: user.isAdmin || false,
        parentId: user.parentId || null,
    });
    const [loading, setLoading] = useState(false);

    const quickExpiry = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        setForm(f => ({ ...f, subExpiry: d.toISOString().slice(0, 10), subStatus: 'active' }));
    };

    const handleSave = async () => {
        setLoading(true);
        await onSave(user.id || user._id, form);
        setLoading(false);
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 20, width: 480, maxWidth: '95vw', padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: 18 }}>✏️ Edit User</div>
                        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{user.name} · {user.email}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                {/* Profile Details (Super Admin only) */}
                {isSuperAdmin && (
                    <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: '#27272a', border: '1px solid #3f3f46', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em' }}>PROFILE DETAILS</div>
                        <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                        <input placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                        <input placeholder="WhatsApp Number" value={form.whatsappNumber} onChange={e => setForm(f => ({ ...f, whatsappNumber: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                        <input placeholder="New Password (leave blank to keep current)" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                    </div>
                )}

                {/* Role selection removed - All managed users are standard Users */}

                {/* Subscription Status */}
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: '#27272a', border: '1px solid #3f3f46' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.05em' }}>SUBSCRIPTION STATUS</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {['none', 'trial', 'active', 'expired'].map(s => {
                            const badge = STATUS_BADGE[s];
                            return (
                                <button key={s} onClick={() => setForm(f => ({ ...f, subStatus: s }))}
                                    style={{
                                        padding: '7px 16px', borderRadius: 20, border: `2px solid ${form.subStatus === s ? badge.color : '#3f3f46'}`,
                                        background: form.subStatus === s ? badge.bg : 'transparent',
                                        color: form.subStatus === s ? badge.color : 'var(--text3)',
                                        cursor: 'pointer', fontWeight: 700, fontSize: 12, textTransform: 'capitalize', transition: 'all 0.15s'
                                    }}>
                                    {badge.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Subscription Plan Selector */}
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: '#27272a', border: '1px solid #3f3f46' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.05em' }}>SUBSCRIPTION PLAN</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                            { label: '📅 Monthly', days: 30, duration: 'monthly' },
                            { label: '🗓️ Quarterly', days: 90, duration: 'quarterly' },
                        ].map(plan => {
                            const isSelected = form.selectedPlan === plan.duration;
                            return (
                                <button key={plan.duration}
                                    onClick={() => {
                                        const d = new Date();
                                        d.setDate(d.getDate() + plan.days);
                                        setForm(f => ({ ...f, subExpiry: d.toISOString().slice(0, 10), subStatus: 'active', selectedPlan: plan.duration }));
                                    }}
                                    style={{
                                        padding: '10px 6px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 12, textAlign: 'center',
                                        border: `2px solid ${isSelected ? '#7c3aed' : '#3f3f46'}`,
                                        background: isSelected ? 'rgba(124,58,237,0.15)' : 'transparent',
                                        color: isSelected ? '#a78bfa' : 'var(--text3)', transition: 'all 0.15s'
                                    }}>
                                    {plan.label}<br />
                                    <span style={{ fontSize: 10, fontWeight: 400 }}>{plan.days} days</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Expiry Date */}
                <div style={{ marginBottom: 20, padding: 16, borderRadius: 12, background: '#27272a', border: '1px solid #3f3f46' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, letterSpacing: '0.05em' }}>EXPIRY DATE</div>
                    <input type="date" value={form.subExpiry} onChange={e => setForm(f => ({ ...f, subExpiry: e.target.value }))}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {[{ label: '7 Days', days: 7 }, { label: '30 Days', days: 30 }, { label: '90 Days', days: 90 }].map(p => (
                            <button key={p.days} onClick={() => quickExpiry(p.days)}
                                style={{ padding: '5px 12px', borderRadius: 8, background: '#3f3f46', border: 'none', color: 'var(--text2)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                                +{p.label}
                            </button>
                        ))}
                        <button onClick={() => setForm(f => ({ ...f, subExpiry: '', subStatus: 'none', selectedPlan: null }))}
                            style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: 'none', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                            Clear
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={handleSave} disabled={loading} className="btn btn-primary" style={{ flex: 1 }}>
                        {loading ? 'Saving...' : '✅ Save Changes'}
                    </button>
                    <button onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                </div>
            </div>
        </div>
    );
}

/* ─── Add User Modal ─────────────────────────────────────────── */
function AddModal({ onClose, onCreated, isSuperAdmin, admins }) {
    const [form, setForm] = useState({ name: '', email: '', password: '', whatsappNumber: '', subStatus: 'active', subExpiry: '', isAdmin: false, parentId: null });
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);

    const quickExpiry = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        setForm(f => ({ ...f, subExpiry: d.toISOString().slice(0, 10) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(form)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Creation failed');
            toast.success('Account created! 🎉');
            onCreated();
            onClose();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 20, width: 480, maxWidth: '95vw', padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.5)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>➕ Create Account</div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <input required placeholder="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        style={{ padding: '11px 14px', borderRadius: 10, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14 }} />
                    <input required type="email" placeholder="Email Address" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        style={{ padding: '11px 14px', borderRadius: 10, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14 }} />
                    <input required placeholder="WhatsApp Number" value={form.whatsappNumber} onChange={e => setForm({ ...form, whatsappNumber: e.target.value })}
                        style={{ padding: '11px 14px', borderRadius: 10, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14 }} />
                    <div style={{ position: 'relative' }}>
                        <input required type={showPwd ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                            style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: 10, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' }} />
                        <button type="button" onClick={() => setShowPwd(v => !v)}
                            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
                            {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {/* Subscription status */}
                    <div style={{ padding: 14, borderRadius: 12, background: '#27272a', border: '1px solid #3f3f46' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 10 }}>SUBSCRIPTION</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {['none', 'trial', 'active'].map(s => (
                                <button type="button" key={s} onClick={() => setForm(f => ({ ...f, subStatus: s }))}
                                    style={{
                                        flex: 1, padding: '7px 0', borderRadius: 8, border: `2px solid ${form.subStatus === s ? STATUS_BADGE[s].color : '#3f3f46'}`,
                                        background: form.subStatus === s ? STATUS_BADGE[s].bg : 'transparent',
                                        color: form.subStatus === s ? STATUS_BADGE[s].color : 'var(--text3)',
                                        cursor: 'pointer', fontWeight: 700, fontSize: 12, textTransform: 'capitalize'
                                    }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        {/* Expiry quick-set */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                            {[7, 30, 90].map(d => (
                                <button type="button" key={d} onClick={() => quickExpiry(d)}
                                    style={{ padding: '4px 10px', borderRadius: 8, background: '#3f3f46', border: 'none', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                                    +{d}d
                                </button>
                            ))}
                        </div>
                        {form.subExpiry && <div style={{ marginTop: 8, fontSize: 12, color: '#22c55e' }}>Expires: {new Date(form.subExpiry).toLocaleDateString()}</div>}
                    </div>

                    {/* Role toggle and parent admin selection removed */}

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1 }}>
                            {loading ? 'Creating...' : '✅ Create Account'}
                        </button>
                        <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─── Main AdminPage ─────────────────────────────────────────── */
export default function AdminPage() {
    const [stats, setStats] = useState(null);
    const [users, setUsers] = useState([]);
    const [payments, setPayments] = useState([]);
    const [tab, setTab] = useState('users');
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('all'); // 'all', 'admins', 'active', 'trial'
    const [editUser, setEditUser] = useState(null);
    const [showAdd, setShowAdd] = useState(false);

    // Payment pagination and search
    const [payPage, setPayPage] = useState(1);
    const [paySearch, setPaySearch] = useState('');
    const ITEMS_PER_PAGE = 20;

    const { user: me } = useAuth();
    const isSuperAdmin = me?.role === 'superadmin';
    const isAdmin = isSuperAdmin || me?.isAdmin;

    const token = localStorage.getItem('token');
    const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token]);

    const fetchAll = useCallback(async (isInitial = false) => {
        let tid;
        if (!isInitial) tid = toast.loading('Refreshing data...');
        try {
            const [sRes, uRes, pRes] = await Promise.all([
                fetch(`${API}/api/admin/stats`, { headers }),
                fetch(`${API}/api/admin/users`, { headers }),
                fetch(`${API}/api/admin/payments`, { headers })
            ]);

            const sData = await sRes.json();
            const uData = await uRes.json();
            const pData = await pRes.json();

            if (!sData.message) setStats(sData);
            if (Array.isArray(uData)) {
                setUsers(uData.map(u => ({ ...u, id: u.id || u._id })));
            }
            if (Array.isArray(pData)) {
                setPayments(pData.map(p => ({
                    ...p,
                    id: p.id || p._id,
                    User: p.userId || p.User
                })));
            }

            if (tid) toast.success('Data updated! ✨', { id: tid });
        } catch (e) {
            if (tid) toast.error('Failed to refresh data', { id: tid });
        }
    }, [headers]);

    useEffect(() => { fetchAll(true); }, [fetchAll]);

    const handleSyncAll = async () => {
        const tid = toast.loading('Syncing all users to Google Sheets...');
        try {
            const res = await fetch(`${API}/api/admin/sync-all`, { headers });
            const d = await res.json();
            if (!res.ok) throw new Error(d.message);
            toast.success(d.message, { id: tid });
        } catch (e) {
            toast.error(e.message, { id: tid });
        }
    };

    const handleSaveUser = async (id, form) => {
        try {
            const res = await fetch(`${API}/api/admin/users/${id}`, { method: 'PATCH', headers, body: JSON.stringify(form) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            const updatedUser = { ...data, id: data.id || data._id };
            setUsers(u => u.map(x => (x.id === id || x._id === id) ? updatedUser : x));
            setEditUser(null);
            toast.success('User updated! ✅');
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API}/api/admin/users/${id}`, { method: 'DELETE', headers });
            if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
            setUsers(u => u.filter(x => x.id !== id && x._id !== id));
            toast.success('User deleted');
            fetchAll();
        } catch (e) { toast.error(e.message); }
    };

    const filtered = users.filter(u => {
        const matchesSearch = u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase());
        if (!matchesSearch) return false;
        if (filterType === 'admins') return u.isAdmin && !u.parentId;
        if (filterType === 'users') return !u.isAdmin && !u.parentId;
        if (filterType === 'subaccounts') return !!u.parentId;
        if (filterType === 'active') return u.subStatus === 'active';
        if (filterType === 'trial') return u.subStatus === 'trial';
        return true;
    });

    const adminCount = users.filter(u => u.isAdmin).length;
    const userCount = users.filter(u => !u.isAdmin).length;

    const exportCSV = () => {
        if (filtered.length === 0) return toast.error('No data to export');
        const headers = ['ID', 'Name', 'Email', 'WhatsApp', 'Role', 'Status', 'Expiry', 'Managed By'];
        const rows = filtered.map(u => [
            u.id || u._id,
            u.name || '',
            u.email || '',
            u.whatsappNumber || '',
            u.isAdmin ? 'Admin' : 'User',
            u.subStatus || 'none',
            u.subExpiry ? new Date(u.subExpiry).toLocaleDateString() : '',
            'Super Admin',
        ]);
        const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`✅ Exported ${filtered.length} records`);
    };

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Crown size={22} style={{ color: '#f59e0b' }} />
                        {isSuperAdmin ? 'Super Admin Dashboard' : 'Admin Dashboard'}
                    </div>
                    <div className="page-sub">
                        {isSuperAdmin ? 'Full control — users, roles, subscriptions & payments' : 'Manage your assigned sub-accounts'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {isSuperAdmin && <button className="btn btn-ghost" style={{ border: '1px solid rgba(124,58,237,0.3)', color: 'var(--accent3)' }} onClick={handleSyncAll}><UploadCloud size={14} /> Push to Sheets</button>}
                    <button className="btn btn-secondary" onClick={fetchAll}><RefreshCw size={14} /> Refresh</button>
                    <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Account</button>
                </div>
            </div>

            {/* ─── Stats Overview ──────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <StatCard icon={<Users size={24} />} label="Total Registered" value={stats?.totalUsers || 0} color="#7c3aed" onClick={() => { setFilterType('all'); setTab('users'); }} />
                {isSuperAdmin && <StatCard icon={<ShieldCheck size={24} />} label="Admins" value={users.filter(u => u.isAdmin).length || 0} color="#f59e0b" onClick={() => { setFilterType('admins'); setTab('users'); }} />}
                <StatCard icon={<UserCheck size={24} />} label="Users" value={stats?.regularUserCount || 0} color="#22c55e" onClick={() => { setFilterType('users'); setTab('users'); }} />
                <StatCard icon={<TrendingUp size={24} />} label="Trial Users" value={stats?.trialUsers || 0} color="#eab308" onClick={() => { setFilterType('trial'); setTab('users'); }} />

                {isSuperAdmin && (
                    <StatCard icon={<CreditCard size={24} />} label="Revenue (₹)" value={stats?.totalRevenue?.toLocaleString() || 0} color="#06b6d4" sub={`${stats?.totalPayments || 0} payments`} onClick={() => { setTab('payments'); }} />
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {['users', ...(isAdmin ? ['payments', 'tickets'] : []), ...(isSuperAdmin ? ['plans', 'settings'] : [])].map(t => (
                    <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>
                        {t === 'users' ? <><Users size={14} /> Users ({users.length})</> :
                            t === 'payments' ? <><CreditCard size={14} /> Payments</> :
                                t === 'tickets' ? <><MessageCircle size={14} /> Support Tickets</> :
                                    t === 'plans' ? <><Zap size={14} /> Plans & Pricing</> :
                                        <><Shield size={14} /> Settings</>}
                    </button>
                ))}
            </div>

            {/* ─── Users Tab ─────────────────────────────────────── */}
            {tab === 'users' && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Search + Role Filters + Export */}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Row 1: Search + export */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Search size={15} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                            <input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)}
                                style={{ border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', flex: 1, minWidth: 160, fontSize: 14 }} />
                            <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                            <button onClick={exportCSV}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ⬇ Export CSV
                            </button>
                        </div>
                        {/* Row 2: Role filter chips (simplified to show all, active, trial) */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[
                                { key: 'all', label: '🌐 All', color: '#7c3aed', show: true },
                                { key: 'active', label: '✅ Active', color: '#22c55e', show: true },
                                { key: 'trial', label: '⏳ Trial', color: '#eab308', show: true },
                            ].filter(f => f.show).map(f => (
                                <button key={f.key} onClick={() => setFilterType(f.key)}
                                    style={{
                                        padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                        border: `1.5px solid ${filterType === f.key ? f.color : '#3f3f46'}`,
                                        background: filterType === f.key ? `${f.color}22` : 'transparent',
                                        color: filterType === f.key ? f.color : 'var(--text3)',
                                    }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                                    {[
                                        'Name', 'Role', 'Email', 'Status', 'Expiry',
                                        ...(isSuperAdmin ? ['Managed By (நிர்வகிப்பவர்)'] : []),
                                        'Actions'
                                    ].map(h => (
                                        <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(u => {
                                    const badge = STATUS_BADGE[u.subStatus] || STATUS_BADGE.none;
                                    return (
                                        <tr key={u.id || u._id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.12s' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                                            {/* Name */}
                                            <td style={{ padding: '13px 16px' }}>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.name}</div>
                                            </td>

                                            {/* Role badge */}
                                            <td style={{ padding: '13px 16px' }}>
                                                {u.isAdmin
                                                    ? <span style={{ fontSize: 11, color: '#f59e0b', background: '#f59e0b1a', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>👨‍💼 Admin</span>
                                                    : <span style={{ fontSize: 11, color: '#94a3b8', background: '#94a3b81a', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>👤 User</span>
                                                }
                                            </td>

                                            {/* Email */}
                                            <td style={{ padding: '13px 16px', fontSize: 13, color: 'var(--text2)' }}>
                                                <div>{u.email}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{u.whatsappNumber}</div>
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: '13px 16px' }}>
                                                <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{badge.label}</span>
                                            </td>

                                            {/* Expiry */}
                                            <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text3)' }}>
                                                {u.subExpiry ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Calendar size={12} />{new Date(u.subExpiry).toLocaleDateString()}
                                                    </span>
                                                ) : '—'}
                                            </td>

                                            {/* Managed By (Super Admin Only) */}
                                            {isSuperAdmin && (
                                                <td style={{ padding: '13px 16px' }}>
                                                    {u.parentAdmin ? (
                                                        <div>
                                                            <div style={{ fontSize: 12, fontWeight: 600 }}>{u.parentAdmin.name}</div>
                                                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>{u.parentAdmin.email}</div>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: '#22c55e', background: '#22c55e1a', padding: '2px 8px', borderRadius: 12 }}>Super Admin</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Actions */}
                                            <td style={{ padding: '13px 16px' }}>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12, background: 'rgba(124,58,237,0.1)', color: '#a78bfa', borderColor: 'rgba(124,58,237,0.3)' }}
                                                        onClick={() => setEditUser(u)}>
                                                        <Zap size={12} /> Sub
                                                    </button>
                                                    <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                                                        onClick={() => setEditUser(u)}>
                                                        <Edit2 size={12} /> Edit
                                                    </button>
                                                    {(isSuperAdmin || (isAdmin && u.parentId === me.id)) && (
                                                        <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: 12 }}
                                                            onClick={() => handleDelete(u.id || u._id, u.name)}>
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {filtered.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)' }}>
                                <Users size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                                <div>No users found</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Payments Tab ─────────────────────────────────── */}
            {tab === 'payments' && isSuperAdmin && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Search size={15} style={{ color: 'var(--text3)' }} />
                        <input placeholder="Search payments by name or email…" value={paySearch} onChange={e => { setPaySearch(e.target.value); setPayPage(1); }}
                            style={{ border: 'none', background: 'transparent', color: 'var(--text)', outline: 'none', flex: 1, fontSize: 14 }} />
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                                    {['User', 'Plan', 'Amount', 'Status', 'Payment ID', 'Date'].map(h => (
                                        <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {payments
                                    .filter(p => !paySearch || p.User?.name?.toLowerCase().includes(paySearch.toLowerCase()) || p.User?.email?.toLowerCase().includes(paySearch.toLowerCase()))
                                    .slice((payPage - 1) * ITEMS_PER_PAGE, payPage * ITEMS_PER_PAGE)
                                    .map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '12px 16px', fontSize: 13 }}>
                                                <div style={{ fontWeight: 600 }}>{p.User?.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.User?.email}</div>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, textTransform: 'capitalize' }}>{p.plan}</td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#22c55e' }}>₹{(p.amount / 100).toLocaleString()}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <span style={{
                                                    background: p.status === 'paid' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                                                    color: p.status === 'paid' ? '#22c55e' : '#eab308',
                                                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize',
                                                }}>{p.status}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' }}>{p.razorpayPaymentId || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text3)' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                        {payments.filter(p => !paySearch || p.User?.name?.toLowerCase().includes(paySearch.toLowerCase()) || p.User?.email?.toLowerCase().includes(paySearch.toLowerCase())).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text3)' }}>
                                <CreditCard size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                                <div>No payments recorded yet</div>
                            </div>
                        )}
                    </div>

                    {(() => {
                        const filteredPays = payments.filter(p => !paySearch || p.User?.name?.toLowerCase().includes(paySearch.toLowerCase()) || p.User?.email?.toLowerCase().includes(paySearch.toLowerCase()));
                        const totalPages = Math.ceil(filteredPays.length / ITEMS_PER_PAGE);
                        if (totalPages > 1) {
                            return (
                                <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                                        Showing {(payPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(payPage * ITEMS_PER_PAGE, filteredPays.length)} of {filteredPays.length}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setPayPage(p => Math.max(1, p - 1))} disabled={payPage === 1}>
                                            <ChevronLeft size={16} /> Prev
                                        </button>
                                        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setPayPage(p => Math.min(totalPages, p + 1))} disabled={payPage === totalPages}>
                                            Next <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}
                </div>
            )}

            {/* ─── Plans Tab ────────────────────────────────────── */}
            {tab === 'plans' && isSuperAdmin && <PlansPricingSection token={token} />}

            {/* ─── Support Tickets Tab ──────────────────────────── */}
            {tab === 'tickets' && isAdmin && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 20, fontWeight: 800 }}>🎧 Support Tickets</div>
                        <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Manage and respond to user messages directly from here.</div>
                    </div>
                    <SupportPage hideHeader={true} />
                </div>
            )}

            {/* ─── Settings Tab ─────────────────────────────────── */}
            {tab === 'settings' && isSuperAdmin && <SettingsSection />}

            {/* ─── Edit Modal ─────────────────────────────────────── */}
            {editUser && (
                <EditModal
                    user={editUser}
                    isSuperAdmin={isSuperAdmin}
                    admins={users.filter(u => u.isAdmin)}
                    onClose={() => setEditUser(null)}
                    onSave={handleSaveUser}
                />
            )}

            {showAdd && (
                <AddModal
                    isSuperAdmin={isSuperAdmin}
                    admins={users.filter(u => u.isAdmin)}
                    onClose={() => setShowAdd(false)}
                    onCreated={fetchAll}
                />
            )}
        </div>
    );
}

/* ─── Plans & Pricing Section ──────────────────────────────────── */
function PlansPricingSection({ token }) {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const defaultPlans = [
        { id: 'user_monthly', label: 'User Monthly', type: 'user', amountInRupees: 6, days: 30, features: ['Unlimited WhatsApp Sending', 'Group Messaging', 'Auto Reply', 'Group Member Grabber', 'Advance Campaign Scheduling', 'Premium Priority Support'] },
        { id: 'user_quarterly', label: 'User Quarterly', type: 'user', amountInRupees: 1299, days: 90, features: ['Unlimited WhatsApp Sending', 'Group Messaging', 'Auto Reply', 'Group Member Grabber', 'Advance Campaign Scheduling', 'Premium Priority Support'] }
    ];

    const [plans, setPlans] = useState(defaultPlans);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [editingFeature, setEditingFeature] = useState({});

    useEffect(() => {
        fetch(`${API}/api/payments/plan-config`, { headers })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    setPlans(prev => prev.map(p => {
                        const found = data.find(d => d.id === p.id);
                        return found ? { ...p, amountInRupees: found.amountInRupees, days: found.days, features: found.features || p.features } : p;
                    }));
                }
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    const savePlan = async (plan) => {
        setSaving(plan.id);
        try {
            const res = await fetch(`${API}/api/payments/plan-config`, {
                method: 'PATCH', headers,
                body: JSON.stringify({
                    planId: plan.id,
                    amountInRupees: plan.amountInRupees,
                    features: plan.features
                }),
            });
            if (!res.ok) throw new Error((await res.json()).message);
            toast.success(`✅ "${plan.label}" saved!`);
        } catch (err) { toast.error(err.message); }
        finally { setSaving(null); }
    };

    const handleSyncAllPlans = async () => {
        if (!window.confirm("This will upload plan configurations to the backend. Continue?")) return;
        setSyncing(true);
        try {
            for (const p of plans) {
                await fetch(`${API}/api/payments/plan-config`, {
                    method: 'PATCH', headers,
                    body: JSON.stringify({
                        planId: p.id,
                        amountInRupees: p.amountInRupees,
                        features: p.features
                    }),
                });
            }
            toast.success("✅ All plans synchronized! Refresh the pricing page to see results.");
        } catch (e) { toast.error("Sync failed: " + e.message); }
        finally { setSyncing(false); }
    };

    const updatePlan = (id, field, val) => setPlans(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
    const addFeature = (planId) => {
        const text = (editingFeature[planId] || '').trim();
        if (!text) return;
        setPlans(prev => prev.map(p => p.id === planId ? { ...p, features: [...p.features, text] } : p));
        setEditingFeature(prev => ({ ...prev, [planId]: '' }));
    };
    const removeFeature = (planId, idx) => setPlans(prev => prev.map(p => p.id === planId ? { ...p, features: p.features.filter((_, i) => i !== idx) } : p));

    const PLAN_COLORS = { admin: '#f59e0b', user: '#7c3aed' };
    const PLAN_ICONS = { admin: '👑', user: '👤' };

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading plans...</div>;

    return (
        <div>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>📦 Plans & Pricing</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Manage subscription plans, pricing, and features. Price changes apply immediately to new orders.</div>
                </div>
                <button onClick={handleSyncAllPlans} disabled={syncing} className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', gap: 8 }}>
                    <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync to Backend'}
                </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                {plans.map(plan => {
                    const color = PLAN_COLORS[plan.type] || '#7c3aed';
                    return (
                        <div key={plan.id} className="card" style={{ border: `1px solid ${color}33`, padding: 0, overflow: 'hidden' }}>
                            <div style={{ background: `${color}18`, padding: '16px 20px', borderBottom: `1px solid ${color}33` }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                    <span style={{ fontSize: 24 }}>{PLAN_ICONS[plan.type]}</span>
                                    <input value={plan.label} onChange={e => updatePlan(plan.id, 'label', e.target.value)}
                                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 18, fontWeight: 800, outline: 'none' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 28, fontWeight: 900, color }}>₹</span>
                                    <input type="number" min="0" value={plan.amountInRupees} onChange={e => updatePlan(plan.id, 'amountInRupees', e.target.value)}
                                        style={{ width: 110, background: 'transparent', border: 'none', borderBottom: `2px solid ${color}`, color, fontSize: 28, fontWeight: 900, outline: 'none', textAlign: 'center' }} />
                                    <span style={{ fontSize: 14, color: 'var(--text3)' }}>/ </span>
                                    <input type="number" min="1" value={plan.days} onChange={e => updatePlan(plan.id, 'days', e.target.value)}
                                        style={{ width: 50, background: '#27272a', border: '1px solid #3f3f46', color: 'var(--text2)', fontSize: 12, borderRadius: 6, padding: '4px 6px', outline: 'none', textAlign: 'center' }} />
                                    <span style={{ fontSize: 13, color: 'var(--text3)' }}>days</span>
                                </div>
                            </div>
                            <div style={{ padding: '16px 20px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginBottom: 10 }}>FEATURES</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
                                    {plan.features.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ color, fontSize: 14 }}>✓</span>
                                            <span style={{ flex: 1, fontSize: 13 }}>{f}</span>
                                            <button onClick={() => removeFeature(plan.id, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, display: 'flex' }}><X size={13} /></button>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                                    <input placeholder="Add a feature..." value={editingFeature[plan.id] || ''}
                                        onChange={e => setEditingFeature(prev => ({ ...prev, [plan.id]: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && addFeature(plan.id)}
                                        style={{ flex: 1, padding: '7px 10px', borderRadius: 8, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 13 }} />
                                    <button onClick={() => addFeature(plan.id)} style={{ background: color, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}><Plus size={14} /></button>
                                </div>
                                <button className="btn btn-primary" style={{ width: '100%', background: color, borderColor: color }} disabled={saving === plan.id} onClick={() => savePlan(plan)}>
                                    {saving === plan.id ? 'Saving...' : <><Check size={14} /> Save Plan</>}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', fontSize: 13, color: 'var(--text2)' }}>
                💡 <strong>Tip:</strong> Pricing changes apply immediately to new orders. Feature lists help describe each plan to your users.
            </div>
        </div>
    );
}

function SettingsSection() {
    const { changePassword } = useAuth();
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Password form
    const [pwdData, setPwdData] = useState({ current: '', new: '', confirm: '' });
    const [pwdLoading, setPwdLoading] = useState(false);

    // Pricing form
    const [plans, setPlans] = useState([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [savingPlan, setSavingPlan] = useState(null);

    // Limits form
    const [limits, setLimits] = useState({ trialDays: 7 });
    const [limitsLoading, setLimitsLoading] = useState(true);
    const [savingLimits, setSavingLimits] = useState(false);

    useEffect(() => {
        fetch(`${API}/api/payments/plan-config`, { headers })
            .then(r => r.json())
            .then(data => {
                setPlans(Array.isArray(data) ? data : []); // Always ensure it's an array
                setPlansLoading(false);
            })
            .catch(() => setPlansLoading(false));

        fetch(`${API}/api/admin/limits`, { headers })
            .then(r => r.json())
            .then(data => {
                if (data && typeof data === 'object' && !data.message) {
                    setLimits(data); // Only update if valid limits object
                }
                setLimitsLoading(false);
            })
            .catch(() => setLimitsLoading(false));
    }, []);

    const handlePwdUpdate = async (e) => {
        e.preventDefault();
        if (pwdData.new !== pwdData.confirm) return toast.error("Passwords don't match");
        if (pwdData.new.length < 6) return toast.error("Password must be at least 6 chars");
        setPwdLoading(true);
        try {
            await changePassword(pwdData.current, pwdData.new);
            toast.success("Password updated! 🔒");
            setPwdData({ current: '', new: '', confirm: '' });
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        } finally { setPwdLoading(false); }
    };

    const handlePriceUpdate = async (plan) => {
        setSavingPlan(plan.id);
        try {
            const res = await fetch(`${API}/api/payments/plan-config`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ planId: plan.id, amountInRupees: plan.amountInRupees }),
            });
            if (!res.ok) throw new Error((await res.json()).message);
            toast.success(`✅ ${plan.label} updated to ₹${plan.amountInRupees}`);
        } catch (err) {
            toast.error(err.message);
        } finally { setSavingPlan(null); }
    };

    const handleLimitsUpdate = async () => {
        setSavingLimits(true);
        try {
            const res = await fetch(`${API}/api/admin/limits`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(limits),
            });
            if (!res.ok) throw new Error((await res.json()).message);
            toast.success('✅ Limits updated successfully!');
        } catch (err) {
            toast.error(err.message);
        } finally { setSavingLimits(false); }
    };

    const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, background: '#27272a', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, boxSizing: 'border-box' };
    const numberBoxStyle = { width: 80, padding: '8px 10px', borderRadius: 8, background: '#18181b', border: '1px solid #3f3f46', color: '#fff', outline: 'none', fontSize: 14, textAlign: 'center' };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>

            {/* ── Account Limits ───────────────────────────── */}
            <div className="card">
                <h3 style={{ marginTop: 0, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users size={18} style={{ color: '#7c3aed' }} /> Account Limits
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 0, marginBottom: 20 }}>
                    Control free trial period and other system limits.
                </p>
                {limitsLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text3)' }}>Loading...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {[
                            { key: 'trialDays', label: 'Trial Period (Days)', icon: '⏳', desc: 'Free trial days for new user registrations' },
                        ].map(item => (
                            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#27272a', border: '1px solid #3f3f46' }}>
                                <span style={{ fontSize: 20 }}>{item.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</div>
                                </div>
                                <input
                                    type="number"
                                    min="1"
                                    value={limits[item.key]}
                                    onChange={e => setLimits(prev => ({ ...prev, [item.key]: e.target.value }))}
                                    style={numberBoxStyle}
                                />
                            </div>
                        ))}
                        <button
                            className="btn btn-primary"
                            onClick={handleLimitsUpdate}
                            disabled={savingLimits}
                            style={{ marginTop: 4 }}
                        >
                            {savingLimits ? 'Saving...' : <><Check size={14} /> Save All Limits</>}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Password Update ─────────────────────────── */}
            <div className="card">
                <h3 style={{ marginTop: 0, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={18} style={{ color: '#7c3aed' }} /> Change Admin Password
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 0, marginBottom: 20 }}>
                    Ensure your account stays secure by periodically updating your password.
                </p>
                <form onSubmit={handlePwdUpdate} style={{ display: 'grid', gap: 14 }}>
                    <input type="password" placeholder="Current Password" required value={pwdData.current} onChange={e => setPwdData({ ...pwdData, current: e.target.value })} style={inputStyle} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <input type="password" placeholder="New Password" required value={pwdData.new} onChange={e => setPwdData({ ...pwdData, new: e.target.value })} style={inputStyle} />
                        <input type="password" placeholder="Confirm New Password" required value={pwdData.confirm} onChange={e => setPwdData({ ...pwdData, confirm: e.target.value })} style={inputStyle} />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={pwdLoading}>
                        {pwdLoading ? 'Updating...' : <><Check size={14} /> Update Password</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
