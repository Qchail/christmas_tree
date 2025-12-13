// 手势控制模块
export class GestureController {
  constructor(options = {}) {
    this.videoElement = document.querySelector('.input_video');
    this.canvasElement = document.querySelector('.output_canvas');
    this.canvasCtx = this.canvasElement.getContext('2d');
    this.statusElement = document.getElementById('gesture-status');
    this.cursorElement = document.getElementById('virtual-cursor');

    this.callbacks = {
      onScatter: options.onScatter || (() => { }),
      onGather: options.onGather || (() => { })
    };

    this.hands = null;
    this.camera = null;

    this.isActive = false;

    // 光标平滑处理
    this.cursorX = window.innerWidth / 2;
    this.cursorY = window.innerHeight / 2;
    this.targetX = 0;
    this.targetY = 0;
    this.isClicking = false;
    this.smoothingFactor = 0.3;

    // 手势状态追踪
    this.lastGesture = 'NONE'; // NONE, FIST, OPEN

    this.init();
  }

  init() {
    if (!window.Hands) {
      this.statusElement.textContent = '正在加载组件...';
      setTimeout(() => this.init(), 500);
      return;
    }

    this.hands = new window.Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    this.hands.onResults(this.onResults.bind(this));

    this.camera = new window.Camera(this.videoElement, {
      onFrame: async () => {
        if (this.isActive) {
          await this.hands.send({ image: this.videoElement });
        }
      },
      width: 320,
      height: 240
    });

    this.statusElement.textContent = '点击开启摄像头';
  }

  async toggle() {
    if (this.isActive) {
      await this.stop();
    } else {
      await this.start();
    }
  }

  async start() {
    if (!this.camera) return;

    this.statusElement.textContent = '正在启动摄像头...';
    try {
      await this.camera.start();
      this.isActive = true;
      this.statusElement.textContent = '摄像头已启动';
      document.getElementById('gesture-container').classList.add('active');

      setTimeout(() => {
        if (this.isActive) {
          this.statusElement.style.display = 'none';
        }
      }, 3000);
    } catch (err) {
      console.error('摄像头启动失败:', err);
      this.statusElement.textContent = '摄像头启动失败';
    }
  }

  async stop() {
    if (this.camera) {
      // 尝试停止摄像头流
      const stream = this.videoElement.srcObject;
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      }
    }

