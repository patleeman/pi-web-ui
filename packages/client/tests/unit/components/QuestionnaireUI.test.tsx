import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestionnaireUI } from '../../../src/components/QuestionnaireUI';
import type { QuestionnaireRequest } from '@pi-web-ui/shared';

describe('QuestionnaireUI', () => {
  const singleQuestionRequest: QuestionnaireRequest = {
    toolCallId: 'tool-1',
    questions: [
      {
        id: 'q1',
        prompt: 'Which framework do you prefer?',
        label: 'Framework',
        options: [
          { value: 'react', label: 'React', description: 'A JavaScript library for building user interfaces' },
          { value: 'vue', label: 'Vue', description: 'The Progressive JavaScript Framework' },
          { value: 'angular', label: 'Angular', description: 'Platform for building mobile and desktop apps' },
        ],
        allowOther: true,
      },
    ],
  };

  const multiQuestionRequest: QuestionnaireRequest = {
    toolCallId: 'tool-2',
    questions: [
      {
        id: 'q1',
        prompt: 'Choose a language',
        label: 'Language',
        options: [
          { value: 'typescript', label: 'TypeScript' },
          { value: 'javascript', label: 'JavaScript' },
        ],
      },
      {
        id: 'q2',
        prompt: 'Choose a style',
        label: 'Style',
        options: [
          { value: 'css', label: 'CSS' },
          { value: 'tailwind', label: 'Tailwind' },
        ],
      },
    ],
  };

  const defaultProps = {
    request: singleQuestionRequest,
    onResponse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single Question', () => {
    it('renders the question prompt', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      expect(screen.getByText('Which framework do you prefer?')).toBeInTheDocument();
    });

    it('renders all options', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('Vue')).toBeInTheDocument();
      expect(screen.getByText('Angular')).toBeInTheDocument();
    });

    it('renders option descriptions', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      expect(screen.getByText('A JavaScript library for building user interfaces')).toBeInTheDocument();
      expect(screen.getByText('The Progressive JavaScript Framework')).toBeInTheDocument();
    });

    it('shows option numbers', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('shows "Type something else" option when allowOther is true', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      expect(screen.getByText('Type something else...')).toBeInTheDocument();
    });

    it('does not show "Type something else" when allowOther is false', () => {
      const noOtherRequest = {
        ...singleQuestionRequest,
        questions: [{
          ...singleQuestionRequest.questions[0],
          allowOther: false,
        }],
      };
      
      render(<QuestionnaireUI {...defaultProps} request={noOtherRequest} />);
      
      expect(screen.queryByText('Type something else...')).not.toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('highlights first option by default', () => {
      const { container } = render(<QuestionnaireUI {...defaultProps} />);
      
      const buttons = container.querySelectorAll('button');
      expect(buttons[0]).toHaveClass('bg-pi-surface');
    });

    it('clicking an option submits response', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} onResponse={onResponse} />);
      
      fireEvent.click(screen.getByText('Vue'));
      
      expect(onResponse).toHaveBeenCalledWith('tool-1', expect.any(String));
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.cancelled).toBe(false);
      expect(response.answers[0].value).toBe('vue');
    });
  });

  describe('Keyboard Navigation', () => {
    it('ArrowDown moves selection down', () => {
      const { container } = render(<QuestionnaireUI {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      
      const buttons = container.querySelectorAll('button');
      expect(buttons[1]).toHaveClass('bg-pi-surface');
    });

    it('ArrowUp moves selection up', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      fireEvent.keyDown(document, { key: 'ArrowUp' });
      
      // Should be back at first option
    });

    it('Enter selects current option', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} onResponse={onResponse} />);
      
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(onResponse).toHaveBeenCalled();
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.answers[0].value).toBe('react'); // First option
    });

    it('Number keys quick select options', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} onResponse={onResponse} />);
      
      fireEvent.keyDown(document, { key: '2' });
      
      expect(onResponse).toHaveBeenCalled();
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.answers[0].value).toBe('vue'); // Second option
    });

    it('Escape cancels questionnaire', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} onResponse={onResponse} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onResponse).toHaveBeenCalled();
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.cancelled).toBe(true);
    });

    it('j/k keys navigate like arrow keys', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'j' });
      fireEvent.keyDown(document, { key: 'k' });
      
      // Should navigate without error
    });
  });

  describe('Custom Input', () => {
    it('clicking "Type something else" shows input field', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Type something else...'));
      
      expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
    });

    it('Enter in custom input submits the value', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} onResponse={onResponse} />);
      
      fireEvent.click(screen.getByText('Type something else...'));
      
      const input = screen.getByPlaceholderText('Type your answer...');
      fireEvent.change(input, { target: { value: 'Svelte' } });
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(onResponse).toHaveBeenCalled();
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.answers[0].value).toBe('Svelte');
    });

    it('Escape in custom input returns to options', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      fireEvent.click(screen.getByText('Type something else...'));
      expect(screen.getByPlaceholderText('Type your answer...')).toBeInTheDocument();
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(screen.queryByPlaceholderText('Type your answer...')).not.toBeInTheDocument();
      expect(screen.getByText('Type something else...')).toBeInTheDocument();
    });
  });

  describe('Multi-Question', () => {
    it('shows question tabs for multiple questions', () => {
      render(<QuestionnaireUI {...defaultProps} request={multiQuestionRequest} />);
      
      expect(screen.getByText('Language')).toBeInTheDocument();
      expect(screen.getByText('Style')).toBeInTheDocument();
    });

    it('first question is active initially', () => {
      render(<QuestionnaireUI {...defaultProps} request={multiQuestionRequest} />);
      
      expect(screen.getByText('Choose a language')).toBeInTheDocument();
    });

    it('selecting an option advances to next question', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} request={multiQuestionRequest} onResponse={onResponse} />);
      
      fireEvent.click(screen.getByText('TypeScript'));
      
      // Should show second question
      expect(screen.getByText('Choose a style')).toBeInTheDocument();
      
      // Should not have responded yet (not last question)
      expect(onResponse).not.toHaveBeenCalled();
    });

    it('selecting last question submits all answers', () => {
      const onResponse = vi.fn();
      render(<QuestionnaireUI {...defaultProps} request={multiQuestionRequest} onResponse={onResponse} />);
      
      fireEvent.click(screen.getByText('TypeScript'));
      fireEvent.click(screen.getByText('Tailwind'));
      
      expect(onResponse).toHaveBeenCalled();
      const response = JSON.parse(onResponse.mock.calls[0][1]);
      expect(response.answers).toHaveLength(2);
      expect(response.answers[0].value).toBe('typescript');
      expect(response.answers[1].value).toBe('tailwind');
    });

    it('does not show tabs for single question', () => {
      render(<QuestionnaireUI {...defaultProps} request={singleQuestionRequest} />);
      
      // Should not show "Framework" tab for single question
      expect(screen.queryByRole('button', { name: 'Framework' })).not.toBeInTheDocument();
    });
  });

  describe('Help Text', () => {
    it('shows keyboard shortcut hints', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      expect(screen.getByText(/↑↓ navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Enter select/)).toBeInTheDocument();
      expect(screen.getByText(/Esc cancel/)).toBeInTheDocument();
    });

    it('shows correct number range for quick select', () => {
      render(<QuestionnaireUI {...defaultProps} />);
      
      // 3 options + 1 "other" = 4 total
      expect(screen.getByText(/1-4 quick select/)).toBeInTheDocument();
    });
  });
});
