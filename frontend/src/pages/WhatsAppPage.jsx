import React from 'react';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { Wifi, WifiOff, Loader, Smartphone, Link2Off } from 'lucide-react';

const STATUS_CONFIG = {
  connected: { color: 'var(--green)', badge: 'badge-green', label: 'Connected' },
  disconnected: { color: 'var(--red)', badge: 'badge-red', label: 'Disconnected' },
  connecting: { color: 'var(--yellow)', badge: 'badge-yellow', label: 'Connecting...' },
  qr: { color: 'var(--yellow)', badge: 'badge-yellow', label: 'QR Waiting' },
  reconnecting: { color: 'var(--yellow)', badge: 'badge-yellow', label: 'Reconnecting...' },
  auth_failure: { color: 'var(--red)', badge: 'badge-red', label: 'Auth Failed' },
  mismatch: { color: 'var(--red)', badge: 'badge-red', label: 'Number Mismatch' },
};

export default function WhatsAppPage() {
  const { status, qrCode, phone, waName, errorMsg, connect, disconnect } = useWhatsApp();
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <div className="page-title">WhatsApp Connection</div>
          <div className="page-sub">Connect your WhatsApp account to start sending</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Status Card */}
        <div className="card">
          <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Connection Status</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, padding: '16px', background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `${cfg.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {status === 'connected' ? <Wifi size={22} color={cfg.color} /> :
                status === 'connecting' || status === 'qr' || status === 'reconnecting' ? <Loader size={22} color={cfg.color} className="spin" /> :
                  <WifiOff size={22} color={cfg.color} />}
            </div>
            <div>
              <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
              {status === 'connected' && (
                <div style={{ marginTop: 6 }}>
                  {waName && <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{waName}</div>}
                  {phone && <div style={{ color: 'var(--text3)', fontSize: 12 }}>+{phone}</div>}
                </div>
              )}
            </div>
          </div>
          {/* Display specific error if available */}
          {errorMsg && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, fontSize: 13, marginBottom: 20, border: '1px solid rgba(239,68,68,0.3)' }}>
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Actions */}
          {status !== 'connected' ? (
            <button
              className="btn btn-primary"
              onClick={connect}
              disabled={status === 'connecting' || status === 'qr' || status === 'reconnecting'}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              {(status === 'connecting' || status === 'qr' || status === 'reconnecting') ? <><Loader size={15} className="spin" /> Connecting...</> : <><Wifi size={15} /> Connect WhatsApp</>}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={disconnect} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              <Link2Off size={15} /> Disconnect
            </button>
          )}

          {/* Instructions */}
          <div style={{ marginTop: 24, padding: '16px', background: 'rgba(124,58,237,0.06)', borderRadius: 12, border: '1px solid rgba(124,58,237,0.15)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent3)' }}>How to connect</div>
            {[
              'Click "Connect WhatsApp" button',
              'Open WhatsApp on your phone',
              'Go to Settings → Linked Devices',
              'Tap "Link a Device" and scan the QR',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 7, color: 'var(--text2)', fontSize: 13 }}>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{i + 1}.</span>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* QR Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340 }}>
          {qrCode ? (
            <>
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <span className="badge badge-yellow pulse" style={{ marginBottom: 12 }}>Waiting for scan...</span>
                <p style={{ color: 'var(--text3)', fontSize: 13 }}>Scan with WhatsApp on your phone</p>
              </div>
              <div style={{ padding: 12, background: '#fff', borderRadius: 16, boxShadow: '0 0 0 4px rgba(124,58,237,0.3)' }}>
                <img src={qrCode} alt="QR Code" style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }} />
              </div>
            </>
          ) : status === 'connected' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>Connected!</div>
              <div style={{ color: 'var(--text3)', marginTop: 6, fontSize: 13 }}>You can now send messages</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Smartphone size={60} style={{ color: 'var(--text3)', opacity: 0.3, marginBottom: 16 }} />
              <div style={{ color: 'var(--text3)', fontSize: 14 }}>QR code will appear here</div>
              <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>Click Connect to generate</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
