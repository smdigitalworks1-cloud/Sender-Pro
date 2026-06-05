import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MessageCircle, CheckCircle, Clock, Send, ShieldAlert, FileText, User } from 'lucide-react';
import toast from 'react-hot-toast';

const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

export default function SupportPage({ hideHeader = false }) {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'superadmin';
    const isAdmin = isSuperAdmin || user?.isAdmin;

    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    // User forms
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Admin forms
    const [replyingTo, setReplyingTo] = useState(null);
    const [adminReply, setAdminReply] = useState('');

    useEffect(() => {
        fetchTickets();
    }, []);

    const fetchTickets = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/support`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) setTickets(data);
        } catch (err) {
            toast.error('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTicket = async (e) => {
        e.preventDefault();
        if (!subject || !message) return toast.error('Fill in all fields');
        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/api/support`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ subject, message })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('Ticket submitted successfully!');
                setSubject('');
                setMessage('');
                fetchTickets();
            } else {
                toast.error(data.message || 'Error creating ticket');
            }
        } catch (err) {
            toast.error('Failed to submit ticket');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAdminReply = async (ticketId, closeTicket = false) => {
        if (!adminReply && !closeTicket) return toast.error('Reply cannot be empty');
        try {
            const token = localStorage.getItem('token');
            const body = { adminReply };
            if (closeTicket) body.status = 'closed';

            const res = await fetch(`${API}/api/support/${ticketId}/reply`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                toast.success(closeTicket ? 'Ticket closed' : 'Reply sent');
                setReplyingTo(null);
                setAdminReply('');
                fetchTickets();
            } else {
                const data = await res.json();
                toast.error(data.message || 'Failed to reply');
            }
        } catch (err) {
            toast.error('Error sending reply');
        }
    };

    return (
        <div className="fade-in">
            {!hideHeader && (
                <div className="page-header">
                    <div>
                        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ShieldAlert size={22} style={{ color: '#7c3aed' }} />
                            Helpdesk Support
                        </div>
                        <div className="page-sub">
                            Send your queries, issues, or feedback directly to our helpdesk team.
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 24, alignItems: 'start' }}>
                {/* Submit Ticket / Email Form */}
                <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ marginBottom: 20, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MessageCircle size={18} color="var(--accent3)" /> Send Support Mail
                    </h3>
                    <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="label">Subject</label>
                            <input
                                className="input"
                                placeholder="Brief description of issue"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="label">Message</label>
                            <textarea
                                className="textarea"
                                placeholder="Describe your issue in detail..."
                                style={{ minHeight: 120 }}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting}
                            style={{ marginTop: 8 }}
                        >
                            <Send size={16} /> {submitting ? 'Sending...' : 'Send Support Mail'}
                        </button>
                    </form>
                </div>

                {/* Tickets List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading tickets...</div>
                    ) : tickets.length === 0 ? (
                        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text3)' }}>
                            <FileText size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                            <div>{isAdmin ? 'No support tickets found.' : "You haven't opened any support tickets yet."}</div>
                        </div>
                    ) : (
                        tickets.map(ticket => (
                            <div key={ticket.id} className="card" style={{ padding: 20, borderLeft: `4px solid ${ticket.status === 'open' ? '#f59e0b' : ticket.status === 'resolved' ? '#22c55e' : '#64748b'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                                            {ticket.subject}
                                        </div>
                                        {isAdmin && ticket.User && (
                                            <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <User size={12} /> {ticket.User.name} ({ticket.User.email})
                                            </div>
                                        )}
                                        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <Clock size={12} /> {new Date(ticket.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                    <div>
                                        <span style={{
                                            padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
                                            background: ticket.status === 'open' ? 'rgba(245,158,11,0.1)' : ticket.status === 'resolved' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                                            color: ticket.status === 'open' ? '#f59e0b' : ticket.status === 'resolved' ? '#22c55e' : '#94a3b8'
                                        }}>
                                            {ticket.status}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', marginBottom: 12 }}>
                                    {ticket.message}
                                </div>

                                {ticket.adminReply && (
                                    <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', padding: 16, borderRadius: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--text)', marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>HELPDESK REPLY:</div>
                                        {ticket.adminReply}
                                    </div>
                                )}

                                {isAdmin && ticket.status !== 'closed' && (
                                    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                                        {replyingTo === ticket.id ? (
                                            <div>
                                                <textarea
                                                    className="textarea"
                                                    placeholder="Write your reply..."
                                                    style={{ minHeight: 80, marginBottom: 10 }}
                                                    value={adminReply}
                                                    onChange={e => setAdminReply(e.target.value)}
                                                />
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button className="btn btn-primary" onClick={() => handleAdminReply(ticket.id, false)}>
                                                        Send Reply
                                                    </button>
                                                    <button className="btn btn-danger" onClick={() => handleAdminReply(ticket.id, true)}>
                                                        Reply & Close
                                                    </button>
                                                    <button className="btn btn-secondary" onClick={() => { setReplyingTo(null); setAdminReply(''); }}>
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button className="btn btn-secondary" onClick={() => setReplyingTo(ticket.id)}>
                                                Reply to User
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
