import type React from 'react';
import { Bug, Lightbulb, Mail } from 'lucide-react';

export function SupportView() {
  return (
    <div style={{ maxWidth: 640, lineHeight: 1.7, fontSize: 14, color: '#cbd5e1' }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
        Support this project
      </h2>
      <p style={{ marginBottom: 24, color: '#94a3b8' }}>
        This site runs 24/7 out of pocket. If it's useful to you, a small
        contribution helps keep it going.
      </p>

      <a
        href="https://ko-fi.com/thehimmat"
        target="_blank"
        rel="noopener noreferrer"
        style={kofiBtn}
      >
        <img
          src="https://storage.ko-fi.com/cdn/cup-border.png"
          alt=""
          style={{ height: 20, width: 20, marginRight: 8, verticalAlign: 'middle' }}
        />
        Support on Ko-fi
      </a>

      <h3 style={h3}>What it costs to run</h3>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>Service</th>
            <th style={th}>What it does</th>
            <th style={{ ...th, textAlign: 'right' }}>Cost/mo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>
              <a href="https://fly.io" target="_blank" rel="noopener noreferrer" style={link}>Fly.io</a>
            </td>
            <td style={td}>
              Polling server — reads the noise monitor around the clock, roughly
              every 2–3 seconds (1 vCPU shared, 1 GB RAM, San Jose)
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#e2e8f0', whiteSpace: 'nowrap' }}>$7.23</td>
          </tr>
          <tr>
            <td style={td}>
              <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" style={link}>Supabase</a>
            </td>
            <td style={td}>
              Cloud database — keeps every reading since tracking began. Fits within
              the free tier.
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>free*</td>
          </tr>
          <tr>
            <td style={td}>
              <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" style={link}>Vercel</a>
            </td>
            <td style={td}>Hosts this website and the data API</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>free</td>
          </tr>
          <tr style={{ borderTop: '1px solid #334155' }}>
            <td style={{ ...td, fontWeight: 600, color: '#e2e8f0' }} colSpan={2}>
              Current total
            </td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>$7.23/mo</td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: 12, color: '#7c8ba1', marginBottom: 24 }}>
        * In September and October 2026 the database outgrew the free tier, so for a
        short while we paid for a bigger plan and the monthly bill went up. We then
        found a way to store the same readings in much less space, which brought it
        back into the free tier.
      </p>

      <h3 style={h3}>If there's enough support</h3>
      <p>
        If this project gets enough community support, a few improvements become
        possible:
      </p>
      <ul style={{ paddingLeft: 20, color: '#94a3b8', marginBottom: 0 }}>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: '#cbd5e1' }}>Custom domain</strong> — move from{' '}
          <code style={code}>pir-sound-tracker.vercel.app</code> to something like{' '}
          <code style={code}>pirnoise.org</code>. Domain registration runs ~$10–15/year
          through most registrars; hosting stays free on Vercel.
        </li>
        <li style={{ marginBottom: 6 }}>
          <strong style={{ color: '#cbd5e1' }}>Sustained database</strong> — keep the
          full historical record online indefinitely rather than archiving or truncating
          when the free tier fills.
        </li>
        <li>
          <strong style={{ color: '#cbd5e1' }}>More features</strong> — email/SMS alerts
          for sustained violations, downloadable data exports, comparison across race
          weekends.
        </li>
      </ul>

      <h3 style={h3}>Violation alerts</h3>
      <p>
        Subscribe to the{' '}
        <a href="/api/feed.xml" style={link}>RSS feed</a>
        {' '}for violation alerts in any RSS reader (Feedly, NetNewsWire, etc.).
        On the <strong style={{ color: '#cbd5e1' }}>Live</strong> view you can
        also enable browser push notifications — one click, no sign-up.
      </p>

      <h3 style={h3}>Get in touch</h3>
      <p style={{ marginBottom: 12 }}>
        Found a bug, have a feature idea, or just want to say something? Choose
        whatever's easiest:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <a
          href="https://github.com/thehimmat/pir-sound-tracker/issues/new?labels=bug"
          target="_blank"
          rel="noopener noreferrer"
          style={contactBtn('#1e293b', '#38bdf8')}
        >
          <Bug size={16} aria-hidden="true" style={{ marginRight: 10, flexShrink: 0 }} />
          Report a bug on GitHub
        </a>
        <a
          href="https://github.com/thehimmat/pir-sound-tracker/issues/new?labels=enhancement"
          target="_blank"
          rel="noopener noreferrer"
          style={contactBtn('#1e293b', '#a78bfa')}
        >
          <Lightbulb size={16} aria-hidden="true" style={{ marginRight: 10, flexShrink: 0 }} />
          Request a feature on GitHub
        </a>
        <a
          href="https://ko-fi.com/thehimmat"
          target="_blank"
          rel="noopener noreferrer"
          style={contactBtn('#1e293b', '#94a3b8')}
        >
          <Mail size={16} aria-hidden="true" style={{ marginRight: 10, flexShrink: 0 }} />
          Send a message via Ko-fi
        </a>
      </div>

      <h3 style={h3}>About this project</h3>
      <p>
        Built and maintained by{' '}
        <a href="https://github.com/thehimmat" target="_blank" rel="noopener noreferrer" style={link}>
          Himmat Singh Khalsa
        </a>
        {' '}as an independent community resource — no affiliation with Portland
        International Raceway or the City of Portland. Source code is on{' '}
        <a href="https://github.com/thehimmat/pir-sound-tracker" target="_blank" rel="noopener noreferrer" style={link}>
          GitHub
        </a>.
      </p>
    </div>
  );
}

const kofiBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '10px 20px',
  borderRadius: 8,
  background: '#ff5e5b',
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
  marginBottom: 32,
};

function contactBtn(bg: string, accent: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: 8,
    background: bg,
    border: `1px solid #334155`,
    color: accent,
    fontWeight: 500,
    fontSize: 13,
    textDecoration: 'none',
  };
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  borderBottom: '1px solid #334155',
  color: '#94a3b8',
  fontWeight: 500,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const td: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #1e293b',
  color: '#cbd5e1',
};

const h3: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#94a3b8',
  marginTop: 32,
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const link: React.CSSProperties = {
  color: '#60a5fa',
  textDecoration: 'underline',
};

const code: React.CSSProperties = {
  background: '#1e293b',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 12,
  fontFamily: 'monospace',
};
