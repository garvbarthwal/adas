/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_BASE_URL?: string;
  readonly VITE_WEBRTC_URL?: string;
  readonly VITE_CAMERA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
