/**
 * @type {import('next').NextConfig}
 *
 * Memory-conscious: SWC minifier, no heavy build-time optimizations.
 * Backend API URL is taken from env and used only on the server.
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['@repo/shared-ts'],
  },
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
