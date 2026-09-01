const localAuth = process.env.NEXT_PUBLIC_AUTH_MODE === "local";
const pythonApiBaseUrl = process.env.PYTHON_API_BASE_URL || "http://127.0.0.1:8765";

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    if (!localAuth) return [];
    return {
      beforeFiles: [
        {
          source: "/api/:endpoint(login|logout|session|dashboard)",
          destination: `${pythonApiBaseUrl}/api/:endpoint`
        },
        {
          source: "/api/mail/:endpoint(settings|messages|imports)",
          destination: `${pythonApiBaseUrl}/api/mail/:endpoint`
        },
        {
          source: "/api/logistics/jobs",
          destination: `${pythonApiBaseUrl}/api/logistics/jobs`
        },
        {
          source: "/api/integrations/sagyou/sync",
          destination: `${pythonApiBaseUrl}/api/integrations/sagyou/sync`
        },
        {
          source: "/api/inventory/:path*",
          destination: `${pythonApiBaseUrl}/api/inventory/:path*`
        },
        {
          source: "/api/inventory",
          destination: `${pythonApiBaseUrl}/api/inventory`
        },
        {
          source: "/static/:path*",
          destination: `${pythonApiBaseUrl}/static/:path*`
        }
      ]
    };
  }
};

export default nextConfig;
