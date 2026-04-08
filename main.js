const STORAGE_KEY = "hiit-timer-settings-v1";
const SOUND_STORAGE_KEY = "hiit-timer-sound-enabled-v1";
const SOUND_VOLUME_STORAGE_KEY = "hiit-timer-sound-volume-v1";
const PAUSE_ON_HIDDEN_STORAGE_KEY = "hiit-timer-pause-on-hidden-v1";
const RAF_TICK_INTERVAL_MS = 80;
const DEFAULT_SOUND_VOLUME = 0.16;
const COUNTDOWN_SOUND_VOLUME = 0.14;

const workInput = document.getElementById("workSeconds");
const restInput = document.getElementById("restSeconds");
const roundsInput = document.getElementById("rounds");

const timerDisplay = document.getElementById("timerDisplay");
const roundNow = document.getElementById("roundNow");
const roundTotal = document.getElementById("roundTotal");
const phaseText = document.getElementById("phaseText");
const phaseBadge = document.getElementById("phaseBadge");
const remainingTotal = document.getElementById("remainingTotal");
const progressBar = document.getElementById("progressBar");
const saveStatus = document.getElementById("saveStatus");
const lockHint = document.getElementById("lockHint");
const quickWorkValue = document.getElementById("quickWorkValue");
const quickRestValue = document.getElementById("quickRestValue");
const quickRoundsValue = document.getElementById("quickRoundsValue");
const soundEnabledInput = document.getElementById("soundEnabled");
const soundVolumeInput = document.getElementById("soundVolume");
const soundVolumeValue = document.getElementById("soundVolumeValue");
const pauseOnHiddenInput = document.getElementById("pauseOnHidden");
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const applySettingsBtn = document.getElementById("applySettingsBtn");
const closeSettingsBackdropBtn = document.querySelector(
  "[data-close-settings]",
);

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const saveBtn = document.getElementById("saveBtn");

const workScreen = document.getElementById("workScreen");
const restScreen = document.getElementById("restScreen");
const embers = document.getElementById("embers");
const snow = document.getElementById("snow");
const stepButtons = document.querySelectorAll(".step-btn");
const presetButtons = document.querySelectorAll(".preset-btn");

let settings = loadSettings();
let soundEnabled = loadSoundEnabled();
let soundVolumeScale = loadSoundVolumeScale();
let pauseOnHidden = loadPauseOnHidden();
let saveStatusTimer = null;
let audioCtx = null;
let audioUnlocked = false;

let rafId = null;
let lastTickAt = 0;
let endAt = null;
let phase = "work";
let remaining = settings.workSeconds;
let currentRound = 1;
let isRunning = false;
let completed = false;
let countdownMarks = new Set();
let shouldResumeWhenVisible = false;

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { workSeconds: 30, restSeconds: 20, rounds: 8 };
    }
    const parsed = JSON.parse(raw);
    return {
      workSeconds: clampInt(parsed.workSeconds, 30, 1, 3600),
      restSeconds: clampInt(parsed.restSeconds, 20, 1, 3600),
      rounds: clampInt(parsed.rounds, 8, 1, 999),
    };
  } catch (e) {
    console.warn("設定の読み込みに失敗", e);
    return { workSeconds: 30, restSeconds: 20, rounds: 8 };
  }
}

function saveSettings(statusText = "設定を保存しました") {
  const next = readSettingsFromInputs();
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    showSaveStatus(statusText);
  } catch (e) {
    console.warn("設定の保存に失敗", e);
    showSaveStatus("設定の保存に失敗しました");
  }
  renderStatic();
}

function loadSoundEnabled() {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw == null) return true;
    return raw === "1";
  } catch (e) {
    console.warn("音声設定の読み込みに失敗", e);
    return true;
  }
}

function saveSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled ? "1" : "0");
    showSaveStatus(
      soundEnabled
        ? "音声ガイドをオンにしました"
        : "音声ガイドをオフにしました",
    );
  } catch (e) {
    console.warn("音声設定の保存に失敗", e);
    showSaveStatus("音声設定の保存に失敗しました");
  }
}

