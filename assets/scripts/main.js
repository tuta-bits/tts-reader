/* ============================================================
   GLOBAL STATE
============================================================ */

const textInput = document.getElementById("textInput");
const charCount = document.getElementById("charCount");

const tabUS = document.getElementById("tabUS");
const tabUK = document.getElementById("tabUK");
const voiceSelect = document.getElementById("voiceSelect");

const rateSlider = document.getElementById("rateSlider");
const rateLabel = document.getElementById("rateLabel");

const playPauseBtn = document.getElementById("playPauseBtn");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const playStatus = document.getElementById("playStatus");

const stopBtn = document.getElementById("stopBtn");

const ttsDot = document.getElementById("ttsDot");
const ttsStatus = document.getElementById("ttsStatus");

const screenRecordBtn = document.getElementById("screenRecordBtn");
const screenStatus = document.getElementById("screenStatus");
const screenPreview = document.getElementById("screenPreview");
const recDot = document.getElementById("recDot");
const recStatus = document.getElementById("recStatus");

let voices = [];
let currentLocale = "en-US";
let selectedVoice = null;

let currentUtterance = null;
let isPlaying = false;
let isPaused = false;

let chunks = [];
let currentChunkIndex = 0;
let globalOffset = 0;

/* ============================================================
   TEXT COUNTER
============================================================ */

textInput.addEventListener("input", () => {
  charCount.textContent = `${textInput.value.length} characters`;
});

/* ============================================================
   SYNC OVERLAY SCROLL
============================================================ */

textInput.addEventListener("scroll", () => {
  if (window._overlay) window._overlay.scrollTop = textInput.scrollTop;
});

/* ============================================================
   LOAD VOICES
============================================================ */

function loadVoices() {
  voices = speechSynthesis.getVoices();
  populateVoiceSelect();
}

