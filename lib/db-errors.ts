/**
 * Turns a Postgres/PostgREST error into something a person can act on.
 *
 * The reported bug was not only that capsule creation failed — it was that the
 * raw constraint error reached the screen. `insert or update on table
 * "timelock_capsules" violates foreign key constraint
 * "timelock_capsules_user_id_fkey"` tells the author nothing about what to do,
 * and leaks the schema while it is at it.
 *
 * Anything unrecognised gets a generic message rather than the driver's text,
 * so a new failure mode cannot start leaking internals by default.
 */
export function humanizeDbError(
  error: { code?: string; message?: string } | null | undefined,
  fallback = 'Something went wrong. Please try again.'
): string {
  switch (error?.code) {
    case '23503': // foreign_key_violation
      return 'We could not finish setting up your TimeLock account. Please try again — if it keeps happening, sign out and back in.'
    case '23505': // unique_violation
      return 'That already exists.'
    case '23514': // check_violation
      return "Some of that doesn't look right — check the dates and lengths and try again."
    case '23502': // not_null_violation
      return 'Something required was missing. Please fill in every field and try again.'
    case '42501': // insufficient_privilege
    case 'PGRST301': // RLS returned no rows / not authorised
      return 'You do not have permission to do that.'
    case 'P0001': // raise_exception — our own triggers speak plainly already
      return error?.message?.replace(/^.*:\s*/, '') || fallback
    case '57014': // query_canceled
    case '08006': // connection_failure
    case '08003':
      return 'The database is not responding right now. Please try again in a moment.'
    default:
      return fallback
  }
}
