/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    unoptimized: true,
    domains: ['supabase.co', 'your-cdn.com'],
  },
  optimizeFonts: false,
}

module.exports = nextConfig
