'use strict';

/* =========================================================
 * AI 미디어아트 제너레이터 (ai-media-art-generator)
 * 외부 AI API 키 없이 동작하는 실시간 생성형 비주얼 아트.
 *
 * 모드
 *  1) 플로우 필드 (flow)   - 노이즈 기반 파티클 흐름
 *  2) 오디오 리액티브 (audio) - 마이크 FFT 기반 반응형 비주얼
 *  3) 만다라 (kaleido)     - 회전 대칭 만화경 패턴
 * ========================================================= */

// ---------- DOM ----------
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const noticeEl = document.getElementById('notice');
const panelEl = document.getElementById('panel');
const panelToggleBtn = document.getElementById('panelToggle');
const micBtn = document.getElementById('micBtn');

// ---------- 전역 상태 ----------
const state = {
  mode: 'flow',          // 'flow' | 'audio' | 'kaleido'
  palette: 0,
  particleCount: 1600,
  speed: 1.0,
  hueShift: 0,
  symmetry: 8,
  time: 0,               // 경과 시간(초)
};

const TAU = Math.PI * 2;

// ---------- 색상 팔레트 프리셋 ----------
const PALETTES = [
  { name: '네온',     hues: [175, 195, 300, 320], sat: 95, light: 62 },
  { name: '선셋',     hues: [8, 28, 45, 350],     sat: 95, light: 60 },
  { name: '오션',     hues: [190, 205, 220, 170], sat: 85, light: 58 },
  { name: '포레스트', hues: [110, 135, 90, 160],  sat: 80, light: 55 },
  { name: '모노크롬', hues: [222, 232, 212],      sat: 22, light: 72 },
];

// ---------- 유틸 ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let fieldSeed = rand(0, 100);

function pickHue() {
  const pal = PALETTES[state.palette];
  return pal.hues[(Math.random() * pal.hues.length) | 0];
}

function cssColor(hue, alpha) {
  const pal = PALETTES[state.palette];
  const h = (((hue + state.hueShift) % 360) + 360) % 360;
  const a = alpha === undefined ? 0.8 : alpha;
  return 'hsla(' + h.toFixed(1) + ',' + pal.sat + '%,' + pal.light + '%,' + a + ')';
}

/** 사인파 기반 유사 노이즈 (-1 ~ 1). 외부 라이브러리 없이 플로우 필드 생성용 */
function noise2(x, y) {
  return (
    Math.sin(x * 1.6 + fieldSeed + Math.cos(y * 1.2 - fieldSeed)) * 0.45 +
    Math.sin(y * 2.1 - fieldSeed * 0.7 + Math.cos(x * 1.1 + fieldSeed)) * 0.35 +
    Math.sin((x + y) * 0.6 + fieldSeed * 1.3) * 0.2
  );
}

// ---------- 캔버스 ----------
let W = 0;
let H = 0;

function paintBackground() {
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBackground();
}
window.addEventListener('resize', resize);

// =========================================================
// 모드 1) 플로우 필드 — 노이즈 방향장을 따라 흐르는 파티클
// =========================================================
let particles = [];

function initParticles() {
  particles = new Array(Math.round(state.particleCount));
  for (let i = 0; i < particles.length; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    particles[i] = { x: x, y: y, px: x, py: y, h: pickHue(), life: rand(40, 240) };
  }
}

function respawnParticle(p) {
  p.x = Math.random() * W;
  p.y = Math.random() * H;
  p.px = p.x;
  p.py = p.y;
  p.h = pickHue();
  p.life = rand(40, 240);
}

