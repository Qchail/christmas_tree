import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { particleConfig } from './config.js';
import { GestureController } from './gesture.js';

console.log('Three.js 版本:', THREE.REVISION);

// ========== 照片管理系统 ==========
const MAX_PHOTOS = particleConfig.photoCards.maxPhotos || 40;
const MAX_FILE_SIZE_MB = particleConfig.photoCards.maxFileSize || 25;
const STORAGE_KEY = 'christmas_tree_photos';

// IndexedDB 配置
const DB_NAME = 'ChristmasTreeDB';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

// 照片存储管理类
class PhotoManager {
  constructor() {
    this.photos = [];
    this.db = null;
    this.initDB().then(() => {
      this.loadPhotos();
    });
  }

  // 初始化 IndexedDB
  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  // 加载照片
  async loadPhotos() {
    if (!this.db) return;

    try {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        this.photos = request.result || [];
        // 如果 IndexedDB 为空，尝试从 localStorage 迁移数据（一次性）
        if (this.photos.length === 0) {
          this.migrateFromLocalStorage();
        } else {
          this.updateUI();
          // 重新创建照片卡片
          if (window.recreatePhotoCards) {
            window.recreatePhotoCards();
          }
        }
      };
    } catch (e) {
      console.error('加载照片失败:', e);
    }
  }

  // 从 localStorage 迁移数据
  async migrateFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const photos = JSON.parse(stored);
        if (Array.isArray(photos) && photos.length > 0) {
          console.log('正在从 localStorage 迁移数据...');
          for (const photo of photos) {
            await this.addPhotoDataToDB(photo);
          }
          this.photos = photos;
          localStorage.removeItem(STORAGE_KEY); // 迁移后清除
          this.updateUI();
          if (window.recreatePhotoCards) {
            window.recreatePhotoCards();
          }
        }
      }
    } catch (e) {
      console.error('迁移数据失败:', e);
    }
  }

  // 添加照片数据到 DB (底层方法)
  addPhotoDataToDB(photo) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(photo);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // 添加照片
  async addPhoto(file) {
    if (this.photos.length >= MAX_PHOTOS) {
      alert(`最多只能上传 ${MAX_PHOTOS} 张照片`);
      return false;
    }

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return false;
    }

    // 检查文件大小
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`图片大小不能超过 ${MAX_FILE_SIZE_MB}MB`);
      return false;
    }

    try {
      // 读取文件并转换为 base64
      const base64 = await this.fileToBase64(file);

      // 压缩图片
      const compressed = await this.compressImage(base64);

      const photo = {
        id: Date.now() + Math.random(),
        data: compressed,
        name: file.name,
        uploadTime: new Date().toISOString()
      };

      await this.addPhotoDataToDB(photo);
      this.photos.push(photo);
      this.updateUI();
      return true;
    } catch (e) {
      console.error('添加照片失败:', e);
      if (e.name === 'QuotaExceededError') {
        alert('存储空间不足');
      } else {
        alert('添加照片失败，请重试');
      }
      return false;
    }
  }

  // 删除照片
  deletePhoto(id) {
    if (!this.db) return;
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);

    this.photos = this.photos.filter(p => p.id !== id);
    this.updateUI();
    // 重新创建照片卡片（延迟执行，确保函数已定义）
    if (window.recreatePhotoCards) {
      window.recreatePhotoCards();
    }
  }

  // 清空所有照片
  clearAllPhotos() {
    if (!this.db) return;
    const transaction = this.db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    this.photos = [];
    this.updateUI();
    // 重新创建照片卡片（延迟执行，确保函数已定义）
    if (window.recreatePhotoCards) {
      window.recreatePhotoCards();
    }
  }

  // 获取所有照片
  getPhotos() {
    return this.photos;
  }

  // 文件转 base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 压缩图片
  compressImage(base64, maxWidth = particleConfig.photoCards.compression.maxWidth, maxHeight = particleConfig.photoCards.compression.maxHeight, quality = particleConfig.photoCards.compression.quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 计算缩放比例
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = base64;
    });
  }

  // 更新 UI
  updateUI() {
    // 更新计数
    const countElement = document.querySelector('#photo-count .count');
    if (countElement) {
      countElement.textContent = this.photos.length;
    }

    // 更新清空按钮状态
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.disabled = this.photos.length === 0;
    }

    // 更新照片网格
    this.updatePhotoGrid();
  }

  // 初始化 UI 文本（从配置文件读取）
  initUIText() {
    // 更新照片数量限制显示
    const maxCountElements = document.querySelectorAll('.max-count, .max-count-text');
    maxCountElements.forEach(el => {
      el.textContent = MAX_PHOTOS;
    });
  }

  // 更新照片网格
  updatePhotoGrid() {
    const grid = document.getElementById('photo-grid');
    if (!grid) return;

    grid.innerHTML = '';

    this.photos.forEach(photo => {
      const item = document.createElement('div');
      item.className = 'photo-item';

      const img = document.createElement('img');
      img.src = photo.data;
      img.alt = photo.name;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '×';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm('确定要删除这张照片吗？')) {
          this.deletePhoto(photo.id);
        }
      };

      item.appendChild(img);
      item.appendChild(deleteBtn);
      grid.appendChild(item);
    });
  }
}

// 创建照片管理器实例
const photoManager = new PhotoManager();

// UI 事件处理
document.addEventListener('DOMContentLoaded', () => {
  // 初始化 UI 文本（从配置文件读取）
  photoManager.initUIText();

  const uploadBtn = document.getElementById('upload-btn');
  const photoManagerPanel = document.getElementById('photo-manager');
  const managerClose = document.getElementById('manager-close');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');

  // 打开照片管理面板
  uploadBtn?.addEventListener('click', () => {
    photoManagerPanel.classList.add('active');
  });

  // 关闭照片管理面板
  const closePhotoManager = () => {
    photoManagerPanel.classList.remove('active');
  };

  managerClose?.addEventListener('click', closePhotoManager);

  // 点击面板外部（背景）关闭面板
  photoManagerPanel?.addEventListener('click', (e) => {
    // 如果点击的是背景层本身（不是内容区域），则关闭面板
    if (e.target === photoManagerPanel) {
      closePhotoManager();
    }
  });

  // 阻止内容区域的点击事件冒泡，防止点击内容时关闭面板
  const managerContent = document.getElementById('manager-content');
  managerContent?.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 清空所有照片
  clearAllBtn?.addEventListener('click', () => {
    if (photoManager.photos.length === 0) {
      return;
    }
    if (confirm(`确定要清空所有 ${photoManager.photos.length} 张照片吗？此操作不可恢复！`)) {
      photoManager.clearAllPhotos();
    }
  });

  // 点击上传区域
  uploadArea?.addEventListener('click', () => {
    fileInput?.click();
  });

  // 文件选择
  fileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    await handleFiles(files);
    fileInput.value = ''; // 清空，允许重复上传同一文件
  });

  // 拖拽上传
  uploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea?.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea?.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  });

  // 处理文件上传
  async function handleFiles(files) {
    const remaining = MAX_PHOTOS - photoManager.photos.length;
    if (files.length > remaining) {
      alert(`最多还能上传 ${remaining} 张照片`);
      files = files.slice(0, remaining);
    }

    for (const file of files) {
      await photoManager.addPhoto(file);
    }

    // 上传完成后重新创建照片卡片（延迟执行，确保函数已定义）
    if (window.recreatePhotoCards) {
      window.recreatePhotoCards();
    }
  }
});

// 场景设置
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// 相机设置
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 4, 12);
camera.lookAt(0, 4, 0);

// 渲染器设置
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比，避免过度渲染
renderer.setClearColor(0x000000, 1);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// 控制器设置（支持旋转、缩放、拖拽）
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 30;
controls.target.set(0, 4, 0);

// 监听相机变化并打印信息（节流防止刷屏）
let lastLogTime = 0;
controls.addEventListener('change', () => {
  const now = Date.now();
  // 限制打印频率为每 500ms 一次
  if (now - lastLogTime > 500) {
    const pos = camera.position;
    // 获取 OrbitControls 的角度信息
    const polarAngle = controls.getPolarAngle(); // 俯仰角 (0=顶视图, PI=底视图)
    const azimuthalAngle = controls.getAzimuthalAngle(); // 方位角 (水平旋转)
    lastLogTime = now;
  }
});

// 开启自动旋转
controls.autoRotate = particleConfig.camera.autoRotate.enabled;
const originalAutoRotateSpeed = particleConfig.camera.autoRotate.normalSpeed; // 原始旋转速度
const scatteredAutoRotateSpeed = particleConfig.camera.autoRotate.scatteredSpeed; // 散开时的旋转速度（更快）
controls.autoRotateSpeed = originalAutoRotateSpeed; // 负值实现画面逆时针旋转（相机顺时针公转），绝对值越大越快

// 保存原始的鼠标按钮配置
// OrbitControls 中：0 = ROTATE, 1 = DOLLY, 2 = PAN
const MOUSE_ROTATE = 0;
const MOUSE_DOLLY = 1;
const MOUSE_PAN = 2;

const originalLeftButton = controls.mouseButtons.LEFT;

// 监听空格键，按住空格键时拖动鼠标可以平移
let isSpacePressed = false;
let isDragging = false;

// 更新光标样式
function updateCursor() {
  if (isSpacePressed) {
    if (isDragging) {
      renderer.domElement.style.cursor = 'grabbing';
    } else {
      renderer.domElement.style.cursor = 'grab';
    }
  } else {
    renderer.domElement.style.cursor = 'default';
  }
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !isSpacePressed) {
    isSpacePressed = true;
    // 按住空格键时，左键拖动变成平移
    controls.mouseButtons.LEFT = MOUSE_PAN;
    updateCursor();
    event.preventDefault(); // 防止空格键触发页面滚动
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    isSpacePressed = false;
    isDragging = false;
    // 释放空格键时，恢复左键拖动为旋转
    controls.mouseButtons.LEFT = originalLeftButton;
    updateCursor();
  }
});

// 监听鼠标按下和释放，更新拖动状态
renderer.domElement.addEventListener('mousedown', (event) => {
  if (isSpacePressed && event.button === 0) { // 左键
    isDragging = true;
    updateCursor();
  }
});

renderer.domElement.addEventListener('mouseup', (event) => {
  if (event.button === 0) { // 左键
    isDragging = false;
    updateCursor();
  }
});

// 鼠标离开画布时，重置拖动状态
renderer.domElement.addEventListener('mouseleave', () => {
  isDragging = false;
  if (!isSpacePressed) {
    updateCursor();
  }
});

