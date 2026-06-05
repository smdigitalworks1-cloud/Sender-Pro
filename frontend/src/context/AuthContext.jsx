import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthCtx = createContext(null);
const API = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api$/, '') : '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setSubscribed] = useState(false);
  const [subExpiry, setSubExpiry] = useState(null);

  // Fetch latest subscription status from server
  const refreshSubscription = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API}/api/payments/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSubscribed(data.isActive);
      setSubExpiry(data.subExpiry);
      // Also update cached user with latest isAdmin/subStatus
      setUser(prev => prev ? { ...prev, isAdmin: data.isAdmin, subStatus: data.subStatus } : prev);
    } catch { }
  };

  // Fetch fresh user data from server (picks up role changes)
  const refreshUser = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      // Merge fresh server data into stored user
      const merged = { ...data, token };
      localStorage.setItem('user', JSON.stringify(merged));
      setUser(merged);
      if (merged.isAdmin || merged.role === 'superadmin') setSubscribed(true);
    } catch { }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (token && saved) {
      const parsed = JSON.parse(saved);
      setUser(parsed);
      
      // Prevent Flash of Subscription Screen but respect EXPIRY DATE
      let hasSub = false;
      if (parsed.role === 'admin' || parsed.role === 'superadmin' || parsed.isAdmin) {
        hasSub = true;
      } else if (parsed.subStatus === 'active' || parsed.subStatus === 'trial') {
        // If there's an expiry date, check if it has passed
        if (parsed.subExpiry && new Date(parsed.subExpiry) < new Date()) {
          hasSub = false; // Expiry complete -> Block them
        } else {
          hasSub = true;
        }
      }
      setSubscribed(hasSub);

      // Always fetch fresh data from server to pick up any role changes
      refreshUser().then(() => {
        refreshSubscription();
      });
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    if (data.requiresOtp) return data; // Return to UI to show OTP field

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    if (data.isAdmin) setSubscribed(true);
    else await refreshSubscription();
    return data;
  };

  const verifyOtp = async (email, otp) => {
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    if (data.isAdmin) setSubscribed(true);
    else await refreshSubscription();
    return data;
  };

  const adminLogin = async (email, password) => {
    const { data } = await api.post('/auth/admin-login', { email, password });
    if (data.requiresOtp) return data;

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    setSubscribed(true);
    return data;
  };

  const adminVerifyOtp = async (email, otp) => {
    const { data } = await api.post('/auth/admin-verify-otp', { email, otp });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    setSubscribed(true);
    return data;
  };

  const register = async (name, email, password, whatsappNumber) => {
    const { data } = await api.post('/auth/register', { name, email, password, whatsappNumber });
    return data;
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
    setSubscribed(false);
    setSubExpiry(null);
  };

  const forgotPassword = async (email) => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  };

  const resetPassword = async (token, password) => {
    const { data } = await api.post(`/auth/reset-password/${token}`, { password });
    return data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    return data;
  };

  return (
    <AuthCtx.Provider value={{
      user, loading, isSubscribed, subExpiry,
      login, verifyOtp, adminLogin, adminVerifyOtp, register, logout, forgotPassword, resetPassword, refreshSubscription, refreshUser, changePassword
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