function loadSoundVolumeScale() {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_STORAGE_KEY);
    if (raw == null) return 1;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(1.5, Math.max(0, parsed));
  } catch (e) {
    console.warn("音量設定の読み込みに失敗", e);
    return 1;
  }
}

function updateSoundVolumeUI() {
  if (!soundVolumeInput || !soundVolumeValue) return;
  const percent = Math.round(soundVolumeScale * 100);
  soundVolumeInput.value = String(percent);
  soundVolumeValue.textContent = `${percent}%`;
}

function saveSoundVolumeScale(scale, showMessage = false) {
  soundVolumeScale = Math.min(1.5, Math.max(0, Number(scale) || 0));
  updateSoundVolumeUI();
  try {
    localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolumeScale));
    if (showMessage) {
      showSaveStatus(
        `音量を ${Math.round(soundVolumeScale * 100)}% に設定しました`,
      );
    }
  } catch (e) {
    console.warn("音量設定の保存に失敗", e);
    showSaveStatus("音量設定の保存に失敗しました");
  }
}

function loadPauseOnHidden() {
  try {
    const raw = localStorage.getItem(PAUSE_ON_HIDDEN_STORAGE_KEY);
    if (raw == null) return false;
    return raw === "1";
  } catch (e) {
    console.warn("バックグラウンド設定の読み込みに失敗", e);
    return false;
  }
}