// 创建粒子圆锥体
function createParticleCone() {
  // 从配置文件读取参数
  const height = particleConfig.cone.height;
  const baseRadius = particleConfig.cone.baseRadius;
  const particleCount = particleConfig.cone.particleCount;

  // 创建粒子几何体
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const colors = new Float32Array(particleCount * 3);

  // 从配置文件读取颜色
  const greenColor = new THREE.Color(particleConfig.color.base);
  const yellowColor = new THREE.Color(particleConfig.yellowParticles.color);

  // 计算常量值（移到循环外，避免重复计算）
  const sizeRange = particleConfig.size.max - particleConfig.size.min;
  const colorVariationRange = particleConfig.color.variationMax - particleConfig.color.variationMin;

  // 创建颜色类型数组（0=绿色，1=黄色）
  const colorTypes = new Uint8Array(particleCount);
  if (particleConfig.yellowParticles.enabled) {
    for (let i = 0; i < particleCount; i++) {
      colorTypes[i] = Math.random() < particleConfig.yellowParticles.ratio ? 1 : 0;
    }
  }

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;

    // 随机高度（从底部到顶部）
    const y = Math.random() * height;

    // 根据高度计算当前层的半径（线性插值）
    const currentRadius = baseRadius * (1 - y / height);

    // 随机角度
    const angle = Math.random() * Math.PI * 2;

    // 在圆形区域内随机分布（使用平方根确保均匀分布）
    const radiusFactor = Math.sqrt(Math.random()) * currentRadius;

    // 计算位置
    positions[i3] = Math.cos(angle) * radiusFactor;
    positions[i3 + 1] = y;
    positions[i3 + 2] = Math.sin(angle) * radiusFactor;

    // 使用预计算的大小范围
    sizes[i] = particleConfig.size.min + Math.random() * sizeRange;

    // 根据颜色类型设置颜色
    const isYellow = colorTypes[i] === 1;
    const baseColor = isYellow ? yellowColor : greenColor;
    const colorVariation = particleConfig.color.variationMin + Math.random() * colorVariationRange;
    colors[i3] = baseColor.r * colorVariation;
    colors[i3 + 1] = baseColor.g * colorVariation;
    colors[i3 + 2] = baseColor.b * colorVariation;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('colorType', new THREE.BufferAttribute(colorTypes, 1));

  // 创建着色器材质（带光泽效果）
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pointSizeScale: { value: particleConfig.size.scale },
      particleRadius: { value: particleConfig.appearance.radius },
      particleEdge: { value: particleConfig.appearance.edge },
      colorEnhancement: { value: particleConfig.appearance.colorEnhancement },
      glowEnabled: { value: particleConfig.glow.enabled ? 1.0 : 0.0 },
      glowIntensity: { value: particleConfig.glow.intensity },
      glowColor: { value: new THREE.Color(particleConfig.glow.color) },
      yellowGlowColor: { value: new THREE.Color(particleConfig.yellowParticles.glowColor) },
      yellowGlowIntensity: { value: particleConfig.yellowParticles.glowIntensity },
      glowBloom: { value: particleConfig.glow.bloom },
      starLightEnabled: { value: particleConfig.star.light.enabled ? 1.0 : 0.0 },
      starLightPosition: { value: new THREE.Vector3(0, 0, 0) },
      starLightColor: { value: new THREE.Color(particleConfig.star.light.color) },
      starLightIntensity: { value: particleConfig.star.light.intensity },
      starLightDistance: { value: particleConfig.star.light.distance },
      starLightDecay: { value: particleConfig.star.light.decay }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 particleColor;
      attribute float colorType;
      uniform float pointSizeScale;
      uniform vec3 starLightPosition;
      varying vec3 vColor;
      varying float vColorType;
      varying vec3 vWorldPosition;
      varying vec3 vLightDirection;
      
      void main() {
        vColor = particleColor;
        vColorType = colorType;
        
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // 计算光源方向（从粒子指向光源）
        vLightDirection = starLightPosition - vWorldPosition;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        
        // 从配置读取缩放因子
        // 防止粒子在相机后面或太近时产生异常大小
        float depth = -mvPosition.z;
        if (depth > 0.0) {
          gl_PointSize = size * (pointSizeScale / depth);
          // 限制点大小，防止过大导致渲染问题
          gl_PointSize = min(gl_PointSize, 2000.0);
        } else {
          // 如果粒子在相机后面，设置点大小为0（不渲染）
          gl_PointSize = 0.0;
        }
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float particleRadius;
      uniform float particleEdge;
      uniform float colorEnhancement;
      uniform float glowEnabled;
      uniform float glowIntensity;
      uniform vec3 glowColor;
      uniform vec3 yellowGlowColor;
      uniform float yellowGlowIntensity;
      uniform float glowBloom;
      uniform float starLightEnabled;
      uniform vec3 starLightColor;
      uniform float starLightIntensity;
      uniform float starLightDistance;
      uniform float starLightDecay;
      
      varying vec3 vColor;
      varying float vColorType;
      varying vec3 vWorldPosition;
      varying vec3 vLightDirection;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = gl_PointCoord - center;
        float dist = length(coord);
        
        // 从配置读取粒子外观参数
        float radius = particleRadius;
        float edge = particleEdge;
        
        float alpha;
        if (dist < radius) {
          alpha = 1.0;
        } else {
          alpha = 1.0 - smoothstep(radius, radius + edge, dist);
        }
        
        if (alpha < 0.01) discard;
        
        // 计算粒子表面的法线（假设是球体）
        vec3 normal = normalize(vec3(coord * 2.0, sqrt(1.0 - min(dot(coord, coord) * 4.0, 1.0))));
        
        // 完全由内向外发光，不使用环境光和光照
        // 初始化为一个很小的值而不是0，避免纯黑色
        vec3 finalColor = vec3(0.001);
        
        // 计算来自五角星光源的光照
        vec3 lightContribution = vec3(0.0);
        if (starLightEnabled > 0.5) {
          // 计算光源方向
          vec3 lightDir = normalize(vLightDirection);
          float lightDistance = length(vLightDirection);
          
          // 计算光照衰减（距离衰减）
          float attenuation = 1.0;
          if (lightDistance > 0.0) {
            attenuation = 1.0 / (1.0 + starLightDecay * lightDistance * lightDistance);
            // 限制影响距离
            if (lightDistance > starLightDistance) {
              attenuation = 0.0;
            }
          }
          
          // 计算漫反射（Lambert光照模型）
          float dotNL = max(dot(normal, lightDir), 0.0);
          lightContribution = starLightColor * starLightIntensity * dotNL * attenuation;
        }
        
        if (glowEnabled > 0.5) {
          // 计算从中心到边缘的距离（归一化到0-1）
          // dist 范围是 0 到 (radius + edge)
          float normalizedDist = dist / (radius + edge);
          
          // 由内向外发光：中心最亮（normalizedDist=0时glowFactor=1），边缘最暗（normalizedDist=1时glowFactor=0）
          // 使用平滑过渡
          float glowFactor = 1.0 - smoothstep(0.0, 1.0, normalizedDist);
          
          // 使用指数函数增强中心亮度，让中心更亮，边缘更暗
          // glowBloom 越小，中心越亮，边缘衰减越快
          glowFactor = pow(glowFactor, 1.0 / glowBloom);
          
          // 根据粒子类型选择发光颜色和强度
          bool isYellow = vColorType > 0.5;
          vec3 particleGlowColor = isYellow ? yellowGlowColor : glowColor;
          float particleGlowIntensity = isYellow ? glowIntensity * yellowGlowIntensity : glowIntensity;
          
          // 计算自发光颜色：使用小球的基础颜色和发光颜色混合
          // 黄色粒子使用更多的发光颜色，让它们更亮
          float colorMixRatio = isYellow ? 0.7 : 0.5;
          vec3 baseGlowColor = mix(vColor, particleGlowColor, colorMixRatio);
          
          // 中心最亮，向外逐渐变暗
          finalColor = baseGlowColor * particleGlowIntensity * glowFactor;
          
          // 增强中心区域的亮度，让中心更突出
          float centerBoost = 1.0 - smoothstep(0.0, radius * 0.3, dist);
          centerBoost = pow(centerBoost, 3.0);
          finalColor += particleGlowColor * particleGlowIntensity * 0.8 * centerBoost;
          
          // 黄色粒子额外增强：添加更亮的中心光晕
          if (isYellow) {
            float brightCenter = 1.0 - smoothstep(0.0, radius * 0.2, dist);
            brightCenter = pow(brightCenter, 2.0);
            finalColor += yellowGlowColor * particleGlowIntensity * 0.5 * brightCenter;
          }
          
          // 添加来自五角星光源的光照效果
          finalColor += lightContribution * vColor;
        } else {
          // 如果发光未启用，使用基础颜色
          finalColor = vColor;
          finalColor = pow(finalColor, vec3(0.9)) * colorEnhancement;
        }
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending, // 使用加法混合增强发光效果
    depthWrite: false,
    depthTest: true
  });

  const particleSystem = new THREE.Points(geometry, material);
  return particleSystem;
}

// 创建五角星几何体
function createStar() {
  if (!particleConfig.star.enabled) return null;

  const size = particleConfig.star.size;
  const thickness = particleConfig.star.thickness;
  const outerRadius = size;
  const innerRadius = size * particleConfig.star.innerRadiusRatio; // 内圆半径，形成五角星形状（增大让五角星更饱满）

  const shape = new THREE.Shape();
  const points = 5;
  const cornerRadius = particleConfig.star.cornerRadius || 0.05;

  // 先计算所有顶点
  const vertices = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    vertices.push({ x, y });
  }

  // 创建带圆角的路径
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    const prev = vertices[(i - 1 + vertices.length) % vertices.length];

    // 计算从上一个点到当前点的方向（归一化）
    const dirFromPrev = {
      x: current.x - prev.x,
      y: current.y - prev.y
    };
    const lenFromPrev = Math.sqrt(dirFromPrev.x * dirFromPrev.x + dirFromPrev.y * dirFromPrev.y);

    // 计算从当前点到下一个点的方向（归一化）
    const dirToNext = {
      x: next.x - current.x,
      y: next.y - current.y
    };
    const lenToNext = Math.sqrt(dirToNext.x * dirToNext.x + dirToNext.y * dirToNext.y);

    if (i === 0) {
      // 第一个点：移动到起始位置（在第一个角之前，考虑圆角）
      if (lenFromPrev > 0 && lenToNext > 0) {
        dirFromPrev.x /= lenFromPrev;
        dirFromPrev.y /= lenFromPrev;
        dirToNext.x /= lenToNext;
        dirToNext.y /= lenToNext;

        // 计算圆角起始点（从prev到current的方向上，距离角点cornerRadius）
        const cornerStartX = current.x - dirFromPrev.x * cornerRadius;
        const cornerStartY = current.y - dirFromPrev.y * cornerRadius;
        shape.moveTo(cornerStartX, cornerStartY);
      } else {
        shape.moveTo(current.x, current.y);
      }
    }

    // 为每个角创建圆角
    if (lenFromPrev > 0 && lenToNext > 0) {
      // 归一化方向向量
      dirFromPrev.x /= lenFromPrev;
      dirFromPrev.y /= lenFromPrev;
      dirToNext.x /= lenToNext;
      dirToNext.y /= lenToNext;

      // 计算圆角的起始点和结束点
      // 圆角起始点：从当前角点沿着prev->current方向后退cornerRadius
      const cornerStartX = current.x - dirFromPrev.x * cornerRadius;
      const cornerStartY = current.y - dirFromPrev.y * cornerRadius;

      // 圆角结束点：从当前角点沿着current->next方向前进cornerRadius
      const cornerEndX = current.x + dirToNext.x * cornerRadius;
      const cornerEndY = current.y + dirToNext.y * cornerRadius;

      // 先画直线到圆角起始点（如果还没到的话）
      if (i > 0) {
        shape.lineTo(cornerStartX, cornerStartY);
      }

      // 使用二次贝塞尔曲线创建圆角
      // 控制点是角点本身，起点是cornerStart，终点是cornerEnd
      shape.quadraticCurveTo(
        current.x, current.y,
        cornerEndX, cornerEndY
      );
    } else {
      // 如果计算失败，使用直线连接
      shape.lineTo(current.x, current.y);
    }
  }
  shape.closePath();

  // 使用挤压几何体创建3D五角星，添加圆角让边缘更圆润
  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: particleConfig.star.bevelThickness !== undefined ? particleConfig.star.bevelThickness : particleConfig.star.bevelSize || 0.05, // 圆角厚度
    bevelSize: particleConfig.star.bevelSize || 0.05, // 圆角大小
    bevelSegments: particleConfig.star.bevelSegments || 8, // 圆角分段数，让圆角更平滑
    curveSegments: particleConfig.star.curveSegments || 16  // 曲线分段数，让形状更平滑
  };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // 创建发光材质，让五角星自身发光
  // 使用 MeshStandardMaterial 并增强自发光效果
  const material = new THREE.MeshStandardMaterial({
    color: particleConfig.star.color,
    emissive: particleConfig.star.glowColor,
    emissiveIntensity: particleConfig.star.glowIntensity, // 直接使用配置强度
    transparent: false,
    side: THREE.DoubleSide
  });

  const star = new THREE.Mesh(geometry, material);

  // 检查着色器编译错误
  const program = material.program;
  const hasError = program && (program.error || !program.program);

  // 旋转使五角星竖立在 YZ 平面上（垂直放置），并调整角度使其正立
  star.rotation.z = Math.PI / 2;
  // 微调旋转，使五角星的一个角朝上
  star.rotation.z += Math.PI / 10;

  // 放置在圆锥顶部，应用位置偏移
  star.position.set(
    particleConfig.star.positionOffset.x,
    particleConfig.cone.height + particleConfig.star.positionOffset.y,
    particleConfig.star.positionOffset.z
  );

  // 创建光晕 Sprite
  // 1. 创建辉光纹理 (复用 createGlowTexture 逻辑，但这里我们直接创建黄色的)
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // 中心白亮
  gradient.addColorStop(0.2, 'rgba(255, 255, 0, 0.8)'); // 中间亮黄
  gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.3)'); // 外部金色微光
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // 边缘透明

  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const glowTexture = new THREE.CanvasTexture(canvas);

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xFFFFFF,
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 1.0
  });

  const sprite = new THREE.Sprite(glowMaterial);
  // 位置与五角星一致
  sprite.position.copy(star.position);
  // 光晕大小调整 (比五角星大3-4倍)
  const glowSize = particleConfig.star.size * 5.0;
  sprite.scale.set(glowSize, glowSize, 1.0);

  // 创建一个组来包含五角星和光晕
  const group = new THREE.Group();
  group.add(star);
  group.add(sprite);

  return group;
}

