import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev server access from local network
  allowedDevOrigins: [
    '10.0.0.161',
    'http://10.0.0.161',
    'http://10.0.0.161:3000',
    'localhost',
    'http://localhost',
    'http://localhost:3000',
  ],
};

export default nextConfig;
