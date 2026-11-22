// 온실 데모: 온도 슬라이더로 화분 카드 단계와 화면 색을 바꿉니다.
(() => {
  const STAGES = [
    { key: "sprout", name: "새싹", num: "01", max: 26, next: "26°C가 되면 잎이 납니다.", tag: "26°C" },
    { key: "leaf", name: "잎", num: "02", max: 28, next: "28°C가 되면 봉오리가 생깁니다.", tag: "28°C" },
    { key: "bud", name: "봉오리", num: "03", max: 30, next: "30°C가 되면 꽃이 핍니다.", tag: "30°C" },
    { key: "bloom", name: "꽃", num: "04", max: Infinity, next: "다 피었습니다. 식으면 다시 오므라듭니다.", tag: "30°C 이상" },
  ];
  const stageOf = (t) => STAGES.find((s) => t < s.max);

  const range = document.getElementById("temp");
  const screen = document.querySelector("[data-screen]");
  const readout = document.querySelector("[data-readout]");
  const pots = [...document.querySelectorAll("[data-pot]")];
  const steps = [...document.querySelectorAll("[data-stage-step]")];
  const presets = [...document.querySelectorAll("[data-preset]")];
  const setText = (sel, text) => document.querySelectorAll(sel).forEach((el) => (el.textContent = text));

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current = null;

  function render(t) {
    const label = `${t.toFixed(1)}°C`;
    const s = stageOf(t);
    setText("[data-temp-num]", t.toFixed(1));
    setText("[data-temp-field]", label);
    range.setAttribute("aria-valuetext", `${label}, ${s.name}`);
    presets.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.preset) === t)));

    const changed = s !== current;
    const apply = () => {
      pots.forEach((pot) => {
        pot.querySelector("[data-title]").textContent = `${pot.dataset.pot} · ${s.name} · ${label}`;
        if (changed) {
          pot.querySelector("[data-desc]").textContent = s.next;
          pot.querySelector("[data-tag-stage]").textContent = s.name;
          pot.querySelector("[data-tag-temp]").textContent = s.tag;
        }
      });
      if (changed) {
        setText("[data-stage-name-out]", s.name);
        setText("[data-stage-note-out]", s.next);
        setText("[data-stage-num-out]", s.num);
      }
    };

    if (!changed) return apply();
    const first = current === null;
    current = s;
    screen.dataset.stage = s.key;
    steps.forEach((li) => li.setAttribute("aria-current", String(li.dataset.stageStep === s.key)));

    if (first || reduced) return apply();
    // 단계가 바뀔 때: 글자를 잠깐 내렸다가 새 단계로 올립니다 (motion/duration/slow).
    pots.forEach((p) => p.classList.add("is-changing"));
    readout.classList.add("is-changing");
    setTimeout(() => {
      apply();
      pots.forEach((p) => p.classList.remove("is-changing"));
      readout.classList.remove("is-changing");
    }, 160);
  }

  range.addEventListener("input", () => render(Number(range.value)));
  presets.forEach((b) =>
    b.addEventListener("click", () => {
      range.value = b.dataset.preset;
      render(Number(range.value));
    })
  );
  render(Number(range.value));
})();