// 创建雪花系统
function createSnowSystem() {
  if (!particleConfig.snow.enabled) return null;

  const count = particleConfig.snow.count;
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count); // 下落速度
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const drifts = new Float32Array(count); // 水平飘动参数
  const landed = new Uint8Array(count); // 标记哪些雪花已经落地（0=未落地，1=已落地）

  const range = particleConfig.snow.range;
  const height = particleConfig.snow.height;
  const groundLevel = 0; // 地面高度
  const initialGroundSnowRatio = 0.35; // 初始地面雪花比例（35%的雪花一开始就在地面上）

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // 随机位置
    positions[i3] = (Math.random() - 0.5) * range;
    positions[i3 + 2] = (Math.random() - 0.5) * range;

    // 随机参数
    velocities[i] = particleConfig.snow.speed.min + Math.random() * (particleConfig.snow.speed.max - particleConfig.snow.speed.min);
    sizes[i] = particleConfig.snow.size.min + Math.random() * (particleConfig.snow.size.max - particleConfig.snow.size.min);
    opacities[i] = particleConfig.snow.opacity.min + Math.random() * (particleConfig.snow.opacity.max - particleConfig.snow.opacity.min);
    drifts[i] = Math.random() * Math.PI * 2;

    // 决定是否初始就在地面上
    const isInitialGroundSnow = Math.random() < initialGroundSnowRatio;
    if (isInitialGroundSnow) {
      // 初始就在地面上
      positions[i3 + 1] = groundLevel;
      landed[i] = 1; // 标记为已落地
    } else {
      // 在空中，随机高度
      positions[i3 + 1] = Math.random() * height;
      landed[i] = 0; // 未落地
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('drift', new THREE.BufferAttribute(drifts, 1));

  // 将landed数组存储到geometry的userData中，供动画循环使用
  geometry.userData.landed = landed;
  geometry.userData.groundLevel = groundLevel;

  // 使用自定义Shader实现朦胧雪花
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(particleConfig.snow.color) },
      time: { value: 0 },
      pointSizeScale: { value: 200.0 } // 控制雪花整体大小的缩放
    },
    vertexShader: `
      attribute float size;
      attribute float opacity;
      uniform float pointSizeScale;
      varying float vOpacity;
      
      void main() {
        vOpacity = opacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // 防止粒子在相机后面或太近时产生异常大小
        float depth = -mvPosition.z;
        if (depth > 0.0) {
          gl_PointSize = size * (pointSizeScale / depth);
          gl_PointSize = min(gl_PointSize, 2000.0);
        } else {
          gl_PointSize = 0.0;
        }
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      varying float vOpacity;
      
      void main() {
        // 创建柔和的圆形
        vec2 center = vec2(0.5, 0.5);
        vec2 coord = gl_PointCoord - center;
        float dist = length(coord);
        
        // 软边缘
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        
        if (alpha < 0.01) discard;
        
        gl_FragColor = vec4(color, alpha * vOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  return new THREE.Points(geometry, material);
}

// 创建金箔系统
function createGoldFoilSystem() {
  if (!particleConfig.goldFoil.enabled) return null;

  const count = particleConfig.goldFoil.count;
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count); // 用于控制闪烁相位的随机数
  const drifts = new Float32Array(count);
  const colors = new Float32Array(count * 3);

  const range = particleConfig.goldFoil.range;
  const height = particleConfig.goldFoil.height;
  const greenRatio = particleConfig.goldFoil.greenRatio || 0.0;
  const redRatio = particleConfig.goldFoil.redRatio || 0.0;

  const goldColor = new THREE.Color(particleConfig.goldFoil.color);
  const greenColor = new THREE.Color(particleConfig.goldFoil.greenColor || 0x228B22);
  const redColor = new THREE.Color(particleConfig.goldFoil.redColor || 0x8B0000);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    positions[i3] = (Math.random() - 0.5) * range;
    positions[i3 + 1] = Math.random() * height;
    positions[i3 + 2] = (Math.random() - 0.5) * range;

    velocities[i] = particleConfig.goldFoil.speed.min + Math.random() * (particleConfig.goldFoil.speed.max - particleConfig.goldFoil.speed.min);
    sizes[i] = particleConfig.goldFoil.size.min + Math.random() * (particleConfig.goldFoil.size.max - particleConfig.goldFoil.size.min);
    phases[i] = Math.random() * Math.PI * 2;
    drifts[i] = Math.random() * Math.PI * 2;

    // 设置颜色
    const rand = Math.random();
    if (rand < greenRatio) {
      colors[i3] = greenColor.r;
      colors[i3 + 1] = greenColor.g;
      colors[i3 + 2] = greenColor.b;
    } else if (rand < greenRatio + redRatio) {
      colors[i3] = redColor.r;
      colors[i3 + 1] = redColor.g;
      colors[i3 + 2] = redColor.b;
    } else {
      colors[i3] = goldColor.r;
      colors[i3 + 1] = goldColor.g;
      colors[i3 + 2] = goldColor.b;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('drift', new THREE.BufferAttribute(drifts, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pointSizeScale: { value: 200.0 }
    },
    vertexShader: `
      attribute float size;
      attribute float phase;
      attribute vec3 color;
      uniform float pointSizeScale;
      uniform float time;
      varying float vPhase;
      varying vec3 vColor;
      
      void main() {
        vPhase = phase;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // 防止粒子在相机后面或太近时产生异常大小
        float depth = -mvPosition.z;
        if (depth > 0.0) {
          gl_PointSize = size * (pointSizeScale / depth);
          gl_PointSize = min(gl_PointSize, 2000.0);
        } else {
          gl_PointSize = 0.0;
        }
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float time;
      varying float vPhase;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        // 原始坐标 (-0.5 到 0.5)
        vec2 coord = gl_PointCoord - center;
        
        // 模拟翻转：
        // 使用两个不同频率的正弦波模拟绕 X 轴和 Y 轴的旋转
        // rotationX/Y 的范围是 -1 到 1
        float rotationSpeed = 2.0;
        float rotX = cos(time * rotationSpeed + vPhase);
        float rotY = sin(time * rotationSpeed * 0.7 + vPhase);
        
        // 应用透视缩放：
        // 当纸片旋转时，其在屏幕上的投影宽度/高度会变化
        // 我们反向缩放坐标，如果 coord 超过了缩放后的范围，就 discard
        
        // 避免除以0，保持最小厚度
        float scaleX = abs(rotY) + 0.1; 
        float scaleY = abs(rotX) + 0.1;
        
        // 检查是否在变形后的矩形内
        if (abs(coord.x) > 0.5 * scaleX || abs(coord.y) > 0.5 * scaleY) discard;
        
        // 计算反光
        // 结合旋转角度，当纸片正对相机时（scale 最大），反光最强
        // 或者当它快速翻转经过某个角度时反光
        
        // 模拟法线方向随旋转变化
        vec3 normal = normalize(vec3(rotY, rotX, 1.0));
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float specular = pow(max(dot(normal, lightDir), 0.0), 8.0);
        
        // 基础闪烁
        float flash = sin(time * 8.0 + vPhase * 3.0);
        
        vec3 finalColor = vColor;
        
        // 强烈的高光时刻
        if (specular > 0.6 || flash > 0.5) {
           finalColor = mix(vColor, vec3(1.0), 0.9);
        } else {
           // 根据旋转角度产生的明暗变化
           float shading = 0.6 + 0.4 * max(abs(rotX), abs(rotY));
           finalColor = vColor * shading;
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending // 使用正常混合，体现金属实体感，或者用 Additive 看个人喜好，这里选 Normal 让它看起来像实体碎片
  });

  return new THREE.Points(geometry, material);
}

// 获取要显示的照片列表（只使用用户上传的照片）
function getPhotosToDisplay() {
  const userPhotos = photoManager.getPhotos();

  // 只返回用户上传的照片
  return userPhotos.map(photo => ({
    type: 'user',
    src: photo.data,
    id: photo.id
  }));
}

// 创建照片卡片系统
function createPhotoCards() {
  if (!particleConfig.photoCards || !particleConfig.photoCards.enabled) return null;

  const photos = getPhotosToDisplay();
  if (photos.length === 0) return null;

  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();

  // 照片卡片尺寸
  const cardWidth = particleConfig.photoCards.cardWidth;
  const cardHeight = particleConfig.photoCards.cardHeight;
  const photoSize = particleConfig.photoCards.photoSize;

  const treeHeight = particleConfig.cone.height;
  const baseRadius = particleConfig.cone.baseRadius;

  photos.forEach((photoData, index) => {
    // 1. 创建卡片组（包含边框和照片）
    const cardGroup = new THREE.Group();

    // 2. 创建金色外边框（高级边框效果）
    const borderThickness = 0.025; // 边框厚度（稍微加厚，更明显）
    const goldFrameGeometry = new THREE.PlaneGeometry(
      cardWidth + borderThickness * 2,
      cardHeight + borderThickness * 2
    );
    const goldFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0xFFD700, // 金色
      side: THREE.DoubleSide,
      emissive: 0xFFD700, // 自发光，让边框更亮
      emissiveIntensity: 1.2 // 增强发光强度，让边框更醒目
    });
    const goldFrame = new THREE.Mesh(goldFrameGeometry, goldFrameMaterial);
    // 翻转边框，让金色边框朝向树中心（内侧）
    goldFrame.rotateY(Math.PI);
    goldFrame.position.z = -0.002; // 稍微靠后，作为背景层
    cardGroup.add(goldFrame);

    // 3. 创建白色边框（背景）
    const frameGeometry = new THREE.PlaneGeometry(cardWidth, cardHeight);
    const frameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    // 翻转边框，让白色背景朝向树中心（内侧）
    frame.rotateY(Math.PI);
    frame.position.z = -0.001; // 在金色边框前面
    cardGroup.add(frame);

    // 4. 加载照片纹理，并在加载完成后根据图片比例调整纹理参数，避免拉伸变形
    const texture = loader.load(
      photoData.src,
      // onLoad 回调
      function (loadedTexture) {
        if (loadedTexture.image) {

          const imgWidth = loadedTexture.image.width;
          const imgHeight = loadedTexture.image.height;
          const imgAspect = imgWidth / imgHeight; // 图片宽高比
          const cardAspect = 1.0; // 卡片是正方形，宽高比为1

          // 使用 object-fit: cover 策略：保持图片比例，裁剪超出部分
          if (imgAspect > cardAspect) {
            // 图片更宽（横向），应该让高度完整显示(repeat.y=1)，宽度只显示中间部分(repeat.x<1)
            loadedTexture.repeat.set(cardAspect / imgAspect, 1);
            loadedTexture.offset.set((1 - cardAspect / imgAspect) / 2, 0);
          } else {
            // 图片更高（纵向），应该让宽度完整显示(repeat.x=1)，高度只显示中间部分(repeat.y<1)
            loadedTexture.repeat.set(1, imgAspect / cardAspect);
            loadedTexture.offset.set(0, (1 - imgAspect / cardAspect) / 2);
          }
          loadedTexture.needsUpdate = true;
        }
      }
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    // 开启各向异性过滤，提高倾斜观察时的清晰度
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearFilter; // 使用线性过滤，避免Mipmap导致的模糊
    texture.magFilter = THREE.LinearFilter;

    // 5. 创建照片部分
    const photoGeometry = new THREE.PlaneGeometry(photoSize, photoSize);
    const photoMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
    });
    const photo = new THREE.Mesh(photoGeometry, photoMaterial);
    photo.position.y = 0.1; // 稍微向上偏移，留出下方空白写字的感觉
    photo.position.z = 0.01; // 稍微在边框前面，防止Z-fighting

    // 给照片添加 userData，存储图片路径，方便点击时获取
    photo.userData = {
      isPhoto: true,
      imageSrc: photoData.src,
      parentGroup: cardGroup
    };
    frame.userData = { // 边框也加上，方便点击判定
      isPhoto: true,
      imageSrc: photoData.src,
      parentGroup: cardGroup
    };
    goldFrame.userData = { // 金色边框也加上，方便点击判定
      isPhoto: true,
      imageSrc: photoData.src,
      parentGroup: cardGroup
    };

    cardGroup.add(photo);

    // 6. 围绕圣诞树均匀分布
    // 高度随机分布
    const y = Math.random() * (treeHeight * 0.7) + treeHeight * 0.15; // 避开最顶部和最底部
    const currentRadius = baseRadius * (1 - y / treeHeight);

    // 角度均匀分布，让照片围绕树圆周均匀摆放
    const angle = (index / photos.length) * Math.PI * 2;
    const r = currentRadius + 0.5; // 稍微悬浮在树表面外

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    cardGroup.position.set(x, y, z);

    // 7. 竖直悬挂，图片朝外，白色背景朝内
    // 使用 lookAt 让卡片正面（+Z）直接朝向外部（沿半径向外）
    // 目标点设为当前位置沿半径向外延伸的点（保持y不变以保持竖直）
    cardGroup.lookAt(x * 2, y, z * 2);

    // 此时：
    // - 照片的正面（图片）朝向外侧 ✓
    // - 边框已被翻转180度，其正面（白色）朝向内侧 ✓
    // - 卡片保持竖直 ✓

    // 存储原始缩放和旋转，用于hover效果恢复
    cardGroup.userData.originalScale = cardGroup.scale.clone();
    cardGroup.userData.originalRotation = cardGroup.rotation.clone();
    // 在 cardGroup 的 userData 中也存储 imageSrc，方便直接访问
    cardGroup.userData.imageSrc = photoData.src;

    group.add(cardGroup);
  });

  return group;
}

