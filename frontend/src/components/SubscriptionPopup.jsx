import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Zap, Star, Crown, X, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

export default function SubscriptionPopup({ onClose }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [minPrice, setMinPrice] = useState(499);
    const [dailyPrice, setDailyPrice] = useState(16);

    useEffect(() => {
        fetch(`${API}/api/payments/plans`)
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    const userPlans = data.filter(p => p.type === 'user');
                    if (userPlans.length > 0) {
                        const lowest = Math.min(...userPlans.map(p => p.amount));
                        const daily = Math.min(...userPlans.map(p => Math.round(p.amount / p.days)));
                        setMinPrice(lowest);
                        setDailyPrice(daily);
                    }
                }
            })
            .catch(() => { });
    }, []);

    const handleSubscribe = () => {
        navigate('/pricing');
        if (onClose) onClose();
    };

    return (
        <>
            <div style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 1000,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}>
                <div style={{
                    background: 'var(--card)', border: '1px solid rgba(124,58,237,0.4)', borderRadius: 24,
                    padding: '40px 36px', maxWidth: 480, width: '100%', position: 'relative',
                    boxShadow: '0 0 80px rgba(124,58,237,0.25)', animation: 'slideUp 0.3s ease', textAlign: 'center',
                }}>
                    <div style={{
                        width: 72, height: 72, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #7c3aed33, #c084fc33)',
                        border: '2px solid rgba(124,58,237,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
                    }}>
                        <Lock size={32} style={{ color: '#c084fc' }} />
                    </div>

                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: 26, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
                        Subscription Required
                    </h2>

                    {user?.role === 'subaccount' ? (
                        <p style={{ color: 'var(--text3)', fontSize: 15, marginBottom: 28, lineHeight: 1.6 }}>
                            உங்கள் கணக்கு காலாவதியாகிவிட்டது (Your account has expired). <br />
                            <strong style={{ color: 'var(--text2)' }}>தொடர்ந்து பயன்படுத்த உங்கள் Admin-ஐ தொடர்பு கொள்ளவும்.</strong>
                        </p>
                    ) : (
                        <p style={{ color: 'var(--text3)', fontSize: 15, marginBottom: 28, lineHeight: 1.6 }}>
                            இந்த feature use பண்ண subscription எடுக்கணும். <br />
                            <strong style={{ color: 'var(--text2)' }}>₹{dailyPrice}/day-இல் முழு access!</strong>
                        </p>
                    )}

                    <div style={{
                        background: 'var(--bg2)', borderRadius: 14, padding: '16px 20px',
                        marginBottom: 28, textAlign: 'left', display: 'grid', gap: 10,
                    }}>
                        {[
                            { icon: <Zap size={15} />, text: 'Unlimited WhatsApp Sending', color: '#7c3aed' },
                            { icon: <Star size={15} />, text: 'Bulk Sender & Campaigns', color: '#06b6d4' },
                            { icon: <Crown size={15} />, text: 'Auto Reply & Scheduling', color: '#f59e0b' },
                        ].map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text2)' }}>
                                <span style={{ color: f.color }}>{f.icon}</span> {f.text}
                            </div>
                        ))}
                    </div>

                    {user?.role !== 'subaccount' && (
                        <button onClick={handleSubscribe} style={{
                            width: '100%', padding: '15px 24px', background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s',
                            boxShadow: '0 4px 20px rgba(124,58,237,0.4)',
                        }}>
                            🚀 Subscribe Now — From ₹{minPrice.toLocaleString()}
                            <ArrowRight size={18} />
                        </button>
                    )}

                </div>
            </div>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(40px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </>
    );
}
