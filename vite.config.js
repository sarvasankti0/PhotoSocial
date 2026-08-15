import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Force revalidation of every module so a stale browser cache can never
// serve an old firebase/dep bundle during development.
function noStore() {
  return {
    name: "no-store-cache",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
      });
    },
  };
}

// The preview proxy caches JS modules for hours (max-age=14400), so a browser
// can end up running old modules that break Firebase (e.g. "Expected first
// argument to collection()..."). Stamping every app module URL with a unique
// token per dev-server start forces the browser/proxy to fetch fresh modules.
function cacheBustVersion() {
  let stamp;
  return {
    name: "cache-bust-version",
    apply: "serve",
    configResolved() {
      stamp = Date.now();
    },
    transformIndexHtml(html) {
      return html.replace(
        /(<script\s+type="module"\s+src=")(\.?\/?src\/main\.jsx)(")/,
        (_m, pre, src, post) => `${pre}${src}?v=${stamp}${post}`
      );
    },
    // Stamp every app module import with ?v= so each server start yields fresh
    // URLs (the preview proxy caches JS for hours and can otherwise serve a
    // stale bundle where Firebase `db` is undefined). Runs on both the
    // pre-analysis source (relative specifiers) and post-analysis output
    // (absolute /src/ specifiers); query params survive Vite's resolution.
    transform(code, id) {
      if (!/^[^?]*\/src\//.test(id) && !id.startsWith("/src/")) return;
      return code.replace(
        /\b(from\s+|import\s*\(|import\s+)(["'])([^"']+)(["'])/g,
        (_m, kw, q, spec, q2) => {
          if (spec.startsWith("/@") || spec.startsWith("/node_modules")) return _m;
          if (spec.includes("?")) return _m;
          if (!(spec.startsWith("/src/") || spec.startsWith("./") || spec.startsWith("../"))) return _m;
          return `${kw}${q}${spec}?v=${stamp}${q2}`;
        }
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), noStore(), cacheBustVersion()],
  // Absolute base so JS/CSS assets resolve from the domain root regardless of
  // the current route. A relative base ("./") breaks deep links like
  // /post/:code — the browser resolves "./assets/..." against the deep URL and
  // loads a 404 / the wrong file. The app is always served at the root.
  base: "/",
  server: {
    port: 5173,
    allowedHosts: [".monkeycode-ai.live"],
  },
});
