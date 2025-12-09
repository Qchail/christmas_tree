import { ref, onMounted, onUnmounted } from 'vue'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'

export interface HandLandmark {
  x: number
  y: number
  z: number
}

export interface HandResult {
  landmarks: HandLandmark[]
  handedness: string
}

export function useHandTracking() {
  const hands = ref<Hands | null>(null)
  const camera = ref<Camera | null>(null)
  const videoElement = ref<HTMLVideoElement | null>(null)
  const handResults = ref<HandResult[]>([])
  const isInitialized = ref(false)
  const error = ref<string | null>(null)

  const initializeHands = async (video: HTMLVideoElement) => {
    try {
      videoElement.value = video
      
      const handsInstance = new Hands({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        }
      })

      handsInstance.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      })

      handsInstance.onResults((results) => {
        handResults.value = results.multiHandLandmarks.map((landmarks, index) => ({
          landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
          handedness: results.multiHandedness[index]?.displayName || 'Unknown'
        }))
      })

      hands.value = handsInstance

      const cameraInstance = new Camera(video, {
        onFrame: async () => {
          if (hands.value) {
            await hands.value.send({ image: video })
          }
        },
        width: 640,
        height: 480
      })

      camera.value = cameraInstance
      cameraInstance.start()
      isInitialized.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : '初始化手势识别失败'
      console.error('手势识别初始化错误:', err)
    }
  }

  const stopTracking = () => {
    if (camera.value) {
      camera.value.stop()
      camera.value = null
    }
    if (hands.value) {
      hands.value.close()
      hands.value = null
    }
    isInitialized.value = false
  }

  onUnmounted(() => {
    stopTracking()
  })

  return {
    initializeHands,
    stopTracking,
    handResults,
    isInitialized,
    error,
    videoElement
  }
}

