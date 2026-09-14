import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * PB-MOBILE-OFFLINE-TOOLS-001
 * Minimal offline indicator. Shows only when navigator.onLine is false.
 * Does not block usage of Tools.
 */
export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-[#0a0a0a]/95 px-4 py-2 text-xs font-medium text-[#F5F7FA] backdrop-blur-sm border-t border-[#232A36]"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#FF8C00]" />
      <span>Sin conexión. Las herramientas siguen disponibles.</span>
    </div>
  );
}
