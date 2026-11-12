import type { NextConfig } from "next";

/**
 * The security headers.
 *
 * The dashboard is a public deployment: anybody can read the run's metrics.
 * That is the point — but it must not also be framable by a third-party
 * site, sniffable, or free to load anything it likes. These headers are the
 * cheap, boring, effective half of that.
 *
 * `frame-ancestors 'none'` is the modern `X-Frame-Options: DENY`;
 * `nosniff` stops the browser from guessing a MIME type;
 * `Referrer-Policy` keeps the URL (which contains no secret, but still)
 * from leaking to third parties.
 *
 * The CSP keeps `'unsafe-inline'` for `style-src` (the components carry
 * their own `<style>` blocks) and for `script-src` (Next.js injects its
 * bootstrap inline). It still removes the dangerous parts: no `object`, no
 * `base`, no framing, and no connection anywhere but the Hub.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://huggingface.co",
  "font-src 'self' data:",
  "connect-src 'self' https://huggingface.co https://*.huggingface.co",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // the snapshot is a static artefact; nothing here is a secret
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
