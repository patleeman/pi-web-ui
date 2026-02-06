import { useState, useEffect, useCallback } from 'react';
import type { QuestionnaireRequest } from '@pi-web-ui/shared';

interface QuestionnaireUIProps {
  request: QuestionnaireRequest;
  onResponse: (toolCallId: string, response: string) => void;
}

export function QuestionnaireUI({ request, onResponse }: QuestionnaireUIProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);

  const currentQuestion = request.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === request.questions.length - 1;
  const isSingleQuestion = request.questions.length === 1;

  // Reset state when question changes
  useEffect(() => {
    setSelectedOptionIndex(0);
    setShowCustomInput(false);
    setCustomInput('');
  }, [currentQuestionIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (showCustomInput) {
      if (e.key === 'Escape') {
        setShowCustomInput(false);
        setCustomInput('');
      } else if (e.key === 'Enter' && customInput.trim()) {
        handleSelectOption(customInput.trim());
      }
      return;
    }

    const options = currentQuestion.options;
    const hasOther = currentQuestion.allowOther !== false;
    const totalOptions = options.length + (hasOther ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        setSelectedOptionIndex(i => Math.min(i + 1, totalOptions - 1));
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        setSelectedOptionIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedOptionIndex < options.length) {
          handleSelectOption(options[selectedOptionIndex].value);
        } else if (hasOther) {
          setShowCustomInput(true);
        }
        break;
      case 'Escape':
        // Cancel questionnaire
        onResponse(request.toolCallId, JSON.stringify({ cancelled: true, answers: [] }));
        break;
      default:
        // Number keys for quick selection
        const num = parseInt(e.key);
        if (num >= 1 && num <= totalOptions) {
          const idx = num - 1;
          if (idx < options.length) {
            handleSelectOption(options[idx].value);
          } else if (hasOther) {
            setShowCustomInput(true);
          }
        }
        break;
    }
  }, [currentQuestion, selectedOptionIndex, showCustomInput, customInput, request.toolCallId, onResponse]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSelectOption = (value: string) => {
    const newAnswers = { ...answers, [currentQuestion.id]: value };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      // Submit all answers
      const answerArray = request.questions.map(q => ({
        id: q.id,
        value: newAnswers[q.id] || '',
      }));
      onResponse(request.toolCallId, JSON.stringify({ cancelled: false, answers: answerArray }));
    } else {
      // Move to next question
      setCurrentQuestionIndex(i => i + 1);
    }
  };

  return (
    <div className="w-full bg-pi-bg border border-pi-border rounded-lg shadow-sm overflow-hidden">
      <div className="p-3">
        {/* Question tabs (if multiple) */}
        {!isSingleQuestion && (
          <div className="flex gap-2 mb-3 text-[13px] sm:text-[11px]">
            {request.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => i < currentQuestionIndex && setCurrentQuestionIndex(i)}
                className={`px-3 py-2 sm:px-2 sm:py-1 rounded transition-colors ${
                  i === currentQuestionIndex
                    ? 'bg-pi-accent text-white'
                    : i < currentQuestionIndex
                    ? 'bg-pi-surface text-pi-muted cursor-pointer hover:text-pi-text'
                    : 'bg-pi-surface/50 text-pi-muted/50 cursor-not-allowed'
                }`}
              >
                {q.label || `Q${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {/* Question prompt */}
        <div className="text-pi-text text-[14px] mb-3">{currentQuestion.prompt}</div>

        {/* Options */}
        {showCustomInput ? (
          <div className="flex items-center gap-2">
            <span className="text-pi-muted">›</span>
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1 bg-transparent border-none outline-none text-pi-text text-[16px] font-mono"
              autoFocus
            />
            <span className="text-[11px] text-pi-muted">Enter to submit, Esc to cancel</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1 sm:gap-1">
            {currentQuestion.options.map((option, i) => (
              <button
                key={option.value}
                onClick={() => handleSelectOption(option.value)}
                className={`flex items-start gap-2 px-3 py-3 sm:px-2 sm:py-1.5 text-left rounded transition-colors ${
                  i === selectedOptionIndex
                    ? 'bg-pi-surface text-pi-text'
                    : 'text-pi-muted hover:bg-pi-surface/50 hover:text-pi-text'
                }`}
              >
                <span className="text-pi-accent text-[14px] sm:text-[12px] w-5 sm:w-4">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] sm:text-[14px]">{option.label}</div>
                  {option.description && (
                    <div className="text-[14px] sm:text-[12px] text-pi-muted mt-0.5">{option.description}</div>
                  )}
                </div>
              </button>
            ))}
            
            {currentQuestion.allowOther !== false && (
              <button
                onClick={() => setShowCustomInput(true)}
                className={`flex items-center gap-2 px-3 py-3 sm:px-2 sm:py-1.5 text-left rounded transition-colors ${
                  selectedOptionIndex === currentQuestion.options.length
                    ? 'bg-pi-surface text-pi-text'
                    : 'text-pi-muted hover:bg-pi-surface/50 hover:text-pi-text'
                }`}
              >
                <span className="text-pi-accent text-[14px] sm:text-[12px] w-5 sm:w-4">{currentQuestion.options.length + 1}.</span>
                <span className="text-[16px] sm:text-[14px] italic">Type something else...</span>
              </button>
            )}
          </div>
        )}

        {/* Help text */}
        <div className="mt-3 text-[11px] text-pi-muted">
          ↑↓ navigate • Enter select • 1-{currentQuestion.options.length + (currentQuestion.allowOther !== false ? 1 : 0)} quick select • Esc cancel
        </div>
      </div>
    </div>
  );
}
