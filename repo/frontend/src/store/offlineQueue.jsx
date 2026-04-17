import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getDb } from '../services/db';
import { api } from '../services/api';

const OfflineCtx = createContext(null);
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];

function randomKey() {
  // UUID-ish; uses crypto if available.
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'key-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function OfflineQueueProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState([]);
  const replaying = useRef(false);

  const refresh = useCallback(async () => {
    const db = await getDb();
    const all = await db.getAll('queue');
    all.sort((a, b) => a.createdAt - b.createdAt);
    setQueue(all);
  }, []);

  useEffect(() => {
    function on() { setIsOnline(true); replay(); }
    function off() { setIsOnline(false); }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    refresh();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  async function enqueue({ path, method = 'POST', body, formData }) {
    const db = await getDb();
    const item = {
      idempotencyKey: randomKey(),
      createdAt: Date.now(),
      path, method,
      body: body || null,
      // FormData cannot be serialized to IDB trivially — encode as base64 JSON of entries if needed.
      hasFormData: !!formData,
      retryCount: 0,
      lastError: null,
      status: 'pending',
    };
    await db.put('queue', item);
    await refresh();
    if (navigator.onLine) replay();
    return item.idempotencyKey;
  }

  async function replay() {
    if (replaying.current) return;
    replaying.current = true;
    try {
      const db = await getDb();
      const items = await db.getAll('queue');
      items.sort((a, b) => a.createdAt - b.createdAt);
      for (const it of items) {
        if (it.status === 'manual_review_required') continue;
        try {
          await api(it.path, {
            method: it.method,
            body: it.body,
            headers: { 'Idempotency-Key': it.idempotencyKey },
          });
          await db.delete('queue', it.idempotencyKey);
        } catch (e) {
          it.retryCount = (it.retryCount || 0) + 1;
          it.lastError = e.message;
          if (it.retryCount >= 10) it.status = 'manual_review_required';
          else it.status = 'failed';
          await db.put('queue', it);
        }
      }
      await refresh();
    } finally { replaying.current = false; }
  }

  return (
    <OfflineCtx.Provider value={{ isOnline, queue, enqueue, replay, refresh }}>
      {children}
    </OfflineCtx.Provider>
  );
}

export function useOfflineQueue() { return useContext(OfflineCtx); }
