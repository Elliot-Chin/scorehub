/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prevent dev-mode page disposal from forcing mobile clients to re-request
  // and remount pages after a few minutes of inactivity.
  onDemandEntries: {
    maxInactiveAge: 24 * 60 * 60 * 1000,
    pagesBufferLength: 100,
  },
};

export default nextConfig;
