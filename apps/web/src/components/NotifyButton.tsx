import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

type State = 'unsupported' | 'checking' | 'off' | 'subscribing' | 'on' | 'error';


async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export function NotifyButton() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      setState('unsupported');
      return;
    }
    getCurrentSubscription().then(sub => {
      setState(sub ? 'on' : 'off');
    }).catch(() => setState('off'));
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
      // If user denied permission the browser won't ask again — show generic error
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
      <div style={wrapStyle}>
        <span style={{ color: '#4ade80', fontSize: 12 }}>
          🔔 Violation alerts on
        </span>
        {' '}
        <button onClick={unsubscribe} style={mutedBtn}>turn off</button>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <button
        onClick={subscribe}
        disabled={state === 'subscribing'}
        style={notifyBtn(state === 'subscribing')}
        title="Get a browser notification when PIR exceeds the noise limit for 60+ seconds"
      >
        🔔 {state === 'subscribing' ? 'Enabling…' : state === 'error' ? 'Try again' : 'Notify me of violations'}
      </button>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  marginTop: 8,
  marginBottom: 4,
  textAlign: 'center',
  fontSize: 12,
};

function notifyBtn(disabled: boolean): React.CSSProperties {
  return {
    background: 'none',
    border: '1px solid #334155',
    color: disabled ? '#475569' : '#64748b',
    fontSize: 12,
    padding: '4px 12px',
    borderRadius: 6,
    cursor: disabled ? 'default' : 'pointer',
  };
}

const mutedBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#475569',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};
