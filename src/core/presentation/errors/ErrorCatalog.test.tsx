import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';

import { CORE_ERROR_KEYS } from '../i18n/translationKeys';
import { QueryFailure } from '../query/QueryFailure';

import {
  CORE_ERROR_CATALOG,
  ErrorCatalogProvider,
  createErrorCatalog,
  useErrorCatalog,
  useErrorCodeOf,
} from './ErrorCatalog';

const SESSION_EXPIRED = 'sessionExpired';

/** A catalog that knows one code more than the core, and one more that a retry can fix. */
const WIDER = createErrorCatalog({
  messageKeys: { ...CORE_ERROR_KEYS, [SESSION_EXPIRED]: 'errors.sessionExpired' },
  isRetryableCode: (code) => code === REPOSITORY_ERROR_CODE.NetworkUnavailable,
});

describe('createErrorCatalog', () => {
  it('has a text for the codes it was given, and for no other', () => {
    expect(WIDER.has(SESSION_EXPIRED)).toBe(true);
    expect(WIDER.has(REPOSITORY_ERROR_CODE.NotFound)).toBe(true);
    expect(WIDER.has('unheardOf')).toBe(false);
  });

  it('is not fooled by a code that is a property of every object', () => {
    expect(WIDER.has('toString')).toBe(false);
    expect(WIDER.has('constructor')).toBe(false);
  });

  it('gives the key of the text of a code, and the one of unexpected for a code with none', () => {
    expect(WIDER.messageKeyOf(SESSION_EXPIRED)).toBe('errors.sessionExpired');
    expect(WIDER.messageKeyOf('unheardOf')).toBe(CORE_ERROR_KEYS[REPOSITORY_ERROR_CODE.Unexpected]);
  });

  it('says which codes a second try can fix, as it was told', () => {
    expect(WIDER.isRetryableCode(REPOSITORY_ERROR_CODE.NetworkUnavailable)).toBe(true);
    expect(WIDER.isRetryableCode(REPOSITORY_ERROR_CODE.Unexpected)).toBe(false);
  });
});

describe('CORE_ERROR_CATALOG', () => {
  it('knows the families of the core, and only them', () => {
    const codes = [
      ...valuesOf(REPOSITORY_ERROR_CODE),
      STORAGE_ERROR_CODE.ReadFailed,
      VALIDATION_ERROR_CODE.Validation,
    ];

    expect(codes.filter((code) => !CORE_ERROR_CATALOG.has(code))).toEqual([]);
    expect(CORE_ERROR_CATALOG.has(SESSION_EXPIRED)).toBe(false);
  });

  it('lets a second try fix what the core says it can: the network, a fault of the server, a store', () => {
    expect(
      [
        REPOSITORY_ERROR_CODE.NetworkUnavailable,
        REPOSITORY_ERROR_CODE.Unexpected,
        STORAGE_ERROR_CODE.ReadFailed,
      ].every((code) => CORE_ERROR_CATALOG.isRetryableCode(code)),
    ).toBe(true);
    expect(CORE_ERROR_CATALOG.isRetryableCode(REPOSITORY_ERROR_CODE.Forbidden)).toBe(false);
  });
});

describe('ErrorCatalogProvider', () => {
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <ErrorCatalogProvider catalog={WIDER}>{children}</ErrorCatalogProvider>
  );

  it('falls back on the catalog of the core when there is no provider', () => {
    const { result } = renderHook(() => useErrorCatalog());

    expect(result.current).toBe(CORE_ERROR_CATALOG);
  });

  it('gives the catalog it was given to the components below it', () => {
    const { result } = renderHook(() => useErrorCatalog(), { wrapper });

    expect(result.current).toBe(WIDER);
  });

  it('reads the code of a rejection with that catalog: a code it has no text for is unexpected', () => {
    const { result } = renderHook(() => useErrorCodeOf(), { wrapper });

    expect(result.current(new QueryFailure({ code: SESSION_EXPIRED }))).toBe(SESSION_EXPIRED);
    expect(result.current(new QueryFailure({ code: 'unheardOf' }))).toBe(
      REPOSITORY_ERROR_CODE.Unexpected,
    );
    expect(result.current(new Error('boom'))).toBe(REPOSITORY_ERROR_CODE.Unexpected);
  });
});
