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
 * check; an unguessable `access_token` stands in for one. It is a bearer
 * credential — holding the link IS the authorisation — and it is checked by
 * Postgres, not here: the token travels as the `x-capsule-token` header and
 * `tl_capsules_read` compares it against the stored column.
 *
 * So this function mirrors the policy, it does not enforce it. All three rules
 * are enforced in the database, which is also why being a platform admin is
 * deliberately NOT a way in: an operator cannot read users' letters through the
 * app or through a query.
 */
export function canViewCapsuleContents(opts: {
  isOwner: boolean
  isPublic: boolean | null | undefined
  hasValidGuestToken?: boolean
}): boolean {
  return opts.isOwner || opts.isPublic === true || opts.hasValidGuestToken === true
}
