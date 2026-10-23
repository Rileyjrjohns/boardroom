import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

/** Why an address cannot be the base URL of the API. */
export const API_BASE_URL_ERROR = {
  Missing: 'missing',
  /** Not an `http` or `https` URL with a host, or one that carries credentials, a query or a fragment. */
  Malformed: 'malformed',
  /** An `http` URL, in a build that is not a development one, for a host that is not on this machine. */
  Insecure: 'insecure',
} as const;

export type ApiBaseUrlError = (typeof API_BASE_URL_ERROR)[keyof typeof API_BASE_URL_ERROR];

/**
 * The hosts that mean "this machine" for the app: the loopback names, and the address the Android
 * emulator gives to the computer it runs on. Traffic to them never leaves the machine, so it needs
 * no TLS, in a build of any kind.
 */
export const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'];

const SCHEME = { Http: 'http', Https: 'https' } as const;

/**
 * scheme, host (a name, an IPv4 address or an IPv6 address in brackets), an optional port, an
 * optional path. No user information (a password in a URL ends up in logs and screenshots), no
 * query and no fragment.
 */
const HOST_LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const BASE_URL = new RegExp(
  `^(?<scheme>https?)://(?<host>\\[[0-9a-f:.]+\\]|${HOST_LABEL}(?:\\.${HOST_LABEL})*)(?<port>:\\d{1,5})?(?<path>/[^\\s?#@]*)?$`,
  'i',
);

const MIN_PORT = 1;
const MAX_PORT = 65_535;
const TRAILING_SLASHES = /\/+$/;

export interface BaseUrlEnvironment {
  /** Whether this is a development build. */
  readonly development: boolean;
}

/**
 * The base URL of the API from the raw value of the setting: trimmed, with the scheme and the host
 * in lower case and no trailing slash, so that a path is always appended to it with a slash of its
 * own. `https` is required, except in a development build (where the API runs on a computer of the
 * network) and for the hosts of `LOCAL_HOSTS`.
 */
export function parseApiBaseUrl(
  raw: string | undefined,
  environment: BaseUrlEnvironment,
): Result<string, ApiBaseUrlError> {
  const text = (raw ?? '').trim();
  if (text === '') return err(API_BASE_URL_ERROR.Missing);

  const { scheme, host, port, path } = BASE_URL.exec(text)?.groups ?? {};
  if (scheme === undefined || host === undefined) return err(API_BASE_URL_ERROR.Malformed);

  const portNumber = port === undefined ? MIN_PORT : Number(port.slice(1));
  if (portNumber < MIN_PORT || portNumber > MAX_PORT) return err(API_BASE_URL_ERROR.Malformed);

  const hostName = host.toLowerCase();
  const secure = scheme.toLowerCase() === SCHEME.Https;
  if (!secure && !environment.development && !LOCAL_HOSTS.includes(hostName)) {
    return err(API_BASE_URL_ERROR.Insecure);
  }
  return ok(
    `${scheme.toLowerCase()}://${hostName}${port ?? ''}${(path ?? '').replace(TRAILING_SLASHES, '')}`,
  );
}
