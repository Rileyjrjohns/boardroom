import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import type { DocumentId } from '@core/domain/value-objects/ids';
import { ROUTES, ROUTE_PARAMS } from '@core/presentation/navigation/routes';

/** Opens a document in the viewer. The callback is stable, so the rows of a list are not re-rendered for it. */
export function useOpenDocumentScreen(): (id: DocumentId) => void {
  const router = useRouter();

  return useCallback(
    (id) => {
      router.push({ pathname: ROUTES.document, params: { [ROUTE_PARAMS.documentId]: id } });
    },
    [router],
  );
}
