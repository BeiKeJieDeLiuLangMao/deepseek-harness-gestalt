/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_ENV?: string
  readonly VITE_PLATFORM_DEVELOPMENT_ORIGIN?: string
  readonly VITE_PLATFORM_PRODUCTION_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

declare module '*.css'
