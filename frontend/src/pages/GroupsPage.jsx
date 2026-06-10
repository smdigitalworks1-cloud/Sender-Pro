import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Users2, RefreshCw, Download, ChevronDown, ChevronRight, ShieldCheck, Search, WifiOff } from 'lucide-react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { Link } from 'react-router-dom';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin);

export default function GroupsPage() {
  const { user } = useAuth();
  const { status } = useWhatsApp();
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [parts, setParts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const socketRef = useRef(null);

  useEffect(() => {
    loadGroups(false);

    if (user?.id) {
      const socket = io(SOCKET_URL);
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('whatsapp:identify', { userId: user.id, role: user.role });
      });

      socket.on('whatsapp:groups_updated', (updatedGroups) => {
        setGroups(updatedGroups);
        console.log('🔄 Real-time groups cache update received via socket.');
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [user?.id, user?.role]);

  const loadGroups = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const { data } = await api.get(forceRefresh ? '/groups?refresh=true' : '/groups');
      setGroups(data);
      if (forceRefresh) {
        toast.success(`Refreshed ${data.length} groups`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'WhatsApp not connected');
    } finally {
      setLoading(false);
    }
  };

  const loadParticipants = async (groupId) => {
    if (expanded === groupId) { setExpanded(null); return; }
    setExpanded(groupId);
    if (parts[groupId]) return;
    try {
      const { data } = await api.get(`/groups/${groupId}/participants`);
      setParts(p => ({ ...p, [groupId]: data }));
    } catch { toast.error('Failed to load participants'); }
  };

  const saveToContacts = async (groupId) => {
    setSaving(s => ({ ...s, [groupId]: true }));
    try {
      const { data } = await api.post(`/groups/${groupId}/save`);
      toast.success(`Saved ${data.saved} contacts`);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(s => ({ ...s, [groupId]: false })); }
  };

  const exportToCSV = (groupId, groupName) => {
    const participants = parts[groupId];
    if (!participants || participants.length === 0) {
      toast.error('Load participants first before exporting');
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8,"
      + "Phone Number,Is Admin\n"
      + participants.map(p => `${p.phone},${p.isAdmin ? 'Yes' : 'No'}`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${groupName.replace(/\s+/g, '_')}_contacts.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
    toast.success('Downloaded as CSV');
  };

  const filteredGroups = (groups || []).filter(g => (g?.name || 'Unknown').toLowerCase().includes((search || '').toLowerCase()));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">Group Grabber</div>
          <div className="page-sub">Extract contacts from your WhatsApp groups</div>
        </div>
        {status === 'connected' && (
          <button className="btn btn-primary" onClick={() => loadGroups(true)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Loading...' : 'Fetch Groups'}
          </button>
        )}
      </div>

      {status !== 'connected' ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', minHeight: 340, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <WifiOff size={30} color="var(--red)" />
          </div>
          <h3 style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>WhatsApp Disconnected</h3>
          <p style={{ color: 'var(--text3)', fontSize: 13, maxWidth: 380, marginBottom: 24, lineHeight: 1.5 }}>
            Your WhatsApp is not connected. Please link your WhatsApp account first to load and extract contacts from your groups.
          </p>
          <Link to="/whatsapp" className="btn btn-primary">
            Go to WhatsApp Connection
          </Link>
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state card">
          <Users2 size={48} />
          <h3>No Groups Loaded</h3>
          <p>Click "Fetch Groups" to load your WhatsApp groups</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Search Box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', padding: '10px 16px', borderRadius: 12 }}>
            <Search size={18} color="var(--text3)" />
            <input
              type="text"
              placeholder="Search groups by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', fontSize: 14, width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)' }}>No groups found matching "{search}"</div>
            ) : (
              filteredGroups.map(g => (
                <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                    onClick={() => loadParticipants(g.id)}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Users2 size={18} color="var(--accent3)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{g.name}</div>
                      <div style={{ color: 'var(--text3)', fontSize: 12 }}>{parts[g.id] ? parts[g.id].length : g.participantCount} participants</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}
                        onClick={e => { e.stopPropagation(); saveToContacts(g.id); }}
                        disabled={saving[g.id]}>
                        <Download size={13} /> {saving[g.id] ? 'Saving...' : 'Save to Contacts'}
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--border)' }}
                        onClick={e => { e.stopPropagation(); exportToCSV(g.id, (g.name || 'Unknown_Group')); }}
                        disabled={!parts[g.id]}>
                        <Download size={13} /> Export CSV
                      </button>
                      {expanded === g.id ? <ChevronDown size={16} color="var(--text3)" /> : <ChevronRight size={16} color="var(--text3)" />}
                    </div>
                  </div>

                  {/* Participants */}
                  {expanded === g.id && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                      {!parts[g.id] ? (
                        <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading participants...</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                          {parts[g.id].map(p => (
                            <div key={p.phone} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg2)', borderRadius: 8 }}>
                              {p.isAdmin && <ShieldCheck size={12} color="var(--yellow)" />}
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>{p.phone}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
