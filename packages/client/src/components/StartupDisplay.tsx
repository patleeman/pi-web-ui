import type { StartupInfo, StartupResourceInfo } from '@pi-web-ui/shared';

interface StartupDisplayProps {
  startupInfo: StartupInfo;
}

// Helper to shorten paths by replacing /Users/xxx/ or /home/xxx/ with ~
function shortenPath(path: string): string {
  // Match common home directory patterns
  return path.replace(/^\/Users\/[^/]+\//, '~/').replace(/^\/home\/[^/]+\//, '~/');
}

function ResourceSection({ 
  title, 
  items 
}: { 
  title: string; 
  items: StartupResourceInfo[];
}) {
  if (items.length === 0) return null;
  
  // Group items by scope
  const userItems = items.filter(item => item.scope === 'user');
  const projectItems = items.filter(item => item.scope === 'project');
  
  const renderItems = (scopeItems: StartupResourceInfo[], scopeLabel: string) => {
    if (scopeItems.length === 0) return null;
    
    return (
      <div className="mb-2">
        <div className="text-pi-muted text-[12px] mb-1">{scopeLabel}</div>
        {scopeItems.map((item, idx) => (
          <div key={idx} className="pl-4 text-pi-muted truncate" title={item.path}>
            {shortenPath(item.path)}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="mb-4">
      <div className="text-pi-text mb-1">[{title}]</div>
      {renderItems(userItems, 'user')}
      {renderItems(projectItems, 'project')}
    </div>
  );
}

export function StartupDisplay({ startupInfo }: StartupDisplayProps) {
  const { version, contextFiles, skills, extensions, themes, shortcuts } = startupInfo;
  
  // Detect if user is on Mac for proper shortcut display
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');
  
  // Convert shortcuts for display
  const displayShortcuts = shortcuts.map(s => ({
    ...s,
    key: isMac ? s.key : s.key.replace('⌘', 'Ctrl+'),
  }));
  
  return (
    <div className="text-[13px] font-mono leading-relaxed select-text">
      {/* Version and shortcuts header */}
      <div className="mb-4">
        <div className="text-pi-accent font-bold">
          pi <span className="text-pi-muted font-normal">v{version}</span>
        </div>
        <div className="mt-2 text-pi-muted">
          {displayShortcuts.map((s, idx) => (
            <div key={idx}>
              <span className="text-pi-text">{s.key}</span>
              <span className="ml-2">{s.description}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Context files */}
      {contextFiles.length > 0 && (
        <div className="mb-4">
          <div className="text-pi-text mb-1">[Context]</div>
          {contextFiles.map((path, idx) => (
            <div key={idx} className="pl-4 text-pi-muted truncate" title={path}>
              {shortenPath(path)}
            </div>
          ))}
        </div>
      )}
      
      {/* Skills */}
      <ResourceSection title="Skills" items={skills} />
      
      {/* Extensions */}
      <ResourceSection title="Extensions" items={extensions} />
      
      {/* Themes */}
      <ResourceSection title="Themes" items={themes} />
    </div>
  );
}
