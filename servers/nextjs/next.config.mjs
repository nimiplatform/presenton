import path from "node:path";
import { fileURLToPath } from "node:url";

const nextjsRoot = path.dirname(fileURLToPath(import.meta.url));
const isElectronBuild = process.env.PRESENTON_ELECTRON_BUILD === "true";

const nextConfig = {
  reactStrictMode: false,
  distDir: process.env.NODE_ENV === "production" ? ".next-production" : ".next-build",
  output: "standalone",
  // Text repair, icon indexing and media Jobs outlive Next's 30-second proxy
  // default. Keep the supervised business stream connected with a finite budget.
  experimental: { proxyTimeout: 600_000 },
  outputFileTracingRoot: path.resolve(nextjsRoot, "../.."),
  // Next traces pnpm's hoisted semver alias without its target package. Include
  // the installed target so the standalone server has no dangling dependency.
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/semver@*/node_modules/semver/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["../../.nimi/**/*", "../../.cache/**/*", "../fastapi/**/*",
      "../../resources/**/*", "../../electron/**/*", "../../presentation-export/**/*"],
  },
  async headers() {
    // Sandboxed template previews have an opaque origin. These bundled fonts
    // are public assets; business data and APIs keep their Host access checks.
    return [{ source: "/vendor/fonts/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
  turbopack: {
    root: path.resolve(nextjsRoot, "../.."),
  },
  ...(process.env.NODE_ENV !== "production"
    ? {
        allowedDevOrigins: [
          "127.0.0.1",
          "localhost",
        ],
      }
    : {}),

  images: {
    // A packaged Electron app is installed under a read-only directory such as
    // /opt/Presenton. Next's optimizer writes to <distDir>/cache, so emit direct
    // image URLs for that build instead of attempting runtime cache writes.
    unoptimized: isElectronBuild,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-7c765f3726084c52bcd5d180d51f1255.r2.dev",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "pptgen-public.s3.ap-south-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "img.icons8.com",
      },
      {
        protocol: "https",
        hostname: "present-for-me.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "yefhrkuqbjcblofdcpnr.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
      },
    ],
  },
  
};

export default nextConfig;
