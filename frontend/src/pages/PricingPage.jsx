import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Zap, Star, Crown, Check, Loader, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

const CATEGORY_INFO = {
    user: {
        label: 'Individual User',
        icon: <Zap size={14} />,
        description: "தனிப்பட்ட பயன்பாட்டிற்கு (Personal Use). Dashboard வசதிகள் மட்டும்.",
        themeColor: '#7c3aed',
    },
    admin: {
        label: 'Admin (Multi-User)',
        icon: <Crown size={14} />,
        description: "அட்மின்களுக்கு (For Admins). சப்-அக்கவுண்ட் மேனேஜ்மென்ட் மற்றும் அட்மின் போர்ட்டல் வசதியுடன்.",
        themeColor: '#f59e0b',
    }
};

const PLAN_THEMES = {
    monthly: { icon: <Zap size={28} />, color: '#7c3aed', gradient: 'linear-gradient(135deg, #7c3aed22, #4f1d9622)', border: '#7c3aed' },
    quarterly: { icon: <Star size={28} />, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b22, #b4570822)', border: '#f59e0b', popular: true, badge: 'Best Value' },
};

export default function PricingPage() {
    const { user, refreshUser, refreshSubscription } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState('');
    const [plans, setPlans] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [category, setCategory] = useState('user'); // 'user' or 'admin'

    useEffect(() => {
        if (user?.role === 'subaccount') {
            navigate('/dashboard');
        } else {
            fetch(`${API}/api/payments/plans`)
                .then(r => r.json())
                .then(data => {
                    setPlans(data);
                    setFetching(false);
                })
                .catch(() => setFetching(false));
        }
    }, [user, navigate]);

    const handlePay = async (plan) => {
        if (!window.Razorpay) return toast.error('Payment gateway loading...');
        setLoading(plan.id);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/payments/create-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ plan: plan.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            const options = {
                key: data.keyId,
                amount: data.amount,
                currency: data.currency,
                name: 'Sender Pro',
                description: `${plan.label} Subscription`,
                order_id: data.orderId,
                handler: async (response) => {
                    try {
                        const vRes = await fetch(`${API}/api/payments/verify`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ ...response, plan: plan.id }),
                        });
                        const vData = await vRes.json();
                        if (vRes.ok) {
                            toast.success('🎉 Payment successful! Subscription activated!');
                            if (refreshUser) await refreshUser();
                            if (refreshSubscription) await refreshSubscription();
                            setTimeout(() => navigate('/dashboard'), 1500);
                        } else throw new Error(vData.message);
                    } catch (e) { toast.error(e.message); }
                },
                prefill: { name: user?.name, email: user?.email },
                theme: { color: PLAN_THEMES[plan.id.split('_')[1]]?.color || '#7c3aed' },
                modal: { ondismiss: () => setLoading('') },
            };

            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading('');
        }
    };

    const filteredPlans = plans.filter(p => p.type === category);
    const theme = CATEGORY_INFO[category];

    if (fetching) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text3)' }}>
            <Loader className="spin" size={32} />
        </div>
    );

    return (
        <div className="fade-in" style={{ minHeight: '100vh', padding: '20px 0' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px',
                    background: `${theme.themeColor}22`, border: `1px solid ${theme.themeColor}44`,
                    borderRadius: 20, marginBottom: 20, color: theme.themeColor, fontSize: 13, fontWeight: 600,
                }}>
                    {theme.icon} Sender Pro Premium
                </div>
                <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 40, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
                    Choose Your Plan
                </h1>
                <p style={{ color: 'var(--text3)', fontSize: 16, marginBottom: 32 }}>
                    Unlock full WhatsApp automation power. No limits. Cancel anytime.
                </p>

                {/* Category Toggle hidden - only User plans are active */}

                <div style={{ color: 'var(--text2)', marginBottom: 20, fontSize: 14 }}>
                    {theme.description}
                </div>
            </div>

            {/* Plans Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 1100, margin: '0 auto', padding: '0 20px' }}>
                {filteredPlans.map((plan) => {
                    const duration = plan.id.split('_')[1]; // monthly, quarterly, yearly
                    const style = PLAN_THEMES[duration] || PLAN_THEMES.monthly;
                    const isSubscribed = user?.subStatus === 'active' || user?.subStatus === 'trial';
                    const isCurrentPlan = isSubscribed && user?.activePlan === plan.id;

                    return (
                        <div key={plan.id} style={{
                            background: style.gradient,
                            border: `1px solid ${style.popular ? style.border : 'var(--border)'}`,
                            borderRadius: 20, padding: 32, position: 'relative',
                            boxShadow: style.popular ? `0 0 40px ${style.color}33` : 'none',
                            transform: style.popular ? 'scale(1.03)' : 'scale(1)',
                            transition: 'all 0.3s',
                            display: 'flex', flexDirection: 'column'
                        }}>
                            {style.badge && (
                                <div style={{
                                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                                    background: style.color, color: '#fff', fontSize: 12, fontWeight: 700,
                                    padding: '4px 16px', borderRadius: 20, whiteSpace: 'nowrap',
                                    zIndex: 10
                                }}>
                                    {style.badge}
                                </div>
                            )}

                            <div style={{
                                width: 56, height: 56, borderRadius: 16, background: `${style.color}22`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: style.color, marginBottom: 20,
                            }}>
                                {style.icon}
                            </div>

                            <div style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{plan.label}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                                <span style={{ fontSize: 14, color: 'var(--text3)' }}>₹</span>
                                <span style={{ fontSize: 42, fontWeight: 800, color: style.color, fontFamily: 'var(--font-head)' }}>{plan.amount.toLocaleString()}</span>
                                <span style={{ color: 'var(--text3)', fontSize: 13 }}>/ {plan.days} days</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 24 }}>
                                ₹{Math.round(plan.amount / plan.days)}/day
                            </div>

                            {/* Features (Dynamically from Backend) */}
                            <div style={{ marginBottom: 28, flex: 1 }}>
                                {plan.features && plan.features.map((f, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: 'var(--text2)' }}>
                                        <Check size={15} style={{ color: style.color, flexShrink: 0, marginTop: 1 }} /> {f}
                                    </div>
                                ))}
                                {(!plan.features || plan.features.length === 0) && (
                                    <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>
                                        Check documentation for features
                                    </div>
                                )}
                            </div>

                            {isCurrentPlan ? (
                                <div
                                    style={{
                                        width: '100%', padding: '13px', borderRadius: 12,
                                        background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e',
                                        border: '1.5px solid rgba(34, 197, 94, 0.4)',
                                        fontWeight: 700, fontSize: 15, textAlign: 'center',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                    }}
                                >
                                    ✅ Active Plan
                                </div>
                            ) : (
                                <button
                                    onClick={() => handlePay(plan)}
                                    disabled={!!loading}
                                    style={{
                                        width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                                        background: style.color, color: '#fff', fontWeight: 700, fontSize: 15,
                                        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading && loading !== plan.id ? 0.6 : 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {loading === plan.id ? <><Loader size={16} className="spin" /> Processing...</> : `Subscribe ₹${plan.amount.toLocaleString()}`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {!window.Razorpay && (
                <script src="https://checkout.razorpay.com/v1/checkout.js" />
            )}
        </div>
    );
}
