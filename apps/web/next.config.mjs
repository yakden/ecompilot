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
  webpack: (config) => {
    // Resolve @opentelemetry/api to Next.js built-in version to prevent clientModules crash
    config.resolve.alias = {
      ...config.resolve.alias,
      '@opentelemetry/api': 'next/dist/compiled/@opentelemetry/api',
    };
    return config;
  },
  async rewrites() {
    const h = process.env.API_HOST || 'localhost';
    const svc = (envHost, envPort, defaultHost, defaultPort) => {
      const host = process.env[envHost] || defaultHost || h;
      const port = process.env[envPort] || defaultPort;
      return `http://${host}:${port}`;
    };
    return [
      { source: '/api/v1/auth/:path*', destination: `${svc('AUTH_SERVICE_HOST', 'AUTH_SERVICE_PORT', null, '3001')}/api/v1/auth/:path*` },
      { source: '/api/v1/analytics/:path*', destination: `${svc('ANALYTICS_SERVICE_HOST', 'ANALYTICS_SERVICE_PORT', null, '3002')}/api/v1/analytics/:path*` },
      { source: '/api/v1/calc/:path*', destination: `${svc('CALC_SERVICE_HOST', 'CALC_SERVICE_PORT', null, '3003')}/api/v1/calc/:path*` },
      { source: '/api/v1/ai/:path*', destination: `${svc('AI_SERVICE_HOST', 'AI_SERVICE_PORT', null, '3004')}/api/v1/ai/:path*` },
      { source: '/api/v1/suppliers/:path*', destination: `${svc('SUPPLIERS_SERVICE_HOST', 'SUPPLIERS_SERVICE_PORT', null, '3005')}/api/v1/suppliers/:path*` },
      { source: '/api/v1/inventory/:path*', destination: `${svc('INVENTORY_SERVICE_HOST', 'INVENTORY_SERVICE_PORT', null, '3017')}/api/v1/inventory/:path*` },
      { source: '/api/v1/billing/:path*', destination: `${svc('BILLING_SERVICE_HOST', 'BILLING_SERVICE_PORT', null, '3006')}/api/v1/billing/:path*` },
      { source: '/api/v1/content/:path*', destination: `${svc('CONTENT_SERVICE_HOST', 'CONTENT_SERVICE_PORT', null, '3007')}/api/v1/content/:path*` },
      { source: '/api/v1/legal/:path*', destination: `${svc('LEGAL_SERVICE_HOST', 'LEGAL_SERVICE_PORT', null, '3008')}/api/v1/legal/:path*` },
      { source: '/api/v1/academy/:path*', destination: `${svc('ACADEMY_SERVICE_HOST', 'ACADEMY_SERVICE_PORT', null, '3009')}/api/v1/academy/:path*` },
      { source: '/api/v1/community/:path*', destination: `${svc('COMMUNITY_SERVICE_HOST', 'COMMUNITY_SERVICE_PORT', null, '3010')}/api/v1/community/:path*` },
      { source: '/api/v1/notifications/:path*', destination: `${svc('NOTIFICATION_SERVICE_HOST', 'NOTIFICATION_SERVICE_PORT', null, '3011')}/api/v1/notifications/:path*` },
      { source: '/api/v1/marketplace/:path*', destination: `${svc('MARKETPLACE_HUB_HOST', 'MARKETPLACE_HUB_PORT', null, '3012')}/api/v1/marketplace/:path*` },
      { source: '/api/v1/logistics/:path*', destination: `${svc('LOGISTICS_ENGINE_HOST', 'LOGISTICS_ENGINE_PORT', null, '3013')}/api/v1/logistics/:path*` },
      { source: '/api/v1/ksef/:path*', destination: `${svc('KSEF_SERVICE_HOST', 'KSEF_SERVICE_PORT', null, '3014')}/api/v1/ksef/:path*` },
      { source: '/api/v1/payment-reconciliation/:path*', destination: `${svc('PAYMENT_RECONCILIATION_HOST', 'PAYMENT_RECONCILIATION_PORT', null, '3015')}/api/v1/payment-reconciliation/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
