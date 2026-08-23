"use client";

// S2: Offline handling — shows a banner when the user loses internet connectivity.
// Uses existing alert/banner component patterns — no new visual style.

import * as React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    setOffline(!navigator.onLine);
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-amber-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
      <WifiOff className="h-4 w-4 flex-shrink-0" />
      <span>You&apos;re offline. Changes will sync when you reconnect.</span>
    </div>
  );
}
