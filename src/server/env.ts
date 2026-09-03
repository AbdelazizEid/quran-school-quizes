// Load .env before anything else — the custom server bypasses Next's env loading
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
