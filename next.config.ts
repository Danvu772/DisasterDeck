import path from "node:path";
import type { NextConfig } from "next";

// D-0001: motion stays behind demo mode. A build without DEMO_MODE=1 (production: deploy.yml and
// the VM build with DEMO_MODE=0) swaps "motion/react" for a static stand-in, so none of motion's
// code ships. Check: npm run check:bundle after such a build.
const demoBuild = process.env.DEMO_MODE === "1";

const nextConfig: NextConfig = {
  devIndicators: false, // the round "N" badge ends up in demo screenshots
  // src/app/uswds.scss loads USWDS 3 from its Sass packages.
  sassOptions: {
    includePaths: [path.join(process.cwd(), "node_modules/@uswds/uswds/packages"), path.join(process.cwd(), "src", "app")],
    quietDeps: true,
    silenceDeprecations: ["legacy-js-api", "import", "global-builtin"],
  },
  webpack(config) {
    // The webpack cache in .next/cache does not see the alias change: a build that reuses a demo
    // build's cache would ship motion. Key the cache on the mode.
    if (config.cache && typeof config.cache === "object" && config.cache.type === "filesystem") {
      config.cache = { ...config.cache, version: `${config.cache.version ?? ""}|motion:${demoBuild ? "demo" : "static"}` };
    }
    if (!demoBuild) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "motion/react$": path.join(process.cwd(), "src/components/motion/static.tsx"),
      };
    }
    return config;
  },
};

export default nextConfig;
