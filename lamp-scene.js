/* LED 프로파일 램프 — 03 SPATIAL RENDER 칸 스크롤(휠·드래그) 조립 애니메이션
   단위 1 = 1 mm. Three.js r150 UMD 필요. */
(function () {
  "use strict";
  const host = document.getElementById("lamp3d");
  if (!host || !window.THREE) return;
  const T = THREE;

  /* ---------- 설정값 ---------- */
  const CFG = {
    W: 200, // 랜턴 외곽 폭(정사각)
    Y0: 90, // 랜턴 바닥 높이
    H: 400, // 랜턴 높이
    LED_PER_FACE: 15, // 4면 × 15 = 60구
    LED_PITCH: 1000 / 60, // 60개/m
    LED_Y0: 140, // 스트립 시작 높이
    WARM: new T.Color(1.0, 0.72, 0.42),
    // 카메라 키프레임 [진행도, 방위각°(+z에서 +x 쪽), 고도각°]
    CAM: [
      [0.0, -42, 34],
      [0.35, -18, 22],
      [0.68, 16, 15],
      [1.0, 30, 12],
    ],
    WHEEL_RANGE: 2400, // 휠 delta 누적 이만큼이면 0→1
    DRAG_RANGE: 520, // 드래그 px 이만큼이면 0→1
  };
  const C = CFG.W / 2 - 10; // 프로파일 중심선 오프셋 (90)
  const Y1 = CFG.Y0 + CFG.H; // 490
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 렌더러 ---------- */
  const canvas = host.querySelector(".lamp3d__canvas");
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) {
    return; // WebGL 불가 → 기존 이미지 유지
  }
  host.classList.add("is-3d");
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  // 장면 색은 전부 디자인 시스템 CSS 토큰(--scene-*)에서 읽음
  const css = getComputedStyle(host);
  const token = (name, fallback) => {
    const v = css.getPropertyValue(name).trim();
    try { return new T.Color(v || fallback); } catch (e) { return new T.Color(fallback); }
  };
  const SCENE_BG = token("--scene-bg", "#e4e4e7");
  const SCENE_GRID = token("--scene-grid", "#ffffff");
  const SCENE_ENV = token("--scene-env", "#e4e4e7");
  const SOFTBOX = token("--scene-softbox", "#ffffff");
  const LIGHT_KEY = token("--scene-light-key", "#ffffff");
  const LIGHT_RIM = token("--scene-light-rim", "#f6f6f6");
  const LIGHT_GROUND = token("--scene-light-ground", "#686669");
  const SIGNAL = token("--scene-signal", "#e3ee06");
  const SIGNAL_SOFT = token("--scene-signal-soft", "#f0f49b");
  const CABLE = token("--scene-cable", "#09090b");
  CFG.WARM = SIGNAL_SOFT.clone();
  renderer.setClearColor(SCENE_BG, 1);

  const scene = new T.Scene();
  scene.fog = new T.Fog(SCENE_BG, 1000, 3000);
  const camera = new T.PerspectiveCamera(28, 1, 5, 20000);

  /* ---------- 유틸 ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => {
    const t = clamp((p - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  /* ---------- 환경맵 (검은 씬 + 소프트박스) ---------- */
  function makeEnv() {
    const s = new T.Scene();
    s.background = SCENE_ENV.clone().multiplyScalar(0.6);
    const panel = (w, h, col, k, pos, map) => {
      const m = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide, map: map || null })
      );
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      s.add(m);
    };
    panel(7, 7, SOFTBOX, 3.2, V(0, 10, 1));
    panel(4, 9, SOFTBOX, 2.4, V(-10, 3, 6));
    panel(2.5, 9, SOFTBOX, 2.0, V(10, 2, -6));
    const gc = document.createElement("canvas");
    gc.width = 4;
    gc.height = 128;
    const g = gc.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "#666");
    gr.addColorStop(1, "#000");
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 128);
    panel(24, 12, SOFTBOX, 1.6, V(0, 0, 12), new T.CanvasTexture(gc));
    panel(30, 3, SOFTBOX, 0.9, V(0, -1, -12));
    panel(3, 10, SOFTBOX, 1.4, V(-12, 0, -2));
    const pm = new T.PMREMGenerator(renderer);
    const tex = pm.fromScene(s, 0.03).texture;
    pm.dispose();
    return tex;
  }
  scene.environment = makeEnv();

  /* ---------- 텍스처 ---------- */
  function brushTex() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 4;
    const g = c.getContext("2d");
    for (let x = 0; x < 256; x++) {
      const v = Math.round(165 + Math.random() * 80);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 4);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(1 / 40, 1 / 40);
    return t;
  }
  function glowTex() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.18, "rgba(255,255,255,0.55)");
    r.addColorStop(0.5, "rgba(255,255,255,0.12)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new T.CanvasTexture(c);
  }
  // 디퓨저 발광 맵: 가운데 세로 빛기둥
  function diffuserTex() {
    const w = 64,
      h = 256;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const v0 = (CFG.LED_Y0 - (CFG.Y0 + 16)) / 368; // LED 시작(아래 기준)
    const v1 = v0 + (CFG.LED_PER_FACE * CFG.LED_PITCH) / 368;
    for (let y = 0; y < h; y++) {
      const v = 1 - y / (h - 1); // 캔버스 위 = 패널 위
      const dv = v < v0 ? (v0 - v) / 0.12 : v > v1 ? (v - v1) / 0.12 : 0;
      const fy = Math.exp(-dv * dv * 2);
      for (let x = 0; x < w; x++) {
        const u = (x / (w - 1) - 0.5) / 0.2;
        const f = (Math.exp(-u * u) * 0.85 + 0.15) * fy;
        const k = Math.round(255 * clamp(f));
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = k;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }

  /* ---------- 재질 ---------- */
  const brushed = brushTex();
  const M = {
    alu: new T.MeshStandardMaterial({ color: 0xd2d5da, metalness: 1, roughness: 0.4, roughnessMap: brushed }),
    bracket: new T.MeshStandardMaterial({ color: 0xb9b4aa, metalness: 0.85, roughness: 0.42 }),
    bracketDark: new T.MeshStandardMaterial({ color: 0x4a4a4c, metalness: 0.6, roughness: 0.55 }),
    bolt: new T.MeshStandardMaterial({ color: 0x8d9096, metalness: 1, roughness: 0.3 }),
    pcb: new T.MeshStandardMaterial({ color: 0x111214, metalness: 0, roughness: 0.5 }),
    ledBody: new T.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0, roughness: 0.6 }),
    ledLens: new T.MeshBasicMaterial({ color: 0xffffff }),
    cable: new T.MeshStandardMaterial({ color: CABLE, metalness: 0, roughness: 0.55 }),
    acrylic: new T.MeshStandardMaterial({
      color: 0x6c6e70,
      metalness: 0,
      roughness: 0.9,
      envMapIntensity: 0.4,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: T.DoubleSide,
      emissive: SIGNAL_SOFT,
      emissiveMap: diffuserTex(),
      emissiveIntensity: 0,
    }),
  };

  /* ---------- 조명 ---------- */
  scene.add(new T.HemisphereLight(LIGHT_KEY, LIGHT_GROUND, 0.35));
  const key = new T.DirectionalLight(LIGHT_KEY, 1.1);
  key.position.set(-400, 900, 600);
  scene.add(key);
  const rim = new T.DirectionalLight(LIGHT_RIM, 0.6);
  rim.position.set(600, 300, -700);
  scene.add(rim);
  const lampLight = new T.PointLight(SIGNAL_SOFT, 0, 560, 1);
  lampLight.position.set(0, 270, 0);
  scene.add(lampLight);

  /* ---------- 2020 프로파일 ---------- */
  function profile2020Shape() {
    const o = 3.1,
      w = 5.5,
      d1 = 1.8,
      d2 = 6.1;
    const side = [
      [-10, 10],
      [-o, 10],
      [-o, 10 - d1],
      [-w, 10 - d1],
      [-w + 1.5, 10 - d2],
      [w - 1.5, 10 - d2],
      [w, 10 - d1],
      [o, 10 - d1],
      [o, 10],
    ];
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const a = (-k * Math.PI) / 2,
        c = Math.cos(a),
        s = Math.sin(a);
      side.forEach(([x, y]) => pts.push(new T.Vector2(x * c - y * s, x * s + y * c)));
    }
    const sh = new T.Shape(pts);
    sh.holes.push(new T.Path().absarc(0, 0, 2.1, 0, Math.PI * 2));
    return sh;
  }
  const PROFILE = profile2020Shape();
  const geoCache = {};
  function profGeo(L, axis) {
    const k = L + axis;
    if (geoCache[k]) return geoCache[k];
    const g = new T.ExtrudeGeometry(PROFILE, { depth: L, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -L / 2);
    if (axis === "x") g.rotateY(Math.PI / 2);
    else if (axis === "y") g.rotateX(-Math.PI / 2);
    return (geoCache[k] = g);
  }
  function profile(L, axis, pos) {
    const m = new T.Mesh(profGeo(L, axis), M.alu);
    m.position.copy(pos);
    return m;
  }

  /* ---------- 코너 브래킷 ----------
     로컬: 꼭짓점 원점, 다리 +X·+Y, 두께 방향은 -Z (0 ~ -d) */
  function bracket(L, d, mat) {
    const th = 3;
    const g = new T.Group();
    const legX = new T.Mesh(new T.BoxGeometry(L, th, d), mat);
    legX.position.set(L / 2, th / 2, -d / 2);
    const legY = new T.Mesh(new T.BoxGeometry(th, L, d), mat);
    legY.position.set(th / 2, L / 2, -d / 2);
    g.add(legX, legY);
    const tri = new T.Shape([new T.Vector2(th, th), new T.Vector2(L - 1, th), new T.Vector2(th, L - 1)]);
    const triG = new T.ExtrudeGeometry(tri, { depth: th, bevelEnabled: false });
    const cheek = new T.Mesh(triG, mat);
    cheek.position.z = -th;
    g.add(cheek);
    if (d >= 16) {
      const back = new T.Mesh(triG, mat);
      back.position.z = -d;
      g.add(back);
    }
    const r = d >= 16 ? 4.4 : 2.4;
    const boltG = new T.CylinderGeometry(r, r, 2.2, 16);
    const b1 = new T.Mesh(boltG, M.bolt);
    b1.position.set(L * 0.66, th + 1.1, -d / 2);
    const b2 = new T.Mesh(boltG, M.bolt);
    b2.rotation.z = Math.PI / 2;
    b2.position.set(th + 1.1, L * 0.66, -d / 2);
    g.add(b1, b2);
    return g;
  }
  // X축·Y축 방향과 바깥쪽(n)을 받아 배치. 오른손 좌표계가 되도록 X/Y를 바꿈
  function placeBracket(b, origin, X, Y, outward) {
    let x = X.clone(),
      y = Y.clone();
    let z = new T.Vector3().crossVectors(x, y);
    if (outward && z.dot(outward) < 0) {
      [x, y] = [y, x];
      z = new T.Vector3().crossVectors(x, y);
    }
    b.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    b.position.copy(origin);
    return { z };
  }

  /* ---------- 부품 등록 ---------- */
  const root = new T.Group();
  scene.add(root);
  const parts = [];
  function addPart(obj, off, a, b) {
    root.add(obj);
    const ax = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    parts.push({
      obj,
      home: obj.position.clone(),
      homeQ: obj.quaternion.clone(),
      off,
      a,
      b,
      ax,
      tilt: 0.12 + Math.random() * 0.14,
      ph: Math.random() * Math.PI * 2,
    });
  }

  // 1) 받침 십자
  addPart(profile(320, "x", V(0, 10, 0)), V(0, -120, 0), 0.1, 0.16);
  [-1, 1].forEach((s) => addPart(profile(150, "z", V(0, 10, s * 85)), V(0, 0, s * 170), 0.13, 0.2));
  // 2) 스파인 (받침 → 랜턴 안)
  addPart(profile(400, "y", V(0, 220, 0)), V(0, 260, 0), 0.17, 0.25);
  // 3) 받침 브래킷 4
  [V(1, 0, 0), V(-1, 0, 0), V(0, 0, 1), V(0, 0, -1)].forEach((dir) => {
    const b = bracket(28, 20, M.bracket);
    const { z } = placeBracket(b, V(0, 0, 0), dir, UP, null);
    b.position.copy(dir.clone().multiplyScalar(10)).add(V(0, 20, 0)).addScaledVector(z, 10);
    addPart(b, dir.clone().multiplyScalar(70).add(V(0, 50, 0)), 0.22, 0.28);
  });
  // 4) 랜턴 하단: 가로바 반쪽 2 + 하단 레일 4
  [-1, 1].forEach((s) => addPart(profile(70, "x", V(s * 45, CFG.Y0 + 10, 0)), V(s * 120, 0, 0), 0.24, 0.3));
  const FACES = [
    { n: V(0, 0, 1), t: V(1, 0, 0) },
    { n: V(0, 0, -1), t: V(-1, 0, 0) },
    { n: V(1, 0, 0), t: V(0, 0, -1) },
    { n: V(-1, 0, 0), t: V(0, 0, 1) },
  ];
  const railAxis = (f) => (Math.abs(f.n.z) > 0 ? "x" : "z");
  FACES.forEach((f) =>
    addPart(profile(160, railAxis(f), f.n.clone().multiplyScalar(C).setY(CFG.Y0 + 10)), f.n.clone().multiplyScalar(130), 0.25, 0.31)
  );
  // 5) 기둥 4
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].forEach(([sx, sz]) => addPart(profile(CFG.H, "y", V(sx * C, CFG.Y0 + CFG.H / 2, sz * C)), V(sx * 110, 170, sz * 110), 0.28, 0.35));
  // 면 브래킷 (하단 0.32~0.37 / 상단 0.53~0.58)
  function faceBrackets(top) {
    FACES.forEach((f) => {
      [-1, 1].forEach((sx) => {
        const b = bracket(34, 8, top ? M.bracketDark : M.bracket);
        const origin = f.n
          .clone()
          .multiplyScalar(99.5)
          .addScaledVector(f.t, sx * 80)
          .setY(top ? Y1 - 20 : CFG.Y0 + 20);
        placeBracket(b, origin, f.t.clone().multiplyScalar(-sx), top ? UP.clone().negate() : UP.clone(), f.n);
        const off = f.n.clone().multiplyScalar(70).add(V(0, top ? 40 : -20, 0));
        addPart(b, off, top ? 0.53 : 0.32, top ? 0.58 : 0.37);
      });
    });
  }
  faceBrackets(false);

  // 6) LED 스트립 (스파인 4면 × 15구)
  const N = CFG.LED_PER_FACE * 4;
  const stripLen = CFG.LED_PER_FACE * CFG.LED_PITCH;
  const stripGeo = new T.BoxGeometry(10, stripLen, 0.4);
  stripGeo.translate(0, stripLen / 2, 0);
  const strips = [];
  const ledBodyIM = new T.InstancedMesh(new T.BoxGeometry(5, 5, 1.6), M.ledBody, N);
  const ledLensIM = new T.InstancedMesh(new T.CircleGeometry(1.7, 16), M.ledLens, N);
  const ledPos = []; // 발광 위치
  const ledFace = [];
  const ledIdx = [];
  const ledMat = []; // 기본 행렬
  const SPINE_FACES = [V(0, 0, 1), V(1, 0, 0), V(0, 0, -1), V(-1, 0, 0)];
  SPINE_FACES.forEach((n, fi) => {
    const q = new T.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
    const s = new T.Mesh(stripGeo, M.pcb);
    s.quaternion.copy(q);
    s.position.copy(n.clone().multiplyScalar(10.2)).setY(CFG.LED_Y0);
    s.scale.y = 0.0001;
    root.add(s);
    strips.push(s);
    for (let i = 0; i < CFG.LED_PER_FACE; i++) {
      const y = CFG.LED_Y0 + CFG.LED_PITCH * (i + 0.5);
      const pBody = n.clone().multiplyScalar(10.4 + 0.8).setY(y);
      const pLens = n.clone().multiplyScalar(10.4 + 1.62).setY(y);
      ledMat.push([pBody, pLens, q]);
      ledPos.push(n.clone().multiplyScalar(14).setY(y));
      ledFace.push(fi);
      ledIdx.push(i);
    }
  });
  ledLensIM.instanceColor = new T.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  root.add(ledBodyIM, ledLensIM);
  const _m = new T.Matrix4();
  const _s = new T.Vector3();
  function setLedVisible(k, vis) {
    const [pb, pl, q] = ledMat[k];
    _s.setScalar(vis ? 1 : 0.0001);
    ledBodyIM.setMatrixAt(k, _m.compose(pb, q, _s));
    ledLensIM.setMatrixAt(k, _m.compose(pl, q, _s));
  }

  // 빛 번짐 Points
  const glowGeo = new T.BufferGeometry();
  const gp = new Float32Array(N * 3),
    gcol = new Float32Array(N * 3);
  ledPos.forEach((p, k) => p.toArray(gp, k * 3));
  glowGeo.setAttribute("position", new T.BufferAttribute(gp, 3));
  glowGeo.setAttribute("color", new T.BufferAttribute(gcol, 3));
  const glow = new T.Points(
    glowGeo,
    new T.PointsMaterial({
      size: 34,
      map: glowTex(),
      vertexColors: true,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  glow.renderOrder = 3;
  root.add(glow);

  // 7) 아크릴 디퓨저 4장 (위에서 슬롯으로 내려옴)
  FACES.forEach((f) => {
    const m = new T.Mesh(new T.BoxGeometry(168, 368, 3), M.acrylic);
    m.quaternion.setFromUnitVectors(V(0, 0, 1), f.n);
    m.position.copy(f.n.clone().multiplyScalar(C)).setY(CFG.Y0 + CFG.H / 2);
    m.renderOrder = 2;
    addPart(m, V(0, 300, 0), 0.43, 0.52);
  });
  // 8) 상단 레일 4 + 상단 브래킷
  FACES.forEach((f) =>
    addPart(profile(160, railAxis(f), f.n.clone().multiplyScalar(C).setY(Y1 - 10)), f.n.clone().multiplyScalar(110).add(V(0, 120, 0)), 0.5, 0.56)
  );
  faceBrackets(true);

  // 9) 파란 전원 케이블
  const cableCurve = new T.CatmullRomCurve3([
    V(0, CFG.LED_Y0 + 2, 11.8),
    V(0, 116, 12.2),
    V(0, 84, 16),
    V(-18, 58, 38),
    V(-46, 26, 66),
    V(-82, 4, 96),
    V(-150, 3.5, 124),
    V(-220, 3.5, 140),
    V(-280, 3.5, 148),
  ]);
  const CAB_SEG = 180,
    CAB_RAD = 10;
  const cable = new T.Mesh(new T.TubeGeometry(cableCurve, CAB_SEG, 2.4, CAB_RAD, false), M.cable);
  cable.geometry.setDrawRange(0, 0);
  root.add(cable);

  // 바닥 그리드
  const grid = new T.GridHelper(4000, 66, SCENE_GRID, SCENE_GRID);
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  scene.add(grid);

  /* ---------- UI ---------- */
  const elBar = host.querySelector(".lamp3d__bar i");
  const elStage = host.querySelector(".lamp3d__stage");
  const elCoords = host.querySelector(".scene__coords");
  const STAGES = [
    [0.1, "01 / EXPLODED  —  SCROLL ▼"],
    [0.35, "02 / FRAME ASSEMBLY"],
    [0.55, "03 / LED STRIP + DIFFUSER"],
    [0.68, "04 / WIRING"],
    [1.01, "05 / POWER ON"],
  ];
  let lastStage = "";

  /* ---------- 입력: 휠 / 드래그 ---------- */
  let target = 0,
    cur = 0;
  const AUTO = host.hasAttribute("data-autoplay");
  let holdUntil = 0; // 사용자가 만지면 자동 재생을 잠시 멈춤
  if (!AUTO) host.addEventListener(
    "wheel",
    (e) => {
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      if ((d > 0 && target >= 1) || (d < 0 && target <= 0)) return; // 끝이면 페이지로 넘김
      e.preventDefault();
      target = clamp(target + d / CFG.WHEEL_RANGE);
    },
    { passive: false }
  );
  let dragY = null;
  canvas.addEventListener("pointerdown", (e) => {
    dragY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    host.classList.add("is-drag");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragY === null) return;
    target = clamp(target - (e.clientY - dragY) / CFG.DRAG_RANGE);
    dragY = e.clientY;
    holdUntil = performance.now() + 4000;
  });
  const endDrag = () => {
    dragY = null;
    host.classList.remove("is-drag");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  host.addEventListener("keydown", (e) => {
    const step = { ArrowDown: 0.04, ArrowRight: 0.04, ArrowUp: -0.04, ArrowLeft: -0.04, End: 1, Home: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    target = clamp(target + step);
  });
  // 테스트·외부 제어용
  host.lampSetProgress = (v, instant) => {
    target = clamp(v);
    if (instant) cur = target;
  };

  /* ---------- 크기 ---------- */
  let vw = 1,
    vh = 1;
  function resize() {
    const r = host.getBoundingClientRect();
    vw = Math.max(1, Math.round(r.width));
    vh = Math.max(1, Math.round(r.height));
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  else window.addEventListener("resize", resize);

  let visible = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver((en) => (visible = en[0].isIntersecting), { rootMargin: "100px" }).observe(host);
  }

  /* ---------- 업데이트 ---------- */
  const _q = new T.Quaternion();
  const box = new T.Box3();
  const sph = new T.Sphere();
  const camC = V(0, 250, 0);
  let camR = 0;
  const ledCol = new T.Color();
  const tmpC = new T.Color();

  function camAngles(p) {
    const K = CFG.CAM;
    for (let i = 0; i < K.length - 1; i++) {
      if (p <= K[i + 1][0]) {
        const t = seg(p, K[i][0], K[i + 1][0]);
        return [K[i][1] + (K[i + 1][1] - K[i][1]) * t, K[i][2] + (K[i + 1][2] - K[i][2]) * t];
      }
    }
    return [K[K.length - 1][1], K[K.length - 1][2]];
  }

  function update(p, time, dt) {
    const idle = reduce ? 0 : 1;
    // 부품 분리/조립
    for (const pt of parts) {
      const k = 1 - seg(p, pt.a, pt.b);
      pt.obj.position.copy(pt.home).addScaledVector(pt.off, k);
      if (k > 0) {
        pt.obj.position.y += Math.sin(time * 1.3 + pt.ph) * 4 * k * idle;
        _q.setFromAxisAngle(pt.ax, pt.tilt * k * (1 + 0.15 * Math.sin(time * 0.9 + pt.ph) * idle));
        pt.obj.quaternion.copy(pt.homeQ).premultiply(_q);
      } else pt.obj.quaternion.copy(pt.homeQ);
    }

    // LED 스트립 깔기 (면마다 아래→위)
    const fill = seg(p, 0.68, 0.78);
    const rainbow = seg(p, 0.8, 0.86) * (1 - seg(p, 0.92, 0.97));
    const breathe = p > 0.9 && !reduce ? 0.86 + 0.14 * Math.sin(time * 1.7) : 1;
    const hueShift = reduce ? p * 3 : time * 0.22 + p * 2;
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const fi = ledFace[k],
        i = ledIdx[k];
      const rev = seg(p, 0.36 + fi * 0.02, 0.42 + fi * 0.02);
      strips[fi].scale.y = Math.max(0.0001, rev);
      setLedVisible(k, (i + 0.5) / CFG.LED_PER_FACE <= rev + 1e-4);

      const lvl = clamp(fill * (CFG.LED_PER_FACE + 2) - i) * breathe;
      // 무지개 대신 시스템 신호색: 라임 ↔ 흰빛 사이를 흐름
      tmpC.copy(SIGNAL).lerp(LIGHT_KEY, 0.3 + 0.3 * Math.sin((i * 0.012 + hueShift) * Math.PI * 2));
      ledCol.copy(CFG.WARM).lerp(tmpC, rainbow);
      // 렌즈: 꺼짐 = 옅은 회색
      const off = 0.32 * (1 - lvl);
      ledLensIM.instanceColor.setXYZ(k, off + ledCol.r * lvl, off + ledCol.g * lvl, off + ledCol.b * lvl);
      gcol[k * 3] = ledCol.r * lvl * 0.5;
      gcol[k * 3 + 1] = ledCol.g * lvl * 0.5;
      gcol[k * 3 + 2] = ledCol.b * lvl * 0.5;
      sum += lvl;
    }
    ledBodyIM.instanceMatrix.needsUpdate = true;
    ledLensIM.instanceMatrix.needsUpdate = true;
    ledLensIM.instanceColor.needsUpdate = true;
    glowGeo.attributes.color.needsUpdate = true;
    const avg = sum / N;
    // 디퓨저·실내광은 평균 색으로
    tmpC.setRGB(0, 0, 0);
    for (let k = 0; k < N; k++) tmpC.r += gcol[k * 3], tmpC.g += gcol[k * 3 + 1], tmpC.b += gcol[k * 3 + 2];
    if (sum > 0) tmpC.multiplyScalar(1 / (sum * 0.5));
    else tmpC.copy(CFG.WARM);
    M.acrylic.emissive.copy(tmpC);
    M.acrylic.emissiveIntensity = avg * 1.25;
    M.acrylic.opacity = 0.22 + avg * 0.3;
    lampLight.color.copy(tmpC);
    lampLight.intensity = avg * 1.8;

    // 케이블
    const cf = seg(p, 0.56, 0.68);
    cable.visible = cf > 0;
    cable.geometry.setDrawRange(0, Math.floor(cf * CAB_SEG) * CAB_RAD * 6);

    // 카메라 맞춤 (현재 물체 경계구 기준, 부드럽게)
    root.updateMatrixWorld(true);
    box.makeEmpty();
    for (const pt of parts) box.expandByObject(pt.obj);
    if (cable.visible) box.expandByPoint(cableCurve.getPoint(cf));
    box.getBoundingSphere(sph);
    const a = Math.min(1, dt * 4);
    if (camR === 0) {
      camC.copy(sph.center);
      camR = sph.radius;
    } else {
      camC.lerp(sph.center, a);
      camR += (sph.radius - camR) * a;
    }
    const hv = T.MathUtils.degToRad(camera.fov / 2);
    const hh = Math.atan(Math.tan(hv) * camera.aspect);
    const dist = (camR / Math.sin(Math.min(hv, hh))) * 1.03;
    let [az, el] = camAngles(p);
    if (!reduce) az += Math.sin(time * 0.35) * 2.5;
    const azr = T.MathUtils.degToRad(az),
      elr = T.MathUtils.degToRad(el);
    const dir = V(Math.sin(azr) * Math.cos(elr), Math.sin(elr), Math.cos(azr) * Math.cos(elr));
    camera.position.copy(camC).addScaledVector(dir, dist);
    camera.lookAt(camC);
    camera.near = Math.max(1, dist - camR * 1.5);
    camera.far = dist + camR * 8;
    camera.updateProjectionMatrix();
    scene.fog.near = dist + camR * 0.6;
    scene.fog.far = dist + camR * 5;

    // UI
    if (elBar) elBar.style.transform = `scaleX(${p.toFixed(4)})`;
    const st = STAGES.find((s) => p < s[0])[1];
    if (elStage && st !== lastStage) elStage.textContent = lastStage = st;
    if (elCoords)
      elCoords.textContent = `X ${dir.x >= 0 ? " " : ""}${dir.x.toFixed(3)}  /  Y ${dir.y.toFixed(3)}  /  Z ${dir.z.toFixed(3)}`;
  }

  /* ---------- 루프 ---------- */
  let last = performance.now(),
    time = 0,
    autoT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    time += dt;
    if (AUTO && dragY === null && now > holdUntil) {
      if (reduce) target = 1;
      else {
        // 분해 1.2s, 조립 5s, 점등 유지 2.8s, 분해 3s
        const L = [1.2, 5, 2.8, 3];
        const tot = L[0] + L[1] + L[2] + L[3];
        let t = (autoT += dt) % tot;
        if (t < L[0]) target = 0;
        else if ((t -= L[0]) < L[1]) target = t / L[1];
        else if ((t -= L[1]) < L[2]) target = 1;
        else target = 1 - (t - L[2]) / L[3];
      }
    }
    cur += (target - cur) * Math.min(1, dt * (AUTO ? 4 : 7));
    if (Math.abs(target - cur) < 1e-4) cur = target;
    update(cur, time, dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
