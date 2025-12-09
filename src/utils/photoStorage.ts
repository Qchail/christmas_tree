export interface PhotoData {
  id: string
  url: string
  name: string
}

const STORAGE_KEY = 'christmas_tree_photos'

export function savePhotos(photos: PhotoData[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos))
  } catch (error) {
    console.error('保存照片失败:', error)
  }
}

export function loadPhotos(): PhotoData[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('加载照片失败:', error)
    return []
  }
}

export function addPhoto(file: File): Promise<PhotoData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const photo: PhotoData = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        url: e.target?.result as string,
        name: file.name
      }
      const photos = loadPhotos()
      photos.push(photo)
      savePhotos(photos)
      resolve(photo)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function removePhoto(id: string): void {
  const photos = loadPhotos()
  const filtered = photos.filter(p => p.id !== id)
  savePhotos(filtered)
}

export function clearPhotos(): void {
  localStorage.removeItem(STORAGE_KEY)
}

