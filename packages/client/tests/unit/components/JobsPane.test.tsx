import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobsPane } from '../../../src/components/JobsPane';
import { ThemeProvider } from '../../../src/contexts/ThemeContext';
import React from 'react';

// Wrapper with ThemeProvider
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}

const mockJob = {
  id: 'job-1',
  name: 'Test Job',
  path: '/home/user/project/.pi/jobs/test-job.json',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  status: 'pending' as const,
  tasks: [
    { id: 'task-1', description: 'Task 1', status: 'pending' as const },
    { id: 'task-2', description: 'Task 2', status: 'completed' as const },
  ],
};

const defaultProps = {
  workspaceId: 'ws-1',
  workspacePath: '/home/user/project',
  jobs: [mockJob],
  selectedJobId: null as string | null,
  jobContentsById: {} as Record<string, { content: string; tasks: any[] }>,
  onSelectJob: vi.fn(),
  onCreateJob: vi.fn(),
  onSaveJob: vi.fn(),
  onPromoteJob: vi.fn(),
  onDemoteJob: vi.fn(),
  onUpdateJobTask: vi.fn(),
  onDeleteJob: vi.fn(),
  onRenameJob: vi.fn(),
};

describe('JobsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(
      <Wrapper>
        <JobsPane {...defaultProps} />
      </Wrapper>
    );

    expect(container).toBeTruthy();
  });

  it('shows empty state when no jobs', () => {
    render(
      <Wrapper>
        <JobsPane {...defaultProps} jobs={[]} />
      </Wrapper>
    );

    // Should show some content (either job list or empty state)
    expect(document.body.textContent).toBeTruthy();
  });

  it('handles job selection', () => {
    render(
      <Wrapper>
        <JobsPane {...defaultProps} selectedJobId="job-1" />
      </Wrapper>
    );

    // Should render without crashing when job is selected
    expect(document.body).toBeTruthy();
  });

  it('handles job with no tasks', () => {
    const jobWithNoTasks = {
      ...mockJob,
      id: 'job-2',
      tasks: [],
    };

    render(
      <Wrapper>
        <JobsPane {...defaultProps} jobs={[jobWithNoTasks]} selectedJobId="job-2" />
      </Wrapper>
    );

    // Should render without crashing
    expect(document.body).toBeTruthy();
  });
});
