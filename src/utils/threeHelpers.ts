import * as THREE from 'three'

export function createMetallicGoldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0x332200,
    emissiveIntensity: 0.3
  })
}

export function createMatteGreenMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2d5016,
    metalness: 0.1,
    roughness: 0.8,
    emissive: 0x1a3009,
    emissiveIntensity: 0.2
  })
}

export function createChristmasRedMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xcc0000,
    metalness: 0.3,
    roughness: 0.6,
    emissive: 0x330000,
    emissiveIntensity: 0.3
  })
}

export function createWhiteCardMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.7
  })
}

export function createGlowMaterial(color: number, intensity: number = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6 * intensity,
    side: THREE.DoubleSide
  })
}

export function addBloomEffect(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  // 使用后处理实现辉光效果
  // 这里简化处理，实际可以使用 UnrealBloomPass
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
}

