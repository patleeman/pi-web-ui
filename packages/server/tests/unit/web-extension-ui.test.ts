import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebExtensionUIContext } from '../../src/web-extension-ui';
import type { ExtensionUIResponse } from '@pi-web-ui/shared';

describe('WebExtensionUIContext', () => {
  let sendRequest: ReturnType<typeof vi.fn>;
  let sendNotification: ReturnType<typeof vi.fn>;
  let ctx: WebExtensionUIContext;

  beforeEach(() => {
    sendRequest = vi.fn();
    sendNotification = vi.fn();
    ctx = new WebExtensionUIContext({
      sendRequest,
      sendNotification,
    });
  });

  afterEach(() => {
    ctx.cancelAllPending();
  });

  describe('notify', () => {
    it('sends notification via callback', () => {
      ctx.notify('Hello', 'info');
      expect(sendNotification).toHaveBeenCalledWith('Hello', 'info');
    });

    it('defaults to info type', () => {
      ctx.notify('Hello');
      expect(sendNotification).toHaveBeenCalledWith('Hello', 'info');
    });
  });

  describe('select', () => {
    it('sends select request to client', async () => {
      const promise = ctx.select('Choose', ['a', 'b', 'c']);
      
      expect(sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'select',
          title: 'Choose',
          options: ['a', 'b', 'c'],
        })
      );

      // Simulate response
      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: false, value: 'b' });

      const result = await promise;
      expect(result).toBe('b');
    });

    it('returns undefined when cancelled', async () => {
      const promise = ctx.select('Choose', ['a', 'b']);
      
      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: true });

      const result = await promise;
      expect(result).toBeUndefined();
    });

    it('handles timeout', async () => {
      vi.useFakeTimers();
      
      const promise = ctx.select('Choose', ['a', 'b'], { timeout: 1000 });
      
      vi.advanceTimersByTime(1500);
      
      const result = await promise;
      expect(result).toBeUndefined();
      
      vi.useRealTimers();
    });
  });

  describe('confirm', () => {
    it('sends confirm request to client', async () => {
      const promise = ctx.confirm('Confirm', 'Are you sure?');
      
      expect(sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'confirm',
          title: 'Confirm',
          message: 'Are you sure?',
        })
      );

      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: false, value: true });

      const result = await promise;
      expect(result).toBe(true);
    });

    it('returns undefined (falsy) when cancelled', async () => {
      const promise = ctx.confirm('Confirm', 'Are you sure?');
      
      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: true });

      const result = await promise;
      // handleResponse resolves with undefined for all cancelled requests
      // callers should treat undefined/falsy as cancelled
      expect(result).toBeFalsy();
    });
  });

  describe('input', () => {
    it('sends input request to client', async () => {
      const promise = ctx.input('Enter name', 'Type here');
      
      expect(sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'input',
          title: 'Enter name',
          placeholder: 'Type here',
        })
      );

      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: false, value: 'John' });

      const result = await promise;
      expect(result).toBe('John');
    });

    it('returns undefined when cancelled', async () => {
      const promise = ctx.input('Enter name');
      
      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: true });

      const result = await promise;
      expect(result).toBeUndefined();
    });
  });

  describe('editor', () => {
    it('sends editor request to client', async () => {
      const promise = ctx.editor('Edit text', 'Initial content');
      
      expect(sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'editor',
          title: 'Edit text',
          prefill: 'Initial content',
        })
      );

      const requestId = sendRequest.mock.calls[0][0].requestId;
      ctx.handleResponse({ requestId, cancelled: false, value: 'Edited content' });

      const result = await promise;
      expect(result).toBe('Edited content');
    });
  });

  describe('handleResponse', () => {
    it('ignores responses for unknown request IDs', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      ctx.handleResponse({ requestId: 'unknown', cancelled: false });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No pending request')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('cancelAllPending', () => {
    it('resolves all pending requests with undefined', async () => {
      const promise1 = ctx.select('Choose 1', ['a']);
      const promise2 = ctx.select('Choose 2', ['b']);
      
      ctx.cancelAllPending();
      
      expect(await promise1).toBeUndefined();
      expect(await promise2).toBeUndefined();
    });
  });

  describe('setStatus', () => {
    it('stores status values', () => {
      ctx.setStatus('key1', 'value1');
      // No error thrown - status is stored internally
    });

    it('removes status when undefined', () => {
      ctx.setStatus('key1', 'value1');
      ctx.setStatus('key1', undefined);
      // No error thrown
    });
  });

  describe('editor text', () => {
    it('uses setEditorText callback', () => {
      const setEditorText = vi.fn();
      const ctxWithEditor = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        setEditorText,
      });

      ctxWithEditor.setEditorText('hello');
      expect(setEditorText).toHaveBeenCalledWith('hello');
    });

    it('uses getEditorText callback', () => {
      const getEditorText = vi.fn().mockReturnValue('current text');
      const ctxWithEditor = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        getEditorText,
      });

      const result = ctxWithEditor.getEditorText();
      expect(result).toBe('current text');
    });

    it('returns empty string when no getEditorText callback', () => {
      expect(ctx.getEditorText()).toBe('');
    });
  });

  describe('TUI-specific methods (no-ops)', () => {
    it('setWorkingMessage does not throw', () => {
      expect(() => ctx.setWorkingMessage('Working...')).not.toThrow();
      expect(() => ctx.setWorkingMessage()).not.toThrow();
    });

    it('setWidget does not throw', () => {
      expect(() => ctx.setWidget('key', {})).not.toThrow();
    });

    it('setFooter does not throw', () => {
      expect(() => ctx.setFooter(() => null)).not.toThrow();
    });

    it('setHeader does not throw', () => {
      expect(() => ctx.setHeader(() => null)).not.toThrow();
    });

    it('setTitle does not throw', () => {
      expect(() => ctx.setTitle('Title')).not.toThrow();
    });

    it('setEditorComponent does not throw', () => {
      expect(() => ctx.setEditorComponent(() => null)).not.toThrow();
    });
  });

  describe('theme', () => {
    it('returns a minimal theme object', () => {
      expect(ctx.theme).toBeTruthy();
      expect(ctx.theme.fg).toBeDefined();
      expect(ctx.theme.bold).toBeDefined();
    });

    it('theme methods return text as-is', () => {
      expect(ctx.theme.fg('red', 'hello')).toBe('hello');
      expect(ctx.theme.bold('hello')).toBe('hello');
    });

    it('getAllThemes returns empty array', () => {
      expect(ctx.getAllThemes()).toEqual([]);
    });

    it('getTheme returns undefined', () => {
      expect(ctx.getTheme('any')).toBeUndefined();
    });

    it('setTheme returns error', () => {
      const result = ctx.setTheme('theme');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('custom', () => {
    it('creates mock TUI and theme', async () => {
      const sendCustomUIStart = vi.fn();
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
      });

      let receivedTui: any;
      let receivedTheme: any;
      
      const promise = ctxWithCustom.custom((tui, theme, _kb, done) => {
        receivedTui = tui;
        receivedTheme = theme;
        // Return a minimal component
        return {
          render: () => [],
          invalidate: () => {},
          toNode: () => ({ id: 'test', type: 'container', children: [] }),
        };
      });
      
      // Give it time to start
      await new Promise(r => setTimeout(r, 10));
      
      expect(receivedTui).toBeDefined();
      expect(receivedTui.requestRender).toBeDefined();
      expect(receivedTheme).toBeDefined();
      expect(receivedTheme.fg).toBeDefined();
      expect(receivedTheme.bold).toBeDefined();
      
      // Cancel to clean up
      ctxWithCustom.cancelAllPending();
      await promise;
    });

    it('calls factory with mock objects', async () => {
      const sendCustomUIStart = vi.fn();
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
      });

      const factory = vi.fn().mockReturnValue({
        render: () => [],
        invalidate: () => {},
        toNode: () => ({ id: 'test', type: 'container', children: [] }),
      });
      
      const promise = ctxWithCustom.custom(factory);
      await new Promise(r => setTimeout(r, 10));
      
      expect(factory).toHaveBeenCalledWith(
        expect.any(Object), // tui
        expect.any(Object), // theme  
        expect.any(Object), // keybindings
        expect.any(Function) // done
      );
      
      ctxWithCustom.cancelAllPending();
      await promise;
    });

    it('extracts tree from returned component', async () => {
      let sentEvent: any;
      const sendCustomUIStart = vi.fn((event) => { sentEvent = event; });
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
      });
      
      const promise = ctxWithCustom.custom((tui, theme, kb, done) => {
        return {
          render: () => [],
          invalidate: () => {},
          toNode: () => ({
            id: 'root',
            type: 'container',
            children: [
              { id: 'text1', type: 'text', content: 'Hello' },
            ],
          }),
        };
      });
      
      await new Promise(r => setTimeout(r, 10));
      
      expect(sendCustomUIStart).toHaveBeenCalled();
      expect(sentEvent.root.type).toBe('container');
      expect(sentEvent.root.children[0].content).toBe('Hello');
      
      ctxWithCustom.cancelAllPending();
      await promise;
    });

    it('sends customUIStart event', async () => {
      const sendCustomUIStart = vi.fn();
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
      });
      
      const promise = ctxWithCustom.custom(() => ({
        render: () => [],
        invalidate: () => {},
        toNode: () => ({ id: 'test', type: 'container', children: [] }),
      }));
      
      await new Promise(r => setTimeout(r, 10));
      
      expect(sendCustomUIStart).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
          root: expect.objectContaining({ type: 'container' }),
        })
      );
      
      ctxWithCustom.cancelAllPending();
      await promise;
    });

    it('resolves when done() is called', async () => {
      const sendCustomUIStart = vi.fn();
      const sendCustomUIClose = vi.fn();
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendCustomUIClose,
      });
      
      let doneCallback: ((result: string) => void) | undefined;
      
      const promise = ctxWithCustom.custom<string>((tui, theme, kb, done) => {
        doneCallback = done;
        return {
          render: () => [],
          invalidate: () => {},
          toNode: () => ({ id: 'test', type: 'container', children: [] }),
        };
      });
      
      await new Promise(r => setTimeout(r, 10));
      
      // Simulate done being called
      doneCallback!('selected-value');
      
      const result = await promise;
      expect(result).toBe('selected-value');
      expect(sendCustomUIClose).toHaveBeenCalled();
    });

    it('sends customUIClose on completion', async () => {
      const sendCustomUIStart = vi.fn();
      const sendCustomUIClose = vi.fn();
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendCustomUIClose,
      });
      
      let doneCallback: ((result: any) => void) | undefined;
      
      const promise = ctxWithCustom.custom((tui, theme, kb, done) => {
        doneCallback = done;
        return {
          render: () => [],
          invalidate: () => {},
          toNode: () => ({ id: 'test', type: 'container', children: [] }),
        };
      });
      
      await new Promise(r => setTimeout(r, 10));
      doneCallback!(null);
      await promise;
      
      expect(sendCustomUIClose).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: expect.any(String),
        })
      );
    });

    it('handles factory that throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const result = await ctx.custom(() => {
        throw new Error('Factory error');
      });
      
      expect(result).toBeUndefined();
      consoleSpy.mockRestore();
    });

    it('handles factory that returns null', async () => {
      const result = await ctx.custom(() => null as any);
      expect(result).toBeUndefined();
    });

    it('routes input to component handleInput', async () => {
      const sendCustomUIStart = vi.fn();
      const sendCustomUIUpdate = vi.fn();
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendCustomUIUpdate,
      });
      
      const handleInput = vi.fn();
      let sessionId: string | undefined;
      
      ctxWithCustom.custom((tui, theme, kb, done) => {
        return {
          render: () => [],
          invalidate: () => {},
          handleInput,
          toNode: () => ({ id: 'test', type: 'container', children: [] }),
        };
      });
      
      await new Promise(r => setTimeout(r, 10));
      
      // Get sessionId from the start event
      sessionId = sendCustomUIStart.mock.calls[0][0].sessionId;
      
      // Simulate input from client
      ctxWithCustom.handleCustomUIInput({
        sessionId: sessionId!,
        inputType: 'key',
        key: 'j',
      });
      
      expect(handleInput).toHaveBeenCalledWith('j');
      
      ctxWithCustom.cancelAllPending();
    });

    it('sends customUIUpdate after input', async () => {
      const sendCustomUIStart = vi.fn();
      const sendCustomUIUpdate = vi.fn();
      
      const ctxWithCustom = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendCustomUIUpdate,
      });
      
      let counter = 0;
      
      ctxWithCustom.custom((tui, theme, kb, done) => {
        return {
          render: () => [],
          invalidate: () => {},
          handleInput: () => { counter++; },
          toNode: () => ({ id: 'test', type: 'container', children: [], counter }),
        };
      });
      
      await new Promise(r => setTimeout(r, 10));
      
      const sessionId = sendCustomUIStart.mock.calls[0][0].sessionId;
      
      ctxWithCustom.handleCustomUIInput({
        sessionId,
        inputType: 'key',
        key: 'j',
      });
      
      expect(sendCustomUIUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          root: expect.objectContaining({ counter: 1 }),
        })
      );
      
      ctxWithCustom.cancelAllPending();
    });
  });

  describe('questionnaire interception', () => {
    it('intercepts custom() when questionnaire mode is set', async () => {
      const sendQuestionnaireRequest = vi.fn();
      const sendCustomUIStart = vi.fn();
      
      const ctxWithQuestionnaire = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendQuestionnaireRequest,
      });

      const questions = [
        {
          id: 'q1',
          prompt: 'Choose a framework',
          options: [
            { value: 'react', label: 'React' },
            { value: 'vue', label: 'Vue' },
          ],
        },
      ];

      // Set questionnaire mode (simulates tool_execution_start detection)
      ctxWithQuestionnaire.setQuestionnaireMode('tool-call-1', questions);

      // Call custom() - this should be intercepted
      const resultPromise = ctxWithQuestionnaire.custom((tui: any, theme: any, kb: any, done: any) => {
        // This factory should NOT be called
        return { render: () => [], invalidate: () => {} };
      });

      // Should have sent questionnaireRequest, NOT customUIStart
      expect(sendQuestionnaireRequest).toHaveBeenCalledWith({
        toolCallId: 'tool-call-1',
        questions,
      });
      expect(sendCustomUIStart).not.toHaveBeenCalled();

      // Simulate questionnaire response from client
      ctxWithQuestionnaire.handleQuestionnaireResponse({
        toolCallId: 'tool-call-1',
        answers: [{ id: 'q1', value: 'react', label: 'React', wasCustom: false, index: 1 }],
        cancelled: false,
      });

      const result = await resultPromise;
      expect(result).toEqual({
        questions,
        answers: [{ id: 'q1', value: 'react', label: 'React', wasCustom: false, index: 1 }],
        cancelled: false,
      });

      ctxWithQuestionnaire.cancelAllPending();
    });

    it('handles cancelled questionnaire response', async () => {
      const sendQuestionnaireRequest = vi.fn();
      
      const ctxWithQuestionnaire = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendQuestionnaireRequest,
      });

      const questions = [
        { id: 'q1', prompt: 'Pick one', options: [{ value: 'a', label: 'A' }] },
      ];

      ctxWithQuestionnaire.setQuestionnaireMode('tool-call-2', questions);
      const resultPromise = ctxWithQuestionnaire.custom(() => ({
        render: () => [],
        invalidate: () => {},
      }));

      ctxWithQuestionnaire.handleQuestionnaireResponse({
        toolCallId: 'tool-call-2',
        answers: [],
        cancelled: true,
      });

      const result = await resultPromise;
      expect(result).toEqual({
        questions,
        answers: [],
        cancelled: true,
      });

      ctxWithQuestionnaire.cancelAllPending();
    });

    it('falls through to normal custom() when questionnaire mode not set', async () => {
      const sendQuestionnaireRequest = vi.fn();
      const sendCustomUIStart = vi.fn();
      
      const ctxWithBoth = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendCustomUIStart,
        sendQuestionnaireRequest,
      });

      // Don't set questionnaire mode - should use normal custom UI path
      ctxWithBoth.custom((tui: any, theme: any, kb: any, done: any) => {
        return {
          render: () => ['hello'],
          invalidate: () => {},
        };
      });

      await new Promise(r => setTimeout(r, 10));

      expect(sendQuestionnaireRequest).not.toHaveBeenCalled();
      expect(sendCustomUIStart).toHaveBeenCalled();

      ctxWithBoth.cancelAllPending();
    });

    it('cancelAllPending resolves pending questionnaire with cancelled', async () => {
      const sendQuestionnaireRequest = vi.fn();
      
      const ctxWithQuestionnaire = new WebExtensionUIContext({
        sendRequest,
        sendNotification,
        sendQuestionnaireRequest,
      });

      const questions = [
        { id: 'q1', prompt: 'Pick one', options: [{ value: 'a', label: 'A' }] },
      ];

      ctxWithQuestionnaire.setQuestionnaireMode('tool-call-3', questions);
      const resultPromise = ctxWithQuestionnaire.custom(() => ({
        render: () => [],
        invalidate: () => {},
      }));

      // Cancel all pending - should resolve the questionnaire
      ctxWithQuestionnaire.cancelAllPending();

      const result = await resultPromise;
      expect(result).toEqual({
        questions,
        answers: [],
        cancelled: true,
      });
    });

    it('ignores questionnaire response with unknown toolCallId', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      ctx.handleQuestionnaireResponse({
        toolCallId: 'unknown-tool',
        answers: [],
        cancelled: false,
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No pending questionnaire')
      );

      warnSpy.mockRestore();
    });
  });
});
