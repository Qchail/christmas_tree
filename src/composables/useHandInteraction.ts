import { watch } from 'vue'
import type { HandResult } from './useHandTracking'
import type { TreeState } from './useTreeState'
import { gsap } from 'gsap'

export interface HandGesture {
  type: 'fist' | 'open' | 'rotate' | 'grab' | 'none'
  rotation?: number
  center?: { x: number; y: number; z: number }
}

function calculateFingerBend(landmarks: any[], tipIndex: number, pipIndex: number, mcpIndex: number): number {
  const tip = landmarks[tipIndex]
  const pip = landmarks[pipIndex]
  const mcp = landmarks[mcpIndex]
  
  const a = Math.sqrt(
    Math.pow(tip.x - pip.x, 2) + 
    Math.pow(tip.y - pip.y, 2) + 
    Math.pow(tip.z - pip.z, 2)
  )
  const b = Math.sqrt(
    Math.pow(pip.x - mcp.x, 2) + 
    Math.pow(pip.y - mcp.y, 2) + 
    Math.pow(pip.z - mcp.z, 2)
  )
  const c = Math.sqrt(
    Math.pow(tip.x - mcp.x, 2) + 
    Math.pow(tip.y - mcp.y, 2) + 
    Math.pow(tip.z - mcp.z, 2)
  )
  
  const angle = Math.acos((a * a + b * b - c * c) / (2 * a * b))
  return angle
}

function detectGesture(handResult: HandResult | null): HandGesture {
  if (!handResult || !handResult.landmarks || handResult.landmarks.length < 21) {
    return { type: 'none' }
  }

  const landmarks = handResult.landmarks

  // 计算手指弯曲度
  const thumbBend = calculateFingerBend(landmarks, 4, 3, 2)
  const indexBend = calculateFingerBend(landmarks, 8, 6, 5)
  const middleBend = calculateFingerBend(landmarks, 12, 10, 9)
  const ringBend = calculateFingerBend(landmarks, 16, 14, 13)
  const pinkyBend = calculateFingerBend(landmarks, 20, 18, 17)

  const bends = [thumbBend, indexBend, middleBend, ringBend, pinkyBend]
  const avgBend = bends.reduce((a, b) => a + b, 0) / bends.length

  // 计算手部中心点
  const center = {
    x: landmarks[9].x, // 中指根部
    y: landmarks[9].y,
    z: landmarks[9].z
  }

  // 握拳检测：所有手指都弯曲
  if (avgBend < 0.8) {
    return { type: 'fist', center }
  }

  // 打开五指检测：所有手指都伸直
  if (avgBend > 1.5 && indexBend > 1.4 && middleBend > 1.4 && ringBend > 1.4 && pinkyBend > 1.4) {
    return { type: 'open', center }
  }

  // 抓取检测：拇指和食指接近
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const distance = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) +
    Math.pow(thumbTip.y - indexTip.y, 2) +
    Math.pow(thumbTip.z - indexTip.z, 2)
  )
  
  if (distance < 0.05 && avgBend > 1.0) {
    return { type: 'grab', center }
  }

  // 旋转检测：基于手腕和手指的位置变化
  const wrist = landmarks[0]
  const middleFinger = landmarks[12]
  const angle = Math.atan2(
    middleFinger.y - wrist.y,
    middleFinger.x - wrist.x
  )
  
  return { type: 'rotate', rotation: angle, center }
}

let lastGesture: HandGesture = { type: 'none' }
let gestureHistory: HandGesture[] = []
const GESTURE_THRESHOLD = 5 // 需要连续检测到相同手势的次数

export function useHandInteraction(
  handResults: { value: HandResult[] },
  currentState: { value: TreeState },
  setState: (state: TreeState, photoId?: string) => void,
  onCameraRotate?: (rotation: number) => void
) {
  const processHandGesture = () => {
    if (!handResults.value || handResults.value.length === 0) {
      lastGesture = { type: 'none' }
      gestureHistory = []
      return
    }

    const gesture = detectGesture(handResults.value[0])
    
    // 手势稳定性检测
    gestureHistory.push(gesture)
    if (gestureHistory.length > GESTURE_THRESHOLD) {
      gestureHistory.shift()
    }

    const stableGesture = getStableGesture(gestureHistory)
    
    if (stableGesture.type !== lastGesture.type) {
      handleGestureChange(stableGesture, currentState, setState, onCameraRotate)
      lastGesture = stableGesture
    } else if (stableGesture.type === 'rotate' && onCameraRotate && stableGesture.rotation !== undefined) {
      onCameraRotate(stableGesture.rotation)
    }
  }

  return {
    processHandGesture
  }
}

function getStableGesture(history: HandGesture[]): HandGesture {
  if (history.length < GESTURE_THRESHOLD) {
    return { type: 'none' }
  }

  const typeCounts: Record<string, number> = {}
  for (const gesture of history) {
    typeCounts[gesture.type] = (typeCounts[gesture.type] || 0) + 1
  }

  const mostCommon = Object.entries(typeCounts).reduce((a, b) => 
    a[1] > b[1] ? a : b
  )[0]

  return history.find(g => g.type === mostCommon) || { type: 'none' }
}

function handleGestureChange(
  gesture: HandGesture,
  currentState: { value: TreeState },
  setState: (state: TreeState, photoId?: string) => void,
  onCameraRotate?: (rotation: number) => void
) {
  switch (gesture.type) {
    case 'fist':
      if (currentState.value !== 'gathered') {
        setState('gathered')
      }
      break
    
    case 'open':
      if (currentState.value !== 'scattered') {
        setState('scattered')
      }
      break
    
    case 'grab':
      if (currentState.value === 'scattered') {
        // 抓取时，找到最接近中心的照片卡片
        // 这里简化处理，使用第一个照片ID
        // 实际应用中可以通过射线检测找到中心照片
        setState('zoomed', 'center-photo')
      }
      break
    
    case 'rotate':
      if (currentState.value === 'scattered' && onCameraRotate && gesture.rotation !== undefined) {
        onCameraRotate(gesture.rotation)
      }
      break
  }
}

