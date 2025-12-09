<template>
  <div class="camera-preview">
    <div class="preview-header">
      <span>摄像头预览</span>
      <button @click="toggleMinimize" class="minimize-btn">{{ minimized ? '□' : '—' }}</button>
    </div>
    <div v-if="!minimized" class="preview-content">
      <video
        ref="videoElement"
        autoplay
        playsinline
        class="video-element"
      ></video>
      <canvas
        ref="canvasElement"
        class="canvas-overlay"
      ></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useHandTracking, type HandResult } from '../composables/useHandTracking'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { HAND_CONNECTIONS } from '@mediapipe/hands'

const props = defineProps<{
  handResults: HandResult[]
}>()

const videoElement = ref<HTMLVideoElement | null>(null)
const canvasElement = ref<HTMLCanvasElement | null>(null)
const minimized = ref(false)
const handTracking = useHandTracking()

onMounted(async () => {
  await nextTick()
  if (videoElement.value) {
    await handTracking.initializeHands(videoElement.value)
  }
})

onUnmounted(() => {
  handTracking.stopTracking()
})

watch(() => props.handResults, () => {
  if (!minimized.value) {
    drawHands()
  }
}, { deep: true, immediate: true })

const drawHands = () => {
  if (!canvasElement.value || !videoElement.value) return

  const canvas = canvasElement.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  canvas.width = videoElement.value.videoWidth || 640
  canvas.height = videoElement.value.videoHeight || 480

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  props.handResults.forEach((handResult) => {
    if (handResult.landmarks.length < 21) return

    const landmarks = handResult.landmarks.map(l => ({
      x: l.x * canvas.width,
      y: l.y * canvas.height,
      z: l.z
    }))

    // 绘制连接线
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
      color: '#00ff00',
      lineWidth: 2
    })

    // 绘制关键点
    drawLandmarks(ctx, landmarks, {
      color: '#ff0000',
      radius: 3
    })
  })
}

const toggleMinimize = () => {
  minimized.value = !minimized.value
}
</script>

<style scoped>
.camera-preview {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 320px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 10px;
  overflow: hidden;
  z-index: 100;
  border: 2px solid #ffd700;
  backdrop-filter: blur(10px);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: rgba(255, 215, 0, 0.2);
  color: #ffd700;
  font-size: 12px;
  font-weight: 600;
}

.minimize-btn {
  background: transparent;
  border: none;
  color: #ffd700;
  cursor: pointer;
  font-size: 16px;
  padding: 0 8px;
}

.preview-content {
  position: relative;
  width: 100%;
  padding-top: 75%; /* 4:3 比例 */
}

.video-element,
.canvas-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.canvas-overlay {
  pointer-events: none;
}
</style>

