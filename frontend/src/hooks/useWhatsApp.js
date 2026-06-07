import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin);

export function useWhatsApp() {
  const { user } = useAuth();
  const [status, setStatus] = useState(user?.whatsappNumber || localStorage.getItem('wa_phone') ? 'connected' : 'disconnected');
  const [errorMsg, setErrorMsg] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [phone, setPhone] = useState(localStorage.getItem('wa_phone') || null);
  const [waName, setWaName] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    const socket = io(SOCKET_URL, { forceNew: true });
    socketRef.current = socket;

    const identify = () => {
      console.log(`🔌 [Socket] Emitting identify for user ${user.id} (role: ${user.role})`);
      socket.emit('whatsapp:identify', { userId: user.id, role: user.role });
    };

    if (socket.connected) {
      identify();
    }
    socket.on('connect', identify);

    socket.on('whatsapp:status', ({ status, phone, name, error }) => {
      setStatus(status);
      if (error) setErrorMsg(error);
      if (phone) { setPhone(phone); localStorage.setItem('wa_phone', phone); }
      if (name) { setWaName(name); }
      if (status === 'connected') setQrCode(null);
      if (['disconnected', 'auth_failure', 'mismatch', 'logging_out'].includes(status)) {
        localStorage.removeItem('wa_phone');
        setPhone(null);
        setWaName(null);
      }
    });

    socket.on('whatsapp:qr', ({ qr }) => {
      setQrCode(qr);
      setStatus('qr');
    });

    return () => socket.disconnect();
  }, [user?.id, user?.role]);

  const connect = () => {
    socketRef.current?.emit('whatsapp:connect', { userId: user?.id, role: user?.role });
    setStatus('connecting');
    setErrorMsg(null);
    setQrCode(null);
  };

  const disconnect = () => {
    socketRef.current?.emit('whatsapp:disconnect', { userId: user?.id, role: user?.role });
    localStorage.removeItem('wa_phone');
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        parsed.whatsappNumber = null;
        localStorage.setItem('user', JSON.stringify(parsed));
      } catch (e) {}
    }
    setStatus('disconnected');
    setPhone(null);
    setWaName(null);
    setQrCode(null);
    setErrorMsg(null);
  };

  return { status, qrCode, phone, waName, errorMsg, connect, disconnect };
}
