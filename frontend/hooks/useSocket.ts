'use client';
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const s = io(API_URL, { transports: ['websocket', 'polling'] });

    s.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected:', s.id);
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected');
    });

    setSocket(s);

    return () => { s.disconnect(); };
  }, []);

  return { socket, isConnected };
}
