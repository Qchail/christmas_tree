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
      glowBloom: { value: particleConfig.glow.bloom }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 particleColor;
      attribute float colorType;
      uniform float pointSizeScale;
      varying vec3 vColor;
      varying float vColorType;
      
      void main() {
        vColor = particleColor;
        vColorType = colorType;
        
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
      
      varying vec3 vColor;
      varying float vColorType;
      
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
        
        // 完全由内向外发光，不使用环境光和光照
        vec3 finalColor = vec3(0.0);
        
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

  for (let i = 0; i < points * 2; i++) {
    // 调整角度，使五角星的一个角朝上（正立）
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;

    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  shape.closePath();

  // 使用挤压几何体创建3D五角星，添加圆角让边缘更圆润
  const extrudeSettings = {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: particleConfig.star.bevelSize,
    bevelSize: particleConfig.star.bevelSize,
    bevelSegments: 3, // 圆角分段数，让圆角更平滑
    curveSegments: 8  // 曲线分段数，让形状更平滑
  };
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // 创建发光材质
  const material = new THREE.MeshBasicMaterial({
    color: particleConfig.star.color,
    emissive: particleConfig.star.glowColor,
    emissiveIntensity: particleConfig.star.glowIntensity,
    transparent: true,
    opacity: 0.9
  });

  const star = new THREE.Mesh(geometry, material);

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

  return star;
}

// 创建粒子圆锥体
const particleCone = createParticleCone();
scene.add(particleCone);
console.log('粒子圆锥体已创建，粒子数量:', particleCone.geometry.attributes.position.count / 3);

// 创建并添加五角星
const star = createStar();
if (star) {
  scene.add(star);
  console.log('五角星已创建');
}

// 动画循环
function animate() {
  requestAnimationFrame(animate);

  // 更新粒子材质的时间（用于可能的动画效果）
  if (particleCone.material instanceof THREE.ShaderMaterial) {
    particleCone.material.uniforms.time.value += 0.01;
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
