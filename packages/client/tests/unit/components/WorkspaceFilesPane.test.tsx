import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { WorkspaceFilesPane } from '../../../src/components/WorkspaceFilesPane';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';

// Wrapper with ThemeProvider
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}

const createProps = (overrides: Partial<ComponentProps<typeof WorkspaceFilesPane>> = {}) => ({
  workspaceName: 'project',
  workspaceId: 'test-workspace',
  workspacePath: '/home/user/project',
  activePlan: null,
  onGetPlans: vi.fn(),
  onGetPlanContent: vi.fn(),
  onSavePlan: vi.fn(),
  onActivatePlan: vi.fn(),
  onDeactivatePlan: vi.fn(),
  onUpdatePlanTask: vi.fn(),
  activeJobs: [],
  onGetJobs: vi.fn(),
  onGetJobContent: vi.fn(),
  onGetJobLocations: vi.fn(),
  onCreateJob: vi.fn(),
  onSaveJob: vi.fn(),
  onPromoteJob: vi.fn(),
  onDemoteJob: vi.fn(),
  onUpdateJobTask: vi.fn(),
  onTogglePane: vi.fn(),
  ...overrides,
});

describe('WorkspaceFilesPane', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows jobs tab by default', () => {
    render(<Wrapper><WorkspaceFilesPane {...createProps()} /></Wrapper>);
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.getByText('No jobs yet')).toBeTruthy();
  });

  it('shows toggle pane button', () => {
    const onTogglePane = vi.fn();
    render(<Wrapper><WorkspaceFilesPane {...createProps({ onTogglePane })} /></Wrapper>);
    expect(screen.getByTitle('Hide pane (⌘⇧F)')).toBeTruthy();
  });
});
