import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Crown, LogOut, ChevronLeft, ChevronRight, Zap, User, HeadphonesIcon } from 'lucide-react';
import { useWhatsApp } from '../hooks/useWhatsApp';

const adminNav = [
    { to: '/admin', icon: Crown, label: 'Admin Portal' },
    { to: '/profile', icon: User, label: 'My Profile' },
    { to: '/support', icon: HeadphonesIcon, label: 'Helpdesk Support' },
    { to: '/dashboard', icon: Zap, label: 'Sender Dashboard' } // Only for Sub-Admins
];

export default function AdminLayout() {
    const { logout, user } = useAuth();
    const { disconnect } = useWhatsApp();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
            {/* Sidebar */}
            <aside style={{
                width: collapsed ? 72 : 230,
                background: '#1a1a24', // slightly different background for admin
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.22s ease',
                flexShrink: 0,
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Logo */}
                <div style={{ padding: collapsed ? '20px 0' : '20px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Crown size={18} color="#fff" />
                    </div>
                    {!collapsed && <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: 17, background: 'linear-gradient(135deg, #fcd34d, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Admin Pro</span>}
                </div>

                {/* Nav */}
                <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
                    {adminNav.map(({ to, icon: Icon, label }) => {
                        return (
                            <NavLink key={to} to={to}>
                                {({ isActive }) => (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 11,
                                        padding: collapsed ? '10px 0' : '10px 14px',
                                        borderRadius: 10, marginBottom: 3, textDecoration: 'none',
                                        justifyContent: collapsed ? 'center' : 'flex-start',
                                        color: isActive && to === '/admin' ? '#f59e0b' : isActive ? '#c084fc' : 'var(--text3)',
                                        background: isActive && to === '/admin' ? 'rgba(245,158,11,0.12)' : isActive ? 'rgba(124,58,237,0.12)' : 'transparent',
                                        fontWeight: isActive ? 600 : 400,
                                        fontSize: 13.5,
                                        transition: 'all 0.15s',
                                    }}>
                                        <Icon size={17} style={{ color: isActive && to === '/admin' ? '#f59e0b' : isActive ? '#c084fc' : 'inherit' }} />
                                        {!collapsed && label}
                                    </div>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Bottom Actions */}
                <div style={{ padding: '20px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button className="btn btn-secondary" onClick={() => setCollapsed(c => !c)} style={{ justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 10 : '10px 14px' }}>
                        {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Collapse Menu</>}
                    </button>
                    <button className="btn btn-danger" onClick={handleLogout} style={{ justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 10 : '10px 14px' }}>
                        <LogOut size={16} />
                        {!collapsed && 'Logout'}
                    </button>
                </div>
            </aside>

            {/* Main Container */}
            <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: '28px 32px', position: 'relative' }}>
                <Outlet />
            </main>
        </div>
    );
}
