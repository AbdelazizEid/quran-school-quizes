import { fileURLToPath } from "url";
import { dirname } from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Pin root to the project dir — C:\Users\ABDELAZIZ has a stray package-lock.json
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
