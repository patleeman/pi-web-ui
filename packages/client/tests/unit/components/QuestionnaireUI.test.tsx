import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionnaireUI } from '../../../src/components/QuestionnaireUI';
import type { QuestionnaireRequest } from '@pi-web-ui/shared';

describe('QuestionnaireUI', () => {
  const mockSingleQuestion: QuestionnaireRequest = {
    toolCallId: 'tool-1',
    questions: [
      {
        id: 'q1',
        prompt: 'What is your favorite color?',
        options: [
          { value: 'red', label: 'Red' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' },
        ],
        allowOther: true,
      },
    ],
  };

  const mockMultiQuestion: QuestionnaireRequest = {
    toolCallId: 'tool-2',
    questions: [
      {
        id: 'q1',
        prompt: 'Question 1?',
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
        allowOther: false,
      },
      {
        id: 'q2',
        prompt: 'Question 2?',
        options: [
          { value: 'x', label: 'Option X' },
          { value: 'y', label: 'Option Y' },
        ],
        allowOther: true,
      },
    ],
  };

  const onResponse = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the question prompt', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    expect(screen.getByText('What is your favorite color?')).toBeInTheDocument();
  });

  it('renders all option labels', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
  });

  it('renders option numbers', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('3.')).toBeInTheDocument();
  });

  it('shows "Type something..." option when allowOther is true', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    expect(screen.getByText(/Type something/)).toBeInTheDocument();
  });

  it('does not show "Type something..." when allowOther is false', () => {
    render(<QuestionnaireUI request={mockMultiQuestion} onResponse={onResponse} />);
    expect(screen.queryByText(/Type something/)).not.toBeInTheDocument();
  });

  it('calls onResponse when option is clicked', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    fireEvent.click(screen.getByText('Blue'));
    expect(onResponse).toHaveBeenCalledWith(
      'tool-1',
      expect.stringContaining('"cancelled":false')
    );
    expect(onResponse).toHaveBeenCalledWith(
      'tool-1',
      expect.stringContaining('"value":"blue"')
    );
  });

  it('navigates through multi-question form', () => {
    render(<QuestionnaireUI request={mockMultiQuestion} onResponse={onResponse} />);
    
    // First question
    expect(screen.getByText('Question 1?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Option A'));
    
    // Should move to second question
    expect(screen.getByText('Question 2?')).toBeInTheDocument();
    expect(screen.getByText('Option X')).toBeInTheDocument();
    
    // Selecting on last question should submit
    fireEvent.click(screen.getByText('Option Y'));
    expect(onResponse).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation with arrow keys', () => {
    const { container } = render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    
    // Arrow down should change selection
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onResponse).toHaveBeenCalledWith(
      'tool-1',
      expect.stringContaining('"value":"blue"') // Second option
    );
  });

  it('supports number key quick selection', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    
    fireEvent.keyDown(document, { key: '3' });
    
    expect(onResponse).toHaveBeenCalledWith(
      'tool-1',
      expect.stringContaining('"value":"green"') // Third option
    );
  });

  it('cancels on Escape key', () => {
    render(<QuestionnaireUI request={mockSingleQuestion} onResponse={onResponse} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(onResponse).toHaveBeenCalledWith(
      'tool-1',
      expect.stringContaining('"cancelled":true')
    );
  });

  it('shows progress indicator for multi-question', () => {
    render(<QuestionnaireUI request={mockMultiQuestion} onResponse={onResponse} />);
    // Should show "Question 1 of 2" or similar
    expect(screen.getByText(/1.*2/)).toBeInTheDocument();
  });

  it('shows description when option has one', () => {
    const requestWithDesc: QuestionnaireRequest = {
      toolCallId: 'tool-3',
      questions: [
        {
          id: 'q1',
          prompt: 'Choose',
          options: [
            { value: 'a', label: 'Alpha', description: 'First letter' },
          ],
          allowOther: false,
        },
      ],
    };
    render(<QuestionnaireUI request={requestWithDesc} onResponse={onResponse} />);
    expect(screen.getByText('First letter')).toBeInTheDocument();
  });
});