// 交互相关的变量
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCard = null;

// 通用创建装饰球函数
function createOrnamentGroup(config) {
  if (!config.enabled) return null;

  const count = config.count;
  const geometry = new THREE.SphereGeometry(config.radius, 32, 32);

  // 材质（增强反光效果）
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    metalness: config.metalness,
    roughness: config.roughness,
    emissive: config.emissive,
    emissiveIntensity: config.emissiveIntensity,
    envMapIntensity: 3.0 // 大幅增强环境反射强度，产生刺眼反光
  });

  // 光晕材质 - 需要针对不同颜色创建不同的纹理或复用纹理但改变颜色
  // 这里为了简单，我们动态创建对应颜色的光晕纹理
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');

  // 解析颜色
  const colorObj = new THREE.Color(config.color);
  const r = Math.floor(colorObj.r * 255);
  const g = Math.floor(colorObj.g * 255);
  const b = Math.floor(colorObj.b * 255);

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)'); // 中心白亮（刺眼）
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 1)'); // 保持中心极亮
  gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 1.0)`); // 中间主体色（增强亮度）
  gradient.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.4)`); // 外部光晕（增强）
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // 边缘透明

  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const glowTexture = new THREE.CanvasTexture(canvas);

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xFFFFFF, // 纹理自带颜色，这里设为白即可
    transparent: true,
    blending: THREE.AdditiveBlending,
    opacity: 1.5 // 增强不透明度，让光晕更刺眼
  });

  const group = new THREE.Group();
  const treeHeight = particleConfig.cone.height;
  const baseRadius = particleConfig.cone.baseRadius;

  for (let i = 0; i < count; i++) {
    // 1. 创建实体球
    const mesh = new THREE.Mesh(geometry, material);

    // 随机高度
    const y = Math.random() * (treeHeight * 0.85) + treeHeight * 0.05;

    // 计算当前高度对应的圆锥半径
    const currentRadius = baseRadius * (1 - y / treeHeight);

    // 随机角度
    const angle = Math.random() * Math.PI * 2;

    // 计算位置
    const radiusOffset = 0.9 + Math.random() * 0.1; // 0.9 - 1.0 之间
    const r = currentRadius * radiusOffset;

    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;

    mesh.position.set(x, y, z);

    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.z = Math.random() * Math.PI;

    group.add(mesh);

    // 2. 创建光晕 Sprite（增强反光效果）
    const sprite = new THREE.Sprite(glowMaterial);
    sprite.position.set(x, y, z);
    // 光晕大小（增大光晕，让反光更明显）
    const glowSize = config.radius * 5.0; // 从3.5增加到5.0，让光晕更大更刺眼
    sprite.scale.set(glowSize, glowSize, 1);

    group.add(sprite);
  }

  return group;
}

// 创建所有装饰球
function createOrnaments() {
  const mainGroup = new THREE.Group();

  // 金球
  const goldOrnaments = createOrnamentGroup(particleConfig.ornaments);
  if (goldOrnaments) mainGroup.add(goldOrnaments);

  // 红球
  const redOrnaments = createOrnamentGroup(particleConfig.redOrnaments);
  if (redOrnaments) mainGroup.add(redOrnaments);

  // 蓝球
  const blueOrnaments = createOrnamentGroup(particleConfig.blueOrnaments);
  if (blueOrnaments) mainGroup.add(blueOrnaments);

  return mainGroup;
}

// 创建螺旋光带
function createSpiralRibbon() {
  if (!particleConfig.spiralRibbon.enabled) return null;

  const config = particleConfig.spiralRibbon;
  const treeHeight = particleConfig.cone.height;
  const baseRadius = particleConfig.cone.baseRadius;
  const turns = config.turns;
  const offset = config.offset;

  // 创建螺旋曲线路径
  const curvePoints = [];
  const segments = 200; // 路径分段数，数值越大越平滑

  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 到 1
    const y = t * treeHeight; // 从底部到顶部

    // 根据高度计算当前层的半径（与树形一致）
    const currentRadius = baseRadius * (1 - t) + offset;

    // 计算螺旋角度
    const angle = t * Math.PI * 2 * turns;

    // 计算位置
    const x = Math.cos(angle) * currentRadius;
    const z = Math.sin(angle) * currentRadius;

    curvePoints.push(new THREE.Vector3(x, y, z));
  }

  // 创建曲线
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  curve.curveType = 'centripetal'; // 使用向心曲线类型，更平滑

  // 创建扁平丝带的截面形状（矩形）
  const ribbonShape = new THREE.Shape();
  const halfWidth = config.width / 2;
  const halfHeight = config.height / 2;

  ribbonShape.moveTo(-halfWidth, -halfHeight);
  ribbonShape.lineTo(halfWidth, -halfHeight);
  ribbonShape.lineTo(halfWidth, halfHeight);
  ribbonShape.lineTo(-halfWidth, halfHeight);
  ribbonShape.closePath();

  // 使用 TubeGeometry 创建沿曲线延伸的丝带
  const geometry = new THREE.TubeGeometry(
    curve,
    segments,
    config.width,
    2, // 径向分段数（截面分段）
    false // 不闭合
  );

  // 创建高级银白色辉光材质（使用自定义着色器）
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new THREE.Color(config.color) },
      glowColor: { value: new THREE.Color(config.glowColor) },
      glowIntensity: { value: config.glowIntensity },
      sparkleSpeed: { value: config.sparkleSpeed },
      sparkleIntensity: { value: config.sparkleIntensity },
      fadeProgress: { value: -1.0 } // 渐变进度：0=完全显示，1=完全消失，-1=完全消失（初始状态）
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      varying vec3 vViewDirection;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        // 计算到相机的距离，用于边缘发光效果
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vDistance = length(mvPosition.xyz);
        vViewDirection = normalize(cameraPosition - vWorldPosition);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      uniform float glowIntensity;
      uniform float sparkleSpeed;
      uniform float sparkleIntensity;
      uniform float fadeProgress; // 渐变进度
      
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying float vDistance;
      varying vec3 vViewDirection;
      
      void main() {
        // 根据UV坐标和fadeProgress计算渐变透明度
        // vUv.x沿着管道长度：0=尾部（底部），1=头部（顶部）
        // fadeProgress > 0时，从尾部到头部逐渐消失
        // fadeProgress < 0时，从头部到尾部逐渐出现（取绝对值）
        float fadeAlpha = 1.0;
        if (fadeProgress > 0.0) {
          // 散开：从尾部到头部消失（vUv.x从0到1，fadeProgress从0到1）
          float fadeThreshold = fadeProgress;
          fadeAlpha = step(fadeThreshold, vUv.x); // vUv.x < fadeThreshold的部分消失
        } else if (fadeProgress < 0.0) {
          // 聚集：从头部到尾部出现（vUv.x从1到0，fadeProgress从-1到0）
          float fadeThreshold = 1.0 + fadeProgress; // fadeProgress从-1到0，threshold从0到1
          fadeAlpha = step(1.0 - fadeThreshold, vUv.x); // vUv.x > (1-fadeThreshold)的部分显示
        }
        
        // 计算边缘发光（基于法线和视角）- 使用更强的菲涅尔效果
        float fresnel = pow(1.0 - max(dot(vViewDirection, vNormal), 0.0), 1.2);
        fresnel = smoothstep(0.0, 1.0, fresnel);
        
        // 多层闪光效果 - 创造布灵布灵闪光感
        // 主要闪光波（沿丝带长度方向）- 增强频率和强度
        float sparkle1 = sin(vUv.x * 30.0 + time * sparkleSpeed * 1.2) * 0.5 + 0.5;
        sparkle1 = pow(sparkle1, 1.8); // 降低指数，让闪光更明显
        
        // 快速闪烁点（高频闪光）- 增强频率
        float sparkle2 = sin(vUv.x * 80.0 + time * sparkleSpeed * 4.0) * 0.5 + 0.5;
        sparkle2 = pow(sparkle2, 6.0); // 更尖锐的闪光点
        
        // 超高频闪光点（创造密集闪光）
        float sparkle2b = sin(vUv.x * 120.0 + time * sparkleSpeed * 5.5) * 0.5 + 0.5;
        sparkle2b = pow(sparkle2b, 10.0);
        
        // 中频闪光（创造流动感）- 增强
        float sparkle3 = sin(vUv.x * 45.0 + time * sparkleSpeed * 2.0) * 0.5 + 0.5;
        sparkle3 = pow(sparkle3, 3.0);
        
        // 随机闪光点（使用噪声模拟）- 增强频率和强度
        float noise1 = fract(sin(dot(vec2(vUv.x * 120.0, time * 0.8), vec2(12.9898, 78.233))) * 43758.5453);
        float sparkle4 = step(0.92, noise1) * (0.5 + 0.5 * sin(time * sparkleSpeed * 8.0));
        sparkle4 = pow(sparkle4, 0.5); // 让随机闪光更明显
        
        // 额外的随机闪光点（增加闪光密度）
        float noise2 = fract(sin(dot(vec2(vUv.x * 150.0 + 7.0, time * 1.2), vec2(37.7193, 91.173))) * 43758.5453);
        float sparkle5 = step(0.90, noise2) * (0.6 + 0.4 * cos(time * sparkleSpeed * 6.0));
        sparkle5 = pow(sparkle5, 0.4);
        
        // 强烈的亮点（模拟光线反射）- 沿丝带移动的亮点
        float highlight = sin(vUv.x * 20.0 + time * sparkleSpeed * 0.8) * 0.5 + 0.5;
        highlight = pow(highlight, 1.2);
        highlight = step(0.85, highlight) * highlight * 2.0; // 只显示最亮的部分
        
        // 组合所有闪光效果 - 增强权重，让闪光更明显
        float totalSparkle = sparkle1 * 0.35 + sparkle2 * 0.25 + sparkle2b * 0.15 + sparkle3 * 0.12 + sparkle4 * 0.08 + sparkle5 * 0.05;
        totalSparkle = pow(totalSparkle, 0.5); // 降低指数，让闪光更亮更明显
        
        // 添加强烈的移动亮点
        totalSparkle += highlight * 0.3;
        totalSparkle = min(totalSparkle, 1.0); // 限制最大值
        
        // 边缘渐变（让丝带边缘更亮，创造扁平丝带感）
        float edgeGlow = 1.0 - abs(vUv.y - 0.5) * 2.0;
        edgeGlow = pow(edgeGlow, 0.2); // 更明显的边缘发光
        
        // 中心高光带（模拟丝带中心的反光）
        float centerGlow = 1.0 - abs(vUv.y - 0.5) * 2.0;
        centerGlow = pow(centerGlow, 1.5);
        
        // 金黄色基础色（带微妙的暖色调）
        vec3 goldBase = baseColor;
        // 添加微妙的暖黄色调，增强高级感和温暖感
        vec3 premiumGold = mix(goldBase, vec3(1.0, 0.95, 0.7), 0.25);
        
        // 构建最终颜色
        vec3 finalColor = premiumGold;
        
        // 添加强烈的边缘辉光（增强）
        finalColor += glowColor * glowIntensity * fresnel * 2.5;
        
        // 添加中心高光带（增强）
        finalColor += glowColor * centerGlow * 1.2;
        
        // 添加边缘发光（增强）
        finalColor += glowColor * edgeGlow * 1.0;
        
        // 添加布灵布灵闪光效果（使用纯白色闪光）- 大幅增强
        vec3 sparkleColor = vec3(1.0, 1.0, 1.0); // 纯白色闪光
        // 主要闪光效果 - 增强强度
        finalColor += sparkleColor * sparkleIntensity * totalSparkle * 4.5;
        
        // 添加强烈的闪光高光（只在闪光最强时显示）
        float intenseSparkle = step(0.7, totalSparkle) * totalSparkle;
        finalColor += sparkleColor * intenseSparkle * 3.0;
        
        // 添加菲涅尔边缘闪光（增强）- 让边缘也有闪光感
        finalColor += sparkleColor * fresnel * 1.5;
        
        // 添加动态闪光（随视角变化）
        float dynamicSparkle = fresnel * totalSparkle;
        finalColor += sparkleColor * dynamicSparkle * 2.0;
        
        // 整体亮度增强，创造高级感
        finalColor *= 1.8;
        
        // 添加微妙的颜色变化（根据视角）- 使用暖色调
        float colorShift = fresnel * 0.3;
        finalColor = mix(finalColor, vec3(1.0, 0.98, 0.85), colorShift);
        
        // 计算透明度（中心更不透明，边缘更透明）
        float alpha = 0.9 + fresnel * 0.1;
        alpha *= (0.85 + edgeGlow * 0.15);
        alpha = min(alpha, 0.98); // 限制最大透明度，保持实体感
        alpha *= fadeAlpha; // 应用渐变透明度
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, // 使用加法混合增强发光效果
    depthWrite: false
  });

  const ribbon = new THREE.Mesh(geometry, material);

  // 创建外层辉光光晕（更大的几何体，专门用于产生辉光效果）
  const glowGeometry = new THREE.TubeGeometry(
    curve,
    segments,
    config.width * 2.5, // 更大的宽度，产生光晕
    2,
    false
  );

  // 创建辉光材质（更透明，专门用于外发光）
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      glowColor: { value: new THREE.Color(config.glowColor) },
      glowIntensity: { value: config.glowIntensity * 0.6 }, // 外层光晕强度稍低
      sparkleSpeed: { value: config.sparkleSpeed },
      fadeProgress: { value: -1.0 } // 渐变进度（初始状态：完全消失）
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vViewDirection;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDirection = normalize(cameraPosition - vWorldPosition);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 glowColor;
      uniform float glowIntensity;
      uniform float sparkleSpeed;
      uniform float fadeProgress; // 渐变进度
      
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec3 vViewDirection;
      
      void main() {
        // 根据UV坐标和fadeProgress计算渐变透明度
        float fadeAlpha = 1.0;
        if (fadeProgress > 0.0) {
          // 散开：从尾部到头部消失
          float fadeThreshold = fadeProgress;
          fadeAlpha = step(fadeThreshold, vUv.x);
        } else if (fadeProgress < 0.0) {
          // 聚集：从头部到尾部出现
          float fadeThreshold = 1.0 + fadeProgress;
          fadeAlpha = step(1.0 - fadeThreshold, vUv.x);
        }
        
        // 计算边缘距离（从中心到边缘）
        float distFromCenter = abs(vUv.y - 0.5) * 2.0; // 0 到 1
        
        // 边缘衰减（距离中心越远，越透明）
        float edgeFade = 1.0 - smoothstep(0.0, 1.0, distFromCenter);
        edgeFade = pow(edgeFade, 1.5); // 更平滑的衰减
        
        // 菲涅尔效果（边缘更亮）
        float fresnel = pow(1.0 - max(dot(vViewDirection, vNormal), 0.0), 1.5);
        fresnel = smoothstep(0.0, 1.0, fresnel);
        
        // 沿长度方向的波动效果 - 增强闪光感
        float wave = sin(vUv.x * 20.0 + time * sparkleSpeed * 0.5) * 0.5 + 0.5;
        wave = pow(wave, 2.5);
        
        // 添加闪光效果到辉光层
        float sparkle = sin(vUv.x * 40.0 + time * sparkleSpeed * 2.0) * 0.5 + 0.5;
        sparkle = pow(sparkle, 4.0);
        
        // 快速闪光点
        float quickSparkle = sin(vUv.x * 70.0 + time * sparkleSpeed * 3.5) * 0.5 + 0.5;
        quickSparkle = pow(quickSparkle, 8.0);
        
        // 组合闪光效果
        float totalSparkle = sparkle * 0.6 + quickSparkle * 0.4;
        
        // 构建辉光颜色（纯白色辉光）
        vec3 finalGlow = glowColor * glowIntensity;
        
        // 结合所有效果 - 添加闪光增强
        float finalAlpha = edgeFade * (0.3 + fresnel * 0.4 + wave * 0.2 + totalSparkle * 0.1);
        finalAlpha = min(finalAlpha, 0.5); // 稍微提高最大透明度，让闪光更明显
        finalAlpha *= fadeAlpha; // 应用渐变透明度
        
        // 增强边缘亮度和闪光效果
        finalGlow *= (1.0 + fresnel * 0.5 + totalSparkle * 0.8);
        
        gl_FragColor = vec4(finalGlow, finalAlpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, // 使用加法混合
    depthWrite: false,
    depthTest: true
  });

  const glowLayer = new THREE.Mesh(glowGeometry, glowMaterial);

  // 创建一个组来包含主丝带和辉光层
  const ribbonGroup = new THREE.Group();
  ribbonGroup.add(glowLayer); // 先添加辉光层（在背景）
  ribbonGroup.add(ribbon); // 再添加主丝带（在前景）

  return ribbonGroup;
}

