/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // 'standalone' creates a self-contained build for containerized deployments (Docker, K8s, etc.)
    // Useful for future cloud/SaaS version. For self-hosted, this is optional but doesn't hurt.
    output: 'standalone',
    experimental: {
        // Required for the background scheduler that runs prompt executions
        instrumentationHook: true,
    },
};

module.exports = nextConfig;