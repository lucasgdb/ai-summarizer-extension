interface ImportMetaEnv {
  readonly WXT_API_URL?: string;
  readonly WXT_GOOGLE_CLIENT_ID?: string;
  /** The website, for its links and the uninstall survey (default: the real one) */
  readonly WXT_PORTFOLIO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite's "?url" imports (e.g. the pdf.js worker): the bundled file's URL
declare module "*?url" {
  const url: string;
  export default url;
}

/** Set per build in wxt.config.ts (vite define) */
declare const __BRIDGE_BUILD__: string;
