import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

type State = 'unsupported' | 'checking' | 'off' | 'subscribing' | 'on' | 'error';

async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/**
 * Renders as a nav-bar button — no wrapper element, caller places it inline.
 * Returns null when push notifications are unsupported or still checking.
 */
export function NotifyButton() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      setState('unsupported');
      return;
    }
    getCurrentSubscription()
      .then(sub => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function subscribe() {
    if (!VAPID_PUBLIC_KEY) return;
    setState('subscribing');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      });
      const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setState('on');
    } catch (err) {
      console.error('[notify] subscribe failed:', err);
      setState(Notification.permission === 'denied' ? 'unsupported' : 'error');
    }
  }

  async function unsubscribe() {
    try {
      const sub = await getCurrentSubscription();
      if (sub) {
        const { endpoint } = sub.toJSON() as { endpoint: string };
        await fetch('/api/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (err) {
      console.error('[notify] unsubscribe failed:', err);
    }
  }

  if (state === 'unsupported' || state === 'checking') return null;

  if (state === 'on') {
    return (
      <button
        onClick={unsubscribe}
        style={btnStyle(true)}
        title="Violation alerts enabled — click to turn off"
      >
        <Bell size={13} style={{ flexShrink: 0 }} />
        Alerts on
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={state === 'subscribing'}
      style={btnStyle(false)}
      title="Get a browser notification when PIR exceeds the noise limit for 60+ seconds"
    >
      <BellOff size={13} style={{ flexShrink: 0 }} />
      {state === 'subscribing' ? 'Enabling…' : state === 'error' ? 'Retry alerts' : 'Notify me'}
    </button>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 6,
    border: active ? '1px solid #166534' : '1px solid #334155',
    background: active ? '#14532d' : '#1e293b',
    color: active ? '#4ade80' : '#64748b',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s',
  };
}
