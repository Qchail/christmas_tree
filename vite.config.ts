import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    exclude: ['@mediapipe/hands', '@mediapipe/camera_utils', '@mediapipe/drawing_utils', '@mediapipe/control_utils']
  },
  build: {
    rollupOptions: {
      output: {
        // 确保 MediaPipe 的静态资源文件被正确复制
        assetFileNames: (assetInfo) => {
          // 保持 MediaPipe 相关文件的原始名称和路径结构
          if (assetInfo.name && assetInfo.name.includes('@mediapipe')) {
            return assetInfo.name;
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  }
})
