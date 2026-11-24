import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// GitHub Pages では https://<ユーザー名>.github.io/seoul-life/ で公開されるため、base をリポジトリ名に合わせる。
export default defineConfig({
  base: '/seoul-life/',
  plugins: [
    react(),
    // PWA（ホーム画面への追加・オフラインでの起動。GAME_SPEC 10-1・10-6。Phase 4 計画 Q10〜Q13）
    VitePWA({
      // 新しい版を見つけても勝手に読み直さず、画面で「更新する」を押してもらう（Q12。src/pwa/pwa.ts）
      registerType: 'prompt',
      // 登録は src/pwa/pwa.ts で行う（更新の知らせを画面に出すため）
      injectRegister: false,
      manifest: {
        name: '서울에서 살기 — ソウルで暮らそう！',
        short_name: '서울에서 살기',
        description: 'ソウルの街で暮らしながら韓国語を身につける、日本語話者向けのライフシミュレーションゲーム',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8f3ec',
        theme_color: '#f8f3ec',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // ゲーム本体・絵・効果音を端末に保存する。BGM（約15MB）は保存しない（Q11。オフラインでは BGM なしで遊ぶ）
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico}', 'audio/sfx/*.mp3'],
        // アイコンは manifest の分を vite-plugin-pwa が足すので、ここでは数えない（二重に入れない）。ほかは vite-plugin-pwa の初期値
        globIgnores: ['**/node_modules/**', 'sw.js', 'workbox-*.js', 'icons/**'],
        // 絵・音の URL には、差し替えたときのための ?v=… が付いている。保存したファイルと同じものとして扱う
        ignoreURLParametersMatching: [/^v$/],
        cleanupOutdatedCaches: true,
        // ゲーム本体（JS）は 1MB 近いので、上限を上げる
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
