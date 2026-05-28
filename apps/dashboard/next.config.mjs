/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required for WebSocket API routes
    serverComponentsExternalPackages: ["ioredis", "ws"],
  },
  webpack(config) {
    // Allow Three.js to bundle correctly
    config.externals = config.externals ?? [];
    return config;
  },
};

export default nextConfig;