function savePauseOnHidden(enabled) {
  pauseOnHidden = Boolean(enabled);
  try {
    localStorage.setItem(
      PAUSE_ON_HIDDEN_STORAGE_KEY,
      pauseOnHidden ? "1" : "0",
    );
    showSaveStatus(
      pauseOnHidden
        ? "バックグラウンド自動一時停止をオンにしました"
        : "バックグラウンド自動一時停止をオフにしました",
    );
  } catch (e) {
    console.warn("バックグラウンド設定の保存に失敗", e);
    showSaveStatus("バックグラウンド設定の保存に失敗しました");
  }
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readSettingsFromInputs() {
  const next = {
    workSeconds: clampInt(workInput.value, settings.workSeconds, 1, 3600),
    restSeconds: clampInt(restInput.value, settings.restSeconds, 1, 3600),
    rounds: clampInt(roundsInput.value, settings.rounds, 1, 999),
  };
  workInput.value = next.workSeconds;
  restInput.value = next.restSeconds;
  roundsInput.value = next.rounds;
  return next;
}

function syncInputs() {
  workInput.value = settings.workSeconds;
  restInput.value = settings.restSeconds;
  roundsInput.value = settings.rounds;
  updateQuickSettingsSummary();
}

function updateQuickSettingsSummary() {
  if (quickWorkValue) quickWorkValue.textContent = String(settings.workSeconds);
  if (quickRestValue) quickRestValue.textContent = String(settings.restSeconds);
  if (quickRoundsValue) quickRoundsValue.textContent = String(settings.rounds);
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function openSettingsModal() {
  if (!settingsModal || !isMobileViewport()) return;
  settingsModal.classList.add("open");
  settingsModal.setAttribute("aria-hidden", "false");
}

function closeSettingsModal() {
  if (!settingsModal) return;
  settingsModal.classList.remove("open");
  settingsModal.setAttribute("aria-hidden", "true");
}

function setInputsDisabled(disabled) {
  workInput.disabled = disabled;
  restInput.disabled = disabled;
  roundsInput.disabled = disabled;
  stepButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
  presetButtons.forEach((btn) => {
    btn.disabled = disabled;
  });
  if (lockHint) {
    lockHint.textContent = disabled
      ? "タイマー実行中は時間と回数の設定を変更できません"
      : "";
  }
}

function showSaveStatus(message) {
  if (!saveStatus) return;
  saveStatus.textContent = message;
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => {
    saveStatus.textContent = "";
  }, 2000);
}

function adjustInputValue(input, delta) {
  const min = Number(input.min || 1);
  const max = Number(input.max || 999999);
  const current = clampInt(input.value, min, min, max);
  const next = Math.min(max, Math.max(min, current + delta));
  input.value = next;
}

function applyPreset(work, rest, rounds) {
  workInput.value = clampInt(work, settings.workSeconds, 1, 3600);
  restInput.value = clampInt(rest, settings.restSeconds, 1, 3600);
  roundsInput.value = clampInt(rounds, settings.rounds, 1, 999);
  settings = readSettingsFromInputs();
  phase = "work";
  currentRound = 1;
  remaining = settings.workSeconds;
  completed = false;
  countdownMarks = new Set();
  renderStatic();
  saveSettings("プリセットを保存しました");
  if (isMobileViewport()) {
    closeSettingsModal();
  }
}

function formatTime(sec) {
  const total = Math.max(0, Math.ceil(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function calcRemainingTotal() {
  const roundsLeftIncludingCurrent = settings.rounds - currentRound;
  let total = remaining;

  if (phase === "work") {
    total += settings.restSeconds;
  }

  total +=
    roundsLeftIncludingCurrent * (settings.workSeconds + settings.restSeconds);
  return total;
}

function getPhaseDuration() {
  return phase === "work" ? settings.workSeconds : settings.restSeconds;
}

function updateTheme() {
  const isWork = phase === "work";
  document.body.className = isWork ? "work-theme" : "rest-theme";
  workScreen.classList.toggle("active", isWork);
  restScreen.classList.toggle("active", !isWork);
  phaseBadge.textContent = isWork ? "WORK" : "REST";
  phaseText.textContent = isWork ? "動く時間" : "レスト";
}

function renderStatic() {
  roundNow.textContent = String(currentRound);
  roundTotal.textContent = String(settings.rounds);
  timerDisplay.textContent = formatTime(remaining);
  remainingTotal.textContent = formatTime(calcRemainingTotal());
  updateQuickSettingsSummary();
  updateTheme();

  const duration = getPhaseDuration();
  const elapsed = Math.max(0, duration - remaining);
  const rate = duration > 0 ? (elapsed / duration) * 100 : 0;
  progressBar.style.width = `${Math.min(100, Math.max(0, rate))}%`;
}

function getAudioContext() {
  if (audioCtx && audioCtx.state !== "closed") {
    return audioCtx;
  }
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioCtx = new AudioCtor();
  return audioCtx;
}

function unlockAudioContext() {
  const ctx = getAudioContext();
  if (!ctx || audioUnlocked) return;

  if (ctx.state === "running") {
    audioUnlocked = true;
    return;
  }

  ctx
    .resume()
    .then(() => {
      if (ctx.state !== "running") return;
      audioUnlocked = true;
      // Prime output on iOS Safari so subsequent cues play reliably.
      scheduleTone(ctx, 880, 12, 0.001, "sine", 0);
    })
    .catch(() => {});
}

function handlePotentialUserGesture() {
  unlockAudioContext();
  if (!audioUnlocked) return;

  ["pointerdown", "touchstart", "click", "keydown"].forEach((eventName) => {
    document.removeEventListener(eventName, handlePotentialUserGesture);
  });
}

function scheduleTone(ctx, freq, ms, volume, type, when) {
  const startAt = ctx.currentTime + when;
  const stopAt = startAt + ms / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const actualVolume = Math.min(
    0.24,
    Math.max(0.0001, volume * soundVolumeScale),
  );

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(actualVolume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(stopAt + 0.01);
}

function playTone(
  freq,
  ms = 140,
  volume = DEFAULT_SOUND_VOLUME,
  type = "sine",
  when = 0,
) {
  if (!soundEnabled) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx
      .resume()
      .then(() => {
        if (!soundEnabled) return;
        scheduleTone(ctx, freq, ms, volume, type, when);
      })
      .catch(() => {});
    return;
  }

  scheduleTone(ctx, freq, ms, volume, type, when);
}

function playSequence(notes, type = "sine") {
  notes.forEach((note, index) => {
    playTone(note, 130, DEFAULT_SOUND_VOLUME, type, index * 0.12);
  });
}

function playCountdownSound(second) {
  const freqMap = { 3: 560, 2: 670, 1: 790 };
  const freq = freqMap[second] || 560;
  playTone(freq, 90, COUNTDOWN_SOUND_VOLUME, "triangle");
}

function playTransitionSound(fromPhase) {
  if (fromPhase === "work") {
    // work -> rest
    playSequence([988, 784, 659], "sine");
  } else {
    // rest -> work
    playSequence([523, 659, 880], "square");
  }
}

function playStartSound() {
  playSequence([659, 880, 1175], "triangle");
}

function maybePlayCountdown() {
  const secondsLeft = Math.ceil(remaining);
  if (secondsLeft > 3 || secondsLeft < 1) {
    return;
  }

  if (countdownMarks.has(secondsLeft)) {
    return;
  }

  countdownMarks.add(secondsLeft);
  playCountdownSound(secondsLeft);
}

function tick() {
  const now = Date.now();
  remaining = Math.max(0, (endAt - now) / 1000);
  maybePlayCountdown();
  renderStatic();

  if (remaining <= 0) {
    nextPhase();
  }
}

function stopTimerLoop() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastTickAt = 0;
}

function animationLoop(timestamp) {
  if (!isRunning) return;

  if (lastTickAt === 0 || timestamp - lastTickAt >= RAF_TICK_INTERVAL_MS) {
    tick();
    lastTickAt = timestamp;
  }

  if (isRunning) {
    rafId = requestAnimationFrame(animationLoop);
  }
}

function startTimerLoop() {
  stopTimerLoop();
  rafId = requestAnimationFrame(animationLoop);
}

function start(playCue = false) {
  if (completed) {
    reset();
  }

  if (isRunning) return;

  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  if (playCue) {
    playStartSound();
  }

  settings = readSettingsFromInputs();
  setInputsDisabled(true);
  isRunning = true;
  endAt = Date.now() + remaining * 1000;
  startTimerLoop();
  renderStatic();
}

function pause() {
  if (!isRunning) return;
  stopTimerLoop();
  remaining = Math.max(0, (endAt - Date.now()) / 1000);
  isRunning = false;
  setInputsDisabled(false);
  renderStatic();
}

function finish() {
  stopTimerLoop();
  isRunning = false;
  completed = true;
  countdownMarks = new Set();
  setInputsDisabled(false);
  timerDisplay.textContent = "DONE";
  remainingTotal.textContent = "00:00";
  progressBar.style.width = "100%";
  phaseBadge.textContent = "FINISH";
  phaseText.textContent = "完了";
  try {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
  } catch (_) {}
}

function nextPhase() {
  const previousPhase = phase;

  if (phase === "work") {
    phase = "rest";
    remaining = settings.restSeconds;
  } else {
    if (currentRound >= settings.rounds) {
      finish();
      return;
    }
    currentRound += 1;
    phase = "work";
    remaining = settings.workSeconds;
  }

  playTransitionSound(previousPhase);
  countdownMarks = new Set();

  if (navigator.vibrate) {
    try {
      navigator.vibrate(120);
    } catch (_) {}
  }

  if (isRunning) {
    endAt = Date.now() + remaining * 1000;
  }
  renderStatic();
}

function reset() {
  stopTimerLoop();
  settings = readSettingsFromInputs();
  isRunning = false;
  completed = false;
  phase = "work";
  currentRound = 1;
  remaining = settings.workSeconds;
  countdownMarks = new Set();
  setInputsDisabled(false);
  renderStatic();
}

function createParticles(container, className, count, isBottomStart = false) {
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement("span");
    el.className = className;
    el.style.left = `${Math.random() * 100}%`;
    if (!isBottomStart) {
      el.style.animationDelay = `${Math.random() * 6}s`;
    } else {
      el.style.animationDelay = `${Math.random() * 3}s`;
    }
    el.style.animationDuration = `${3 + Math.random() * 5}s`;
    const size = 4 + Math.random() * 7;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    fragment.appendChild(el);
  }
  container.appendChild(fragment);
}

startBtn.addEventListener("click", () => start(true));
pauseBtn.addEventListener("click", pause);
resetBtn.addEventListener("click", reset);
saveBtn.addEventListener("click", () => saveSettings("設定を保存しました"));

["pointerdown", "touchstart", "click", "keydown"].forEach((eventName) => {
  document.addEventListener(eventName, handlePotentialUserGesture, {
    passive: true,
  });
});

if (openSettingsBtn) {
  openSettingsBtn.addEventListener("click", openSettingsModal);
}

if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", closeSettingsModal);
}

if (closeSettingsBackdropBtn) {
  closeSettingsBackdropBtn.addEventListener("click", closeSettingsModal);
}

if (applySettingsBtn) {
  applySettingsBtn.addEventListener("click", () => {
    saveSettings("設定を保存しました");
    closeSettingsModal();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSettingsModal();
  }
});

window.addEventListener("resize", () => {
  if (!isMobileViewport()) {
    closeSettingsModal();
  }
});

if (soundEnabledInput) {
  soundEnabledInput.checked = soundEnabled;
  soundEnabledInput.addEventListener("change", () => {
    saveSoundEnabled(soundEnabledInput.checked);
  });
}

if (soundVolumeInput) {
  updateSoundVolumeUI();

  soundVolumeInput.addEventListener("input", () => {
    const nextScale = Number(soundVolumeInput.value) / 100;
    soundVolumeScale = Math.min(1.5, Math.max(0, nextScale));
    updateSoundVolumeUI();
  });

  soundVolumeInput.addEventListener("change", () => {
    const nextScale = Number(soundVolumeInput.value) / 100;
    saveSoundVolumeScale(nextScale, true);
  });
}

if (pauseOnHiddenInput) {
  pauseOnHiddenInput.checked = pauseOnHidden;
  pauseOnHiddenInput.addEventListener("change", () => {
    savePauseOnHidden(pauseOnHiddenInput.checked);
  });
}

document.addEventListener("visibilitychange", () => {
  if (!pauseOnHidden) return;

  if (document.hidden) {
    shouldResumeWhenVisible = isRunning;
    if (isRunning) {
      pause();
      showSaveStatus("バックグラウンドで一時停止しました");
    }
    return;
  }

  if (shouldResumeWhenVisible && !isRunning && !completed) {
    start(false);
    showSaveStatus("タイマーを再開しました");
  }
  shouldResumeWhenVisible = false;
});

stepButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isRunning) return;
    const inputId = btn.dataset.input;
    const delta = Number(btn.dataset.delta || 0);
    const input = document.getElementById(inputId);
    if (!input) return;
    adjustInputValue(input, delta);
    settings = readSettingsFromInputs();
    if (!completed) {
      remaining =
        phase === "work" ? settings.workSeconds : settings.restSeconds;
    }
    renderStatic();
    saveSettings("変更を自動保存しました");
  });
});

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (isRunning) return;
    applyPreset(btn.dataset.work, btn.dataset.rest, btn.dataset.rounds);
  });
});

[workInput, restInput, roundsInput].forEach((input) => {
  input.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );

  input.addEventListener("change", () => {
    if (!isRunning) {
      settings = readSettingsFromInputs();
      if (!completed) {
        if (phase === "work") remaining = settings.workSeconds;
        if (phase === "rest") remaining = settings.restSeconds;
      }
      saveSettings("変更を自動保存しました");
      renderStatic();
    }
  });
});

createParticles(embers, "ember", 30, true);
createParticles(snow, "flake", 42, false);
syncInputs();
showSaveStatus("前回設定を読み込みました");
reset();
