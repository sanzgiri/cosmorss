import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // Only expose the dev server to LAN origins in development.
  ...(isDev && {
    allowedDevOrigins: [
      "10.0.0.161",
      "http://10.0.0.161",
      "http://10.0.0.161:3000",
      "localhost",
      "http://localhost",
      "http://localhost:3000",
    ],
  }),
};

export default nextConfig;
