/**
 * Parsing for the capsule URL fragment.
 *
 * Two secrets ride in the fragment, and neither may ever reach the server:
 *
 *   #t=<access token>   authorises the read (RLS compares it to access_token)
 *   #key=<AES key>      decrypts the letter once it is unlocked
 *
 * The token used to travel as `?t=`, which works but puts it in every access
 * log that records query strings. Fragments are stripped by the browser before
 * the request is sent, so moving it here keeps it out of logs entirely — and
 * out of Referer, which `Referrer-Policy: no-referrer` already covered.
 *
 * Callable only in the browser: on the server `window` does not exist and the
 * fragment was never transmitted in the first place.
 */
export type CapsuleFragment = { token: string | null; key: string | null }

export function readCapsuleFragment(hash: string): CapsuleFragment {
  // Tolerate the leading '#' and an accidental '?'-style separator.
  const params = new URLSearchParams(hash.replace(/^[#?]+/, ''))
  const clean = (v: string | null) => (v && /^[A-Za-z0-9_-]+$/.test(v) ? v : null)
  return { token: clean(params.get('t')), key: clean(params.get('key')) }
}

/** Reads the fragment of the current document. Browser only. */
export function readCurrentFragment(): CapsuleFragment {
  if (typeof window === 'undefined') return { token: null, key: null }
  return readCapsuleFragment(window.location.hash)
}
