import type { DirectoryEntry, WsConnectedEvent, WsWorkspaceOpenedEvent, WsStateEvent, WsMessagesEvent, WsSessionsEvent, WsModelsEvent, WsCommandsEvent, WsStartupInfoEvent } from '@pi-web-ui/shared';
import { mockSessionState, mockMessages, mockSessions, mockModels, mockCommands, mockStartupInfo } from './messages';

export const mockDirectoryEntries: DirectoryEntry[] = [
  { name: 'src', path: '/workspace/src', isDirectory: true },
  { name: 'package.json', path: '/workspace/package.json', isDirectory: false },
  { name: 'README.md', path: '/workspace/README.md', isDirectory: false },
  { name: 'node_modules', path: '/workspace/node_modules', isDirectory: true },
];

export const mockConnectedEvent: WsConnectedEvent = {
  type: 'connected',
  allowedRoots: ['/Users/test', '/home/test'],
  homeDirectory: '/Users/test',
  recentWorkspaces: ['/Users/test/project1', '/Users/test/project2'],
};

export const mockWorkspaceOpenedEvent: WsWorkspaceOpenedEvent = {
  type: 'workspaceOpened',
  workspaceId: 'ws-1',
  path: '/Users/test/project',
  name: 'project',
};

export const mockStateEvent: WsStateEvent = {
  type: 'state',
  workspaceId: 'ws-1',
  sessionSlotId: 'default',
  state: mockSessionState,
};

export const mockMessagesEvent: WsMessagesEvent = {
  type: 'messages',
  workspaceId: 'ws-1',
  sessionSlotId: 'default',
  messages: mockMessages,
};

export const mockSessionsEvent: WsSessionsEvent = {
  type: 'sessions',
  workspaceId: 'ws-1',
  sessions: mockSessions,
};

export const mockModelsEvent: WsModelsEvent = {
  type: 'models',
  workspaceId: 'ws-1',
  models: mockModels,
};

export const mockCommandsEvent: WsCommandsEvent = {
  type: 'commands',
  workspaceId: 'ws-1',
  sessionSlotId: 'default',
  commands: mockCommands,
};

export const mockStartupInfoEvent: WsStartupInfoEvent = {
  type: 'startupInfo',
  workspaceId: 'ws-1',
  startupInfo: mockStartupInfo,
};

/**
 * Returns all events needed to fully initialize a workspace
 */
export function getWorkspaceInitEvents(workspaceId = 'ws-1', slotId = 'default') {
  return [
    { ...mockWorkspaceOpenedEvent, workspaceId },
    { ...mockStateEvent, workspaceId, sessionSlotId: slotId },
    { ...mockMessagesEvent, workspaceId, sessionSlotId: slotId },
    { ...mockSessionsEvent, workspaceId },
    { ...mockModelsEvent, workspaceId },
    { ...mockCommandsEvent, workspaceId, sessionSlotId: slotId },
    { ...mockStartupInfoEvent, workspaceId },
  ];
}
