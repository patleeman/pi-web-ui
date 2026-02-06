import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
  it('shows empty state when no file is selected', () => {
    render(<WorkspaceFilesPane {...createProps()} />);
    expect(screen.getByText('Select a file to preview')).toBeTruthy();
  });

  it('requests file content when a file is selected', async () => {
    const onRequestFile = vi.fn();
    render(<WorkspaceFilesPane {...createProps({
      selectedFilePath: 'src/app.ts',
      onRequestFile,
    })} />);
    await act(async () => {});
    expect(onRequestFile).toHaveBeenCalledWith('src/app.ts');
  });

  it('renders file content when available', () => {
    const { container } = render(<WorkspaceFilesPane {...createProps({
      selectedFilePath: 'src/app.ts',
      fileContentsByPath: { 'src/app.ts': { content: 'const x = 1;', truncated: false } },
    })} />);
    // SyntaxHighlighter may split text across spans
    expect(container.textContent).toContain('const');
    expect(container.textContent).toContain('x');
  });

  it('shows diff view when viewMode is diff', () => {
    render(<WorkspaceFilesPane {...createProps({
      selectedFilePath: 'src/app.ts',
      viewMode: 'diff',
      fileDiffsByPath: { 'src/app.ts': '+added line\n-removed line' },
    })} />);
    expect(screen.getByText('+added line')).toBeTruthy();
    expect(screen.getByText('-removed line')).toBeTruthy();
  });
});
