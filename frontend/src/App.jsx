import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import Dashboard from './pages/Dashboard';
import WhatsAppPage from './pages/WhatsAppPage';
import ContactsPage from './pages/ContactsPage';
import GroupsPage from './pages/GroupsPage';
import CampaignsPage from './pages/CampaignsPage';
import AutoReplyPage from './pages/AutoReplyPage';
import SchedulePage from './pages/SchedulePage';
import ContactFilterPage from './pages/ContactFilter';
import BulkSenderPage from './pages/BulkSender';
import PersonalizationPage from './pages/PersonalizationPage';
import GroupAutomationPage from './pages/GroupAutomationPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PricingPage from './pages/PricingPage';
import AdminPage from './pages/AdminPage';
import ProfilePage from './pages/ProfilePage';
import SupportPage from './pages/SupportPage';


function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#7c3aed', fontSize: 18 }}>Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  // Allow Super Admin (role=superadmin) and Admin users (isAdmin=true)
  if (user.role !== 'superadmin' && !user.isAdmin) return <Navigate to="/dashboard" />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

      {/* Admin Route */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminPage />} />
      </Route>

      {/* Normal User Routing */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="bulk" element={<BulkSenderPage />} />
        <Route path="personalize" element={<PersonalizationPage />} />
        <Route path="autoreply" element={<AutoReplyPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="group-automation" element={<GroupAutomationPage />} />
        <Route path="filter" element={<ContactFilterPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="support" element={<SupportPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#13132a', color: '#f1f0ff', border: '1px solid #2a2a4a' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#13132a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#13132a' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
