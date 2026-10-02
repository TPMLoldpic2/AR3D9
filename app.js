(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const scene = $('arScene'), anchor = $('photoAnchor'), root = $('cityRoot'), model = $('cityModel');
  const defaults = {size: .95, yaw: 0, height: .006, trafficSpeed: 1};
  const settings = {...defaults};
  const state = {session: 'idle', tracked: false, ready: Boolean(model.getObject3D?.('mesh')), modelError: false, trafficEnabled: true};
  let generation = 0;
  const system = () => scene.systems?.['mindar-image-system'];

  function renderState() {
    const active = state.session === 'starting' || state.session === 'scanning';
    const showCity = active && state.tracked && state.ready && !state.modelError;
    root.setAttribute('visible', showCity);
    model.components?.['street-traffic']?.setRunning(showCity && state.trafficEnabled);
    document.body.dataset.view = active ? 'ar' : 'home';
    $('arRoot').setAttribute('aria-hidden', String(!active));
    $('scanUI').hidden = !active;
    $('scanGuide').hidden = state.tracked;
    $('start').disabled = state.session !== 'idle';
    $('retryModel').hidden = !state.modelError;
    $('loadNote').textContent = state.modelError ? '3D 模型載入失敗，請重新整理網頁。' : state.ready ? '3D 街景已就緒' : '準備 3D 街景中…';
    $('trackingStatus').classList.toggle('found', showCity);
    $('trackingStatus').textContent = state.session === 'starting' ? '正在開啟相機…' :
      !state.tracked ? '請對準中華商場照片' :
      state.modelError ? '已辨識照片，3D 模型載入失敗' :
      !state.ready ? '已辨識照片，3D 街景載入中…' : '辨識成功 · 中華商場就在眼前';
  }

  function applySettings() {
    root.setAttribute('scale', `${settings.size} ${settings.size} ${settings.size}`);
    root.setAttribute('position', `0 0 ${settings.height}`);
    $('cityYaw').setAttribute('rotation', `0 ${settings.yaw} 0`);
    for (const key of ['size', 'yaw', 'height']) $(''+key).value = settings[key];
    $('sizeValue').value = settings.size.toFixed(2);
    $('yawValue').value = `${settings.yaw}°`;
    $('heightValue').value = settings.height.toFixed(3);
    $('trafficSpeed').value = settings.trafficSpeed;
    $('trafficSpeedValue').value = `${settings.trafficSpeed.toFixed(2)}×`;
    model.setAttribute('street-traffic', 'speed', settings.trafficSpeed);
  }

  async function stopCamera() {
    try { await system()?.stop(); } catch (error) { console.warn('AR stop', error); }
    // Ensure camera streams are released even if the AR system stopped incompletely.
    for (const video of document.querySelectorAll('video')) {
      if (video.srcObject?.getTracks) video.srcObject.getTracks().forEach(track => track.stop());
    }
  }

  async function stop() {
    generation++;
    state.session = 'stopping'; state.tracked = false;
    $('modelControls').hidden = true;
    $('adjust').setAttribute('aria-expanded', 'false');
    renderState();
    await stopCamera();
    state.session = 'idle'; renderState();
  }

  function waitForScene(timeout = 20000) {
    if (scene.hasLoaded && system()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (scene.hasLoaded && system()) { clearInterval(poll); clearTimeout(expire); resolve(); }
      }, 100);
      const expire = setTimeout(() => { clearInterval(poll); reject(new Error('AR 程式尚未載入，請確認 vendor 資料夾已上傳。')); }, timeout);
    });
  }

  async function start() {
    if (state.session !== 'idle') return;
    const token = ++generation;
    state.session = 'starting'; state.tracked = false;
    $('homeError').hidden = true;
    renderState();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('請使用 HTTPS 網址開啟網頁，才能使用相機。');
      }
      await waitForScene();
      if (token !== generation) return;
      const timeout = new AbortController();
      const expire = setTimeout(() => timeout.abort(), 15000);
      try {
        const result = await fetch('./assets/targets.mind', {signal: timeout.signal});
        if (!result.ok) throw new Error('找不到照片辨識檔，請一併上傳 assets/targets.mind。');
        const bytes = await result.arrayBuffer();
        if (bytes.byteLength < 32) throw new Error('照片辨識檔內容不完整。');
      } finally { clearTimeout(expire); }
      if (token !== generation) return;
      await system().start();
      if (token !== generation) { await stopCamera(); return; }
      state.session = 'scanning'; renderState();
    } catch (error) {
      if (token !== generation) return;
      await stop();
      $('homeError').hidden = false;
      $('homeError').textContent = error.name === 'NotAllowedError' ? '相機權限未開啟，請允許瀏覽器使用相機後再試。' :
        error.name === 'AbortError' ? '辨識檔載入逾時，請檢查網路後再試。' :
        error.message || '相機啟動失敗，請確認相機權限後再試。';
    }
  }

  anchor.addEventListener('targetFound', () => {
    if (state.session !== 'starting' && state.session !== 'scanning') return;
    state.tracked = true; renderState();
  });
  anchor.addEventListener('targetLost', () => { state.tracked = false; renderState(); });
  model.addEventListener('postcard-model-ready', () => { state.ready = true; state.modelError = false; renderState(); });
  model.addEventListener('model-error', () => { state.ready = false; state.modelError = true; renderState(); });
  model.addEventListener('traffic-ready', renderState);
  scene.addEventListener('arError', async () => {
    if (state.session === 'idle') return;
    await stop();
    $('homeError').hidden = false;
    $('homeError').textContent = 'AR 啟動失敗，請確認瀏覽器相機權限，並重新整理後再試。';
  });
  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', stop);
  $('adjust').addEventListener('click', () => {
    $('modelControls').hidden = !$('modelControls').hidden;
    $('adjust').setAttribute('aria-expanded', String(!$('modelControls').hidden));
  });
  for (const key of ['size', 'yaw', 'height']) {
    $(key).addEventListener('input', event => { settings[key] = Number(event.target.value); applySettings(); });
  }
  $('trafficEnabled').addEventListener('change', event => {
    state.trafficEnabled = event.target.checked;
    renderState();
  });
  $('trafficSpeed').addEventListener('input', event => {
    settings.trafficSpeed = Number(event.target.value); applySettings();
  });
  $('reset').addEventListener('click', () => {
    Object.assign(settings, defaults);
    state.trafficEnabled = true; $('trafficEnabled').checked = true;
    applySettings(); renderState();
  });
  $('retryModel').addEventListener('click', () => {
    state.ready = false; state.modelError = false;
    model.removeAttribute('gltf-model');
    model.setAttribute('gltf-model', `url(./assets/Zhonghua_Shopping_Arcade.glb?v=${Date.now()})`);
    renderState();
  });
  window.addEventListener('pagehide', stop);
  applySettings(); renderState();
})();
