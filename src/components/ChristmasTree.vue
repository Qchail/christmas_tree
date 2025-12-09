<template>
  <div ref="containerRef" class="christmas-tree-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { gsap } from 'gsap'
import type { PhotoData } from '../utils/photoStorage'
import type { TreeState } from '../composables/useTreeState'
import { addBloomEffect } from '../utils/threeHelpers'
import {
  createMetallicGoldMaterial,
  createMatteGreenMaterial,
  createChristmasRedMaterial,
  createWhiteCardMaterial
} from '../utils/threeHelpers'

const props = defineProps<{
  photos: PhotoData[]
  currentState: TreeState
  zoomedPhotoId: string | null
  cameraRotationAngle?: number
}>()

const emit = defineEmits<{
  sceneReady: [scene: THREE.Scene]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let animationId: number
let cameraRotation = 0
let elementsGroup: THREE.Group
const originalPositions = new Map<THREE.Object3D, THREE.Vector3>()
const scatteredPositions = new Map<THREE.Object3D, THREE.Vector3>()

onMounted(() => {
  initThreeJS()
  createTreeElements()
  animate()
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (renderer) {
    renderer.dispose()
  }
})

watch(() => props.photos, () => {
  updatePhotoCards()
}, { deep: true })

watch(() => props.currentState, (newState) => {
  animateStateChange(newState)
})

watch(() => props.zoomedPhotoId, (photoId) => {
  if (photoId) {
    animatePhotoZoom(photoId)
  }
})

const initThreeJS = () => {
  if (!containerRef.value) return

  // 创建场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.fog = new THREE.Fog(0x000000, 10, 50)

  // 创建相机
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 0, 5)

  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  
  // 添加辉光效果
  addBloomEffect(renderer, scene, camera)
  
  containerRef.value.appendChild(renderer.domElement)

  // 添加光源
  setupLights()

  // 窗口大小调整
  window.addEventListener('resize', handleResize)
  
  emit('sceneReady', scene)
}

const setupLights = () => {
  // 环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
  scene.add(ambientLight)

  // 主光源（金色）
  const mainLight = new THREE.DirectionalLight(0xffd700, 1.5)
  mainLight.position.set(5, 5, 5)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.width = 2048
  mainLight.shadow.mapSize.height = 2048
  scene.add(mainLight)

  // 辅助光源（红色）
  const redLight = new THREE.PointLight(0xcc0000, 1, 20)
  redLight.position.set(-5, 3, -5)
  scene.add(redLight)

  // 辅助光源（绿色）
  const greenLight = new THREE.PointLight(0x2d5016, 0.8, 20)
  greenLight.position.set(5, -3, 5)
  scene.add(greenLight)

  // 体积光效果（多个点光源）
  for (let i = 0; i < 5; i++) {
    const glowLight = new THREE.PointLight(0xffd700, 0.5, 15)
    glowLight.position.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    )
    scene.add(glowLight)
    
    // 添加光晕效果
    const glowGeometry = new THREE.SphereGeometry(0.2, 16, 16)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.3
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    glow.position.copy(glowLight.position)
    scene.add(glow)
  }
}

const handleResize = () => {
  if (!camera || !renderer) return
  
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

const createTreeElements = () => {
  const group = new THREE.Group()
  
  // 创建球体装饰（金属金）
  const sphereMaterial = createMetallicGoldMaterial()
  for (let i = 0; i < 30; i++) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 16, 16),
      sphereMaterial.clone()
    )
    group.add(sphere)
  }

  // 创建正方体装饰（哑光绿）
  const boxMaterial = createMatteGreenMaterial()
  for (let i = 0; i < 20; i++) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.15, 0.15),
      boxMaterial.clone()
    )
    group.add(box)
  }

  // 创建糖果棍（圣诞红）
  const candyMaterial = createChristmasRedMaterial()
  for (let i = 0; i < 15; i++) {
    const candy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8),
      candyMaterial.clone()
    )
    group.add(candy)
  }

  // 创建照片卡片
  createPhotoCards(group)

  // 设置初始位置（合拢态 - 圣诞树形状）
  arrangeAsTree(group)
  
  // 生成散开态位置
  generateScatteredPositions(group)

  elementsGroup = group
  scene.add(group)
}

function createPhotoCards(group: THREE.Group) {
  const cardCount = Math.max(props.photos.length, 10) // 至少10张卡片
  
  for (let i = 0; i < cardCount; i++) {
    const photo = props.photos[i]
    let material: THREE.MeshStandardMaterial
    
    if (photo) {
      const texture = new THREE.TextureLoader().load(photo.url)
      texture.minFilter = THREE.LinearFilter
      material = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide
      })
    } else {
      material = createWhiteCardMaterial()
    }

    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.4),
      material
    )
    card.userData.isPhotoCard = true
    card.userData.photoId = photo?.id || null
    group.add(card)
  }
}

