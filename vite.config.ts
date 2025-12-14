import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import { existsSync, rmSync } from 'fs'

// 插件：生成 MediaPipe 资源的 data URI 映射并内联到 JS 中
const generateMediaPipeDataUriMap = () => {
  return {
    name: 'generate-mediapipe-datauri-map',
    closeBundle() {
      const handsDir = resolve(__dirname, 'dist/node_modules/@mediapipe/hands')
      if (!existsSync(handsDir)) return

      const files = readdirSync(handsDir)
      const dataUriMap: Record<string, string> = {}

      for (const file of files) {
        const filePath = join(handsDir, file)
        const stat = statSync(filePath)
        if (stat.isFile() && file !== 'hands.js') {
          try {
            const buffer = readFileSync(filePath)
            const base64 = buffer.toString('base64')
            let mime = 'application/octet-stream'
            if (file.endsWith('.wasm')) mime = 'application/wasm'
            else if (file.endsWith('.js')) mime = 'application/javascript'
            else if (file.endsWith('.binarypb')) mime = 'application/octet-stream'
            else if (file.endsWith('.tflite')) mime = 'application/octet-stream'
            else if (file.endsWith('.pb')) mime = 'application/octet-stream'
            else if (file.endsWith('.data')) mime = 'application/octet-stream'

            dataUriMap[file] = `data:${mime};base64,${base64}`
          } catch (e) {
            console.warn(`无法处理文件 ${file}:`, e)
          }
        }
      }

      // 生成一个 JS 文件，将映射暴露到全局
      const mapJsPath = resolve(__dirname, 'dist/mediapipe-datauri-map.js')
      const mapJsContent = `// MediaPipe Data URI 映射（构建时生成）
window.MEDIAPIPE_DATA_URI_MAP = ${JSON.stringify(dataUriMap, null, 2)};`
      writeFileSync(mapJsPath, mapJsContent, 'utf-8')
      console.log(`✓ 已生成 MediaPipe data URI 映射 (${Object.keys(dataUriMap).length} 个文件)`)
    }
  }
}

// 插件：修改 MediaPipe hands.js，注入 fetch polyfill 以支持 data URI
const patchMediaPipeHands = () => {
  return {
    name: 'patch-mediapipe-hands',
    closeBundle() {
      const handsJsPath = resolve(__dirname, 'dist/node_modules/@mediapipe/hands/hands.js')
      if (!existsSync(handsJsPath)) return

      let handsJs = readFileSync(handsJsPath, 'utf-8')

      // 在文件开头注入 fetch polyfill，用于处理 data URI 和 file:// 协议
      const fetchPolyfill = `
// MediaPipe Data URI Fetch Polyfill (构建时注入)
(function() {
  const originalFetch = window.fetch || fetch;
  const dataUriFetch = function(url, options) {
    // 检查是否是 data URI
    if (typeof url === 'string' && url.startsWith('data:')) {
      return new Promise(function(resolve, reject) {
        try {
          // 解析 data URI
          const commaIndex = url.indexOf(',');
          if (commaIndex === -1) {
            reject(new Error('Invalid data URI'));
            return;
          }
          const header = url.substring(0, commaIndex);
          const data = url.substring(commaIndex + 1);
          
          // 检查是否是 base64 编码
          const isBase64 = header.includes('base64');
          let binaryString;
          
          if (isBase64) {
            // Base64 解码
            binaryString = atob(data);
          } else {
            // URL 解码
            binaryString = decodeURIComponent(data);
          }
          
          // 转换为 ArrayBuffer
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // 创建 Response 对象
          const response = new Response(bytes.buffer, {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
            }
          });
          
          resolve(response);
        } catch (e) {
          reject(e);
        }
      });
    }
    
    // 检查是否是 file:// 协议，且存在 data URI 映射
    if (typeof url === 'string' && url.startsWith('file://') && typeof window !== 'undefined' && window.MEDIAPIPE_DATA_URI_MAP) {
      // 从 file:// 路径中提取文件名
      const fileName = url.split('/').pop();
      const dataUri = window.MEDIAPIPE_DATA_URI_MAP[fileName];
      
      if (dataUri) {
        // 如果找到对应的 data URI，使用它
        return dataUriFetch(dataUri, options);
      }
    }
    
    // 不是 data URI 或 file:// 协议，使用原始的 fetch
    return originalFetch.apply(this, arguments);
  };
  
  // 替换全局 fetch（如果存在）
  if (typeof window !== 'undefined') {
    window.fetch = dataUriFetch;
  }
  // 在 Worker 环境中也替换
  if (typeof self !== 'undefined' && self !== window) {
    self.fetch = dataUriFetch;
  }
})();
`

      // 添加 importScripts polyfill（用于 Worker 环境）
      const importScriptsPolyfill = `
// MediaPipe Data URI importScripts Polyfill (构建时注入)
(function() {
  if (typeof importScripts !== 'undefined') {
    const originalImportScripts = importScripts;
    const dataUriImportScripts = function() {
      const scripts = Array.from(arguments);
      for (let i = 0; i < scripts.length; i++) {
        const url = scripts[i];
        // 检查是否是 data URI
        if (typeof url === 'string' && url.startsWith('data:')) {
          try {
            // 直接解析 data URI
            const commaIndex = url.indexOf(',');
            if (commaIndex === -1) {
              throw new Error('Invalid data URI');
            }
            const header = url.substring(0, commaIndex);
            const data = url.substring(commaIndex + 1);
            
            // 检查是否是 base64 编码
            const isBase64 = header.includes('base64');
            let code;
            
            if (isBase64) {
              // Base64 解码
              code = atob(data);
            } else {
              // URL 解码
              code = decodeURIComponent(data);
            }
            
            // 在 Worker 中执行代码
            eval(code);
          } catch (e) {
            throw new Error('Failed to load script from data URI: ' + e.message);
          }
        } else {
          // 不是 data URI，使用原始的 importScripts
          originalImportScripts(url);
        }
      }
    };
    // 替换全局 importScripts
    if (typeof self !== 'undefined') {
      self.importScripts = dataUriImportScripts;
    }
  }
})();
`

      // 在文件开头注入 polyfill（在第一个函数或变量声明之前）
      // 查找第一个非注释、非空行的位置
      const firstLineMatch = handsJs.match(/^(?:\s*\/\/[^\n]*\n|\s*\/\*[\s\S]*?\*\/\s*\n|\s*\n)*/);
      const insertPosition = firstLineMatch ? firstLineMatch[0].length : 0;

      handsJs = handsJs.slice(0, insertPosition) + fetchPolyfill + '\n' + importScriptsPolyfill + '\n' + handsJs.slice(insertPosition);

      writeFileSync(handsJsPath, handsJs, 'utf-8')
      console.log('✓ 已在 MediaPipe hands.js 中注入 fetch polyfill')
    }
  }
}

