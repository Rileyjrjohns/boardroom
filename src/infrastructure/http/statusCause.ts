/**
 * The `cause` of an `unexpected` error that comes from a status: the status, which is a kind of
 * failure and no more. Never a URL, a path or a part of the body.
 */
export function statusCause(status: number): string {
  return `status ${status}`;
}
