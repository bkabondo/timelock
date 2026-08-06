/**
 * Who may read a capsule's contents.
 *
 * A capsule's message, AI letter and oracle hint belong to whoever wrote it.
 * There are exactly three ways in:
 *
 *   1. You are the author.
 *   2. The author published it (`is_public`).
 *   3. It is a guest capsule and you hold its secret link.
 *
 * Guest capsules are written by logged-out visitors, so there is no identity to
 * check; an unguessable `access_token` in the URL stands in for one. The token
 * is matched server-side before the row is ever fetched.
 *
 * Being a platform admin is deliberately NOT a way in. The matching RLS policy
 * (tl_capsules_read) enforces rules 1 and 2 in the database, so an operator
 * cannot read users' letters through the app or through a query.
 */
export function canViewCapsuleContents(opts: {
  isOwner: boolean
  isPublic: boolean | null | undefined
  hasValidGuestToken?: boolean
}): boolean {
  return opts.isOwner || opts.isPublic === true || opts.hasValidGuestToken === true
}
