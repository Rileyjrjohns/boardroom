/**
 * The routes of the app, written once. The files under `app/` are what expo-router reads, so a
 * route and its constant must match: `routes.test.ts` fails when a constant points at a file that
 * does not exist.
 */
export const ROUTES = {
  /** The meetings list: `app/index.tsx`. */
  meetings: '/',
  /** The detail of a meeting: `app/meetings/[meetingId].tsx`. */
  meetingDetail: '/meetings/[meetingId]',
  /** A document, in the viewer: `app/documents/[documentId].tsx`. */
  document: '/documents/[documentId]',
  /** The votes waiting to be sent and the rejected ones: `app/pending-votes.tsx`. */
  pendingVotes: '/pending-votes',
  /** The sign-in form: `app/sign-in.tsx`. */
  signIn: '/sign-in',
  /** The lock screen: `app/lock.tsx`. */
  lock: '/lock',
} as const;

/** The name of each route in the stack, as expo-router derives it from the file path. */
export const ROUTE_NAMES = {
  meetings: 'index',
  meetingDetail: 'meetings/[meetingId]',
  document: 'documents/[documentId]',
  pendingVotes: 'pending-votes',
  signIn: 'sign-in',
  lock: 'lock',
} as const;

/** The dynamic segments of the routes: the name inside the brackets of the file name. */
export const ROUTE_PARAMS = {
  meetingId: 'meetingId',
  documentId: 'documentId',
} as const;
