import React, { useEffect, useState } from 'react';
import { SyncService } from '../services/sync';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export const SyncStatusBadge: React.FC = () => {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const isCloudActive = SyncService.isFirebaseConfigured();

  useEffect(() => {
    const unsub = SyncService.subscribeStatus((isOnline, isSync, count) => {
      setOnline(isOnline);
      setSyncing(isSync);
      setPendingCount(count);
    });
    return () => unsub();
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md bg-slate-900/80 border border-slate-700/60 shadow-sm">
      {online ? (
        <span className="flex items-center gap-1 text-emerald-400">
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isCloudActive ? 'Cloud Live' : 'Online'}</span>
        </span>
      ) : (
        <span className="flex items-center gap-1 text-amber-400">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline (Saving locally)</span>
        </span>
      )}

      {syncing && (
        <span className="flex items-center gap-1 text-sky-400">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span className="text-[10px]">Syncing...</span>
        </span>
      )}

      {pendingCount > 0 && !syncing && (
        <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
          {pendingCount} queued
        </span>
      )}
    </div>
  );
};
