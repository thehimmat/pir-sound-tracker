import React from 'react';
import type { Reading } from '@pir/types';
import { useApi } from '../hooks/useApi.js';
import { ReadingsChart } from './ReadingsChart.js';
import { SummaryBar } from './SummaryBar.js';

export function TodayView() {
  const { data, loading } = useApi<Reading[]>('/api/readings/today');

  if (loading) return <Placeholder />;
  const readings = data ?? [];

  return (
    <div>
      <SummaryBar readings={readings} />
      <ReadingsChart readings={readings} />
    </div>
  );
}

function Placeholder() {
  return <div style={{ color: '#64748b', padding: '40px 0', textAlign: 'center' }}>Loading…</div>;
}
