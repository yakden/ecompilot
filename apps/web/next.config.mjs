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
    const p = (name, fallback) => process.env[name] || fallback;
    return [
      { source: '/api/v1/auth/:path*', destination: `http://${h}:${p('AUTH_SERVICE_PORT', '3001')}/api/v1/auth/:path*` },
      { source: '/api/v1/analytics/:path*', destination: `http://${h}:${p('ANALYTICS_SERVICE_PORT', '3002')}/api/v1/analytics/:path*` },
      { source: '/api/v1/calc/:path*', destination: `http://${h}:${p('CALC_SERVICE_PORT', '3003')}/api/v1/calc/:path*` },
      { source: '/api/v1/ai/:path*', destination: `http://${h}:${p('AI_SERVICE_PORT', '3004')}/api/v1/ai/:path*` },
      { source: '/api/v1/suppliers/:path*', destination: `http://${h}:${p('SUPPLIERS_SERVICE_PORT', '3005')}/api/v1/suppliers/:path*` },
      { source: '/api/v1/inventory/:path*', destination: `http://${h}:${p('INVENTORY_SERVICE_PORT', '3017')}/api/v1/inventory/:path*` },
      { source: '/api/v1/billing/:path*', destination: `http://${h}:${p('BILLING_SERVICE_PORT', '3006')}/api/v1/billing/:path*` },
      { source: '/api/v1/content/:path*', destination: `http://${h}:${p('CONTENT_SERVICE_PORT', '3007')}/api/v1/content/:path*` },
      { source: '/api/v1/legal/:path*', destination: `http://${h}:${p('LEGAL_SERVICE_PORT', '3008')}/api/v1/legal/:path*` },
      { source: '/api/v1/academy/:path*', destination: `http://${h}:${p('ACADEMY_SERVICE_PORT', '3009')}/api/v1/academy/:path*` },
      { source: '/api/v1/community/:path*', destination: `http://${h}:${p('COMMUNITY_SERVICE_PORT', '3010')}/api/v1/community/:path*` },
      { source: '/api/v1/notifications/:path*', destination: `http://${h}:${p('NOTIFICATION_SERVICE_PORT', '3011')}/api/v1/notifications/:path*` },
      { source: '/api/v1/marketplace/:path*', destination: `http://${h}:${p('MARKETPLACE_HUB_PORT', '3012')}/api/v1/marketplace/:path*` },
      { source: '/api/v1/logistics/:path*', destination: `http://${h}:${p('LOGISTICS_ENGINE_PORT', '3013')}/api/v1/logistics/:path*` },
      { source: '/api/v1/ksef/:path*', destination: `http://${h}:${p('KSEF_SERVICE_PORT', '3014')}/api/v1/ksef/:path*` },
      { source: '/api/v1/payment-reconciliation/:path*', destination: `http://${h}:${p('PAYMENT_RECONCILIATION_PORT', '3015')}/api/v1/payment-reconciliation/:path*` },
    ];
  },
};

export default withNextIntl(nextConfig);
