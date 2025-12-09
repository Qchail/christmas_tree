# 3D粒子圣诞树相册

一个基于 Vue 3 + Three.js + MediaPipe Hands 的手势交互3D粒子圣诞树相册应用。

## 功能特性

- 🎄 **3D粒子圣诞树**：使用 Three.js 实现的精美3D圣诞树，包含球体、正方体、糖果棍和照片卡片等元素
- ✋ **手势交互**：使用 MediaPipe Hands 实现手势识别，支持握拳、打开五指、手旋转、抓取等手势
- 📸 **照片上传**：支持上传照片并持久化到 localStorage
- 🎨 **电影级视觉效果**：金碧辉煌的辉光和光晕效果，哑光绿 + 金属金 + 圣诞红色配色方案
- 🎭 **三种状态**：合拢态、散开态、照片放大态，支持平滑过渡动画

## 技术栈

- Vue 3 + TypeScript
- Vite
- Three.js
- MediaPipe Hands
- GSAP (动画)

## 安装和运行

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn dev

# 构建生产版本
yarn build
```

## 使用说明

1. **上传照片**：点击右上角的"上传照片"按钮，选择图片文件
2. **手势控制**：
   - ✊ **握拳**：切换到合拢态（所有元素聚拢成圣诞树形状）
   - ✋ **打开五指**：切换到散开态（元素在空间中散开漂浮）
   - 🔄 **手旋转**：在散开态下旋转相机视角
   - 👆 **抓取动作**：在散开态下抓取并放大中心照片
3. **摄像头预览**：右下角显示摄像头画面和手势检测的骨骼点

## 项目结构

```
src/
├── components/
│   ├── ChristmasTree.vue      # 主3D场景组件
│   ├── PhotoUpload.vue        # 照片上传组件
│   └── CameraPreview.vue      # 摄像头预览组件
├── composables/
│   ├── useTreeState.ts        # 状态管理
│   ├── useHandTracking.ts     # 手势识别
│   └── useHandInteraction.ts  # 手势交互逻辑
├── utils/
│   ├── threeHelpers.ts        # Three.js 工具函数
│   └── photoStorage.ts        # 照片存储工具
├── App.vue
└── main.ts
```

## 浏览器要求

- 支持 WebGL 的现代浏览器
- 需要摄像头权限用于手势识别

## 许可证

MIT

