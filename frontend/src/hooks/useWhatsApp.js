import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : window.location.origin);

export function useWhatsApp() {
  const { user } = useAuth();
  const [status, setStatus] = useState(localStorage.getItem('wa_phone') ? 'connected' : 'disconnected');
  const [errorMsg, setErrorMsg] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [phone, setPhone] = useState(localStorage.getItem('wa_phone') || null);
  const [waName, setWaName] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    // Join this user's private room so we only receive OUR WhatsApp events
    socket.on('connect', () => {
      socket.emit('whatsapp:identify', { userId: user.id, role: user.role });
    });

    socket.on('whatsapp:status', ({ status, phone, name, error }) => {
      setStatus(status);
      if (error) setErrorMsg(error);
      if (phone) { setPhone(phone); localStorage.setItem('wa_phone', phone); }
      if (name) { setWaName(name); }
      if (status === 'connected') setQrCode(null);
      if (['disconnected', 'auth_failure', 'mismatch'].includes(status)) {
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
  };

  return { status, qrCode, phone, waName, errorMsg, connect, disconnect };
}
