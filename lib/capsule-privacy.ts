/**
 * Who may read a capsule's contents.
 *
 * A capsule's message, AI letter and oracle hint belong to the person who wrote
 * it. The only two ways to read one are to be its author, or for the author to
 * have published it. Being a platform admin is deliberately NOT a way in — the
 * matching RLS policy (tl_capsules_read) enforces the same rule in the database,
 * so an operator cannot read users' letters through the app or through a query.
 */
export function canViewCapsuleContents(opts: {
  isOwner: boolean
  isPublic: boolean | null | undefined
}): boolean {
  return opts.isOwner || opts.isPublic === true
}
