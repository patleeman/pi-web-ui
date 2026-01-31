import { AlertCircle } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
}

export function ConnectionStatus({ isConnected, error }: ConnectionStatusProps) {
  if (isConnected && !error) {
    return null;
  }

  return (
    <div className="bg-pi-error/20 border-b border-pi-error/50 px-4 py-2 flex items-center gap-2 text-sm">
      <AlertCircle className="w-4 h-4 text-pi-error" />
      <span className="text-pi-error">
        {error || 'Disconnected from server. Reconnecting...'}
      </span>
    </div>
  );
}