    this.isActive = false;
    this.statusElement.textContent = '点击开启摄像头';
    this.statusElement.style.display = 'block';
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    document.getElementById('gesture-container').classList.remove('active');
  }

  onResults(results) {
    if (!this.isActive) return;

    this.canvasCtx.save();
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    this.canvasCtx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];

      // 绘制骨架
      if (window.drawConnectors && window.drawLandmarks) {
        window.drawConnectors(this.canvasCtx, landmarks, window.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        window.drawLandmarks(this.canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
      }

      this.updateCursor(landmarks);
    } else {
      if (this.cursorElement) this.cursorElement.style.display = 'none';
      if (this.isClicking) {
        // 如果手势消失时还在点击，强制释放
        this.dispatchEvent('pointerup', this.cursorX, this.cursorY);
        this.dispatchEvent('mouseup', this.cursorX, this.cursorY);
        this.isClicking = false;
        this.cursorElement.classList.remove('clicking');
      }
    }

    this.canvasCtx.restore();
  }

  updateCursor(landmarks) {
    if (!this.cursorElement) return;

    // 1. 获取食指指尖 (8) 坐标
    const indexTip = landmarks[8];
    // 拇指指尖 (4)
    const thumbTip = landmarks[4];

    // 映射到屏幕坐标
    // 注意：x轴是镜像的，所以屏幕上的 x = (1 - landmark.x) * width
    const targetX = (1 - indexTip.x) * window.innerWidth;
    const targetY = indexTip.y * window.innerHeight;

    // 平滑处理
    this.cursorX += (targetX - this.cursorX) * this.smoothingFactor;
    this.cursorY += (targetY - this.cursorY) * this.smoothingFactor;

    // 更新光标位置
    this.cursorElement.style.display = 'block';
    this.cursorElement.style.left = `${this.cursorX}px`;
    this.cursorElement.style.top = `${this.cursorY}px`;

    // 2. 检测捏合 (拇指与食指距离)
    // 需要计算屏幕空间的距离，或者直接用归一化距离
    // 简单起见，用欧几里得距离 (3D空间或2D空间均可，这里用2D)
    const dist = Math.sqrt(
      Math.pow(indexTip.x - thumbTip.x, 2) +
      Math.pow(indexTip.y - thumbTip.y, 2)
    );

    // 捏合阈值
    const pinchThreshold = 0.03;
    const isPinching = dist < pinchThreshold;

    // 3. 触发鼠标/指针事件
    if (isPinching && !this.isClicking) {
      // 开始捏合 -> 按下
      this.isClicking = true;
      this.cursorElement.classList.add('clicking');
      this.dispatchEvent('pointerdown', this.cursorX, this.cursorY);
      this.dispatchEvent('mousedown', this.cursorX, this.cursorY);
    } else if (!isPinching && this.isClicking) {
      // 结束捏合 -> 松开
      this.isClicking = false;
      this.cursorElement.classList.remove('clicking');
      this.dispatchEvent('pointerup', this.cursorX, this.cursorY);
      this.dispatchEvent('mouseup', this.cursorX, this.cursorY);
    }

    // 始终触发移动
    this.dispatchEvent('pointermove', this.cursorX, this.cursorY);
    this.dispatchEvent('mousemove', this.cursorX, this.cursorY);

    // 4. 识别手势状态 (握拳/伸掌)
    this.detectAndTriggerGesture(landmarks);
  }

  detectAndTriggerGesture(landmarks) {
    const gesture = this.detectHandPose(landmarks);

    // 状态变更触发事件
    if (gesture !== this.lastGesture) {
      // 握拳 -> 伸掌 : 散开
      if (this.lastGesture === 'FIST' && gesture === 'OPEN') {
        this.showStatus('识别: 散开');
        this.callbacks.onScatter();
      }

      // 伸掌 -> 握拳 : 聚拢
      if (this.lastGesture === 'OPEN' && gesture === 'FIST') {
        this.showStatus('识别: 聚拢');
        this.callbacks.onGather();
      }

      this.lastGesture = gesture;
    }
  }

  detectHandPose(landmarks) {
    // 判断手指弯曲状态
    const fingers = [8, 12, 16, 20]; // 食指、中指、无名指、小指
    let bentCount = 0;
    const wrist = landmarks[0];

    for (let tipIdx of fingers) {
      const pipIdx = tipIdx - 2; // PIP 是 TIP 的前两个点

      // 简单距离比较：如果指尖到手腕的距离 < 关节到手腕的距离，认为是弯曲
      const distTip = this.calculateDistance(landmarks[tipIdx], wrist);
      const distPip = this.calculateDistance(landmarks[pipIdx], wrist);

      if (distTip < distPip) {
        bentCount++;
      }
    }

    if (bentCount >= 3) return 'FIST'; // 大部分手指弯曲 -> 握拳
    if (bentCount <= 1) return 'OPEN'; // 大部分手指伸直 -> 伸掌
    return 'UNKNOWN';
  }

  calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  }

  showStatus(text) {
    this.statusElement.style.display = 'block';
    this.statusElement.textContent = text;
    setTimeout(() => {
      if (this.isActive && this.statusElement.textContent === text) {
        this.statusElement.style.display = 'none';
      }
    }, 1000);
  }

  dispatchEvent(type, x, y) {
    const target = document.elementFromPoint(x, y);
    if (!target) return;

    const eventInit = {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      screenX: x, // 某些库可能使用 screenX
      screenY: y,
      button: 0,
      buttons: this.isClicking ? 1 : 0,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      pressure: this.isClicking ? 0.5 : 0
    };

    let event;
    if (type.startsWith('pointer')) {
      event = new PointerEvent(type, eventInit);
    } else {
      event = new MouseEvent(type, eventInit);
    }

    target.dispatchEvent(event);
  }
}