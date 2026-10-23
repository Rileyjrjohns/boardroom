/** A link the system hands to the router, and whether it is the one that started the app. */
export interface SystemLink {
  readonly path: string;
  readonly initial: boolean;
}

/**
 * The link the development launcher opens a development build with
 * (`exp+boardroom://expo-development-client/?url=...`): it tells the launcher where the bundle is,
 * and is no link to a screen.
 */
const DEVELOPMENT_LAUNCHER_LINK = /^[a-z][a-z0-9+.-]*:\/\/expo-development-client(?:[/?#]|$)/i;

/**
 * The longest link the app takes, in characters. The links to its screens are a few dozen long; a
 * browser or a share sheet will hand over far more, and nothing the app does needs it. A longer
 * link is dropped without being read.
 */
export const MAX_SYSTEM_LINK_LENGTH = 2048;

/**
 * Whether the percent-encoding of the link can be decoded. The query-string parser of the router
 * (`decode-uri-component` 0.2.2) takes a time that grows with the square of the length of the link
 * when it meets a `%` it cannot decode, and runs on the JavaScript thread: a link of a kilobyte or
 * so freezes the app for seconds. The platform decoder fails at once on the same input, so the link
 * is tried here first, and only a link it can decode goes on.
 */
function isDecodable(path: string): boolean {
  try {
    decodeURIComponent(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the router makes of a link the system hands it, before it matches a route (expo-router calls
 * it for the link that started the app and for every one that arrives while it runs). A link to
 * a screen goes through as it is. The link of the development launcher is not one: it is dropped
 * (`undefined`), so that the router never takes it for a link it could not handle.
 *
 * A link that is too long (`MAX_SYSTEM_LINK_LENGTH`) or whose percent-encoding is malformed
 * (`isDecodable`) is dropped the same way. A dropped link that started the app starts it on its
 * root route, and one that arrives while the app runs changes nothing: a crafted link can do no
 * more than a link to no screen.
 *
 * That matters because of what the router does with a link that started the app. It asks for it
 * while it renders its container, with a promise whose answer sets a state of that container
 * (`useLinking`, "the last link that was not handled"), and when the render of the container was
 * thrown away and made again, which a slow first start does, the answer lands on a component that
 * never mounted: React reports "Can't perform a React state update on a component that hasn't
 * mounted yet" in every development build opened by the launcher. The router only sets that state
 * for a link that is a string. Dropping the launcher's link removes the only one such a build ever
 * starts with, so the state is not touched, and nothing the app does depends on it.
 */
export function redirectSystemPath({ path }: SystemLink): string | undefined {
  if (path.length > MAX_SYSTEM_LINK_LENGTH) return undefined;
  if (DEVELOPMENT_LAUNCHER_LINK.test(path)) return undefined;
  return isDecodable(path) ? path : undefined;
}
