import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // Source maps for the prerender pass are on by default and cost a lot of
  // memory for something only useful when debugging that pass.
  enablePrerenderSourceMaps: false,
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    // Build workers are sized from the host's core count, and each one holds a
    // full module graph. A build machine with sixteen cores therefore needs
    // sixteen times the memory of a laptop for the same twenty-four routes,
    // which is how a build that peaks at 2.6 GB locally runs out of 8 GB on a
    // hosted runner.
    cpus: 2,
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }] },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
};

export default nextConfig;
