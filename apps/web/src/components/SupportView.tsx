import type React from 'react';

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
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
        Approximate monthly figures — updated periodically.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>Service</th>
            <th style={th}>What it does</th>
            <th style={{ ...th, textAlign: 'right' }}>Est. cost/mo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>Fly.io</td>
            <td style={td}>Polling server — fetches and OCR-reads the noise monitor every second, 24/7</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#e2e8f0' }}>~$10</td>
          </tr>
          <tr>
            <td style={td}>Supabase</td>
            <td style={td}>Cloud database — stores every reading (~86,400 rows/day)</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#e2e8f0' }}>free tier</td>
          </tr>
          <tr>
            <td style={td}>Vercel</td>
            <td style={td}>Hosts this website and the data API</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 500, color: '#e2e8f0' }}>free tier</td>
          </tr>
          <tr style={{ borderTop: '1px solid #334155' }}>
            <td style={{ ...td, fontWeight: 600, color: '#e2e8f0' }} colSpan={2}>Total</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#e2e8f0' }}>~$10/mo</td>
          </tr>
        </tbody>
      </table>

      <h3 style={h3}>About this project</h3>
      <p>
        Built and maintained by{' '}
        <a
          href="https://github.com/thehimmat"
          target="_blank"
          rel="noopener noreferrer"
          style={link}
        >
          Himmat Singh Khalsa
        </a>
        {' '}as an independent community resource — no affiliation with Portland
        International Raceway or the City of Portland. Source code is on{' '}
        <a
          href="https://github.com/thehimmat/pir-sound-tracker"
          target="_blank"
          rel="noopener noreferrer"
          style={link}
        >
          GitHub
        </a>
        .
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

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 12px',
  borderBottom: '1px solid #334155',
  color: '#64748b',
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
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const link: React.CSSProperties = {
  color: '#3b82f6',
  textDecoration: 'none',
};
