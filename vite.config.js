import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifestProd from './manifest.json' with { type: 'json' }
import manifestDev from './manifest.dev.json' with { type: 'json' }

export default defineConfig(({ mode }) => {
  // Use dev manifest for development builds (no key = different extension ID)
  // Use prod manifest for production builds
  const manifest = mode === 'development' ? manifestDev : manifestProd
  
  return {
    plugins: [crx({ manifest })],
  }
})