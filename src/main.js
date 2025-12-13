import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { particleConfig } from './config.js';

console.log('Three.js 版本:', THREE.REVISION);

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

// 开启自动旋转
controls.autoRotate = true;
controls.autoRotateSpeed = -1.0; // 负值实现画面逆时针旋转（相机顺时针公转），数值越小越慢

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
        gl_PointSize = size * (pointSizeScale / -mvPosition.z);
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
        vec3 finalColor = vec3(0.0);
        
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
  // 使用 MeshBasicMaterial 并增强自发光效果
  const material = new THREE.MeshBasicMaterial({
    color: particleConfig.star.color,
    emissive: particleConfig.star.glowColor,
    emissiveIntensity: particleConfig.star.glowIntensity * 2.0, // 增强发光强度
    transparent: false,
    side: THREE.DoubleSide
  });

  const star = new THREE.Mesh(geometry, material);

  // #region agent log
  // 检查着色器编译错误
  const program = material.program;
  const hasError = program && (program.error || !program.program);
  fetch('http://127.0.0.1:7242/ingest/1bb3b66e-759d-4ad4-bdba-022ceafa4832', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'main.js:373', message: 'Star mesh created', data: { hasGeometry: !!star.geometry, hasMaterial: !!star.material, materialType: star.material?.type, hasProgram: !!program, programError: hasError, vertexShaderError: material.vertexShader?.includes('error'), fragmentShaderError: material.fragmentShader?.includes('error') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1bb3b66e-759d-4ad4-bdba-022ceafa4832', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'main.js:385', message: 'Star position set', data: { positionX: star.position.x, positionY: star.position.y, positionZ: star.position.z, rotationZ: star.rotation.z }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
  // #endregion

  return star;
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

  const range = particleConfig.snow.range;
  const height = particleConfig.snow.height;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // 随机位置
    positions[i3] = (Math.random() - 0.5) * range;
    positions[i3 + 1] = Math.random() * height;
    positions[i3 + 2] = (Math.random() - 0.5) * range;

    // 随机参数
    velocities[i] = particleConfig.snow.speed.min + Math.random() * (particleConfig.snow.speed.max - particleConfig.snow.speed.min);
    sizes[i] = particleConfig.snow.size.min + Math.random() * (particleConfig.snow.size.max - particleConfig.snow.size.min);
    opacities[i] = particleConfig.snow.opacity.min + Math.random() * (particleConfig.snow.opacity.max - particleConfig.snow.opacity.min);
    drifts[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('drift', new THREE.BufferAttribute(drifts, 1));

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
        gl_PointSize = size * (pointSizeScale / -mvPosition.z);
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

// 创建粒子圆锥体
const particleCone = createParticleCone();
scene.add(particleCone);
console.log('粒子圆锥体已创建，粒子数量:', particleCone.geometry.attributes.position.count / 3);

// 创建并添加五角星
const star = createStar();
let starLight = null;
if (star) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1bb3b66e-759d-4ad4-bdba-022ceafa4832', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'main.js:396', message: 'Before adding star to scene', data: { starExists: !!star, hasGeometry: !!star?.geometry, hasMaterial: !!star?.material }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
  // #endregion
  scene.add(star);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1bb3b66e-759d-4ad4-bdba-022ceafa4832', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'main.js:399', message: 'After adding star to scene', data: { starInScene: scene.children.includes(star), sceneChildrenCount: scene.children.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
  // #endregion
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

// 动画循环
function animate() {
  requestAnimationFrame(animate);

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

    // 更新时间 uniform 供 shader 使用（如果需要）
    // snowSystem.material.uniforms.time.value += 0.01;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // 下落
      positions[i3 + 1] -= velocities[i];

      // 飘动 (使用简单的正弦波模拟风)
      positions[i3] += Math.sin(Date.now() * 0.001 + drifts[i]) * 0.02;
      positions[i3 + 2] += Math.cos(Date.now() * 0.001 + drifts[i]) * 0.02;

      // 循环
      if (positions[i3 + 1] < 0) {
        positions[i3 + 1] = height;
        positions[i3] = (Math.random() - 0.5) * range;
        positions[i3 + 2] = (Math.random() - 0.5) * range;
      }
    }

    snowSystem.geometry.attributes.position.needsUpdate = true;
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
