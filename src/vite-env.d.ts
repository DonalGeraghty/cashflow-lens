/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth 2.0 Web client ID for Google Sheets. Optional; without it the Sheets option is hidden. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