function stepFlow(dt) {
  // 잔상 효과: 반투명 검은 사각형으로 서서히 페이드
  ctx.fillStyle = 'rgba(5,5,9,0.06)';
  ctx.fillRect(0, 0, W, H);

  const t = state.time;
  const v = 95 * state.speed * dt; // 초당 이동 픽셀
  ctx.lineWidth = 1.2;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const angle = noise2(p.x * 0.0026, p.y * 0.0026 + t * 0.10) * Math.PI * 2.4;
    p.px = p.x;
    p.py = p.y;
    p.x += Math.cos(angle) * v;
    p.y += Math.sin(angle) * v;
    p.life -= dt;

    if (p.life <= 0 || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
      respawnParticle(p);
      continue;
    }
    ctx.strokeStyle = cssColor(p.h, 0.5);
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

// =========================================================
// 모드 2) 오디오 리액티브 — 마이크 FFT 기반 방사형 비주얼
// =========================================================
const mic = {
  ctx: null,
  analyser: null,
  data: null,
  stream: null,
  status: 'idle', // 'idle' | 'connecting' | 'on' | 'fallback'
};
const FFT_BINS = 48;

/** 주파수 스펙트럼(0~1)을 반환. 마이크가 없으면 시간 기반 대체 신호 생성 */
function getSpectrum() {
  const out = new Float32Array(FFT_BINS);
  if (mic.status === 'on' && mic.analyser && mic.data) {
    mic.analyser.getByteFrequencyData(mic.data);
    const n = mic.data.length;
    for (let i = 0; i < FFT_BINS; i++) {
      const idx = Math.floor(Math.pow(i / FFT_BINS, 1.6) * n * 0.7);
      out[i] = mic.data[idx] / 255;
    }
  } else {
    // 마이크 거부/미연결 시 대체 애니메이션용 가상 스펙트럼
    const t = state.time;
    for (let i = 0; i < FFT_BINS; i++) {
      const wave = Math.sin(t * 2.1 - i * 0.32) * 0.5 + 0.5;
      const wave2 = Math.sin(t * 0.9 + i * 0.21) * 0.5 + 0.5;
      const beat = Math.pow(Math.sin(t * 3.0) * 0.5 + 0.5, 3);
      out[i] = clamp((wave * 0.55 + wave2 * 0.25 + beat * 0.35) * (1 - (i / FFT_BINS) * 0.55), 0.03, 1);
    }
  }
  return out;
}

function drawCenterHint(text) {
  const lines = text.split('\n');
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = '600 15px system-ui, -apple-system, "Noto Sans KR", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], W / 2, H / 2 - (lines.length - 1) * 14 + i * 28);
  }
}

function stepAudio() {
  ctx.fillStyle = 'rgba(5,5,9,0.14)';
  ctx.fillRect(0, 0, W, H);

  const spec = getSpectrum();
  const pal = PALETTES[state.palette];
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H);

  let bass = 0;
  for (let i = 0; i < 6; i++) bass += spec[i];
  bass /= 6;

  // 중심 블룸 (저음 에너지에 반응)
  const bloomR = R * 0.10 * (0.8 + bass * 1.6);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR * 2.2);
  grad.addColorStop(0, cssColor(pal.hues[0] + state.time * 20, 0.5 + bass * 0.4));
  grad.addColorStop(1, 'hsla(0,0%,0%,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, bloomR * 2.2, 0, TAU);
  ctx.fill();

  // 방사형 주파수 바
  const bars = 72;
  const r0 = R * 0.16;
  for (let i = 0; i < bars; i++) {
    const s = spec[Math.floor((i / bars) * spec.length)];
    const len = s * R * 0.30;
    const a = (i / bars) * TAU + state.time * 0.15 * state.speed;
    ctx.strokeStyle = cssColor(pal.hues[i % pal.hues.length], 0.25 + s * 0.65);
    ctx.lineWidth = R * 0.004 + 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
    ctx.stroke();
  }

  // 외곽 링
  ctx.strokeStyle = cssColor(pal.hues[1 % pal.hues.length], 0.25);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r0 + R * 0.30 + bass * R * 0.03, 0, TAU);
  ctx.stroke();

  if (mic.status === 'idle') {
    drawCenterHint('마이크 연결 버튼을 눌러\n소리에 반응하는 비주얼을 시작하세요');
  } else if (mic.status === 'fallback') {
    drawCenterHint('');
  }
}