// 创建粒子圆锥体
const particleCone = createParticleCone();
scene.add(particleCone);
console.log('粒子圆锥体已创建，粒子数量:', particleCone.geometry.attributes.position.count / 3);

// 创建并添加五角星
const star = createStar();
let starLight = null;
if (star) {
  scene.add(star);
  console.log('五角星已创建');

  // 创建五角星光源
  if (particleConfig.star.light.enabled) {
    starLight = new THREE.PointLight(
      particleConfig.star.light.color,
      particleConfig.star.light.intensity,
      particleConfig.star.light.distance,
      particleConfig.star.light.decay
    );

    // 光源位置与五角星位置相同
    starLight.position.set(
      particleConfig.star.positionOffset.x,
      particleConfig.cone.height + particleConfig.star.positionOffset.y,
      particleConfig.star.positionOffset.z
    );

    scene.add(starLight);
    console.log('五角星光源已创建');

    // 更新着色器中的光源位置
    if (particleCone.material instanceof THREE.ShaderMaterial) {
      particleCone.material.uniforms.starLightPosition.value.copy(starLight.position);
    }
  }
}

// 创建并添加雪花系统
const snowSystem = createSnowSystem();
if (snowSystem) {
  scene.add(snowSystem);
  console.log('雪花系统已创建，数量:', snowSystem.geometry.attributes.position.count);
}

// 创建并添加金箔系统
const goldFoilSystem = createGoldFoilSystem();
if (goldFoilSystem) {
  scene.add(goldFoilSystem);
  console.log('金箔系统已创建，数量:', goldFoilSystem.geometry.attributes.position.count);
}

// 创建并添加圣诞球
const ornaments = createOrnaments();
if (ornaments) {
  scene.add(ornaments);
  console.log('圣诞球装饰已创建');

  // 添加一个环境光，让金属球有更好的反光效果（增强强度产生刺眼反光）
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  // 添加一个方向光，制造高光（增强强度产生刺眼反光）
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  // 添加额外的方向光，从不同角度照射，增强反光效果
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight2.position.set(-5, 8, -7);
  scene.add(dirLight2);
}

// 创建并添加照片卡片
let photoCards = createPhotoCards();
if (photoCards) {
  scene.add(photoCards);
  console.log('照片卡片已创建');
}

// 重新创建照片卡片的函数
function recreatePhotoCards() {
  // 移除旧的照片卡片
  if (photoCards) {
    scene.remove(photoCards);
    // 释放资源
    photoCards.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }

  // 创建新的照片卡片
  photoCards = createPhotoCards();
  if (photoCards) {
    scene.add(photoCards);
    console.log('照片卡片已重新创建，数量:', photoCards.children.length);
  }
}

// 将函数暴露到全局，供 PhotoManager 使用
window.recreatePhotoCards = recreatePhotoCards;

// 处理鼠标移动（Hover效果）
window.addEventListener('mousemove', (event) => {
  // 计算鼠标在归一化设备坐标中的位置 (-1 到 +1)
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // 更新射线
  raycaster.setFromCamera(mouse, camera);

  // 计算物体交点
  if (photoCards) {
    // 递归检测 photoCards 组中的所有子对象
    // 注意：我们需要检测的是 cardGroup 里的 mesh
    const intersects = raycaster.intersectObjects(photoCards.children, true);

    if (intersects.length > 0) {
      // 获取最上面的对象
      const object = intersects[0].object;

      // 检查是否是照片或边框
      if (object.userData.isPhoto) {
        const cardGroup = object.userData.parentGroup;

        if (hoveredCard !== cardGroup) {
          // 如果之前有悬停的卡片，先恢复
          if (hoveredCard) {
            // 恢复到散开状态下的缩放（如果散开）或原始缩放（如果聚集）
            const originalScale = hoveredCard.userData.originalScale || new THREE.Vector3(1, 1, 1);
            const scatteredScale = particleConfig.photoCards.scatteredScale || 1.5;
            if (isScattered) {
              hoveredCard.scale.copy(originalScale).multiplyScalar(scatteredScale);
            } else {
              hoveredCard.scale.copy(originalScale);
            }
          }

          // 设置新的悬停卡片
          hoveredCard = cardGroup;

          // 放大效果：在散开缩放的基础上再放大1.2倍（如果散开），否则直接放大1.2倍
          const originalScale = hoveredCard.userData.originalScale || new THREE.Vector3(1, 1, 1);
          const scatteredScale = particleConfig.photoCards.scatteredScale || 1.5;
          if (isScattered) {
            hoveredCard.scale.copy(originalScale).multiplyScalar(scatteredScale * 1.2);
          } else {
            hoveredCard.scale.set(1.2, 1.2, 1.2);
          }

          // 改变光标
          document.body.style.cursor = 'pointer';
        }
        return; // 找到交点后返回
      }
    }
  }

  // 如果没有交点或交点不是照片
  if (hoveredCard) {
    // 恢复到散开状态下的缩放（如果散开）或原始缩放（如果聚集）
    const originalScale = hoveredCard.userData.originalScale || new THREE.Vector3(1, 1, 1);
    const scatteredScale = particleConfig.photoCards.scatteredScale || 1.5;
    if (isScattered) {
      hoveredCard.scale.copy(originalScale).multiplyScalar(scatteredScale);
    } else {
      hoveredCard.scale.copy(originalScale);
    }
    hoveredCard = null;
    document.body.style.cursor = 'default';
    updateCursor(); // 恢复默认光标逻辑（检查空格键状态）
  }
});

// 处理鼠标点击（打开照片）
window.addEventListener('click', (event) => {
  // 只有在左键点击且没有拖动时才触发（防止旋转视角时误触）
  if (event.button === 0 && !isDragging) {
    if (hoveredCard) {
      // 获取图片路径
      const imageSrc = hoveredCard.children.find(c => c.userData.imageSrc)?.userData.imageSrc;
      if (imageSrc) {
        openPhotoOverlay(imageSrc);
      }
    }
  }
});

// 照片遮罩层逻辑
const overlay = document.getElementById('photo-overlay');
const overlayImg = document.getElementById('photo-img');
const closeBtn = document.getElementById('close-btn');
let isPhotoLoading = false; // 标记图片是否正在加载
let closeOverlayTimeout = null; // 用于存储关闭动画的定时器 ID

function openPhotoOverlay(src) {
  if (!src || typeof src !== 'string' || src.length === 0) {
    console.warn('无效的图片源:', src);
    return;
  }

  // 如果有正在进行的关闭操作（延迟清空 src），立即取消
  if (closeOverlayTimeout) {
    clearTimeout(closeOverlayTimeout);
    closeOverlayTimeout = null;
  }

  // 如果正在加载图片，先停止当前加载
  if (isPhotoLoading) {
    // 清除之前的加载状态
    overlayImg.onload = null;
    overlayImg.onerror = null;
    overlayImg.src = ''; // 清空当前图片源，停止加载
  }

  // 标记开始加载
  isPhotoLoading = true;

  // 先隐藏遮罩层，等图片加载完成后再显示
  overlay.classList.remove('active');

  // 添加错误处理
  overlayImg.onerror = () => {
    console.error('图片加载失败:', src.substring(0, 50) + '...');
    isPhotoLoading = false;
    // 关闭遮罩层
    closePhotoOverlay();
    alert('图片加载失败，请检查图片是否有效');
  };

  overlayImg.onload = () => {
    // 图片加载成功后，显示遮罩层
    isPhotoLoading = false;
    overlay.classList.add('active');
    // 清除错误处理，避免影响后续加载
    overlayImg.onerror = null;
  };

  // 设置图片源，开始加载
  overlayImg.src = src;
  // 暂停自动旋转
  controls.autoRotate = false;
}

