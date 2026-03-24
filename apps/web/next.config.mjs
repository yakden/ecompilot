import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/auth/:path*',
        destination: 'http://localhost:3001/api/v1/auth/:path*',
      },
      {
        source: '/api/v1/analytics/:path*',
        destination: 'http://localhost:3002/api/v1/analytics/:path*',
      },
      {
        source: '/api/v1/calc/:path*',
        destination: 'http://localhost:3003/api/v1/calc/:path*',
      },
      {
        source: '/api/v1/ai/:path*',
        destination: 'http://localhost:3004/api/v1/ai/:path*',
      },
      {
        source: '/api/v1/suppliers/:path*',
        destination: 'http://localhost:3005/api/v1/suppliers/:path*',
      },
      {
        source: '/api/v1/inventory/:path*',
        destination: 'http://localhost:3017/api/v1/inventory/:path*',
      },
      {
        source: '/api/v1/billing/:path*',
        destination: 'http://localhost:3006/api/v1/billing/:path*',
      },
      {
        source: '/api/v1/content/:path*',
        destination: 'http://localhost:3007/api/v1/content/:path*',
      },
      {
        source: '/api/v1/legal/:path*',
        destination: 'http://localhost:3008/api/v1/legal/:path*',
      },
      {
        source: '/api/v1/academy/:path*',
        destination: 'http://localhost:3009/api/v1/academy/:path*',
      },
      {
        source: '/api/v1/community/:path*',
        destination: 'http://localhost:3010/api/v1/community/:path*',
      },
      {
        source: '/api/v1/notifications/:path*',
        destination: 'http://localhost:3011/api/v1/notifications/:path*',
      },
      {
        source: '/api/v1/marketplace/:path*',
        destination: 'http://localhost:3012/api/v1/marketplace/:path*',
      },
      {
        source: '/api/v1/logistics/:path*',
        destination: 'http://localhost:3013/api/v1/logistics/:path*',
      },
      {
        source: '/api/v1/ksef/:path*',
        destination: 'http://localhost:3014/api/v1/ksef/:path*',
      },
      {
        source: '/api/v1/payment-reconciliation/:path*',
        destination: 'http://localhost:3015/api/v1/payment-reconciliation/:path*',
      },
    ];
  },
};

export default withNextIntl(nextConfig);