// 插件：在 HTML 中注入 data URI 映射脚本
const injectDataUriMap = () => {
  return {
    name: 'inject-datauri-map',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist/index.html')
      if (!existsSync(htmlPath)) return

      let html = readFileSync(htmlPath, 'utf-8')
      const mapJsPath = resolve(__dirname, 'dist/mediapipe-datauri-map.js')

      if (existsSync(mapJsPath)) {
        // 移除所有已存在的 mediapipe-datauri-map.js 脚本标签
        html = html.replace(/<script[^>]*src=["']\.\/mediapipe-datauri-map\.js["'][^>]*><\/script>\s*/gi, '')

        // 在第一个 script 标签之前插入映射脚本（只插入一次）
        const scriptTag = '<script src="./mediapipe-datauri-map.js"></script>'
        if (!html.includes(scriptTag)) {
          html = html.replace(
            /(<head>[\s\S]*?)(<script[^>]*src)/,
            `$1    ${scriptTag}\n    $2`
          )
        }

        writeFileSync(htmlPath, html, 'utf-8')
        console.log('✓ 已在 HTML 中注入 data URI 映射脚本')
      }
    }
  }
}

// 插件：移除 HTML 中的 type="module" 以支持 file:// 协议
const removeModuleType = () => {
  return {
    name: 'remove-module-type',
    closeBundle() {
      const htmlPath = resolve(__dirname, 'dist/index.html')
      let html = readFileSync(htmlPath, 'utf-8')
      // 移除 type="module" 和 crossorigin 属性
      html = html.replace(/<script type="module" crossorigin/g, '<script')
      html = html.replace(/<script type="module"/g, '<script')


      writeFileSync(htmlPath, html, 'utf-8')
    }
  }
}

// 插件：排除 videos 目录
const excludeVideos = () => {
  return {
    name: 'exclude-videos',
    closeBundle() {
      const videosPath = resolve(__dirname, 'dist/videos')
      if (existsSync(videosPath)) {
        rmSync(videosPath, { recursive: true, force: true })
        console.log('✓ 已排除 videos 目录')
      }
    }
  }
}


export default defineConfig({
  base: './', // 使用相对路径，支持直接打开 HTML 文件
  server: {
    port: 3000,
    open: true
  },
  optimizeDeps: {
    exclude: ['@mediapipe/hands', '@mediapipe/camera_utils', '@mediapipe/drawing_utils', '@mediapipe/control_utils']
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@mediapipe/hands/*.{wasm,js,data,tflite,pb,binarypb}',
          dest: 'node_modules/@mediapipe/hands'
        },
        {
          src: 'node_modules/@mediapipe/camera_utils/*.js',
          dest: 'node_modules/@mediapipe/camera_utils'
        },
        {
          src: 'node_modules/@mediapipe/drawing_utils/*.js',
          dest: 'node_modules/@mediapipe/drawing_utils'
        }
      ]
    }),
    removeModuleType(),
    excludeVideos(),
    generateMediaPipeDataUriMap(),
    injectDataUriMap(),
    patchMediaPipeHands()
  ],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        format: 'iife', // 使用 IIFE 格式，支持 file:// 协议
        entryFileNames: 'assets/index-[hash].js',
        inlineDynamicImports: true // 内联所有动态导入
      }
    }
  }
})
