# AI 미디어아트 제너레이터

외부 AI API 키 없이 브라우저에서 바로 실행되는 **실시간 생성형 미디어아트 웹앱**입니다.
2D 캔버스와 WebAudio만으로 동작하며, 빌드 과정이 필요 없는 순수 정적 파일로 구성되어 있습니다.

## 컨셉

코드가 곧 붓이 되는 제너러티브 아트. 수학 함수(노이즈 필드, FFT 스펙트럼, 회전 대칭)로
매번 다른 비주얼을 실시간 렌더링합니다. 다크 갤러리 스타일 UI로 전시장 스크린이나
포트폴리오 데모에 바로 사용할 수 있습니다.

## 모드

| 모드 | 설명 |
|---|---|
| **플로우 필드** | 사인파 기반 노이즈 방향장을 따라 수천 개의 파티클이 흐르며 궤적을 그립니다 |
| **오디오 리액티브** | 마이크 입력의 FFT 스펙트럼에 반응하는 방사형 바 + 저음 블룸 비주얼. 권한이 거부되면 자동으로 대체 애니메이션 재생 |
| **만다라** | N분할 회전 대칭(만화경) 패턴. 호(arc), 궤도 점, 곡선이 대칭으로 증식합니다 |

## 조작법

- **모드**: 상단 버튼 또는 단축키 `1` / `2` / `3`
- **팔레트**: 네온, 선셋, 오션, 포레스트, 모노크롬 5종 프리셋
- **슬라이더**
  - 파티클 수 (200–4000)
  - 속도 (0.2x–3x)
  - 색상 변화 (Hue Shift, 0–360°)
  - 대칭 수 (만다라 분할, 3–12)
- **액션**
  - 랜덤화 (`R`): 팔레트·속도·대칭·파티클 수를 무작위로 재생성
  - 전체화면 (`F`)
  - PNG 저장: 현재 프레임을 이미지로 다운로드
  - 마이크 연결/해제: 오디오 리액티브 모드용
- **패널 숨기기** (`H`): 감상 모드용

## 실행 방법

빌드가 필요 없습니다.

```bash
# 방법 1: 파일을 브라우저로 직접 열기
open index.html   # 또는 더블클릭

# 방법 2: 로컬 서버 (마이크 사용 시 권장 — file:// 에서는 브라우저가 마이크를 차단할 수 있음)
python3 -m http.server 8000
# → http://localhost:8000 접속
```

> 마이크는 `localhost` 또는 `HTTPS` 환경에서만 동작합니다.
> 권한을 거부하면 시간 기반 가상 스펙트럼의 대체 애니메이션이 자동 재생됩니다.

## 확장하기

- **팔레트 추가**: `art.js`의 `PALETTES` 배열에 `{ name, hues, sat, light }` 객체 추가
- **새 모드 추가**: `stepXxx()` 렌더 함수를 만들고 `frame()` 분기와 `setMode()`에 연결,
  `index.html`에 `[data-mode]` 버튼 추가
- **노이즈 교체**: `noise2()`를 Simplex/Perlin 노이즈로 교체하면 플로우 필드 품질 향상
- **오디오 소스 확장**: 마이크 대신 `<audio>` 요소나 오디오 파일을 `MediaElementSource`로 연결 가능

## 기술 스택

- HTML5 Canvas 2D (DPR 대응, 최대 2x)
- WebAudio API (`AnalyserNode`, FFT 256)
- 바닐라 JS / CSS — 의존성 없음, CDN 없음

## 라이선스

MIT

---

## English Summary

A real-time generative media-art web app that runs entirely in the browser with no external AI API keys and no build step — pure static files (`index.html`, `style.css`, `art.js`).

- **Modes**: (1) flow-field particle system, (2) audio-reactive visuals driven by microphone FFT via WebAudio `AnalyserNode` (graceful fallback animation if mic permission is denied), (3) kaleidoscope/mandala patterns with adjustable rotational symmetry.
- **Controls**: sliders for particle count, speed, hue shift, and symmetry; five color palette presets; buttons for randomize, fullscreen, PNG snapshot export, and mic connect/disconnect. Korean UI, dark gallery aesthetic.
- **Run**: just open `index.html`, or serve with `python3 -m http.server` for microphone access.
- **Extend**: add palettes in the `PALETTES` array, or add new render modes via a `stepXxx()` function wired into the main loop.
