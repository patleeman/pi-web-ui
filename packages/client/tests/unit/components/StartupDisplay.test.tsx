import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StartupDisplay } from '../../../src/components/StartupDisplay';
import type { StartupInfo, StartupResourceInfo } from '@pi-deck/shared';

describe('StartupDisplay', () => {
  const mockStartupInfo: StartupInfo = {
    version: '1.2.3',
    contextFiles: [
      '/Users/testuser/project/AGENTS.md',
      '/Users/testuser/.pi/AGENTS.md',
    ],
    skills: [
      { path: '/Users/testuser/.pi/skills/code-review', scope: 'user' },
      { path: '/Users/testuser/project/.pi/skills/deploy', scope: 'project' },
    ],
    extensions: [
      { path: '/Users/testuser/.pi/extensions/github', scope: 'user' },
    ],
    themes: [
      { path: '/Users/testuser/.pi/themes/dracula', scope: 'user' },
    ],
    shortcuts: [
      { key: '⌘K', description: 'Clear conversation' },
      { key: '⌘P', description: 'Cycle model' },
    ],
  };

  // Store original navigator
  let originalNavigator: typeof navigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true });
  });

  describe('Version Display', () => {
    it('shows the version number', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    });

    it('shows "pi" brand name', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('pi')).toBeInTheDocument();
    });

    it('pi text has accent color', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      const piElement = screen.getByText('pi');
      expect(piElement).toHaveClass('text-pi-accent');
    });
  });

  describe('Shortcuts', () => {
    it('displays keyboard shortcuts', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('Clear conversation')).toBeInTheDocument();
      expect(screen.getByText('Cycle model')).toBeInTheDocument();
    });

    it('shows Mac shortcuts when on Mac', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'MacIntel' },
        writable: true,
      });
      
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('⌘K')).toBeInTheDocument();
      expect(screen.getByText('⌘P')).toBeInTheDocument();
    });

    it('converts shortcuts to Ctrl+ on non-Mac', () => {
      Object.defineProperty(global, 'navigator', {
        value: { platform: 'Win32' },
        writable: true,
      });
      
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('Ctrl+K')).toBeInTheDocument();
      expect(screen.getByText('Ctrl+P')).toBeInTheDocument();
    });
  });

  describe('Context Files', () => {
    it('shows Context section heading', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('[Context]')).toBeInTheDocument();
    });

    it('lists context files', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      // Paths are shortened (~/project/AGENTS.md instead of full path)
      expect(screen.getByText('~/project/AGENTS.md')).toBeInTheDocument();
      expect(screen.getByText('~/.pi/AGENTS.md')).toBeInTheDocument();
    });

    it('shows full path in title attribute', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      const contextFile = screen.getByText('~/project/AGENTS.md');
      expect(contextFile).toHaveAttribute('title', '/Users/testuser/project/AGENTS.md');
    });

    it('does not show Context section when empty', () => {
      const infoWithoutContext = { ...mockStartupInfo, contextFiles: [] };
      render(<StartupDisplay startupInfo={infoWithoutContext} />);
      
      expect(screen.queryByText('[Context]')).not.toBeInTheDocument();
    });
  });

  describe('Skills Section', () => {
    it('shows Skills section heading', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('[Skills]')).toBeInTheDocument();
    });

    it('groups skills by scope (user/project)', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      // Should show user and project scope labels
      const userLabels = screen.getAllByText('user');
      const projectLabels = screen.getAllByText('project');
      
      expect(userLabels.length).toBeGreaterThan(0);
      expect(projectLabels.length).toBeGreaterThan(0);
    });

    it('does not show Skills section when empty', () => {
      const infoWithoutSkills = { ...mockStartupInfo, skills: [] };
      render(<StartupDisplay startupInfo={infoWithoutSkills} />);
      
      expect(screen.queryByText('[Skills]')).not.toBeInTheDocument();
    });
  });

  describe('Extensions Section', () => {
    it('shows Extensions section heading when present', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('[Extensions]')).toBeInTheDocument();
    });

    it('does not show Extensions section when empty', () => {
      const infoWithoutExtensions = { ...mockStartupInfo, extensions: [] };
      render(<StartupDisplay startupInfo={infoWithoutExtensions} />);
      
      expect(screen.queryByText('[Extensions]')).not.toBeInTheDocument();
    });
  });

  describe('Themes Section', () => {
    it('shows Themes section heading when present', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(screen.getByText('[Themes]')).toBeInTheDocument();
    });

    it('does not show Themes section when empty', () => {
      const infoWithoutThemes = { ...mockStartupInfo, themes: [] };
      render(<StartupDisplay startupInfo={infoWithoutThemes} />);
      
      expect(screen.queryByText('[Themes]')).not.toBeInTheDocument();
    });
  });

  describe('Path Shortening', () => {
    it('replaces /Users/xxx/ with ~/', () => {
      render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      // Original: /Users/testuser/project/AGENTS.md
      // Shortened: ~/project/AGENTS.md
      expect(screen.getByText('~/project/AGENTS.md')).toBeInTheDocument();
    });

    it('replaces /home/xxx/ with ~/', () => {
      const linuxPaths: StartupInfo = {
        ...mockStartupInfo,
        contextFiles: ['/home/linuxuser/project/README.md'],
      };
      
      render(<StartupDisplay startupInfo={linuxPaths} />);
      
      expect(screen.getByText('~/project/README.md')).toBeInTheDocument();
    });
  });

  describe('Typography', () => {
    it('uses monospace font', () => {
      const { container } = render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(container.firstChild).toHaveClass('font-mono');
    });

    it('text is selectable', () => {
      const { container } = render(<StartupDisplay startupInfo={mockStartupInfo} />);
      
      expect(container.firstChild).toHaveClass('select-text');
    });
  });

  describe('Minimal Info', () => {
    it('renders with only version and shortcuts', () => {
      const minimalInfo: StartupInfo = {
        version: '0.0.1',
        contextFiles: [],
        skills: [],
        extensions: [],
        themes: [],
        shortcuts: [],
      };
      
      render(<StartupDisplay startupInfo={minimalInfo} />);
      
      expect(screen.getByText('pi')).toBeInTheDocument();
      expect(screen.getByText('v0.0.1')).toBeInTheDocument();
    });
  });
});
