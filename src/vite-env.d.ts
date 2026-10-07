/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_BACKEND?: 'mock' | 'chatwoot';
  readonly VITE_CHATWOOT_BASE?: string;
  readonly VITE_CHATWOOT_INBOX?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
