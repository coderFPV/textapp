import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${
          process.env.BACKEND_URL || "http://localhost:3001"
        }/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${
          process.env.BACKEND_URL || "http://localhost:3001"
        }/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