async function toggleMic() {
  if (mic.status === 'on' || mic.status === 'fallback') {
    stopMic();
    return;
  }
  setMicUI('connecting');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia를 지원하지 않는 환경입니다.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AC = window.AudioContext || window.webkitAudioContext;
    mic.ctx = new AC();
    const src = mic.ctx.createMediaStreamSource(stream);
    mic.analyser = mic.ctx.createAnalyser();
    mic.analyser.fftSize = 256;
    mic.analyser.smoothingTimeConstant = 0.8;
    src.connect(mic.analyser);
    mic.data = new Uint8Array(mic.analyser.frequencyBinCount);
    mic.stream = stream;
    mic.status = 'on';
    notice('마이크가 연결되었습니다. 소리에 반응하는 비주얼을 즐겨보세요.');
  } catch (err) {
    // 권한 거부/미지원 → 대체 애니메이션으로 폴백
    mic.status = 'fallback';
    notice('마이크 권한이 거부되어 대체 애니메이션으로 재생합니다.');
  }
  setMicUI(mic.status);
}

function stopMic() {
  if (mic.stream) {
    mic.stream.getTracks().forEach((track) => track.stop());
  }
  if (mic.ctx) {
    mic.ctx.close().catch(() => {});
  }
  mic.stream = null;
  mic.ctx = null;
  mic.analyser = null;
  mic.data = null;
  mic.status = 'idle';
  setMicUI('idle');
  notice('마이크 연결을 해제했습니다.');
}

function setMicUI(s) {
  if (s === 'connecting') {
    micBtn.textContent = '연결 중…';
    micBtn.disabled = true;
  } else if (s === 'on' || s === 'fallback') {
    micBtn.textContent = '마이크 해제';
    micBtn.disabled = false;
  } else {
    micBtn.textContent = '마이크 연결';
    micBtn.disabled = false;
  }
}

// =========================================================
// 모드 3) 만다라 — 회전 대칭 만화경 패턴
// =========================================================
function stepKaleido() {
  ctx.fillStyle = 'rgba(5,5,9,0.10)';
  ctx.fillRect(0, 0, W, H);

  const pal = PALETTES[state.palette];
  const cx = W / 2;
  const cy = H / 2;
  const seg = Math.round(state.symmetry);
  const R = Math.hypot(W, H) * 0.5;
  const t = state.time * state.speed;
  const halfWedge = Math.PI / seg;

  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < seg; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / seg) * TAU + t * 0.06);
    if (i % 2 === 1) ctx.scale(1, -1);

    // 쐐기(wedge) 영역으로 클립 → 완전한 대칭 보장
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -halfWedge, halfWedge);
    ctx.closePath();
    ctx.clip();

    // 동심 호(arc) 스트로크
    for (let s = 0; s < 4; s++) {
      const rr = R * (0.22 + 0.17 * s);
      const start = t * (s % 2 ? 0.25 : -0.18) + s * 1.3;
      ctx.strokeStyle = cssColor(pal.hues[s % pal.hues.length], 0.45);
      ctx.lineWidth = Math.max(1, 3.2 - s * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, rr, start, start + Math.PI * (0.5 + 0.2 * Math.sin(t * 0.7 + s)));
      ctx.stroke();
    }

    // 궤도를 도는 점들
    for (let d = 0; d < 7; d++) {
      const ang = t * (0.35 + d * 0.09) + d * 2.1;
      const rad = R * (0.28 + 0.10 * Math.sin(t * 0.6 + d * 1.7));
      ctx.fillStyle = cssColor(pal.hues[d % pal.hues.length], 0.8);
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * rad, Math.sin(ang) * rad, 2.5 + d * 0.5, 0, TAU);
      ctx.fill();
    }

    // 중심에서 뻗는 곡선
    ctx.strokeStyle = cssColor(pal.hues[2 % pal.hues.length], 0.35);
    ctx.lineWidth = 1.4;
    for (let c = 0; c < 3; c++) {
      const off = (c - 1) * R * 0.10 + Math.sin(t * 0.9 + c) * R * 0.05;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(R * 0.4, off, R * 0.9, Math.cos(t * 0.5 + c * 2) * R * 0.12);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.globalCompositeOperation = 'source-over';
}

// =========================================================
// 메인 루프
// =========================================================
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // 초 단위, 최대 50ms 클램프
  last = now;
  state.time += dt;

  if (state.mode === 'flow') stepFlow(dt);
  else if (state.mode === 'audio') stepAudio();
  else stepKaleido();

  requestAnimationFrame(frame);
}

