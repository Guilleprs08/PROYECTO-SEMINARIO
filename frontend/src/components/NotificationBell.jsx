import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './notification-bell.css';

// Base robusta (ajústala si ya tienes un helper global)
const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  'http://localhost:3001';

const authHeaders = () => {
  const t = localStorage.getItem('mf_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [lastCheck, setLastCheck] = useState(
    localStorage.getItem('notif_last_check') || new Date().toISOString()
  );
  const timerRef = useRef(null);

  const checkNotifications = async () => {
    try {
      const url = `${API_BASE}/api/eventos-reservados/nuevos`;
      const res = await axios.get(url, {
        headers: { ...authHeaders() },
        params: { since: lastCheck }
      });
      const n = Number(res.data?.count || 0);
      if (n > 0) {
        setUnread(n);
        // Opcional: pequeña vibración visual
        const el = document.querySelector('.notif-bell');
        if (el) {
          el.classList.add('shake');
          setTimeout(() => el.classList.remove('shake'), 500);
        }
      }
    } catch (e) {
      // Silencioso para no molestar
      console.warn('Notif poll error', e?.message);
    }
  };

  useEffect(() => {
    // Primer chequeo al montar
    checkNotifications();

    // Polling cada 20s
    timerRef.current = setInterval(checkNotifications, 20000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCheck]);

  const markAsRead = () => {
    const nowIso = new Date().toISOString();
    localStorage.setItem('notif_last_check', nowIso);
    setLastCheck(nowIso);
    setUnread(0);
    setOpen(false);
  };

  return (
    <div className="notif-wrapper">
      <button
        className={`notif-bell ${unread > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Notificaciones"
      >
        <i className="fas fa-bell"></i>
        {unread > 0 && <span className="badge">{unread}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-header">
            <strong>Notificaciones</strong>
          </div>

          {unread > 0 ? (
            <div className="notif-item">
              <i className="fas fa-calendar-check"></i>
              <div>
                <div>Se ha reservado un evento</div>
                <small>Hay {unread} reserva(s) nueva(s) desde tu última revisión.</small>
              </div>
            </div>
          ) : (
            <div className="notif-empty">
              <i className="far fa-smile"></i>
              <span>Sin novedades</span>
            </div>
          )}

          <div className="notif-actions">
            <button className="mark-read" onClick={markAsRead}>
              Marcar como leído
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
