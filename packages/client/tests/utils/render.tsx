import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { SettingsProvider } from '../../src/contexts/SettingsContext';

/**
 * Custom render that wraps components with required providers.
 * Use this instead of `render()` from @testing-library/react for any
 * component that uses useSettings (Pane, MessageList, etc.).
 */
function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SettingsProvider>
        {children}
      </SettingsProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}

export { renderWithProviders };