function updatePhotoCards() {
  if (!elementsGroup) return
  const cards = elementsGroup.children.filter(child => child.userData.isPhotoCard)
  
  cards.forEach((card, index) => {
    const photo = props.photos[index]
    const mesh = card as THREE.Mesh
    
    if (photo && mesh.material instanceof THREE.MeshStandardMaterial) {
      const texture = new THREE.TextureLoader().load(photo.url)
      texture.minFilter = THREE.LinearFilter
      mesh.material.map = texture
      mesh.material.needsUpdate = true
      mesh.userData.photoId = photo.id
    } else if (!photo && mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.map = null
      mesh.material.color.setHex(0xffffff)
      mesh.material.needsUpdate = true
      mesh.userData.photoId = null
    }
  })
}

function arrangeAsTree(group: THREE.Group) {
  const children = group.children
  let index = 0

  // 树干（底部）
  const trunkCount = 5
  for (let i = 0; i < trunkCount && index < children.length; i++) {
    const child = children[index++]
    child.position.set(
      (Math.random() - 0.5) * 0.2,
      -1 + i * 0.1,
      (Math.random() - 0.5) * 0.2
    )
    originalPositions.set(child, child.position.clone())
  }

  // 树层（从下往上）
  const layers = 8
  for (let layer = 0; layer < layers && index < children.length; layer++) {
    const layerY = -0.5 + layer * 0.3
    const radius = 0.3 + layer * 0.15
    const itemsPerLayer = Math.floor((children.length - index) / (layers - layer))
    
    for (let i = 0; i < itemsPerLayer && index < children.length; i++) {
      const child = children[index++]
      const angle = (i / itemsPerLayer) * Math.PI * 2
      const r = radius * (0.7 + Math.random() * 0.3)
      
      child.position.set(
        Math.cos(angle) * r,
        layerY + (Math.random() - 0.5) * 0.2,
        Math.sin(angle) * r
      )
      
      // 随机旋转
      child.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      )
      
      originalPositions.set(child, child.position.clone())
    }
  }

  // 树顶
  if (index < children.length) {
    const top = children[index++]
    top.position.set(0, 1.5, 0)
    originalPositions.set(top, top.position.clone())
  }
}

function generateScatteredPositions(group: THREE.Group) {
  group.children.forEach((child) => {
    const scatteredPos = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    )
    scatteredPositions.set(child, scatteredPos)
  })
}

function animateStateChange(newState: TreeState) {
  if (!elementsGroup) return
  const children = elementsGroup.children
  
  children.forEach((child) => {
    let targetPos: THREE.Vector3
    let targetRot: THREE.Euler
    
    if (newState === 'gathered') {
      targetPos = originalPositions.get(child) || new THREE.Vector3()
      targetRot = new THREE.Euler(0, 0, 0)
    } else if (newState === 'scattered' || newState === 'zoomed') {
      targetPos = scatteredPositions.get(child) || new THREE.Vector3()
      targetRot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      )
    } else {
      return
    }

    gsap.to(child.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1,
      ease: 'power2.inOut'
    })

    gsap.to(child.rotation, {
      x: targetRot.x,
      y: targetRot.y,
      z: targetRot.z,
      duration: 1,
      ease: 'power2.inOut'
    })
  })
}

function animatePhotoZoom(photoId: string | null) {
  if (!elementsGroup || !photoId) return
  
  // 如果是 'center-photo'，找到最接近中心的照片卡片
  let card: THREE.Object3D | undefined
  
  if (photoId === 'center-photo') {
    // 找到所有照片卡片，选择最接近中心的
    const photoCards = elementsGroup.children.filter(
      child => child.userData.isPhotoCard
    )
    
    if (photoCards.length > 0) {
      // 找到距离中心最近的卡片
      let minDistance = Infinity
      photoCards.forEach(c => {
        const distance = c.position.length()
        if (distance < minDistance) {
          minDistance = distance
          card = c
        }
      })
    }
  } else {
    card = elementsGroup.children.find(
      child => child.userData.isPhotoCard && child.userData.photoId === photoId
    )
  }
  
  if (card) {
    gsap.to(card.scale, {
      x: 3,
      y: 3,
      z: 3,
      duration: 0.8,
      ease: 'power2.out'
    })
    
    gsap.to(card.position, {
      x: 0,
      y: 0,
      z: 0,
      duration: 0.8,
      ease: 'power2.out'
    })
  }
}

const animate = () => {
  animationId = requestAnimationFrame(animate)
  
  // 相机旋转（在散开态时）
  if (props.currentState === 'scattered') {
    if (props.cameraRotationAngle !== undefined) {
      // 使用手势控制的旋转
      camera.position.x = Math.cos(props.cameraRotationAngle) * 5
      camera.position.z = Math.sin(props.cameraRotationAngle) * 5
    } else {
      // 自动旋转
      cameraRotation += 0.005
      camera.position.x = Math.cos(cameraRotation) * 5
      camera.position.z = Math.sin(cameraRotation) * 5
    }
    camera.lookAt(0, 0, 0)
  }
  
  renderer.render(scene, camera)
}

defineExpose({
  scene,
  camera,
  renderer
})
</script>

<style scoped>
.christmas-tree-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.christmas-tree-container canvas {
  display: block;
}
</style>

