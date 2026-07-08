import React, { useState } from 'react';
import { LiveView } from './components/LiveView.js';
import { TodayView } from './components/TodayView.js';
import { HistoryView } from './components/HistoryView.js';
import { AboutView } from './components/AboutView.js';
import { SupportView } from './components/SupportView.js';
import { NotifyButton } from './components/NotifyButton.js';
import { StatusBanner } from './components/StatusBanner.js';

type Tab = 'live' | 'today' | 'history' | 'about' | 'support';

const NAV_TABS: { id: Tab; label: string }[] = [
  { id: 'live',    label: 'Live' },
  { id: 'today',   label: 'Today' },
  { id: 'history', label: 'History' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('live');

  return (
    // #root adds 24px vertical padding on each side; subtract it so the
    // footer sits within the first viewport instead of 48px below the fold
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 48px)' }}>
      <div style={{ flex: 1 }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>
            Portland International Raceway — Noise Monitor
          </h1>
          <nav aria-label="Primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {/* Left: page tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {NAV_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-pressed={tab === t.id}
                  style={tabStyle(tab === t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Right: notify + report */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <NotifyButton />
              <a
                href="https://www.portland.gov/ppd/noise/noise-concerns"
                target="_blank"
                rel="noopener noreferrer"
                style={reportBtnStyle}
              >
                Report noise
              </a>
            </div>
          </nav>
        </header>

        <StatusBanner />

        <main>
          {tab === 'live'    && <LiveView />}
          {tab === 'today'   && <TodayView />}
          {tab === 'history' && <HistoryView />}
          {tab === 'about'   && <AboutView />}
          {tab === 'support' && <SupportView />}
        </main>
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
    // blue-600 rather than blue-500: white 13px text needs 4.5:1 contrast
    background: active ? '#2563eb' : '#1e293b',
    color:  active ? '#fff' : '#94a3b8',
    transition: 'background 0.15s',
  };
}

const reportBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 14px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  background: '#7f1d1d',
  color: '#fca5a5',
  textDecoration: 'none',
  border: '1px solid #991b1b',
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  paddingTop: 14,
  borderTop: '1px solid #1e293b',
  fontSize: 13,
  fontWeight: 500,
  color: '#94a3b8',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  alignItems: 'center',
  whiteSpace: 'nowrap', // wrap between footer items, never inside a link
};

const linkStyle: React.CSSProperties = {
  color: '#94a3b8',
  textDecoration: 'none',
};

const footerLinkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  padding: 0,
};
