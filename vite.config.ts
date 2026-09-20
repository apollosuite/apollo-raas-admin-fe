import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { fileURLToPath, URL } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'
import AutoImport from 'unplugin-auto-import/vite'
import Component from 'unplugin-vue-components/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vitest/config'

const RouteGenerateExclude = ['**/components/**', '**/layouts/**', '**/data/**', '**/types/**']

export default defineConfig({
  plugins: [
    VueRouter({
      exclude: RouteGenerateExclude,
      dts: 'src/types/typed-router.d.ts',
    }),
    vue(),
    vueJsx(),
    vueDevTools({
      componentInspector: false,
    }),
    tailwindcss(),
    visualizer({ gzipSize: true, brotliSize: true }),
    Layouts({
      defaultLayout: 'default',
    }),
    AutoImport({
      include: [
        /\.[tj]sx?$/,
        /\.vue$/,
      ],
      imports: [
        'vue',
        VueRouterAutoImports,
      ],
      dirs: [
        'src/composables/**/*.ts',
        'src/constants/**/*.ts',
        'src/stores/**/*.ts',
      ],
      defaultExportByFilename: true,
      dts: 'src/types/auto-import.d.ts',
    }),
    Component({
      dirs: [
        'src/components',
      ],
      collapseSamePrefixes: true,
      directoryAsNamespace: true,
      dts: 'src/types/auto-import-components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log'],
  },
  test: {
    // Component tests mount real SFCs, so they need a DOM. jsdom was already a
    // devDependency; only the environment was missing, which is why the
    // product-table suite failed with `document is not defined`.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
