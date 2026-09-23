/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_PUBLIC_BASE_URL?: string
  readonly VITE_QA_APP_LOGIN?: string
  readonly VITE_QA_MP_CREDENTIAL?: string
  readonly VITE_QA_READER_SAMPLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
