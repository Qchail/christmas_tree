import { ref, computed } from 'vue'

export type TreeState = 'gathered' | 'scattered' | 'zoomed'

export function useTreeState() {
  const currentState = ref<TreeState>('gathered')
  const zoomedPhotoId = ref<string | null>(null)
  const isTransitioning = ref(false)

  const setState = (state: TreeState, photoId?: string) => {
    if (isTransitioning.value) return
    
    isTransitioning.value = true
    currentState.value = state
    if (state === 'zoomed' && photoId) {
      zoomedPhotoId.value = photoId
    } else if (state !== 'zoomed') {
      zoomedPhotoId.value = null
    }
    
    // 过渡动画完成后重置标志
    setTimeout(() => {
      isTransitioning.value = false
    }, 1000)
  }

  const isGathered = computed(() => currentState.value === 'gathered')
  const isScattered = computed(() => currentState.value === 'scattered')
  const isZoomed = computed(() => currentState.value === 'zoomed')

  return {
    currentState,
    zoomedPhotoId,
    isTransitioning,
    setState,
    isGathered,
    isScattered,
    isZoomed
  }
}