function closePhotoOverlay() {
  overlay.classList.remove('active');
  // 清除加载状态
  isPhotoLoading = false;
  overlayImg.onload = null;
  overlayImg.onerror = null;
  // 延迟清空图片，避免视觉跳动
  if (closeOverlayTimeout) {
    clearTimeout(closeOverlayTimeout);
  }
  closeOverlayTimeout = setTimeout(() => {
    overlayImg.src = '';
    closeOverlayTimeout = null;
  }, 500);
  // 恢复自动旋转
  controls.autoRotate = true;
}

closeBtn.addEventListener('click', closePhotoOverlay);
overlay.addEventListener('click', (e) => {
  if (e.target === overlay || e.target.id === 'photo-container') {
    closePhotoOverlay();
  }
});

// 创建并添加螺旋光带
const spiralRibbon = createSpiralRibbon();
if (spiralRibbon) {
  scene.add(spiralRibbon);
  console.log('螺旋光带已创建');
}

// ========== 初始光带出现动画 ==========
const initialRibbonFadeDuration = particleConfig.spiralRibbon.animation.initialFadeDuration; // 初始光带出现动画持续时间（毫秒）
let initialRibbonAnimationStartTime = Date.now();
let isInitialRibbonAnimating = true; // 初始动画是否正在进行

// ========== 散开/聚集动画系统 ==========
let isScattered = false; // 当前状态：false=聚集，true=散开
let animationProgress = 0; // 动画进度 0-1
const ribbonFadeDuration = particleConfig.spiralRibbon.animation.fadeDuration; // 散开时光带消失的动画时长（毫秒）
const gatherRibbonFadeDuration = particleConfig.spiralRibbon.animation.gatherFadeDuration || ribbonFadeDuration; // 聚拢时光带出现的动画时长（毫秒）
const scatterDuration = particleConfig.scatterAnimation.scatterDuration || 1500; // 元素散开/聚集持续时间（毫秒）
// 总动画时间：散开时 = ribbonFadeDuration + scatterDuration，聚拢时 = scatterDuration + gatherRibbonFadeDuration
let animationStartTime = 0;
let isAnimating = false;

// 保存原始位置数据
const originalPositions = {
  particleCone: null, // 粒子系统的原始位置数组
  star: null,
  ornaments: [], // 装饰球组的每个球的位置
  photoCards: [], // 照片卡片的每个卡片的位置
  spiralRibbon: null,
  camera: null // 原始相机位置
};

// 散开目标位置
const scatteredPositions = {
  particleCone: null,
  star: null,
  ornaments: [],
  photoCards: [],
  spiralRibbon: null
};

// 保存原始位置
function saveOriginalPositions() {
  // 保存粒子系统的原始位置
  if (particleCone && particleCone.geometry) {
    const positions = particleCone.geometry.attributes.position.array;
    originalPositions.particleCone = new Float32Array(positions);
  }

  // 保存五角星位置
  if (star) {
    originalPositions.star = star.position.clone();
  }

  // 保存装饰球位置（包括光晕）
  // ornaments 是一个主组，包含三个子组（goldOrnaments、redOrnaments、blueOrnaments）
  // 每个子组直接包含多个 mesh 和 sprite（成对出现）
  if (ornaments) {
    originalPositions.ornaments = [];
    // 遍历主组的每个子组（金、红、蓝）
    ornaments.children.forEach((colorGroup) => {
      if (colorGroup instanceof THREE.Group) {
        // 遍历每个子组内的每个子对象（mesh 和 sprite）
        // 由于 mesh 和 sprite 是成对出现的，我们以 mesh 为代表
        colorGroup.children.forEach((child) => {
          if (child instanceof THREE.Mesh) {
            // 找到对应的 sprite（通常紧跟在 mesh 后面）
            let sprite = null;
            const meshIndex = colorGroup.children.indexOf(child);
            if (meshIndex + 1 < colorGroup.children.length) {
              const nextChild = colorGroup.children[meshIndex + 1];
              if (nextChild instanceof THREE.Sprite) {
                sprite = nextChild;
              }
            }

            // 保存装饰球的全局位置（用于散开动画）
            const worldPosition = new THREE.Vector3();
            child.getWorldPosition(worldPosition);
            originalPositions.ornaments.push({
              mesh: child,
              sprite: sprite,
              colorGroup: colorGroup, // 保存所属的颜色组
              position: child.position.clone(), // 保存本地位置（用于恢复）
              worldPosition: worldPosition.clone() // 保存全局位置（用于散开计算）
            });
          }
        });
      }
    });
  }

  // 保存照片卡片位置
  if (photoCards) {
    originalPositions.photoCards = [];
    photoCards.children.forEach((cardGroup) => {
      originalPositions.photoCards.push({
        object: cardGroup,
        position: cardGroup.position.clone()
      });
    });
  }

  // 保存彩带位置（如果有子对象）
  if (spiralRibbon) {
    originalPositions.spiralRibbon = spiralRibbon.position.clone();
  }

  // 保存原始相机位置
  originalPositions.camera = camera.position.clone();

  // 保存原始球坐标信息（Radius, Polar）
  const vec = new THREE.Vector3().subVectors(camera.position, controls.target);
  const radius = vec.length();
  // 计算 Polar Angle (phi)
  // y = radius * cos(phi) => phi = acos(y/radius)
  // 注意：这里 y 是相对于 target 的 y
  const phi = Math.acos(vec.y / radius);

  originalPositions.cameraSpherical = {
    radius: radius,
    phi: phi
  };
}

// 生成散开位置
function generateScatteredPositions() {
  const scatterRange = particleConfig.scatterAnimation.scatterRange; // 散开范围
  const scatterHeight = particleConfig.scatterAnimation.scatterHeight; // 散开高度范围

  // 生成粒子系统的散开位置（随机偏移每个粒子）
  if (particleCone && particleCone.geometry && originalPositions.particleCone) {
    const positions = particleCone.geometry.attributes.position.array;
    scatteredPositions.particleCone = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      scatteredPositions.particleCone[i] = positions[i] + (Math.random() - 0.5) * scatterRange;
      scatteredPositions.particleCone[i + 1] = positions[i + 1] + Math.random() * scatterHeight;
      scatteredPositions.particleCone[i + 2] = positions[i + 2] + (Math.random() - 0.5) * scatterRange;
    }
  }

  // 生成五角星散开位置
  if (star && originalPositions.star) {
    scatteredPositions.star = new THREE.Vector3(
      originalPositions.star.x + (Math.random() - 0.5) * scatterRange,
      originalPositions.star.y + Math.random() * scatterHeight,
      originalPositions.star.z + (Math.random() - 0.5) * scatterRange
    );
  }

  // 生成装饰球散开位置（从每个装饰球的原始全局位置加上随机偏移）
  if (ornaments && originalPositions.ornaments.length > 0) {
    scatteredPositions.ornaments = originalPositions.ornaments.map((item) => {
      // 使用保存的原始全局位置，加上随机偏移
      const originalWorldPos = item.worldPosition;
      return {
        position: new THREE.Vector3(
          originalWorldPos.x + (Math.random() - 0.5) * scatterRange,
          originalWorldPos.y + Math.random() * scatterHeight,
          originalWorldPos.z + (Math.random() - 0.5) * scatterRange
        )
      };
    });
  }

  // 生成照片卡片散开位置（从每个照片卡片的原始位置加上随机偏移）
  if (photoCards && originalPositions.photoCards.length > 0) {
    scatteredPositions.photoCards = originalPositions.photoCards.map((item) => ({
      position: new THREE.Vector3(
        item.position.x + (Math.random() - 0.5) * scatterRange,
        item.position.y + Math.random() * scatterHeight,
        item.position.z + (Math.random() - 0.5) * scatterRange
      )
    }));
  }

  // 生成彩带散开位置
  if (spiralRibbon && originalPositions.spiralRibbon) {
    scatteredPositions.spiralRibbon = new THREE.Vector3(
      originalPositions.spiralRibbon.x + (Math.random() - 0.5) * scatterRange,
      originalPositions.spiralRibbon.y + Math.random() * scatterHeight,
      originalPositions.spiralRibbon.z + (Math.random() - 0.5) * scatterRange
    );
  }
}

// 保存当前实际散开位置（用于下次聚集时使用）
function saveCurrentScatteredPositions() {
  // 保存粒子系统的当前实际位置
  if (particleCone && particleCone.geometry) {
    const positions = particleCone.geometry.attributes.position.array;
    scatteredPositions.particleCone = new Float32Array(positions);
  }

  // 保存五角星当前实际位置
  if (star) {
    scatteredPositions.star = star.position.clone();
  }

  // 保存装饰球当前实际位置（全局位置）
  if (ornaments && originalPositions.ornaments.length > 0) {
    scatteredPositions.ornaments = originalPositions.ornaments.map((item) => {
      const worldPosition = new THREE.Vector3();
      item.mesh.getWorldPosition(worldPosition);
      return {
        position: worldPosition.clone()
      };
    });
  }

  // 保存照片卡片当前实际位置
  if (photoCards && originalPositions.photoCards.length > 0) {
    scatteredPositions.photoCards = originalPositions.photoCards.map((item) => ({
      position: item.object.position.clone()
    }));
  }

  // 保存彩带当前实际位置
  if (spiralRibbon) {
    scatteredPositions.spiralRibbon = spiralRibbon.position.clone();
  }
}

// 缓动函数（ease in out）
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// 更新初始光带出现动画
function updateInitialRibbonAnimation() {
  if (!isInitialRibbonAnimating || !spiralRibbon) return;

  const currentTime = Date.now();
  const elapsed = currentTime - initialRibbonAnimationStartTime;
  const progress = Math.min(elapsed / initialRibbonFadeDuration, 1);
  const easedProgress = easeInOutCubic(progress);

  // fadeProgress 从 -1.0 到 0.0（从头部到尾部逐渐出现）
  const fadeProgressValue = -1.0 + easedProgress;

  spiralRibbon.children.forEach((child) => {
    if (child.material && child.material.uniforms) {
      child.material.uniforms.fadeProgress.value = fadeProgressValue;
    }
  });

  // 动画结束
  if (progress >= 1) {
    isInitialRibbonAnimating = false;
    // 确保最终值为 0
    spiralRibbon.children.forEach((child) => {
      if (child.material && child.material.uniforms) {
        child.material.uniforms.fadeProgress.value = 0.0;
      }
    });
  }
}

