// 小球粒子系统配置
export const particleConfig = {
  // ========== 圆锥体形状参数 ==========
  cone: {
    height: 8,           // 圆锥体高度
    baseRadius: 5,       // 底部半径
    particleCount: 3000  // 粒子数量（增加以产生更多绿色粒子）
  },

  // ========== 小球大小参数 ==========
  size: {
    min: 0.4,            // 最小大小
    max: 1.0,            // 最大大小
    scale: 300.0         // 着色器缩放因子（数值越大，小球越大）
  },

  // ========== 颜色参数 ==========
  color: {
    base: 0x228B22,      // 基础颜色（圣诞绿色）
    variationMin: 0.8,   // 颜色亮度变化最小值
    variationMax: 1.0    // 颜色亮度变化最大值
  },

  // ========== 黄色粒子参数 ==========
  yellowParticles: {
    enabled: true,       // 是否启用黄色粒子
    ratio: 0.20,         // 黄色粒子比例（降低比例，让绿色粒子更多）
    color: 0xFFFF00,     // 黄色粒子颜色（亮金色）
    glowColor: 0xFFFF00, // 黄色粒子发光颜色（亮金色）
    glowIntensity: 1.5   // 黄色粒子发光强度倍数（相对于基础发光强度）
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
  },

  // ========== 五角星参数 ==========
  star: {
    enabled: true,        // 是否启用五角星
    size: 0.6,            // 五角星大小
    color: 0xFFFF00,      // 五角星颜色（金色）
    glowColor: 0xFFFF00, // 发光颜色
    glowIntensity: 1.0,   // 发光强度 (与黄色小球一致)
    thickness: 0.3,       // 五角星厚度（增加厚度让它更饱满）
    innerRadiusRatio: 0.6, // 内圆半径比例（0-1，数值越大越圆润饱满，默认0.4）
    bevelThickness: 0.1,  // 厚度边缘圆角深度（水平旋转时看到的侧面圆角，数值越大圆角越明显，建议0.05-0.2）
    bevelSize: 0.1,       // 厚度边缘圆角大小（水平旋转时看到的侧面圆角，数值越大圆角越明显，建议0.05-0.2）
    bevelSegments: 16,    // 侧面圆角分段数（数值越大圆角越平滑，建议5-12）
    curveSegments: 16,   // 曲线分段数（数值越大形状越平滑，建议12-24）
    cornerRadius: 0.02,  // 五角星角的圆角半径（数值越大圆角越明显，建议0.02-0.1）
    positionOffset: {     // 位置偏移
      x: 0,               // X 轴偏移
      y: 0.5,               // Y 轴偏移（高度）
      z: -0.15              // Z 轴偏移（前后位置，正值向前）
    },
    // 光源参数
    light: {
      enabled: true,      // 是否启用光源
      color: 0xFFFF00,    // 光源颜色（金色）
      intensity: 10.0,     // 光源强度
      distance: 15.0,     // 光源影响距离
      decay: 2.0          // 光源衰减（2.0 = 物理衰减）
    }
  },

  // ========== 雪花参数 ==========
  snow: {
    enabled: true,        // 是否启用雪花
    count: 3000,          // 雪花数量
    color: 0xFFFFFF,      // 雪花颜色
    range: 30.0,          // 雪花分布范围（xz平面大小）
    height: 30.0,         // 雪花分布高度
    size: {
      min: 0.5,          // 最小大小
      max: 0.8           // 最大大小
    },
    speed: {
      min: 0.005,         // 最小下落速度
      max: 0.01           // 最大下落速度
    },
    opacity: {
      min: 0.3,           // 最小透明度
      max: 0.8            // 最大透明度
    }
  },

  // ========== 金箔碎片参数 ==========
  goldFoil: {
    enabled: true,
    count: 300,          // 数量
    color: 0xFFD700,     // 金色
    range: 20.0,         // 分布范围
    height: 20.0,        // 分布高度
    size: {
      min: 0.5,          // 最小大小
      max: 1.8           // 最大大小
    },
    speed: {
      min: 0.01,         // 下落速度
      max: 0.03
    }
  },

  // ========== 圣诞球装饰 ==========
  ornaments: {
    enabled: true,
    count: 12,           // 增加一点数量
    radius: 0.25,        // 球体半径
    color: 0xFFFF00,     // 颜色 (与五角星一致 - 亮黄)
    metalness: 1.0,      // 金属度 (拉满，最强金属质感)
    roughness: 0.0,      // 粗糙度 (拉低，如镜面般光滑)
    emissive: 0xFFFF00,  // 自发光颜色 (与五角星一致)
    emissiveIntensity: 3.0 // 自发光强度 (大幅增强，产生刺眼反光)
  },

  // ========== 红色小球装饰 ==========
  redOrnaments: {
    enabled: true,
    count: 12,           // 数量比金球多一些
    radius: 0.25,        // 半径 (与金球一致)
    color: 0xFF0000,     // 颜色 (纯红)
    metalness: 1.0,      // 金属度 (拉满，最强反光)
    roughness: 0.0,      // 粗糙度 (拉低，如镜面般光滑)
    emissive: 0xFF0000,  // 自发光颜色 (红色)
    emissiveIntensity: 3.5 // 自发光强度 (大幅增强，产生刺眼反光)
  },

  // ========== 蓝色小球装饰 ==========
  blueOrnaments: {
    enabled: true,
    count: 12,           // 数量 (与红色小球一致)
    radius: 0.25,        // 半径 (与红色小球一致)
    color: 0x0080FF,     // 颜色 (蓝色)
    metalness: 1.0,      // 金属度 (拉满，最强反光)
    roughness: 0.0,      // 粗糙度 (拉低，如镜面般光滑)
    emissive: 0x0080FF,  // 自发光颜色 (蓝色)
    emissiveIntensity: 3.5 // 自发光强度 (大幅增强，产生刺眼反光)
  },

  // ========== 螺旋光带参数 ==========
  spiralRibbon: {
    enabled: true,        // 是否启用螺旋光带
    turns: 3.5,          // 螺旋圈数（增加圈数，更完整地缠绕）
    width: 0.12,         // 丝带宽度（稍微加宽，更明显）
    height: 0.015,       // 丝带厚度（扁平，模拟真实丝带）
    color: 0xFFD700,     // 金黄色基础颜色（标准金色）
    glowColor: 0xFFE87C, // 辉光颜色（亮金色，创造温暖的高级感）
    glowIntensity: 3.5,  // 辉光强度（增强发光效果）
    sparkleSpeed: 4.5,   // 闪光速度（更快的闪光，布灵布灵效果）
    sparkleIntensity: 3.5, // 闪光强度（大幅增强闪光效果，创造布灵布灵感）
    offset: 0.15,        // 距离树表面的偏移量（稍微远离，更明显）
    // 动画时长参数（单位：毫秒）
    animation: {
      initialFadeDuration: 1000,  // 初始光带出现动画时长（页面加载时）
      fadeDuration: 500          // 散开/聚集时光带消失和出现的动画时长
    }
  },

  // ========== 照片卡片参数 ==========
  photoCards: {
    enabled: true,       // 是否启用照片卡片
    count: 25,           // 默认卡片数量（当没有用户上传照片时使用）
    cardWidth: 0.5,      // 卡片宽度
    cardHeight: 0.65,     // 卡片高度
    photoSize: 0.5       // 照片大小
  }
};

