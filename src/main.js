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

    // 从配置文件读取大小范围
    const sizeRange = particleConfig.size.max - particleConfig.size.min;
    sizes[i] = particleConfig.size.min + Math.random() * sizeRange;

    // 从配置文件读取颜色变化范围
    const colorVariationRange = particleConfig.color.variationMax - particleConfig.color.variationMin;
    const colorVariation = particleConfig.color.variationMin + Math.random() * colorVariationRange;
    colors[i3] = greenColor.r * colorVariation;
    colors[i3 + 1] = greenColor.g * colorVariation;
    colors[i3 + 2] = greenColor.b * colorVariation;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('particleColor', new THREE.BufferAttribute(colors, 3));

  // 创建着色器材质（带光泽效果）
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      lightPosition: {
        value: new THREE.Vector3(
          particleConfig.lighting.light1.position.x,
          particleConfig.lighting.light1.position.y,
          particleConfig.lighting.light1.position.z
        )
      },
      lightPosition2: {
        value: new THREE.Vector3(
          particleConfig.lighting.light2.position.x,
          particleConfig.lighting.light2.position.y,
          particleConfig.lighting.light2.position.z
        )
      },
      viewerPosition: { value: camera.position },
      lightColor: { value: new THREE.Color(particleConfig.lighting.light1.color) },
      lightIntensity: { value: particleConfig.lighting.light1.intensity },
      lightIntensity2: { value: particleConfig.lighting.light2.intensity },
      shininess: { value: particleConfig.lighting.shininess },
      specularStrength: { value: particleConfig.lighting.specularStrength },
      ambientIntensity: { value: particleConfig.lighting.ambient },
      pointSizeScale: { value: particleConfig.size.scale },
      particleRadius: { value: particleConfig.appearance.radius },
      particleEdge: { value: particleConfig.appearance.edge },
      colorEnhancement: { value: particleConfig.appearance.colorEnhancement }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 particleColor;
      uniform float pointSizeScale;
      varying vec3 vColor;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      
      void main() {
        vColor = particleColor;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        
        // 从配置读取缩放因子
        gl_PointSize = size * (pointSizeScale / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 lightPosition;
      uniform vec3 lightPosition2;
      uniform vec3 viewerPosition;
      uniform vec3 lightColor;
      uniform float lightIntensity;
      uniform float lightIntensity2;
      uniform float shininess;
      uniform float specularStrength;
      uniform float ambientIntensity;
      uniform float particleRadius;
      uniform float particleEdge;
      uniform float colorEnhancement;
      
      varying vec3 vColor;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      
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
        
        // 转换法线到世界空间（简化处理，使用视图空间）
        vec3 viewNormal = normalize(normal);
        vec3 viewPos = normalize(vViewPosition);
        
        // 计算光照方向（在视图空间）
        vec3 lightDir1 = normalize((viewMatrix * vec4(lightPosition, 1.0)).xyz - (viewMatrix * vec4(vWorldPosition, 1.0)).xyz);
        vec3 lightDir2 = normalize((viewMatrix * vec4(lightPosition2, 1.0)).xyz - (viewMatrix * vec4(vWorldPosition, 1.0)).xyz);
        
        // 从配置读取环境光强度
        vec3 ambient = vColor * ambientIntensity;
        
        // 漫反射（光源1）
        float diff1 = max(dot(viewNormal, lightDir1), 0.0);
        vec3 diffuse1 = vColor * lightColor * diff1 * lightIntensity;
        
        // 漫反射（光源2）
        float diff2 = max(dot(viewNormal, lightDir2), 0.0);
        vec3 diffuse2 = vColor * lightColor * diff2 * lightIntensity2;
        
        // 镜面反射（高光）- Blinn-Phong
        vec3 viewDir = normalize(-viewPos);
        vec3 halfDir1 = normalize(lightDir1 + viewDir);
        vec3 halfDir2 = normalize(lightDir2 + viewDir);
        
        float spec1 = pow(max(dot(viewNormal, halfDir1), 0.0), shininess);
        float spec2 = pow(max(dot(viewNormal, halfDir2), 0.0), shininess);
        
        vec3 specular1 = lightColor * spec1 * specularStrength * lightIntensity;
        vec3 specular2 = lightColor * spec2 * specularStrength * lightIntensity2;
        
        // 组合所有光照
        vec3 finalColor = ambient + diffuse1 + diffuse2 + specular1 + specular2;
        
        // 从配置读取颜色增强倍数
        finalColor = pow(finalColor, vec3(0.9)) * colorEnhancement;
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthWrite: false,
    depthTest: true
  });

  const particleSystem = new THREE.Points(geometry, material);
  return particleSystem;
}

// 创建粒子圆锥体
const particleCone = createParticleCone();
scene.add(particleCone);
console.log('粒子圆锥体已创建，粒子数量:', particleCone.geometry.attributes.position.count / 3);

// 动画循环
function animate() {
  requestAnimationFrame(animate);

  // 更新粒子材质的时间（用于可能的动画效果）
  if (particleCone.material instanceof THREE.ShaderMaterial) {
    particleCone.material.uniforms.time.value += 0.01;
    // 更新相机位置到着色器
    particleCone.material.uniforms.viewerPosition.value.copy(camera.position);
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