// 更新动画
function updateScatterAnimation() {
  if (!isAnimating) return;

  const currentTime = Date.now();
  const elapsed = currentTime - animationStartTime;

  // 根据当前状态计算总动画时长
  // 散开时：光带消失和元素散开同时进行，总时长取两者中的较大值
  // 聚拢时：光带出现和元素聚集同时进行，总时长取两者中的较大值
  const currentTotalDuration = isScattered
    ? Math.max(ribbonFadeDuration, scatterDuration)
    : Math.max(scatterDuration, gatherRibbonFadeDuration);
  const totalProgress = Math.min(elapsed / currentTotalDuration, 1);

  // 分阶段动画
  let ribbonFadeProgress = 0; // 光带渐变进度
  let scatterProgress = 0; // 元素散开进度（与画面缩放同步）

  if (isScattered) {
    // 散开：元素散开和画面缩放同时进行，光带消失也同时进行
    // 计算元素散开进度（使用整个动画时间，与画面缩放同步）
    scatterProgress = Math.min(elapsed / scatterDuration, 1);
    // 计算光带消失进度
    if (elapsed < ribbonFadeDuration) {
      // 光带从尾部到头部消失
      ribbonFadeProgress = Math.min(elapsed / ribbonFadeDuration, 1);
    } else {
      ribbonFadeProgress = 1;
    }
  } else {
    // 聚集：元素聚集和光带出现同时进行
    // 计算元素聚集进度（使用整个动画时间，与画面缩放同步）
    scatterProgress = Math.min(elapsed / scatterDuration, 1);
    // 计算光带出现进度（与元素聚集同时开始）
    // 光带从头部到尾部出现，使用 gatherRibbonFadeDuration 作为动画时长
    ribbonFadeProgress = 1 - Math.min(elapsed / gatherRibbonFadeDuration, 1);
  }

  const easedScatterProgress = easeInOutCubic(scatterProgress);
  const easedRibbonProgress = easeInOutCubic(ribbonFadeProgress);

  // 更新粒子系统位置（与画面缩放同步进行）
  if (scatterProgress > 0 && particleCone && particleCone.geometry && originalPositions.particleCone && scatteredPositions.particleCone) {
    const positions = particleCone.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      if (isScattered) {
        // 散开：从原始位置到散开位置
        positions[i] = originalPositions.particleCone[i] + (scatteredPositions.particleCone[i] - originalPositions.particleCone[i]) * easedScatterProgress;
        positions[i + 1] = originalPositions.particleCone[i + 1] + (scatteredPositions.particleCone[i + 1] - originalPositions.particleCone[i + 1]) * easedScatterProgress;
        positions[i + 2] = originalPositions.particleCone[i + 2] + (scatteredPositions.particleCone[i + 2] - originalPositions.particleCone[i + 2]) * easedScatterProgress;
      } else {
        // 聚集：从散开位置回到原始位置
        positions[i] = scatteredPositions.particleCone[i] + (originalPositions.particleCone[i] - scatteredPositions.particleCone[i]) * easedScatterProgress;
        positions[i + 1] = scatteredPositions.particleCone[i + 1] + (originalPositions.particleCone[i + 1] - scatteredPositions.particleCone[i + 1]) * easedScatterProgress;
        positions[i + 2] = scatteredPositions.particleCone[i + 2] + (originalPositions.particleCone[i + 2] - scatteredPositions.particleCone[i + 2]) * easedScatterProgress;
      }
    }
    particleCone.geometry.attributes.position.needsUpdate = true;
  }

  // 更新五角星位置（与画面缩放同步进行）
  if (scatterProgress > 0 && star && originalPositions.star) {
    if (isScattered && scatteredPositions.star) {
      star.position.lerpVectors(originalPositions.star, scatteredPositions.star, easedScatterProgress);
      // sprite 是 Group 的子对象，其本地位置应该保持为 (0, 0, 0)，不需要更新
    } else if (!isScattered && scatteredPositions.star) {
      star.position.lerpVectors(scatteredPositions.star, originalPositions.star, easedScatterProgress);
      // sprite 是 Group 的子对象，其本地位置应该保持为 (0, 0, 0)，不需要更新
    }
  }

  // 更新装饰球位置（与画面缩放同步进行）
  if (scatterProgress > 0 && ornaments && originalPositions.ornaments.length > 0 && scatteredPositions.ornaments.length > 0) {
    originalPositions.ornaments.forEach((item, index) => {
      if (item.mesh && scatteredPositions.ornaments[index]) {
        // 获取原始全局位置和目标散开全局位置
        const originalWorldPos = item.worldPosition;
        const targetWorldPos = scatteredPositions.ornaments[index].position;

        // 在全局坐标系中插值
        const newWorldPos = new THREE.Vector3();
        if (isScattered) {
          // 散开：从原始全局位置到散开全局位置
          newWorldPos.lerpVectors(originalWorldPos, targetWorldPos, easedScatterProgress);
        } else {
          // 聚集：从散开全局位置回到原始全局位置
          newWorldPos.lerpVectors(targetWorldPos, originalWorldPos, easedScatterProgress);
        }

        // 将全局位置转换为相对于颜色组的本地位置
        // 使用 worldToLocal 方法确保正确转换（考虑旋转、缩放等变换）
        const localPos = new THREE.Vector3();
        item.colorGroup.worldToLocal(localPos.copy(newWorldPos));

        // 更新 mesh 和 sprite 的位置
        item.mesh.position.copy(localPos);
        if (item.sprite) {
          item.sprite.position.copy(localPos);
        }
      }
    });
  }

  // 更新照片卡片位置和缩放（与画面缩放同步进行）
  if (scatterProgress > 0 && photoCards && originalPositions.photoCards.length > 0 && scatteredPositions.photoCards.length > 0) {
    const scatteredScale = particleConfig.photoCards.scatteredScale || 1.5; // 从配置读取散开时的缩放倍数
    originalPositions.photoCards.forEach((item, index) => {
      if (item.object && scatteredPositions.photoCards[index]) {
        // 更新位置
        if (isScattered) {
          item.object.position.lerpVectors(item.position, scatteredPositions.photoCards[index].position, easedScatterProgress);
        } else {
          item.object.position.lerpVectors(scatteredPositions.photoCards[index].position, item.position, easedScatterProgress);
        }

        // 更新缩放：散开时放大，聚集时恢复原始大小
        // 如果当前卡片正在被悬停，跳过缩放更新（让悬停效果优先）
        if (item.object === hoveredCard) {
          return;
        }

        const originalScale = item.object.userData.originalScale || new THREE.Vector3(1, 1, 1);
        if (isScattered) {
          // 散开：从原始大小逐渐放大到配置的倍数
          const targetScale = originalScale.clone().multiplyScalar(scatteredScale);
          item.object.scale.lerpVectors(originalScale, targetScale, easedScatterProgress);
        } else {
          // 聚集：从放大状态逐渐恢复到原始大小
          const currentScatteredScale = originalScale.clone().multiplyScalar(scatteredScale);
          item.object.scale.lerpVectors(currentScatteredScale, originalScale, easedScatterProgress);
        }
      }
    });
  }

  // 更新彩带位置（与画面缩放同步进行）
  if (scatterProgress > 0 && spiralRibbon && originalPositions.spiralRibbon) {
    if (isScattered && scatteredPositions.spiralRibbon) {
      spiralRibbon.position.lerpVectors(originalPositions.spiralRibbon, scatteredPositions.spiralRibbon, easedScatterProgress);
    } else if (!isScattered && scatteredPositions.spiralRibbon) {
      spiralRibbon.position.lerpVectors(scatteredPositions.spiralRibbon, originalPositions.spiralRibbon, easedScatterProgress);
    }
  }

  // 更新彩带渐变效果（从尾部到头部消失/出现）
  if (spiralRibbon) {
    let fadeProgressValue;
    if (isScattered) {
      // 散开时：fadeProgress从0到1（从尾部到头部消失）
      fadeProgressValue = easedRibbonProgress;
    } else {
      // 聚集时：fadeProgress从-1到0（从头部到尾部出现）
      // 与元素聚集动画同时进行
      const ribbonProgress = Math.min(elapsed / gatherRibbonFadeDuration, 1);
      const easedRibbonProgress2 = easeInOutCubic(ribbonProgress);
      fadeProgressValue = -1.0 + easedRibbonProgress2; // 从-1到0
    }

    spiralRibbon.children.forEach((child) => {
      if (child.material && child.material.uniforms) {
        child.material.uniforms.fadeProgress.value = fadeProgressValue;
      }
    });
  }

  // 更新相机缩放（整体画面缩放）和旋转速度（与元素散开同步）
  if (scatterProgress > 0) {
    // 更新相机旋转速度（根据动画进度逐步变化）
    if (isScattered) {
      // 散开：从原始速度逐渐加快到散开速度
      controls.autoRotateSpeed = originalAutoRotateSpeed + (scatteredAutoRotateSpeed - originalAutoRotateSpeed) * easedScatterProgress;
    } else {
      // 聚集：从散开速度逐渐恢复到原始速度
      controls.autoRotateSpeed = scatteredAutoRotateSpeed + (originalAutoRotateSpeed - scatteredAutoRotateSpeed) * easedScatterProgress;
    }

    // 更新相机位置（画面缩放和视角变化）
    // 使用动态计算的 Start/Target 进行插值
    if (cameraAnimationState.targetRadius > 0) {
      // 相机动画始终是从 Start 到 Target (进度 0 -> 1)
      const currentRadius = cameraAnimationState.startRadius + (cameraAnimationState.targetRadius - cameraAnimationState.startRadius) * easedScatterProgress;
      const currentPhi = cameraAnimationState.startPhi + (cameraAnimationState.targetPhi - cameraAnimationState.startPhi) * easedScatterProgress;

      const target = controls.target;
      // 获取当前的方位角 (由 OrbitControls 自动旋转控制)
      const currentTheta = controls.getAzimuthalAngle();

      // 将球坐标转换为笛卡尔坐标并设置相机位置
      const sinPhi = Math.sin(currentPhi);
      const cosPhi = Math.cos(currentPhi);
      const sinTheta = Math.sin(currentTheta);
      const cosTheta = Math.cos(currentTheta);

      camera.position.set(
        target.x + currentRadius * sinPhi * sinTheta,
        target.y + currentRadius * cosPhi,
        target.z + currentRadius * sinPhi * cosTheta
      );
    }
  }

  // 更新光源位置（如果五角星移动）
  if (starLight && star) {
    starLight.position.copy(star.position);
    // 立即更新着色器中的光源位置
    if (particleCone.material instanceof THREE.ShaderMaterial && particleConfig.star.light.enabled) {
      particleCone.material.uniforms.starLightPosition.value.copy(starLight.position);
    }
  }

  if (totalProgress >= 1) {
    isAnimating = false;
    // 如果散开动画结束，保存当前实际位置（为下次聚集做准备）
    if (isScattered) {
      saveCurrentScatteredPositions();
      // 确保旋转速度设置为散开速度
      controls.autoRotateSpeed = scatteredAutoRotateSpeed;
    } else {
      // 聚集动画结束：恢复原始旋转速度
      controls.autoRotateSpeed = originalAutoRotateSpeed;
    }
    // 确保光带状态正确
    if (spiralRibbon) {
      const finalFadeProgress = isScattered ? 1.0 : 0.0;
      spiralRibbon.children.forEach((child) => {
        if (child.material && child.material.uniforms) {
          child.material.uniforms.fadeProgress.value = finalFadeProgress;
        }
      });
    }
    // 确保照片卡片缩放状态正确
    if (photoCards && originalPositions.photoCards.length > 0) {
      const scatteredScale = particleConfig.photoCards.scatteredScale || 1.5;
      originalPositions.photoCards.forEach((item) => {
        if (item.object) {
          const originalScale = item.object.userData.originalScale || new THREE.Vector3(1, 1, 1);
          if (isScattered) {
            // 散开状态：设置为放大后的缩放
            item.object.scale.copy(originalScale).multiplyScalar(scatteredScale);
          } else {
            // 聚集状态：恢复原始缩放
            item.object.scale.copy(originalScale);
          }
        }
      });
    }
    // 确保相机位置状态正确（聚拢时恢复到原始位置）
    if (!isScattered && originalPositions.cameraSpherical) {
      const target = controls.target;
      const currentTheta = controls.getAzimuthalAngle();
      const radius = originalPositions.cameraSpherical.radius;
      const phi = originalPositions.cameraSpherical.phi;

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const sinTheta = Math.sin(currentTheta);
      const cosTheta = Math.cos(currentTheta);

      camera.position.set(
        target.x + radius * sinPhi * sinTheta,
        target.y + radius * cosPhi,
        target.z + radius * sinPhi * cosTheta
      );
    }
    // 确保光源位置在动画结束时被正确更新
    if (starLight && star) {
      starLight.position.copy(star.position);
      if (particleCone.material instanceof THREE.ShaderMaterial && particleConfig.star.light.enabled) {
        particleCone.material.uniforms.starLightPosition.value.copy(starLight.position);
      }
    }
  }
}

// 相机动画状态，用于动态插值
let cameraAnimationState = {
  startRadius: 0,
  startPhi: 0,
  targetRadius: 0,
  targetPhi: 0
};

