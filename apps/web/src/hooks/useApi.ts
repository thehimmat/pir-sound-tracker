import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const doFetch = (url: string) => {
    const t0 = Date.now();
    console.log(`[useApi] GET ${url}`);
    return fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then(d => {
        console.log(`[useApi] GET ${url} → ${Array.isArray(d) ? d.length + ' rows' : 'ok'} (${Date.now() - t0}ms)`);
        setData(d as T);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[useApi] GET ${url} failed: ${msg}`);
        setError(msg);
        setLoading(false);
        // data intentionally left as previous value so callers can detect error via error !== null
      });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    doFetch(`${API_URL}${path}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = () => {
    setLoading(true);
    setError(null);
    doFetch(`${API_URL}${path}`);
  };

  return { data, loading, error, refetch };
}
