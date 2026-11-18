import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// GitHub Pages では https://<ユーザー名>.github.io/seoul-life/ で公開されるため、base をリポジトリ名に合わせる。
export default defineConfig({
  base: '/seoul-life/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