function populateVoiceSelect() {
  const filtered = voices.filter(v => v.lang === currentLocale);

  voiceSelect.innerHTML = "";

  filtered.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang}) ${v.localService ? "(Microsoft)" : "(Google)"}`;
    voiceSelect.appendChild(opt);
  });

  voiceSelect.selectedIndex = 0;
}

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

/* ============================================================
   REGION TABS
============================================================ */

function setRegion(locale) {
  currentLocale = locale;
  tabUS.classList.toggle("active", locale === "en-US");
  tabUK.classList.toggle("active", locale === "en-GB");
  populateVoiceSelect();
}

tabUS.addEventListener("click", () => setRegion("en-US"));
tabUK.addEventListener("click", () => setRegion("en-GB"));

/* ============================================================
   PLAYBACK SPEED
============================================================ */

rateSlider.addEventListener("input", () => {
  const rate = parseFloat(rateSlider.value);
  rateLabel.textContent = `${rate.toFixed(1)}×`;
  if (currentUtterance) currentUtterance.rate = rate;
});

/* ============================================================
   CHUNKING (ONLY FOR GOOGLE VOICES)
============================================================ */

function chunkText(text, size = 2000) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size;
  }
  return chunks;
}

/* ============================================================
   HIGHLIGHT OVERLAY SYSTEM
============================================================ */

function applyHighlight(start, end, type) {
  const text = textInput.value;

  const before = text.slice(0, start);
  const target = text.slice(start, end);
  const after = text.slice(end);

  const spanClass = type === "word" ? "word-highlight" : "sentence-highlight";

  const html = before + `<span class="${spanClass}">` + target + `</span>` + after;

  renderHighlight(html);
  autoScrollTo(start);
}

function renderHighlight(html) {
  if (!window._overlay) {
    const overlay = document.createElement("div");
    overlay.id = "highlightOverlay";

    const style = window.getComputedStyle(textInput);

    overlay.style.position = "absolute";
    overlay.style.top = textInput.offsetTop + "px";
    overlay.style.left = textInput.offsetLeft + "px";
    overlay.style.width = textInput.offsetWidth + "px";
    overlay.style.height = textInput.offsetHeight + "px";
    overlay.style.pointerEvents = "none";
    overlay.style.whiteSpace = "pre-wrap";
    overlay.style.wordWrap = "break-word";
    overlay.style.font = style.font;
    overlay.style.padding = style.padding;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.color = "transparent";
    overlay.style.overflow = "hidden";
    overlay.style.zIndex = 10;

    textInput.parentElement.appendChild(overlay);
    window._overlay = overlay;
  }

  window._overlay.innerHTML = html;
}

function autoScrollTo(index) {
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(textInput);

  ["fontSize", "fontFamily", "lineHeight", "padding", "border", "whiteSpace", "width"]
    .forEach(prop => mirror.style[prop] = style[prop]);

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";

  mirror.textContent = textInput.value.substring(0, index);

  document.body.appendChild(mirror);
  const caretY = mirror.offsetHeight;
  document.body.removeChild(mirror);

  textInput.scrollTop = caretY - textInput.clientHeight / 2;

  if (window._overlay) window._overlay.scrollTop = textInput.scrollTop;
}

function findSentenceBounds(text, index) {
  let start = index;
  while (start > 0 && !".!?".includes(text[start - 1])) start--;

  let end = index;
  while (end < text.length && !".!?".includes(text[end])) end++;

  return { start, end };
}

/* ============================================================
   PLAYBACK ENGINE (NORMAL + CHUNKED)
============================================================ */

function playChunk() {
  if (currentChunkIndex >= chunks.length) {
    playStatus.textContent = "Finished";
    isPlaying = false;
    return;
  }

  const chunk = chunks[currentChunkIndex];
  const utterance = new SpeechSynthesisUtterance(chunk);

  utterance.voice = selectedVoice;
  utterance.rate = parseFloat(rateSlider.value);

  utterance.onboundary = (event) => {
    const fullText = textInput.value;

    const absoluteIndex =
      typeof event.charIndex === "number" && event.charIndex > 0
        ? globalOffset + event.charIndex
        : globalOffset;

    const { start: sStart, end: sEnd } = findSentenceBounds(fullText, absoluteIndex);
    applyHighlight(sStart, sEnd, "sentence");

    if (selectedVoice.localService === true && selectedVoice.lang === "en-US") {
      let wStart = absoluteIndex;
      while (wStart > 0 && /\S/.test(fullText[wStart - 1])) wStart--;

      let wEnd = absoluteIndex;
      while (wEnd < fullText.length && /\S/.test(fullText[wEnd])) wEnd++;

      applyHighlight(wStart, wEnd, "word");
    }
  };

  utterance.onend = () => {
    globalOffset += chunk.length;
    currentChunkIndex++;
    if (!isPaused) playChunk();
  };

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

function startNormalPlayback() {
  const fullText = textInput.value;
  const utterance = new SpeechSynthesisUtterance(fullText);

  utterance.voice = selectedVoice;
  utterance.rate = parseFloat(rateSlider.value);

  utterance.onboundary = (event) => {
    const absoluteIndex = event.charIndex;
    const { start: sStart, end: sEnd } = findSentenceBounds(fullText, absoluteIndex);
    applyHighlight(sStart, sEnd, "sentence");

    if (selectedVoice.lang === "en-US") {
      let wStart = absoluteIndex;
      while (wStart > 0 && /\S/.test(fullText[wStart - 1])) wStart--;

      let wEnd = absoluteIndex;
      while (wEnd < fullText.length && /\S/.test(fullText[wEnd])) wEnd++;

      applyHighlight(wStart, wEnd, "word");
    }
  };

  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

function startPlayback() {
  const fullText = textInput.value;
  if (!fullText.trim()) return;

  selectedVoice = voices.find(v => v.name === voiceSelect.value);

  isPlaying = true;
  isPaused = false;

  playStatus.textContent = "Playing";
  playIcon.style.display = "none";
  pauseIcon.style.display = "block";

  if (selectedVoice.localService === true) {
    startNormalPlayback();
  } else {
    chunks = chunkText(fullText, 2000);
    currentChunkIndex = 0;
    globalOffset = 0;
    playChunk();
  }
}

function togglePlayPause() {
  if (!isPlaying && !isPaused) {
    startPlayback();
    return;
  }

  if (isPlaying && !isPaused) {
    speechSynthesis.pause();
    isPaused = true;
    isPlaying = false;

    playStatus.textContent = "Paused";
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    return;
  }

  if (isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    isPlaying = true;

    playStatus.textContent = "Playing";
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
  }
}

playPauseBtn.addEventListener("click", togglePlayPause);

/* ============================================================
   STOP BUTTON
============================================================ */

stopBtn.addEventListener("click", () => {
  speechSynthesis.cancel();

  isPlaying = false;
  isPaused = false;

  currentChunkIndex = 0;
  globalOffset = 0;

  playStatus.textContent = "Stopped";
  playIcon.style.display = "block";
  pauseIcon.style.display = "none";

  if (window._overlay) window._overlay.innerHTML = "";
});

/* ============================================================
   FIXED SCREEN RECORDER MODULE
============================================================ */

let screenRecorder = null;
let screenChunks = [];
let isScreenRecording = false;

async function startScreenRecording() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    let finalStream = screenStream;

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const tracks = [
        ...screenStream.getVideoTracks(),
        ...screenStream.getAudioTracks(),
        ...micStream.getAudioTracks()
      ];

      finalStream = new MediaStream(tracks);
    } catch (err) {
      console.warn("Mic unavailable, recording screen only.");
    }

    screenChunks = [];
    screenRecorder = new MediaRecorder(finalStream, {
      mimeType: "video/webm; codecs=vp9"
    });

    screenRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) screenChunks.push(e.data);
    };

    screenRecorder.onstop = () => {
      const blob = new Blob(screenChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      screenPreview.src = url;
      screenPreview.style.display = "block";

      const a = document.createElement("a");
      a.href = url;
      a.download = "screen-recording.webm";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      recStatus.textContent = "Recorded";
      recDot.classList.remove("recording");
      recDot.classList.add("active");
      screenStatus.textContent = "Screen recorded";
      screenRecordBtn.classList.remove("danger");
    };

    screenRecorder.start();
    isScreenRecording = true;

    screenRecordBtn.classList.add("danger");
    recDot.classList.add("recording");
    recDot.classList.remove("active");
    recStatus.textContent = "Recording";
    screenStatus.textContent = "Recording screen…";

  } catch (err) {
    alert("Screen recording not available or permission denied.");
    screenStatus.textContent = "Screen error";
  }
}

function stopScreenRecording() {
  if (screenRecorder && isScreenRecording) {
    screenRecorder.stop();
    isScreenRecording = false;
  }
}

screenRecordBtn.addEventListener("click", () => {
  if (!isScreenRecording) {
    startScreenRecording();
  } else {
    stopScreenRecording();
  }
});


 // Wait for the DOM to fully load before running the code to set year in the footer
document.addEventListener("DOMContentLoaded", () => {
  const yearElement = document.getElementById("copyright-year");
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
});