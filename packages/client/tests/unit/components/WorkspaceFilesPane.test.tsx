import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { WorkspaceFilesPane } from '../../../src/components/WorkspaceFilesPane';

const createProps = (overrides: Partial<ComponentProps<typeof WorkspaceFilesPane>> = {}) => ({
  workspaceName: 'project',
  workspaceId: 'test-workspace',
  workspacePath: '/home/user/project',
  selectedFilePath: '',
  fileContentsByPath: {},
  fileDiffsByPath: {},
  onRequestFile: vi.fn(),
  onRequestFileDiff: vi.fn(),
  viewMode: 'file' as const,
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

  it('defaults to jobs tab', () => {
    render(<WorkspaceFilesPane {...createProps()} />);
    expect(screen.getByText('No jobs yet')).toBeTruthy();
  });

  it('shows preview empty state when preview tab is selected', () => {
    render(<WorkspaceFilesPane {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    expect(screen.getByText('Select a file to preview')).toBeTruthy();
  });

  it('requests file content when preview tab is selected and a file is chosen', async () => {
    const onRequestFile = vi.fn();
    render(
      <WorkspaceFilesPane
        {...createProps({
          selectedFilePath: 'src/app.ts',
          onRequestFile,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await act(async () => {});

    expect(onRequestFile).toHaveBeenCalledWith('src/app.ts');
  });

  it('renders file content when preview tab is selected', () => {
    const { container } = render(
      <WorkspaceFilesPane
        {...createProps({
          selectedFilePath: 'src/app.ts',
          fileContentsByPath: { 'src/app.ts': { content: 'const x = 1;', truncated: false } },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(container.textContent).toContain('const');
    expect(container.textContent).toContain('x');
  });

  it('shows diff view when preview tab is selected and viewMode is diff', () => {
    render(
      <WorkspaceFilesPane
        {...createProps({
          selectedFilePath: 'src/app.ts',
          viewMode: 'diff',
          fileDiffsByPath: { 'src/app.ts': '+added line\n-removed line' },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    expect(screen.getByText('+added line')).toBeTruthy();
    expect(screen.getByText('-removed line')).toBeTruthy();
  });

  it('keeps active tab selection scoped to each workspace', () => {
    const { rerender } = render(
      <WorkspaceFilesPane
        {...createProps({
          workspaceId: 'ws-a',
          workspacePath: '/home/user/project-a',
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    expect(screen.getByText('Select a file to preview')).toBeTruthy();

    rerender(
      <WorkspaceFilesPane
        {...createProps({
          workspaceId: 'ws-b',
          workspacePath: '/home/user/project-b',
        })}
      />,
    );

    expect(screen.getByText('No jobs yet')).toBeTruthy();

    rerender(
      <WorkspaceFilesPane
        {...createProps({
          workspaceId: 'ws-a',
          workspacePath: '/home/user/project-a',
        })}
      />,
    );

    expect(screen.getByText('Select a file to preview')).toBeTruthy();
  });
});
