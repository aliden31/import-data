import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // ESLint is not available in some deployment environments. Allow the build to
    // proceed without it so that type checking can still verify the codebase.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: config => {
    // The Genkit SDK optionally imports tracing exporters and Firebase bindings.
    // They are not required for this project, so mark them as external to avoid
    // bundling warnings when the packages are not installed.
    config.externals = config.externals || [];
    config.externals.push({
      '@opentelemetry/exporter-jaeger': 'commonjs @opentelemetry/exporter-jaeger',
      '@genkit-ai/firebase': 'commonjs @genkit-ai/firebase',
      handlebars: 'commonjs handlebars',
    });
    return config;
  },
};

export default nextConfig;
