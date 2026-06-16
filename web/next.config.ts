import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: [
    "localhost",
    "lvh.me",
    "*.lvh.me",
    "multi.takitahmid.com",
    "*.multi.takitahmid.com",
  ],
};

export default nextConfig;
