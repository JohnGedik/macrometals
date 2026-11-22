import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/*": ["./content/articles/**/*.md", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
