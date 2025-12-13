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
      onGather: options.onGather || (() => { }),
      onIndexPointing: options.onIndexPointing || (() => { }),
      onIndexPointingEnd: options.onIndexPointingEnd || (() => { }),
      onZoom: options.onZoom || (() => { })
    };

    this.hands = null;
    this.camera = null;

    this.isActive = false;
    this.hasReceivedFirstFrame = false; // 标记是否已收到第一帧画面

    // 光标平滑处理
    this.cursorX = window.innerWidth / 2;
    this.cursorY = window.innerHeight / 2;
    this.targetX = 0;
    this.targetY = 0;
    this.isClicking = false;
    this.smoothingFactor = 0.3;

    // 手势状态追踪
    this.lastGesture = 'NONE'; // NONE, FIST, OPEN
    this.lastPalmSize = 0; // 用于缩放计算

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

    this.statusElement.textContent = '点击开启摄像头启动手势控制';
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

    this.statusElement.textContent = '摄像头启动中';
    this.statusElement.style.display = 'block';
    this.hasReceivedFirstFrame = false; // 重置标志
    try {
      await this.camera.start();
      this.isActive = true;
      document.getElementById('gesture-container').classList.add('active');

      // 切换到手势说明
      const instructions = document.getElementById('instructions');
      const gestureInstructions = document.getElementById('gesture-instructions');
      if (instructions) instructions.classList.add('hidden');
      if (gestureInstructions) gestureInstructions.classList.add('visible');

      // 注意：状态文字会在收到第一帧画面时更新为"摄像头启动成功"
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
    this.hasReceivedFirstFrame = false; // 重置标志
    this.statusElement.textContent = '点击开启摄像头启动手势控制';
    this.statusElement.style.display = 'block';
    this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    document.getElementById('gesture-container').classList.remove('active');

    // 切换回键鼠说明
    const instructions = document.getElementById('instructions');
    const gestureInstructions = document.getElementById('gesture-instructions');
    if (instructions) instructions.classList.remove('hidden');
    if (gestureInstructions) gestureInstructions.classList.remove('visible');
  }

  onResults(results) {
    if (!this.isActive) return;

    // 第一次收到画面时，更新状态文字
    if (!this.hasReceivedFirstFrame) {
      this.hasReceivedFirstFrame = true;
      this.statusElement.textContent = '摄像头启动成功';
    }

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
    const pinchThreshold = 0.05;
    const isPinching = dist < pinchThreshold;

    // 3. 触发鼠标/指针事件（用于拖拽等交互）
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

    // 5. 缩放检测
    this.detectZoom(landmarks);
  }

  detectZoom(landmarks) {
    // 使用手腕(0)到中指根部(9)的距离作为手掌大小参考
    const palmSize = this.calculateDistance(landmarks[0], landmarks[9]);

    if (this.lastPalmSize > 0) {
      const scale = palmSize / this.lastPalmSize;

      // 设置阈值防止抖动 (变化超过 1% 才触发)
      if (Math.abs(scale - 1) > 0.01) {
        this.callbacks.onZoom(scale);
      }
    }

    // 平滑更新上一帧大小
    this.lastPalmSize = this.lastPalmSize === 0 ? palmSize : (this.lastPalmSize * 0.9 + palmSize * 0.1);
  }

  detectAndTriggerGesture(landmarks) {
    const gesture = this.detectHandPose(landmarks);

    // 如果是未知手势，直接忽略，保持上一个有效状态
    // 这样可以解决 FIST -> UNKNOWN -> OPEN 导致动作链断裂的问题
    if (gesture === 'UNKNOWN') return;

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

      // 进入比耶手势 : 随机看照片
      if (gesture === 'INDEX_POINTING') {
        this.showStatus('识别: 比耶✌🏻 随机照片');
        this.callbacks.onIndexPointing();
      }

      // 退出比耶手势 : 关闭照片
      if (this.lastGesture === 'INDEX_POINTING') {
        this.callbacks.onIndexPointingEnd();
      }

      this.lastGesture = gesture;
    }
  }

  detectHandPose(landmarks) {
    // 判断手指弯曲状态
    const wrist = landmarks[0];

    // 辅助函数：判断手指是否弯曲
    const isBent = (tipIdx) => {
      const pipIdx = tipIdx - 2; // PIP 是 TIP 的前两个点
      // 简单距离比较：如果指尖到手腕的距离 < 关节到手腕的距离，认为是弯曲
      const distTip = this.calculateDistance(landmarks[tipIdx], wrist);
      const distPip = this.calculateDistance(landmarks[pipIdx], wrist);
      return distTip < distPip;
    };

    const indexBent = isBent(8);   // 食指
    const middleBent = isBent(12); // 中指
    const ringBent = isBent(16);   // 无名指
    const pinkyBent = isBent(20);  // 小指
    const thumbBent = isBent(4);   // 拇指

    // 比耶手势（✌🏻）：优先检测
    // 核心特征：食指和中指伸直，无名指和小指都明显弯曲
    // 严格要求：
    // 1. 食指和中指必须伸直
    // 2. 无名指和小指都必须弯曲（避免将五指张开误判为比耶）
    // 3. 使用距离检查确保弯曲程度足够明显
    const isVictory = !indexBent && !middleBent && ringBent && pinkyBent;

    if (isVictory) {
      // 额外检查：确保无名指和小指的弯曲程度足够明显
      // 通过比较指尖到手腕的距离来判断
      const indexDist = this.calculateDistance(landmarks[8], wrist);
      const middleDist = this.calculateDistance(landmarks[12], wrist);
      const ringDist = this.calculateDistance(landmarks[16], wrist);
      const pinkyDist = this.calculateDistance(landmarks[20], wrist);

      // 无名指和小指到手腕的距离应该明显小于食指和中指
      // 这样可以确保它们确实弯曲了，而不是只是稍微弯曲
      const ringBentEnough = ringDist < indexDist * 0.85;
      const pinkyBentEnough = pinkyDist < indexDist * 0.85;

      if (ringBentEnough && pinkyBentEnough) {
        return 'INDEX_POINTING';
      }
    }

    let bentCount = (indexBent ? 1 : 0) + (middleBent ? 1 : 0) + (ringBent ? 1 : 0) + (pinkyBent ? 1 : 0);

    if (bentCount >= 4) return 'FIST'; // 握拳：4指都弯曲 (比之前严格，避免误判)
    if (bentCount <= 1) return 'OPEN'; // 伸掌：大部分手指伸直

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