'use client';
import { useEffect, useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export type GuardianStatus = {
  initialized: boolean;
  started_at?: string;
  nexus?: {
    initialized: boolean;
    alerts_today: number;
    active_subscriptions: number;
    unresolved_financial_alerts: number;
  };
  atlas?: {
    initialized: boolean;
    synthetic_tests_last_hour: number;
    predictive_alerts_last_24h: number;
    active_repairs: any[];
    last_test_results: Record<string, { status: string; responseTimeMs: number; testedAt: string }>;
  };
  services?: Record<string, number>;
  total_services?: number;
};

export type ServiceRow = {
  service_key: string;
  name: string;
  type: string;
  importance_level: number;
  current_status: string;
  last_checked_at: string;
  last_response_time_ms: number;
};

async function fetchJSON(path: string) {
  const r = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export function useGuardianStatus(intervalMs = 30000) {
  const [status, setStatus] = useState<GuardianStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJSON('/api/guardian/status');
      setStatus(data);
      setError(null);
      setLastUpdate(new Date());
    } catch (e: any) {
      setError(e.message || 'fetch failed');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { status, error, lastUpdate, refresh };
}

export function useGuardianServices(intervalMs = 60000) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJSON('/api/guardian/services');
      setServices(data.services || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'fetch failed');
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { services, error, refresh };
}
