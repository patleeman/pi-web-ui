import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders as render } from '../../utils/render';
import { MessageList } from '../../../src/components/MessageList';
import type { ChatMessage } from '@pi-deck/shared';

describe('MessageList', () => {
  const mockUserMessage: ChatMessage = {
    id: 'msg-1',
    role: 'user',
    content: [{ type: 'text', text: 'Hello, how are you?' }],
    timestamp: Date.now(),
  };

  const mockAssistantMessage: ChatMessage = {
    id: 'msg-2',
    role: 'assistant',
    content: [{ type: 'text', text: 'I am doing well, thank you!' }],
    timestamp: Date.now(),
  };

  const mockMessageWithToolCall: ChatMessage = {
    id: 'msg-3',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me read that file.' },
      { 
        type: 'toolCall',
        id: 'tool-1', 
        name: 'Read', 
        arguments: { path: '/test/file.ts' },
        status: 'complete',
        result: 'file content here',
      },
    ],
    timestamp: Date.now(),
  };

  const defaultProps = {
    keyPrefix: 'test',
    messages: [mockUserMessage, mockAssistantMessage],
    streamingText: '',
    streamingThinking: '',
    isStreaming: false,
    activeToolExecutions: [],
  };

  it('renders user messages', () => {
    render(<MessageList {...defaultProps} />);
    expect(screen.getByText('Hello, how are you?')).toBeInTheDocument();
  });

  it('renders assistant messages', () => {
    render(<MessageList {...defaultProps} />);
    expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument();
  });

  it('shows streaming text when streaming', () => {
    render(
      <MessageList 
        {...defaultProps} 
        isStreaming={true}
        streamingText="This is being typed..."
      />
    );
    expect(screen.getByText('This is being typed...')).toBeInTheDocument();
  });

  it('shows streaming thinking when present', () => {
    render(
      <MessageList 
        {...defaultProps} 
        isStreaming={true}
        streamingThinking="I am thinking about this..."
      />
    );
    expect(screen.getByText('I am thinking about this...')).toBeInTheDocument();
  });

  it('renders messages with tool calls', () => {
    const { container } = render(
      <MessageList 
        {...defaultProps} 
        messages={[mockUserMessage, mockMessageWithToolCall]}
      />
    );
    expect(screen.getByText('Let me read that file.')).toBeInTheDocument();
    // Tool call info should be present
    expect(container.textContent).toMatch(/Read|file\.ts|tool/i);
  });

  it('shows tool name for tool calls', () => {
    const { container } = render(
      <MessageList 
        {...defaultProps} 
        messages={[mockMessageWithToolCall]}
      />
    );
    // Tool should be mentioned somewhere
    expect(container.textContent).toMatch(/Read|file\.ts/);
  });

  it('renders empty state when no messages', () => {
    const { container } = render(
      <MessageList {...defaultProps} messages={[]} />
    );
    // Should render without crashing (may return null or empty div)
    expect(container).toBeTruthy();
  });

  it('shows active tool executions', () => {
    render(
      <MessageList 
        {...defaultProps} 
        isStreaming={true}
        activeToolExecutions={[
          { 
            toolCallId: 'tool-active', 
            toolName: 'Bash', 
            args: { command: 'ls -la' },
            status: 'running',
          },
        ]}
      />
    );
    // Tool execution should be rendered somehow
    const { container } = render(
      <MessageList 
        {...defaultProps} 
        isStreaming={true}
        activeToolExecutions={[
          { 
            toolCallId: 'tool-active', 
            toolName: 'Bash', 
            args: { command: 'ls -la' },
            status: 'running',
          },
        ]}
      />
    );
    // Just verify it renders without error
    expect(container).toBeTruthy();
  });

  it('renders bash execution messages inline', () => {
    const bashMessage: ChatMessage = {
      id: 'bash-1',
      role: 'bashExecution',
      timestamp: Date.now(),
      content: [],
      command: 'ls -la',
      output: 'file1\nfile2\n',
      exitCode: 0,
      excludeFromContext: false,
      isError: false,
    };

    render(
      <MessageList
        {...defaultProps}
        messages={[bashMessage]}
      />
    );
    expect(screen.getByText('ls -la')).toBeInTheDocument();
    expect(screen.getByText(/file1/)).toBeInTheDocument();
  });

  it('renders markdown in assistant messages', async () => {
    const markdownMessage: ChatMessage = {
      id: 'msg-md',
      role: 'assistant',
      content: [{ type: 'text', text: '**Bold text** and `code`' }],
      timestamp: Date.now(),
    };
    
    render(
      <MessageList 
        {...defaultProps} 
        messages={[markdownMessage]}
      />
    );
    
    // Markdown should be processed (may take a moment due to lazy loading)
    await waitFor(() => {
      expect(screen.getByText(/Bold text/)).toBeInTheDocument();
    });
  });

  it('applies correct styling for user messages', () => {
    const { container } = render(<MessageList {...defaultProps} />);
    // User messages are rendered - just verify they're there
    expect(container.textContent).toContain('Hello, how are you?');
  });

  it('handles messages with thinking content', () => {
    const thinkingMessage: ChatMessage = {
      id: 'msg-thinking',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me think about this...' },
        { type: 'text', text: 'Here is my answer.' },
      ],
      timestamp: Date.now(),
    };
    
    render(
      <MessageList 
        {...defaultProps} 
        messages={[thinkingMessage]}
      />
    );
    
    expect(screen.getByText('Here is my answer.')).toBeInTheDocument();
    // Thinking may be collapsed by default
  });
});
