import type { NextConfig } from "next";

// Supabase is contacted directly from the browser, so it has to be allowed as
// a connect-src. 'unsafe-inline' on styles is required by Tailwind's runtime
// style injection; scripts stay strict apart from Next's hydration inline
// bootstrap, which needs 'unsafe-inline' in the absence of nonce plumbing.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseOrigin} https://*.supabase.co`.trim(),
  "upgrade-insecure-requests",
].join('; ')

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Capsule links carry secrets. no-referrer guarantees a reveal link
          // is never handed to a third party, even if one is ever linked out.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ]
  },
};

export default nextConfig;
