import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

export function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}${path}`)
      .then(r => r.json())
      .then(d => { setData(d as T); setLoading(false); })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = () => {
    setLoading(true);
    fetch(`${API_URL}${path}`)
      .then(r => r.json())
      .then(d => { setData(d as T); setLoading(false); })
      .catch(() => setLoading(false));
  };

  return { data, loading, refetch };
}
