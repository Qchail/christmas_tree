<template>
  <div class="app">
    <PhotoUpload @photos-changed="handlePhotosChanged" />
    <CameraPreview :hand-results="handResults" />
    <ChristmasTree
      ref="treeRef"
      :photos="photos"
      :current-state="currentState"
      :zoomed-photo-id="zoomedPhotoId"
      :camera-rotation-angle="cameraRotationAngle"
    />
    <div class="status-indicator">
      <div class="status-item" :class="{ active: isGathered }">
        <span class="status-icon">✊</span>
        <span class="status-text">合拢态</span>
      </div>
      <div class="status-item" :class="{ active: isScattered }">
        <span class="status-icon">✋</span>
        <span class="status-text">散开态</span>
      </div>
      <div class="status-item" :class="{ active: isZoomed }">
        <span class="status-icon">👆</span>
        <span class="status-text">照片放大</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import PhotoUpload from './components/PhotoUpload.vue'
import CameraPreview from './components/CameraPreview.vue'
import ChristmasTree from './components/ChristmasTree.vue'
import { useTreeState } from './composables/useTreeState'
import { useHandTracking, type HandResult } from './composables/useHandTracking'
import { useHandInteraction } from './composables/useHandInteraction'
import type { PhotoData } from './utils/photoStorage'

const photos = ref<PhotoData[]>([])
const handResults = ref<HandResult[]>([])
const treeRef = ref<InstanceType<typeof ChristmasTree> | null>(null)

const {
  currentState,
  zoomedPhotoId,
  setState,
  isGathered,
  isScattered,
  isZoomed
} = useTreeState()

const handTracking = useHandTracking()
const trackingResults = handTracking.handResults

let cameraRotationAngle = 0

const handleCameraRotate = (rotation: number) => {
  if (currentState.value === 'scattered') {
    cameraRotationAngle = rotation
  }
}

const { processHandGesture } = useHandInteraction(
  trackingResults,
  currentState,
  setState,
  handleCameraRotate
)

let gestureInterval: number

onMounted(() => {
  // 定期处理手势
  gestureInterval = window.setInterval(() => {
    handResults.value = trackingResults.value
    processHandGesture()
  }, 100)
})

onUnmounted(() => {
  if (gestureInterval) {
    clearInterval(gestureInterval)
  }
})

const handlePhotosChanged = (newPhotos: PhotoData[]) => {
  photos.value = newPhotos
}
</script>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.status-indicator {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 15px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 20px;
  border: 2px solid rgba(255, 215, 0, 0.3);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  transition: all 0.3s;
}

.status-item.active {
  background: rgba(255, 215, 0, 0.2);
  border-color: #ffd700;
  color: #ffd700;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
}

.status-icon {
  font-size: 16px;
}

.status-text {
  font-weight: 600;
}
</style>

