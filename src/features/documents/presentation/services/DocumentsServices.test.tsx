import { render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { DocumentsServicesProvider, useDocumentsServices } from './DocumentsServices';
import type { DocumentsServices } from './DocumentsServices';

const UNUSED = { execute: () => Promise.reject(new Error('unused')) };

const SERVICES: DocumentsServices = {
  openDocument: UNUSED,
  closeDocument: UNUSED,
  observeScreenCapture: UNUSED,
};

describe('DocumentsServicesProvider', () => {
  it('provides the use cases of the feature to the hooks below it', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <DocumentsServicesProvider services={SERVICES}>{children}</DocumentsServicesProvider>
    );

    const { result } = renderHook(() => useDocumentsServices(), { wrapper });

    expect(result.current).toBe(SERVICES);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useDocumentsServices();
      return null;
    }

    expect(() => render(<Probe />)).toThrow('DocumentsServicesProvider');

    error.mockRestore();
  });
});
