<template>
  <div class="photo-upload">
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      @change="handleFileSelect"
      style="display: none"
    />
    <button @click="triggerFileSelect" class="upload-button">
      <span>📷</span>
      <span>上传照片</span>
    </button>
    <div v-if="photos.length > 0" class="photo-list">
      <div
        v-for="photo in photos"
        :key="photo.id"
        class="photo-item"
      >
        <img :src="photo.url" :alt="photo.name" />
        <button @click="removePhoto(photo.id)" class="remove-btn">×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { addPhoto, removePhoto as removePhotoStorage, loadPhotos, type PhotoData } from '../utils/photoStorage'

const emit = defineEmits<{
  photosChanged: [photos: PhotoData[]]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const photos = ref<PhotoData[]>([])

onMounted(() => {
  photos.value = loadPhotos()
  emit('photosChanged', photos.value)
})

const triggerFileSelect = () => {
  fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files) return

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.type.startsWith('image/')) {
      try {
        const photo = await addPhoto(file)
        photos.value.push(photo)
      } catch (error) {
        console.error('上传照片失败:', error)
      }
    }
  }

  emit('photosChanged', photos.value)
  if (target) {
    target.value = ''
  }
}

const removePhoto = (id: string) => {
  removePhotoStorage(id)
  photos.value = photos.value.filter(p => p.id !== id)
  emit('photosChanged', photos.value)
}
</script>

<style scoped>
.photo-upload {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.7);
  padding: 15px;
  border-radius: 10px;
  backdrop-filter: blur(10px);
}

.upload-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #ffd700, #ffed4e);
  color: #000;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: transform 0.2s;
}

.upload-button:hover {
  transform: scale(1.05);
}

.photo-list {
  margin-top: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.photo-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #ffd700;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 24px;
  height: 24px;
  background: rgba(255, 0, 0, 0.8);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-btn:hover {
  background: rgba(255, 0, 0, 1);
}
</style>