// 切换散开/聚集状态
function toggleScatter() {
  const now = Date.now();

  // 记录当前相机状态，作为动画起点
  // 这样无论何时打断或开始，都从当前视觉位置开始，避免跳变
  const currentOffset = new THREE.Vector3().copy(camera.position).sub(controls.target);
  const currentSpherical = new THREE.Spherical().setFromVector3(currentOffset);

  // 限制 Phi 防止极点问题
  currentSpherical.makeSafe();

  cameraAnimationState.startRadius = currentSpherical.radius;
  cameraAnimationState.startPhi = currentSpherical.phi;

  // 计算目标状态
  // 1. 获取散开的目标位置配置
  const targetY = particleConfig.camera.scatteredY || 1.5;
  const targetPhiDegree = particleConfig.camera.scatteredPolarAngle || 120;
  const targetPhiRad = targetPhiDegree * Math.PI / 180;

  // 反推 Radius
  // cameraY = target.y + radius * cos(phi)
  // radius = (cameraY - target.y) / cos(phi)
  let scatterTargetRadius;
  const cosTargetPhi = Math.cos(targetPhiRad);
  if (Math.abs(cosTargetPhi) < 0.001) {
    scatterTargetRadius = (originalPositions.cameraSpherical ? originalPositions.cameraSpherical.radius : 10) * (particleConfig.camera.scatteredScale || 1.5);
  } else {
    scatterTargetRadius = Math.abs((targetY - controls.target.y) / cosTargetPhi);
  }

  // 如果正在动画中，允许打断并反转
  if (isAnimating) {
    const elapsed = now - animationStartTime;
    const effectiveElapsed = Math.min(elapsed, scatterDuration);
    // 反转时间
    const newElapsed = scatterDuration - effectiveElapsed;
    animationStartTime = now - newElapsed;
    isScattered = !isScattered;

    // 注意：如果是打断，起点其实也变了（变成了刚才那一帧的位置）
    // 但为了保证插值曲线的连贯性，如果只是反转时间，我们应该保持 start 和 target 不变？
    // 不，"时间反转"技巧假设的是 start 和 target 是固定的。
    // 但现在我们的 target 是动态的（聚合时 target = start）。
    // 如果聚合时 target = start，那么动画就没有位移。
    // 所以这里的逻辑需要调整：

    // 如果是打断，简单的"时间反转"可能不再适用，因为"聚合"的目标变了（变成了不动）。
    // 之前"聚合"的目标是"回到原点"。现在是"不动"。
    // 如果我们想"立即不动"，那动画就该立即结束？
    // 或者是平滑地减速到不动？

    // 既然用户要求聚合时"不动"，那么聚合动画对于相机来说就是 no-op。
    // 所以如果是散开 -> 聚合：相机应该停在当前位置。
    // 如果是聚合 -> 散开：相机应该从当前位置（此时可能在半路）移动到散开目标。

    // 所以：无论是否打断，我们都重新设定 Start 和 Target，并重置时间。
    // 这样最简单且正确。
    // 只要 Start 是 Current，就不会有跳变。
    isAnimating = true;
    animationStartTime = now;
  } else {
    isScattered = !isScattered;
    isAnimating = true;
    animationStartTime = now;
  }

  // 设置目标状态
  if (isScattered) {
    // 散开：目标是配置的散开位置
    cameraAnimationState.targetRadius = scatterTargetRadius;
    cameraAnimationState.targetPhi = targetPhiRad;
  } else {
    // 聚合：目标是恢复到最初的状态
    if (originalPositions.cameraSpherical) {
      cameraAnimationState.targetRadius = originalPositions.cameraSpherical.radius;
      cameraAnimationState.targetPhi = originalPositions.cameraSpherical.phi;
    } else {
      // 如果没有保存原始位置，则保持当前位置
      cameraAnimationState.targetRadius = cameraAnimationState.startRadius;
      cameraAnimationState.targetPhi = cameraAnimationState.startPhi;
    }
  }

  if (isScattered) {
    // 散开：如果还没有散开位置，则生成新的随机位置
    if (!scatteredPositions.particleCone || !scatteredPositions.star) {
      generateScatteredPositions();
    }
  }
}

// 恢复相机到初始状态
function resetCameraToInitial() {
  if (!originalPositions.cameraSpherical) {
    console.warn('初始相机位置未保存，无法恢复');
    return;
  }

  const target = controls.target;
  const radius = originalPositions.cameraSpherical.radius;
  const phi = originalPositions.cameraSpherical.phi;

  // 获取当前的方位角（保持当前的水平旋转角度）
  const currentTheta = controls.getAzimuthalAngle();

  // 将球坐标转换为笛卡尔坐标
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinTheta = Math.sin(currentTheta);
  const cosTheta = Math.cos(currentTheta);

  // 计算目标位置
  const targetPosition = new THREE.Vector3(
    target.x + radius * sinPhi * sinTheta,
    target.y + radius * cosPhi,
    target.z + radius * sinPhi * cosTheta
  );

  // 平滑过渡到目标位置
  // 使用 OrbitControls 的平滑更新
  const startPosition = camera.position.clone();
  const duration = 1000; // 1秒过渡时间
  const startTime = Date.now();

  function animateCamera() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeInOutCubic(progress);

    // 插值相机位置
    camera.position.lerpVectors(startPosition, targetPosition, easedProgress);
    controls.update();

    if (progress < 1) {
      requestAnimationFrame(animateCamera);
    } else {
      // 确保最终位置准确
      camera.position.copy(targetPosition);
      controls.update();
    }
  }

  animateCamera();
}

// 初始化：保存原始位置
setTimeout(() => {
  saveOriginalPositions();
  generateScatteredPositions(); // 预生成散开位置
}, 100);

// 监听 Enter 键
window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.repeat) {
    toggleScatter();
  }

  // 监听 S 键，随机点击一张照片
  if (event.key === 's' || event.key === 'S') {
    // 防止重复触发：如果正在加载图片，忽略本次按键
    if (isPhotoLoading) {
      return;
    }

    if (!event.repeat && photoCards && photoCards.children.length > 0) {
      // 获取所有照片卡片，并过滤出有有效 imageSrc 的卡片
      const validCardGroups = photoCards.children.filter(child => {
        if (!(child instanceof THREE.Group)) return false;
        // 优先检查 cardGroup 本身的 userData.imageSrc
        if (child.userData && child.userData.imageSrc && typeof child.userData.imageSrc === 'string' && child.userData.imageSrc.length > 0) {
          return true;
        }
        // 如果没有，检查子元素
        return child.children.some(c => {
          return c.userData && c.userData.imageSrc && typeof c.userData.imageSrc === 'string' && c.userData.imageSrc.length > 0;
        });
      });

      if (validCardGroups.length > 0) {
        // 随机选择一张照片
        const randomIndex = Math.floor(Math.random() * validCardGroups.length);
        const randomCard = validCardGroups[randomIndex];

        // 获取照片的 imageSrc（优先从 cardGroup 的 userData 获取）
        let imageSrc = null;
        if (randomCard.userData && randomCard.userData.imageSrc && typeof randomCard.userData.imageSrc === 'string' && randomCard.userData.imageSrc.length > 0) {
          imageSrc = randomCard.userData.imageSrc;
        } else {
          // 如果没有，从子元素中查找
          for (const child of randomCard.children) {
            if (child.userData && child.userData.imageSrc && typeof child.userData.imageSrc === 'string' && child.userData.imageSrc.length > 0) {
              imageSrc = child.userData.imageSrc;
              break;
            }
          }
        }

        if (imageSrc) {
          openPhotoOverlay(imageSrc);
        }
      }
    }
  }

  // 监听 ESC 键，关闭放大的照片
  if (event.key === 'Escape') {
    if (overlay && overlay.classList.contains('active')) {
      closePhotoOverlay();
    }
  }

  // 监听 R 键，恢复相机到初始状态
  if ((event.key === 'r' || event.key === 'R') && !event.repeat) {
    resetCameraToInitial();
  }
});

// 动画循环
function animate() {
  requestAnimationFrame(animate);

  // 更新初始光带出现动画（如果正在进行）
  if (isInitialRibbonAnimating) {
    updateInitialRibbonAnimation();
  }

  // 更新散开/聚集动画
  updateScatterAnimation();

  // 更新粒子材质的时间（用于可能的动画效果）
  if (particleCone.material instanceof THREE.ShaderMaterial) {
    particleCone.material.uniforms.time.value += 0.01;

    // 更新光源位置（如果五角星移动）
    if (starLight && particleConfig.star.light.enabled) {
      particleCone.material.uniforms.starLightPosition.value.copy(starLight.position);
    }
  }

  // 五角星使用 MeshBasicMaterial，不需要更新 uniform

  // 更新雪花位置
  if (snowSystem) {
    const positions = snowSystem.geometry.attributes.position.array;
    const velocities = snowSystem.geometry.attributes.velocity.array;
    const drifts = snowSystem.geometry.attributes.drift.array;
    const count = snowSystem.geometry.attributes.position.count;
    const height = particleConfig.snow.height;
    const range = particleConfig.snow.range;
    const landed = snowSystem.geometry.userData.landed;
    const groundLevel = snowSystem.geometry.userData.groundLevel || 0;

    // 更新时间 uniform 供 shader 使用（如果需要）
    // snowSystem.material.uniforms.time.value += 0.01;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 如果雪花已经落地，跳过更新
      if (landed[i] === 1) {
        continue;
      }

      // 下落
      positions[i3 + 1] -= velocities[i];

      // 飘动 (使用简单的正弦波模拟风)
      positions[i3] += Math.sin(Date.now() * 0.001 + drifts[i]) * 0.02;
      positions[i3 + 2] += Math.cos(Date.now() * 0.001 + drifts[i]) * 0.02;

      // 检查是否落地
      if (positions[i3 + 1] <= groundLevel) {
        // 循环回到顶部，实现无限下雪效果
        positions[i3 + 1] = height;
        // 重新随机水平位置，避免重复路径
        positions[i3] = (Math.random() - 0.5) * range;
        positions[i3 + 2] = (Math.random() - 0.5) * range;
      }
    }

    snowSystem.geometry.attributes.position.needsUpdate = true;
  }

  // 更新金箔位置
  if (goldFoilSystem) {
    const positions = goldFoilSystem.geometry.attributes.position.array;
    const velocities = goldFoilSystem.geometry.attributes.velocity.array;
    const drifts = goldFoilSystem.geometry.attributes.drift.array;
    const count = goldFoilSystem.geometry.attributes.position.count;
    const height = particleConfig.goldFoil.height;
    const range = particleConfig.goldFoil.range;

    // 更新 shader 时间
    goldFoilSystem.material.uniforms.time.value += 0.05; // 闪烁速度

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 下落
      positions[i3 + 1] -= velocities[i];

      // 飘动 (不规则运动)
      positions[i3] += Math.sin(Date.now() * 0.002 + drifts[i]) * 0.01;
      positions[i3 + 2] += Math.cos(Date.now() * 0.0015 + drifts[i]) * 0.01;

      // 循环
      if (positions[i3 + 1] < 0) {
        positions[i3 + 1] = height;
        positions[i3] = (Math.random() - 0.5) * range;
        positions[i3 + 2] = (Math.random() - 0.5) * range;
      }
    }
    goldFoilSystem.geometry.attributes.position.needsUpdate = true;
  }

  // 更新螺旋光带的时间（用于闪光动画）
  if (spiralRibbon && spiralRibbon instanceof THREE.Group) {
    // 更新组内所有子对象的时间
    spiralRibbon.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms.time.value += 0.016; // 约60fps的时间增量
      }
    });
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

// 窗口大小调整
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 初始化手势控制
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，确保 MediaPipe 脚本加载完成
  setTimeout(() => {
    // 初始化手势控制
    const gestureController = new GestureController({
      onScatter: () => {
        if (!isScattered) toggleScatter();
      },
      onGather: () => {
        if (isScattered) toggleScatter();
      },
      onIndexPointing: () => {
        // 单指手势：模拟按下 S 键随机打开照片
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
      },
      onIndexPointingEnd: () => {
        // 取消单指手势：模拟按下 Esc 键关闭照片
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      },
      onZoom: (scale) => {
        // 根据手掌大小变化缩放画面
        if (!controls) return;

        // 调整灵敏度（值越小越不敏感，0.2 表示较低的敏感度）
        const zoomSpeed = 0.2;
        const factor = Math.pow(scale, zoomSpeed);

        // 手动计算缩放 (改变相机与目标的距离)
        // 获取当前相机相对于目标的偏移向量
        const offset = new THREE.Vector3();
        offset.copy(camera.position).sub(controls.target);

        // 获取当前距离
        const radius = offset.length();

        // 计算新距离：手变大(scale > 1) -> 距离变小; 手变小(scale < 1) -> 距离变大
        let newRadius = radius / factor;

        // 限制缩放范围 (使用 controls 的配置)
        newRadius = Math.max(controls.minDistance, Math.min(controls.maxDistance, newRadius));

        // 应用新距离
        offset.setLength(newRadius);
        camera.position.copy(controls.target).add(offset);

        controls.update();
      }
    });

    // 点击小窗切换开启/关闭状态
    const gestureContainer = document.getElementById('gesture-container');
    gestureContainer.addEventListener('click', () => {
      gestureController.toggle();
    });
  }, 1000);
});
