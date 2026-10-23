import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { CloseDocument } from '@features/documents/application/use-cases/CloseDocument';
import type { ObserveScreenCapture } from '@features/documents/application/use-cases/ObserveScreenCapture';
import type { OpenDocument } from '@features/documents/application/use-cases/OpenDocument';

/**
 * The use cases the screen of a document needs. The presentation of the feature declares the shape
 * it depends on, and whatever builds the use cases (the composition root, a test) provides it: the
 * feature never imports the composition. Only the `execute` of a use case is part of the shape, so
 * a stand-in needs no more than that.
 */
export interface DocumentsServices {
  readonly openDocument: Pick<OpenDocument, 'execute'>;
  readonly closeDocument: Pick<CloseDocument, 'execute'>;
  readonly observeScreenCapture: Pick<ObserveScreenCapture, 'execute'>;
}

const DocumentsServicesContext = createContext<DocumentsServices | undefined>(undefined);

interface DocumentsServicesProviderProps {
  readonly services: DocumentsServices;
  readonly children: ReactNode;
}

/** Exposes the use cases of the documents to the hooks of the feature, through React context. */
export function DocumentsServicesProvider({ services, children }: DocumentsServicesProviderProps) {
  return (
    <DocumentsServicesContext.Provider value={services}>
      {children}
    </DocumentsServicesContext.Provider>
  );
}

/**
 * The use cases of the documents. A component outside the provider is a programming error, hence
 * the throw: there is nothing sensible to render without them.
 */
export function useDocumentsServices(): DocumentsServices {
  const services = useContext(DocumentsServicesContext);
  if (services === undefined) {
    throw new Error('useDocumentsServices must be used inside a DocumentsServicesProvider.');
  }
  return services;
}
