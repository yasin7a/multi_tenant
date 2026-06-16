import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN || "http://localhost:9097";
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/internal/:path*", destination: `${apiOrigin}/internal/:path*` },
      { source: "/auth/:path*", destination: `${apiOrigin}/auth/:path*` },
      { source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
