import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "wxt";

// pdf.js needs Adobe's CMaps to extract text from CID-font PDFs (CJK and
// some others). Copied from the package at build time, not kept in public/
const pdfjsDir = dirname(
  createRequire(import.meta.url).resolve("pdfjs-dist/package.json"),
);
const cmapsDir = join(pdfjsDir, "cmaps");

export default defineConfig({
  srcDir: "src",
  // Manifest V3 everywhere (WXT's default for Firefox is still V2)
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  // Explicit imports (#imports) read better than globals
  imports: false,
  hooks: {
    "build:publicAssets": (_wxt, files) => {
      for (const file of readdirSync(cmapsDir)) {
        files.push({
          absoluteSrc: join(cmapsDir, file),
          relativeDest: `pdfjs/cmaps/${file}`,
        });
      }
    },
  },
  vite: () => ({
    plugins: [tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
    define: {
      // Tells one build's page script from another's: a tab opened before an
      // update keeps the old one installed, which lacks the newer messages
      __BRIDGE_BUILD__: JSON.stringify(Date.now().toString(36)),
    },
  }),
  // A function: WXT loads .env after importing this file. One Chromium build
  // serves Chrome, Edge, Brave, Vivaldi, Opera and Arc (what they lack is
  // detected at runtime, lib/browser-support.ts); Firefox has its own
  // (`pnpm build:firefox`), with a sidebar instead of the side panel
  manifest: ({ mode, browser }) => ({
    // Public key that pins the extension id (dndfpaedmpflakhaeiejjkmjmijfpnon)
    // for every unpacked install, so Google's redirect URI
    // https://<id>.chromiumapp.org/ stays valid. Not in the Web Store build
    // (`pnpm zip`, mode "store"): the store assigns the id itself
    key:
      mode === "store" || browser === "firefox"
        ? undefined
        : "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnRWFwer9+nwjO0FmSIEmtaK4NEIX5oxKo/r2Rd2F50eFKduyrqGX6gyWau+DSPtq254tJ1ZvtYMJyg8vNEV7O1b4Ms4qhHH0eufgwGzwrNLoGxo3+gQ62z47b0HFg+UB9nxeQmG8W6J7vDk1KwZZHU/376FozIanXGxMho8Cb/Rqpb4eGLC9R+sgyLqlqjpJkuLBqQYxTNFT7/VsPyE98KPpBb0Ji/OTQ9Cyv3GPPTC1WUU4WfLShBrj9HdfIdlC4LR45F5pqwtAGgfKeOHAdEivhfucTl9aK3vs9dsNgE+PILyjyxa3QRlI4dExxYLwLf7QqkHxY5ATP9ifWVWyFQIDAQAB",
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    // setPanelBehavior landed in Chrome 116
    minimum_chrome_version: browser === "firefox" ? undefined : "116",
    // Firefox: a fixed id (storage, Google's redirect URI
    // https://<hash>.extensions.allizom.org/ stays the same), 128+ (MV3 host
    // permissions granted at install, sidebarAction.toggle, storage.session),
    // and what it sends declared for addons.mozilla.org
    browser_specific_settings:
      browser === "firefox"
        ? {
            gecko: {
              id: "ai-summarizer@lucasbittencourt.dev",
              strict_min_version: "128.0",
              data_collection_permissions: {
                required: ["authenticationInfo", "websiteContent"],
              },
            },
          }
        : undefined,
    action: {
      default_title: "__MSG_actionTitle__",
    },
    // activeTab + scripting: the page is only read when the user asks for it.
    // activeTab expires on navigation, so the side panel can ask for host
    // access at runtime instead of declaring it at install.
    // storage: UI language, shared by the panel and the page script
    // identity: Google sign-in popup (launchWebAuthFlow), no install warning
    // favicon: the tab's icon from Chrome's cache (no request to the site)
    // (Chrome's only: Firefox shows the site's own icon, or a globe)
    permissions: [
      "activeTab",
      "scripting",
      "storage",
      "identity",
      ...(browser === "firefox" ? [] : ["favicon"]),
    ],
    optional_host_permissions: ["<all_urls>"],
    // Saving a summary's audio under its own name: asked for on the first
    // export, so it adds no warning at install
    optional_permissions: ["downloads"],
    // Only the API: extension requests to a granted host skip CORS, so the
    // API doesn't need to know the (per-install) extension id
    // Firefox gives each install a random origin (moz-extension://<uuid>),
    // which lb-auth-api's CORS can't list: there it's a host permission too
    host_permissions: [
      `${new URL(process.env.WXT_API_URL ?? "http://localhost:8080").origin}/*`,
      ...(browser === "firefox"
        ? [
            `${new URL(process.env.WXT_AUTH_API_URL ?? "http://localhost:8081").origin}/*`,
          ]
        : []),
    ],
  }),
});
