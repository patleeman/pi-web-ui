import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { WorkspaceFilesPane } from '../../../src/components/WorkspaceFilesPane';
import type { FileInfo, GitStatusFile } from '@pi-web-ui/shared';

const AUTO_REFRESH_INTERVAL_MS = 3000;

const rootEntries: FileInfo[] = [
  { name: 'src', path: 'src', isDirectory: true },
  { name: 'README.md', path: 'README.md', isDirectory: false },
];

const createProps = (overrides: Partial<ComponentProps<typeof WorkspaceFilesPane>> = {}) => ({
  workspaceName: 'project',
  workspaceId: 'test-workspace',
  workspacePath: '/home/user/project',
  entriesByPath: { '': rootEntries },
  fileContentsByPath: {},
  gitStatusFiles: [],
  fileDiffsByPath: {},
  activePlan: null,
  onRequestEntries: vi.fn(),
  onRequestFile: vi.fn(),
  onRequestGitStatus: vi.fn(),
  onRequestFileDiff: vi.fn(),
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

describe('WorkspaceFilesPane auto refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('polls file entries while files tab is active', async () => {
    const onRequestEntries = vi.fn();
    render(<WorkspaceFilesPane {...createProps({ onRequestEntries })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const initialCalls = onRequestEntries.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS);
    });

    expect(onRequestEntries.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('polls git status and diffs while git tab is active', async () => {
    const onRequestGitStatus = vi.fn();
    const onRequestFileDiff = vi.fn();
    const gitStatusFiles: GitStatusFile[] = [
      { path: 'src/app.ts', status: 'modified' },
    ];
    const fileDiffsByPath = { 'src/app.ts': 'diff content' };

    render(
      <WorkspaceFilesPane
        {...createProps({
          gitStatusFiles,
          fileDiffsByPath,
          onRequestGitStatus,
          onRequestFileDiff,
          entriesByPath: { '': [] },
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /git/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const fileButton = screen.getByRole('button', { name: /app\.ts/ });
    fireEvent.click(fileButton);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const initialGitCalls = onRequestGitStatus.mock.calls.length;
    const initialDiffCalls = onRequestFileDiff.mock.calls.length;

    expect(initialGitCalls).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTO_REFRESH_INTERVAL_MS);
    });

    expect(onRequestGitStatus.mock.calls.length).toBeGreaterThan(initialGitCalls);
    expect(onRequestFileDiff.mock.calls.length).toBeGreaterThan(initialDiffCalls);
  });
});
