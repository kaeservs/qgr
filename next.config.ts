import type { NextConfig } from 'next';

const config: NextConfig = {
  devIndicators: false,
  // The dashboard is never framed by another site, responses are read as the
  // type they declare, and links out do not carry the page they left.
  headers: () =>
    Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
        ],
      },
    ]),
};

export default config;
