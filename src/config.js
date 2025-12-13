// 小球粒子系统配置
export const particleConfig = {
  // ========== 圆锥体形状参数 ==========
  cone: {
    height: 8,           // 圆锥体高度
    baseRadius: 5,       // 底部半径
    particleCount: 2000  // 粒子数量（影响性能，建议 1000-5000）
  },

  // ========== 小球大小参数 ==========
  size: {
    min: 0.2,            // 最小大小
    max: 0.6,            // 最大大小
    scale: 200.0         // 着色器缩放因子（数值越大，小球越大）
  },

  // ========== 颜色参数 ==========
  color: {
    base: 0x228B22,      // 基础颜色（圣诞绿色）
    variationMin: 0.8,   // 颜色亮度变化最小值
    variationMax: 1.0    // 颜色亮度变化最大值
  },

  // ========== 光照参数 ==========
  lighting: {
    light1: {
      position: { x: 0, y: 10, z: 5 },  // 光源1位置
      intensity: 1.5,                    // 光源1强度
      color: 0xffffff                    // 光源颜色
    },
    light2: {
      position: { x: 5, y: 8, z: -5 },   // 光源2位置
      intensity: 0.8                     // 光源2强度
    },
    ambient: 1.0,                        // 环境光强度（增加到1.0以消除阴影）
    shininess: 32.0,                     // 高光锐度（数值越大，高光越集中）
    specularStrength: 0.8                // 镜面反射强度
  },

  // ========== 粒子外观参数 ==========
  appearance: {
    radius: 0.45,         // 粒子半径（0-0.5，影响圆形大小）
    edge: 0.05,          // 边缘柔化（影响边缘模糊程度）
    colorEnhancement: 1.2 // 颜色增强倍数
  },

  // ========== 发光效果参数 ==========
  glow: {
    enabled: true,        // 是否启用发光效果
    intensity: 5.0,       // 发光强度（数值越大越亮，建议1.0-3.0）
    color: 0x228B22,      // 发光颜色（默认与基础颜色相同）
    bloom: 0.8            // 光晕衰减（数值越小，中心越亮边缘越暗，建议0.5-1.5）
  }
};

