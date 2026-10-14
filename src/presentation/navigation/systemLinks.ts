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
 * What the router makes of a link the system hands it, before it matches a route (expo-router calls
 * it for the link that started the app and for every one that arrives while it runs). A link to
 * a screen goes through as it is. The link of the development launcher is not one: it is dropped
 * (`undefined`), so that the router never takes it for a link it could not handle.
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
  return DEVELOPMENT_LAUNCHER_LINK.test(path) ? undefined : path;
}
