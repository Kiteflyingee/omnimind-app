import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/chat',
        destination: 'http://127.0.0.1:8000/chat',
      },
      {
        source: '/login',
        destination: 'http://127.0.0.1:8000/login',
      },
      {
        source: '/chat/reset',
        destination: 'http://127.0.0.1:8000/chat/reset',
      },
      {
        source: '/sessions/:path*',
        destination: 'http://127.0.0.1:8000/sessions/:path*',
      },
      {
        source: '/history/:path*',
        destination: 'http://127.0.0.1:8000/history/:path*',
      },
      {
        source: '/rules/:path*',
        destination: 'http://127.0.0.1:8000/rules/:path*',
      },
      {
        source: '/rules',
        destination: 'http://127.0.0.1:8000/rules',
      },
    ];
  },
};

export default nextConfig;
