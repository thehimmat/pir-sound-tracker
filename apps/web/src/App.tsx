import React, { useState } from 'react';
import { LiveView } from './components/LiveView.js';
import { TodayView } from './components/TodayView.js';
import { HistoryView } from './components/HistoryView.js';
import { AboutView } from './components/AboutView.js';
import { SupportView } from './components/SupportView.js';

type Tab = 'live' | 'today' | 'history' | 'about' | 'support';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live',    label: 'Live' },
  { id: 'today',   label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'about',   label: 'About' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('live');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ flex: 1 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 16 }}>
            Portland International Raceway — Noise Monitor
          </h1>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={tabStyle(tab === t.id)}
              >
                {t.label}
              </button>
            ))}
            <a
              href="https://www.portland.gov/ppd/noise/noise-concerns"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 18px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                background: '#7f1d1d',
                color: '#fca5a5',
                textDecoration: 'none',
                marginLeft: 8,
              }}
            >
              File noise complaint ↗
            </a>
          </nav>
        </header>

        {tab === 'live'    && <LiveView />}
        {tab === 'today'   && <TodayView />}
        {tab === 'history' && <HistoryView />}
        {tab === 'about'   && <AboutView />}
        {tab === 'support' && <SupportView />}
      </div>

      <footer style={footerStyle}>
        © {new Date().getFullYear()}{' '}
        <a href="https://github.com/thehimmat" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          Himmat Singh Khalsa
        </a>
        {' · '}
        <button onClick={() => setTab('about')} style={footerLinkBtn}>
          About
        </button>
        {' · '}
        <button onClick={() => setTab('support')} style={{ ...footerLinkBtn, color: '#f87171' }}>
          Support this project
        </button>
        {' · '}
        <a href="https://portlandraceway.com/?/about/noise_information" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          PIR noise info
        </a>
      </footer>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 18px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    background: active ? '#3b82f6' : '#1e293b',
    color:  active ? '#fff' : '#94a3b8',
    transition: 'background 0.15s',
  };
}

const footerStyle: React.CSSProperties = {
  marginTop: 48,
  paddingTop: 16,
  borderTop: '1px solid #1e293b',
  fontSize: 12,
  color: '#475569',
  display: 'flex',
  gap: 4,
  alignItems: 'center',
};

const linkStyle: React.CSSProperties = {
  color: '#475569',
  textDecoration: 'none',
};

const footerLinkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#475569',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
};
