import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bug, X, Wifi, WifiOff } from 'lucide-react';

const DevDebugPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Monitor HMR WebSocket status
    const checkWebSocket = () => {
      try {
        // @ts-ignore - Access Vite's HMR client if available
        if (import.meta && import.meta.hot) {
          setWsStatus('connected');
          console.log('✅ HMR WebSocket connected');
        } else {
          setWsStatus('disconnected');
          console.log('❌ HMR WebSocket not available');
        }
      } catch (error) {
        setWsStatus('disconnected');
        console.log('❌ HMR WebSocket error:', error);
      }
    };

    // Monitor for global errors
    const handleError = (event: ErrorEvent) => {
      const errorMsg = `${event.filename}:${event.lineno} - ${event.message}`;
      setErrors(prev => [...prev.slice(-4), errorMsg]); // Keep last 5 errors
      console.error('🐛 Global error captured:', errorMsg);
    };

    window.addEventListener('error', handleError);
    checkWebSocket();

    const interval = setInterval(checkWebSocket, 5000);

    return () => {
      window.removeEventListener('error', handleError);
      clearInterval(interval);
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      {/* Toggle Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full p-0"
        variant="outline"
      >
        <Bug className="w-5 h-5" />
      </Button>

      {/* Debug Panel */}
      {isOpen && (
        <Card className="fixed bottom-20 right-4 z-40 w-80 max-h-96 overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              Dev Debug Panel
              <Button
                onClick={() => setIsOpen(false)}
                variant="ghost"
                size="sm"
                className="w-6 h-6 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* WebSocket Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm">HMR Status:</span>
              <Badge
                variant={wsStatus === 'connected' ? 'default' : 'destructive'}
                className="flex items-center gap-1"
              >
                {wsStatus === 'connected' ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                {wsStatus}
              </Badge>
            </div>

            {/* Environment Info */}
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span>Node Env:</span>
                <Badge variant="outline">{process.env.NODE_ENV}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Vite Mode:</span>
                <Badge variant="outline">{import.meta.env.MODE}</Badge>
              </div>
            </div>

            {/* Recent Errors */}
            {errors.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Recent Errors:</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {errors.map((error, index) => (
                    <div
                      key={index}
                      className="text-xs bg-destructive/10 text-destructive p-2 rounded"
                    >
                      {error}
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => setErrors([])}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                >
                  Clear Errors
                </Button>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t">
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Force Reload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default DevDebugPanel;