// =========================================================
// UI 바인딩
// =========================================================
let noticeTimer = null;
function notice(msg, ms) {
  noticeEl.textContent = msg;
  noticeEl.classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => noticeEl.classList.add('hidden'), ms || 3500);
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === m);
  });
  paintBackground();
  if (m === 'flow') initParticles();
}
document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

// 팔레트 스와치 생성
function buildPaletteSwatches() {
  const wrap = document.getElementById('palettes');
  wrap.innerHTML = '';
  PALETTES.forEach((pal, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === state.palette ? ' active' : '');
    b.title = pal.name;
    b.setAttribute('aria-label', '팔레트: ' + pal.name);
    const stops = pal.hues
      .map((h, k) => 'hsl(' + h + ',' + pal.sat + '%,' + pal.light + '%) ' + ((k / (pal.hues.length - 1)) * 100).toFixed(0) + '%')
      .join(',');
    b.style.background = 'linear-gradient(135deg,' + stops + ')';
    b.addEventListener('click', () => {
      state.palette = i;
      buildPaletteSwatches();
    });
    wrap.appendChild(b);
  });
}

// 슬라이더 바인딩
const sliderUpdaters = [];
function bindSlider(id, key, format, after) {
  const el = document.getElementById(id);
  const out = document.getElementById(id + 'Val');
  const update = () => {
    const v = parseFloat(el.value);
    state[key] = v;
    out.textContent = format(v);
    if (after) after();
  };
  el.addEventListener('input', update);
  sliderUpdaters.push(() => {
    el.value = state[key];
    update();
  });
}
function bindAllSliders() {
  bindSlider('particleCount', 'particleCount',
    (v) => Math.round(v).toLocaleString('ko-KR') + ' 개',
    () => { if (state.mode === 'flow') initParticles(); });
  bindSlider('speed', 'speed', (v) => v.toFixed(1) + 'x');
  bindSlider('hueShift', 'hueShift', (v) => Math.round(v) + '°');
  bindSlider('symmetry', 'symmetry', (v) => Math.round(v) + ' 분할');
}
function syncSliders() {
  sliderUpdaters.forEach((u) => u());
}

// 랜덤화
function randomize() {
  state.palette = (Math.random() * PALETTES.length) | 0;
  state.hueShift = Math.random() * 360;
  state.speed = rand(0.6, 1.8);
  state.symmetry = 3 + ((Math.random() * 10) | 0);
  state.particleCount = 800 + ((Math.random() * 2200) | 0);
  fieldSeed = rand(0, 100);
  syncSliders();
  buildPaletteSwatches();
  paintBackground();
  if (state.mode === 'flow') initParticles();
  notice('새로운 아트 파라미터를 생성했습니다.');
}

// PNG 스냅샷 저장
function exportPNG() {
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = 'media-art-' + state.mode + '-' + ts + '.png';
  a.href = canvas.toDataURL('image/png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  notice('PNG 스냅샷을 저장했습니다.');
}

// 전체화면
function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {
      notice('전체화면 전환이 차단되었습니다.');
    });
  } else {
    notice('이 브라우저는 전체화면을 지원하지 않습니다.');
  }
}

// 패널 토글
function togglePanel() {
  const hidden = document.body.classList.toggle('panel-hidden');
  panelEl.classList.toggle('collapsed', hidden);
}
panelToggleBtn.addEventListener('click', togglePanel);

document.getElementById('randomizeBtn').addEventListener('click', randomize);
document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
document.getElementById('exportBtn').addEventListener('click', exportPNG);
micBtn.addEventListener('click', toggleMic);

// 단축키
window.addEventListener('keydown', (e) => {
  if (e.key === '1') setMode('flow');
  else if (e.key === '2') setMode('audio');
  else if (e.key === '3') setMode('kaleido');
  else if (e.key === 'r' || e.key === 'R') randomize();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === 'h' || e.key === 'H') togglePanel();
});

// ---------- 초기화 ----------
resize();
buildPaletteSwatches();
bindAllSliders();
setMode('flow');
syncSliders();
setMicUI('idle');
requestAnimationFrame(frame);
