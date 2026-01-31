import { useState, useCallback, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { InputEditor, InputEditorHandle } from './components/InputEditor';
import { ConnectionStatus } from './components/ConnectionStatus';
import { Upload } from 'lucide-react';

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:3001/ws'
  : `ws://${window.location.host}/ws`;

function App() {
  const ws = useWebSocket(WS_URL);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const inputEditorRef = useRef<InputEditorHandle>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    
    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0 && inputEditorRef.current) {
      imageFiles.forEach(file => {
        inputEditorRef.current?.addImageFile(file);
      });
    }
  }, []);

  if (!ws.isConnected && ws.isConnecting) {
    return (
      <div className="min-h-screen bg-pi-bg flex items-center justify-center">
        <div className="text-pi-muted">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-pi-accent border-t-transparent rounded-full animate-spin" />
            <span>Connecting to Pi...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-pi-bg flex flex-col relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-pi-bg/90 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-pi-accent bg-pi-accent/10">
            <Upload className="w-16 h-16 text-pi-accent" />
            <div className="text-center">
              <p className="text-xl font-medium text-pi-text">Drop images to attach</p>
              <p className="text-sm text-pi-muted mt-1">Images will be added to your message</p>
            </div>
          </div>
        </div>
      )}

      {/* Connection status banner */}
      <ConnectionStatus isConnected={ws.isConnected} error={ws.error} />

      {/* Header */}
      <Header
        state={ws.state}
        models={ws.models}
        onSetModel={ws.setModel}
        onSetThinkingLevel={ws.setThinkingLevel}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          sessions={ws.sessions}
          currentSessionId={ws.state?.sessionId}
          onSwitchSession={ws.switchSession}
          onNewSession={ws.newSession}
          onRefresh={ws.refreshSessions}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Chat messages */}
          <ChatView
            messages={ws.messages}
            isStreaming={ws.isStreaming}
            streamingText={ws.streamingText}
            streamingThinking={ws.streamingThinking}
            activeToolExecutions={ws.activeToolExecutions}
          />

          {/* Input editor */}
          <InputEditor
            ref={inputEditorRef}
            isStreaming={ws.isStreaming}
            onSend={ws.sendPrompt}
            onSteer={ws.steer}
            onFollowUp={ws.followUp}
            onAbort={ws.abort}
          />
        </main>
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-pi-border px-4 py-2 text-xs text-pi-muted flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span>Session: {ws.state?.sessionId?.slice(0, 8) || 'N/A'}</span>
          <span>Messages: {ws.state?.messageCount || 0}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            Tokens: {((ws.state?.tokens.total || 0) / 1000).toFixed(1)}k
          </span>
          <span>Cost: ${(ws.state?.cost || 0).toFixed(4)}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
