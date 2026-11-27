(() => {
  "use strict";

  const STORAGE_KEY = "cofounder_dynamics_career_v2";

  const ORIGINS = {
    hackathon: {
      name: "Hackathon Partners",
      trust: 58,
      valuation: 24, // $240k
      quote: "Prototype shipped. Now prove customers care."
    },
    friends: {
      name: "University Friends",
      trust: 62,
      valuation: 20, // $200k
      quote: "Years of trust—let's keep business clean."
    },
    veterans: {
      name: "Industry Acquaintances",
      trust: 52,
      valuation: 30, // $300k
      quote: "Strong resumes. Time to see how we handle pressure."
    }
  };

  const ALL_ENDINGS = [
    "Rocketship Partnership",
    "Strong Partnership",
    "Clean Split",
    "Survived, But Strained",
    "Breakdown"
  ];

  /* Lightweight Web Audio synthesizer (no external files required) */
  const AudioEngine = {
    ctx: null,
    muted: false,
    unlocked: false,
    unlockListenersBound: false,
    init() {
      if (this.unlockListenersBound || typeof document === "undefined") return;
      this.unlockListenersBound = true;
      const onGesture = () => {
        if (!this.muted) this.unlock();
      };
      ["touchstart", "pointerdown", "mousedown", "keydown"].forEach((ev) => {
        document.addEventListener(ev, onGesture, { capture: true, passive: true });
      });
    },
    configureAudioSession() {
      try {
        if (typeof navigator !== "undefined" && navigator.audioSession && navigator.audioSession.type !== "playback") {
          navigator.audioSession.type = "playback";
        }
      } catch {
        // Ignore unsupported audioSession API
      }
    },
    unlock() {
      this.configureAudioSession();
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state !== "running" && typeof this.ctx.resume === "function") {
        this.ctx.resume().catch(() => {});
      }
      if (!this.unlocked && this.ctx) {
        try {
          const buf = this.ctx.createBuffer(1, 1, 22050);
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.connect(this.ctx.destination);
          src.start(0);
          this.unlocked = true;
        } catch {
          // Will retry on next user interaction
        }
      }
      return this.ctx;
    },
    ensure() {
      if (this.muted) return null;
      return this.unlock();
    },
    tone(freq, duration, type = "sine", gainVal = 0.06, delay = 0) {
      const ctx = this.ensure();
      if (!ctx) return;
      const schedule = () => {
        if (this.muted) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      };
      if (ctx.state === "running") {
        schedule();
      } else if (typeof ctx.resume === "function") {
        ctx.resume().then(() => {
          if (ctx.state === "running") schedule();
        }).catch(() => {});
      }
    },
    playPositive() {
      this.tone(523.25, 0.14, "triangle", 0.055, 0);
      this.tone(659.25, 0.18, "triangle", 0.055, 0.07);
    },
    playNegative() {
      this.tone(240, 0.16, "sawtooth", 0.04, 0);
      this.tone(185, 0.22, "sawtooth", 0.04, 0.09);
    },
    playAlert() {
      this.tone(220, 0.15, "square", 0.04, 0);
      this.tone(196, 0.18, "square", 0.04, 0.13);
      this.tone(164, 0.25, "square", 0.045, 0.27);
    },
    playClick() {
      this.tone(420, 0.06, "sine", 0.035, 0);
    },
    playVictory() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this.tone(f, 0.25, "triangle", 0.055, i * 0.09);
      });
    }
  };
  AudioEngine.init();

  const PLAYER_ICONS = {
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>`,
    pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>`,
    prev: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5.5" width="2.4" height="13" rx="1"/><path d="M18.5 6.2v11.6a.9.9 0 0 1-1.38.76l-8.4-5.8a.9.9 0 0 1 0-1.52l8.4-5.8a.9.9 0 0 1 1.38.76z"/></svg>`,
    next: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 6.2v11.6a.9.9 0 0 0 1.38.76l8.4-5.8a.9.9 0 0 0 0-1.52l-8.4-5.8A.9.9 0 0 0 5.5 6.2z"/><rect x="16.6" y="5.5" width="2.4" height="13" rx="1"/></svg>`
  };

  /* Bundled MP3/OGG voice narrator with mobile-friendly interactive player controls */
  const SpeechEngine = {
    timer: null,
    rafId: null,
    sharedAudio: null,
    sharedClipKey: null,
    activeAudio: null,
    activeSource: null,
    activeUtterances: [],
    bufferCache: new Map(),
    blobUrlCache: new Map(),
    playToken: 0,
    clips: [],
    clipIndex: 0,
    offsetSeconds: 0,
    startedAtCtxTime: 0,
    duration: 0,
    isPlaying: false,
    playbackRate: 1,
    speeds: [1, 1.25, 1.5, 0.85],
    init() {
      if (!this.speechSupported()) return;
      try {
        window.speechSynthesis.getVoices();
      } catch {
        // Ignore voice initialization errors
      }
    },
    speechSupported() {
      return (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance === "function"
      );
    },
    supported() {
      return (
        typeof Audio === "function" ||
        typeof AudioContext === "function" ||
        typeof webkitAudioContext === "function" ||
        this.speechSupported()
      );
    },
    formatTime(sec) {
      const s = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${r < 10 ? "0" : ""}${r}`;
    },
    detectMime(b64) {
      return b64 && b64.startsWith("T2dnUw") ? "audio/ogg" : "audio/mpeg";
    },
    decodeBase64Bytes(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let idx = 0; idx < bin.length; idx++) {
        bytes[idx] = bin.charCodeAt(idx);
      }
      return bytes;
    },
    getClipUrl(key) {
      if (this.blobUrlCache.has(key)) return this.blobUrlCache.get(key);
      const b64 = window.GAME_AUDIO ? window.GAME_AUDIO[key] : null;
      if (!b64) return null;
      const mime = this.detectMime(b64);
      let url;
      if (typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        const bytes = this.decodeBase64Bytes(b64);
        url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      } else {
        url = `data:${mime};base64,${b64}`;
      }
      this.blobUrlCache.set(key, url);
      return url;
    },
    ensureSharedAudio() {
      if (typeof Audio !== "function") return null;
      if (!this.sharedAudio) {
        const audio = new Audio();
        audio.preload = "auto";
        if ("playsInline" in audio) audio.playsInline = true;
        this.sharedAudio = audio;
      }
      return this.sharedAudio;
    },
    showNotice(msg) {
      const box = el("speech-notice");
      if (!box) return;
      if (!msg) {
        box.classList.add("hidden");
        box.textContent = "";
      } else {
        box.textContent = msg;
        box.classList.remove("hidden");
      }
    },
    clearHighlights() {
      document.querySelectorAll(".choice-btn.speaking").forEach((b) => {
        b.classList.remove("speaking");
      });
    },
    highlightChoice(choiceIdx) {
      this.clearHighlights();
      if (choiceIdx >= 0) {
        const buttons = document.querySelectorAll(".choice-btn");
        if (buttons[choiceIdx]) {
          buttons[choiceIdx].classList.add("speaking");
        }
      }
    },
    stopCurrentPlayback() {
      this.playToken += 1;
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.activeSource) {
        try {
          this.activeSource.onended = null;
          this.activeSource.stop(0);
          this.activeSource.disconnect();
        } catch {
          // Ignore BufferSource stop errors
        }
        this.activeSource = null;
      }
      if (this.activeAudio) {
        try {
          this.activeAudio.onended = null;
          this.activeAudio.onerror = null;
          this.activeAudio.onloadedmetadata = null;
          this.activeAudio.ontimeupdate = null;
          this.activeAudio.pause();
        } catch {
          // Ignore audio pause errors
        }
        this.activeAudio = null;
      }
      this.activeUtterances = [];
      this.isPlaying = false;
      this.clearHighlights();
      if (this.speechSupported()) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore speech cancellation errors
        }
      }
    },
    stop() {
      this.stopCurrentPlayback();
      this.offsetSeconds = 0;
      this.updatePlayerUI();
    },
    getCurrentTime() {
      if (
        this.activeAudio &&
        this.activeAudio.readyState >= 1 &&
        !Number.isNaN(this.activeAudio.currentTime)
      ) {
        return Math.max(0, this.activeAudio.currentTime);
      }
      if (this.isPlaying && AudioEngine.ctx) {
        const elapsed = (AudioEngine.ctx.currentTime - this.startedAtCtxTime) * this.playbackRate;
        return Math.max(0, Math.min(this.duration || 0, this.offsetSeconds + elapsed));
      }
      return Math.max(0, Math.min(this.duration || 0, this.offsetSeconds));
    },
    updatePlayerUI() {
      const toggleBtn = el("player-toggle");
      const prevBtn = el("player-prev");
      const nextBtn = el("player-next");
      const labelEl = el("player-label");
      const timeEl = el("player-time");
      const seekEl = el("player-seek");
      const speedEl = el("player-speed");
      if (!toggleBtn) return;

      const clip = this.clips[this.clipIndex];
      const cur = this.getCurrentTime();
      const dur = this.duration || 0;

      const wantIcon = this.isPlaying ? PLAYER_ICONS.pause : PLAYER_ICONS.play;
      if (toggleBtn.dataset && toggleBtn.dataset.icon !== (this.isPlaying ? "pause" : "play")) {
        toggleBtn.innerHTML = wantIcon;
        toggleBtn.dataset.icon = this.isPlaying ? "pause" : "play";
      } else if (!toggleBtn.dataset) {
        toggleBtn.innerHTML = wantIcon;
      }
      toggleBtn.setAttribute("aria-label", this.isPlaying ? "Pause narration" : "Play narration");
      if (prevBtn) prevBtn.disabled = this.clipIndex === 0 && cur <= 0.5;
      if (nextBtn) nextBtn.disabled = this.clipIndex >= this.clips.length - 1;
      if (labelEl) {
        labelEl.textContent = clip ? `${clip.label} (${this.clipIndex + 1}/${this.clips.length})` : "Narration";
      }
      if (timeEl) {
        timeEl.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;
      }
      if (seekEl) {
        seekEl.value = dur > 0 ? String(Math.round((cur / dur) * 1000)) : "0";
      }
      if (speedEl) {
        speedEl.textContent = `${this.playbackRate}x`;
      }

      document.querySelectorAll(".segment-chip").forEach((chip, idx) => {
        chip.classList.toggle("active", idx === this.clipIndex);
      });
    },
    startRaf() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      const tick = () => {
        if (!this.isPlaying) {
          this.rafId = null;
          return;
        }
        this.updatePlayerUI();
        this.rafId = typeof requestAnimationFrame === "function" ? requestAnimationFrame(tick) : null;
      };
      if (typeof requestAnimationFrame === "function") {
        this.rafId = requestAnimationFrame(tick);
      }
    },
    getAudioClips(scenario, choices) {
      const hasRepairVariant =
        (scenario.id === "m6" || scenario.id === "m11") &&
        choices.length > 0 &&
        Boolean(choices[0].isRepair);

      const clips = [
        { base: `${scenario.id}_q`, label: "Question", choiceIdx: -1 }
      ];
      choices.forEach((_, idx) => {
        let base = `${scenario.id}_c${idx}`;
        if (hasRepairVariant) {
          base = idx === 0 ? `${scenario.id}_repair` : `${scenario.id}_d${idx}`;
        }
        clips.push({
          base,
          label: `Option ${idx + 1}`,
          choiceIdx: idx
        });
      });
      return clips;
    },
    decodeAudioDataCompat(ctx, arrayBuffer) {
      return new Promise((resolve, reject) => {
        let settled = false;
        const done = (buf) => {
          if (!settled) {
            settled = true;
            resolve(buf);
          }
        };
        const fail = (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        };
        try {
          const maybePromise = ctx.decodeAudioData(arrayBuffer, done, fail);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(done, fail);
          }
        } catch (err) {
          fail(err);
        }
      });
    },
    async loadClipBuffer(clip) {
      const ctx = AudioEngine.ensure();
      if (!ctx) throw new Error("AudioContext unavailable");
      const key = clip.base;
      if (this.bufferCache.has(key)) return this.bufferCache.get(key);
      if (!window.GAME_AUDIO || !window.GAME_AUDIO[key]) {
        throw new Error(`Missing embedded clip ${key}`);
      }
      const arr = this.decodeBase64Bytes(window.GAME_AUDIO[key]).buffer;
      const buf = await this.decodeAudioDataCompat(ctx, arr);
      this.bufferCache.set(key, buf);
      return buf;
    },
    loadMetadataFor(index) {
      const clip = this.clips[index];
      if (!clip) return;
      const url = this.getClipUrl(clip.base);
      if (typeof Audio === "function" && url) {
        const probe = new Audio();
        probe.preload = "metadata";
        probe.onloadedmetadata = () => {
          if (this.clipIndex === index && Number.isFinite(probe.duration) && probe.duration > 0) {
            this.duration = probe.duration;
            this.updatePlayerUI();
          }
        };
        probe.src = url;
        return;
      }
      if (!AudioEngine.muted) {
        this.loadClipBuffer(clip)
          .then((buf) => {
            if (this.clipIndex === index) {
              this.duration = buf.duration || 0;
              this.updatePlayerUI();
            }
          })
          .catch(() => {});
      }
    },
    playClipAt(index, offset = 0) {
      if (!this.clips.length) return;
      const clampedIdx = Math.max(0, Math.min(this.clips.length - 1, index));
      this.stopCurrentPlayback();
      this.showNotice("");
      this.clipIndex = clampedIdx;
      const token = this.playToken;

      const audio = this.ensureSharedAudio();
      if (audio) {
        this.playHtml5At(clampedIdx, offset, token);
        return;
      }

      this.playWebAudioAt(clampedIdx, offset, token);
    },
    async playWebAudioAt(index, offset, token) {
      const item = this.clips[index];
      if (!item) return;
      const ctx = AudioEngine.ensure();
      if (!ctx) {
        this.isPlaying = false;
        this.clearHighlights();
        this.showNotice("Audio playback unavailable in this browser.");
        this.updatePlayerUI();
        return;
      }

      try {
        if (ctx.state !== "running" && typeof ctx.resume === "function") {
          await ctx.resume();
        }
        const buf = await this.loadClipBuffer(item);
        if (token !== this.playToken || AudioEngine.muted) return;
        if (ctx.state !== "running") {
          throw Object.assign(new Error("AudioContext suspended"), { name: "NotAllowedError" });
        }

        this.duration = buf.duration || 0;
        const safeOffset = Math.max(0, Math.min(Math.max(0, this.duration - 0.05), offset));
        this.offsetSeconds = safeOffset;
        this.startedAtCtxTime = ctx.currentTime;
        this.isPlaying = true;
        this.highlightChoice(item.choiceIdx);

        const source = ctx.createBufferSource();
        source.buffer = buf;
        if (source.playbackRate) source.playbackRate.value = this.playbackRate;
        source.connect(ctx.destination);
        this.activeSource = source;

        source.onended = () => {
          if (token !== this.playToken) return;
          if (this.activeSource === source) this.activeSource = null;
          if (index + 1 < this.clips.length) {
            this.playClipAt(index + 1, 0);
          } else {
            this.isPlaying = false;
            this.clipIndex = 0;
            this.offsetSeconds = 0;
            this.clearHighlights();
            this.loadMetadataFor(0);
            this.updatePlayerUI();
          }
        };

        this.updatePlayerUI();
        this.startRaf();
        source.start(0, safeOffset);
      } catch (err) {
        if (token !== this.playToken) return;
        this.activeSource = null;
        this.isPlaying = false;
        this.clearHighlights();
        if (err && err.name === "NotAllowedError") {
          this.showNotice("Tap ▶ in the player to start narration.");
        } else {
          this.showNotice("Voice narration unavailable in this browser.");
        }
        this.updatePlayerUI();
      }
    },
    playHtml5At(index, offset, token) {
      const item = this.clips[index];
      const url = item ? this.getClipUrl(item.base) : null;
      const audio = this.ensureSharedAudio();
      if (!audio || !url) {
        this.playWebAudioAt(index, offset, token);
        return;
      }

      const fallbackToWebAudio = (errName) => {
        if (token !== this.playToken) return;
        this.activeAudio = null;
        if (
          errName !== "NotAllowedError" ||
          (AudioEngine.ctx && AudioEngine.ctx.state === "running")
        ) {
          this.playWebAudioAt(index, offset, token);
        } else {
          this.isPlaying = false;
          this.clearHighlights();
          this.showNotice("Tap ▶ in the player to start narration.");
          this.updatePlayerUI();
        }
      };

      const safeOffset = Math.max(0, offset || 0);
      this.activeAudio = audio;
      this.offsetSeconds = safeOffset;
      this.isPlaying = true;
      this.highlightChoice(item.choiceIdx);

      try {
        if ("preservesPitch" in audio) audio.preservesPitch = true;
        if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
      } catch {
        // Ignore pitch preservation property errors
      }

      audio.onloadedmetadata = () => {
        if (token !== this.playToken) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.duration = audio.duration;
        }
        if (safeOffset > 0 && (!this.duration || safeOffset < this.duration)) {
          try {
            audio.currentTime = safeOffset;
          } catch {
            // Ignore seek before ready on strict browsers
          }
        }
        this.updatePlayerUI();
      };
      audio.ontimeupdate = () => {
        if (token !== this.playToken) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.duration = audio.duration;
        }
        if (!Number.isNaN(audio.currentTime)) {
          this.offsetSeconds = audio.currentTime;
        }
        this.updatePlayerUI();
      };
      audio.onended = () => {
        if (token !== this.playToken) return;
        this.activeAudio = null;
        if (index + 1 < this.clips.length) {
          this.playClipAt(index + 1, 0);
        } else {
          this.isPlaying = false;
          this.clipIndex = 0;
          this.offsetSeconds = 0;
          this.clearHighlights();
          this.updatePlayerUI();
        }
      };
      audio.onerror = () => {
        fallbackToWebAudio("MediaError");
      };

      const isSameClip = this.sharedClipKey === item.base && audio.src === url && audio.readyState >= 1;
      if (!isSameClip) {
        this.duration = 0;
        this.sharedClipKey = item.base;
        audio.src = url;
      } else {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.duration = audio.duration;
        }
        try {
          if (Math.abs((audio.currentTime || 0) - safeOffset) > 0.1 || audio.ended) {
            audio.currentTime = safeOffset;
          }
        } catch {
          // Ignore seek errors
        }
      }
      audio.playbackRate = this.playbackRate;

      this.updatePlayerUI();
      this.startRaf();
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          if (token !== this.playToken || (err && err.name === "AbortError")) return;
          fallbackToWebAudio(err ? err.name : "PlaybackError");
        });
      }
    },
    pause() {
      if (!this.isPlaying) return;
      const cur = this.getCurrentTime();
      this.stopCurrentPlayback();
      this.offsetSeconds = cur;
      this.updatePlayerUI();
    },
    togglePlay() {
      if (this.isPlaying) {
        this.pause();
      } else {
        if (AudioEngine.muted) {
          AudioEngine.muted = false;
          el("sound-icon").textContent = "🔊";
        }
        AudioEngine.unlock();
        this.playClipAt(this.clipIndex, this.offsetSeconds);
      }
    },
    prevClip() {
      const cur = this.getCurrentTime();
      if (cur > 2) {
        this.seekToRatio(0);
        return;
      }
      if (this.clipIndex <= 0) return;
      const target = this.clipIndex - 1;
      if (this.isPlaying) {
        this.playClipAt(target, 0);
      } else {
        this.clipIndex = target;
        this.offsetSeconds = 0;
        this.duration = 0;
        this.loadMetadataFor(target);
        this.updatePlayerUI();
      }
    },
    nextClip() {
      if (this.clipIndex + 1 >= this.clips.length) return;
      const target = this.clipIndex + 1;
      if (this.isPlaying) {
        this.playClipAt(target, 0);
      } else {
        this.clipIndex = target;
        this.offsetSeconds = 0;
        this.duration = 0;
        this.loadMetadataFor(target);
        this.updatePlayerUI();
      }
    },
    jumpToClip(idx) {
      if (idx < 0 || idx >= this.clips.length) return;
      if (AudioEngine.muted) {
        AudioEngine.muted = false;
        el("sound-icon").textContent = "🔊";
      }
      AudioEngine.unlock();
      this.playClipAt(idx, 0);
    },
    seekToRatio(ratio) {
      if (!this.duration) return;
      const target = Math.max(0, Math.min(this.duration, ratio * this.duration));
      if (this.isPlaying && this.activeAudio && this.activeAudio.readyState >= 1) {
        try {
          this.activeAudio.currentTime = target;
          this.offsetSeconds = target;
          this.updatePlayerUI();
          return;
        } catch {
          // Fall through to full restart seek
        }
      }
      if (this.isPlaying) {
        this.playClipAt(this.clipIndex, target);
      } else {
        this.offsetSeconds = target;
        this.updatePlayerUI();
      }
    },
    cycleSpeed() {
      const curIdx = this.speeds.indexOf(this.playbackRate);
      const nextRate = this.speeds[(curIdx + 1) % this.speeds.length];
      const curPos = this.getCurrentTime();
      this.playbackRate = nextRate;
      if (this.isPlaying && this.activeAudio) {
        this.activeAudio.playbackRate = nextRate;
        this.updatePlayerUI();
        return;
      }
      if (this.isPlaying) {
        this.playClipAt(this.clipIndex, curPos);
      } else {
        this.updatePlayerUI();
      }
    },
    loadRound(scenario, choices, autoPlay = true) {
      this.stop();
      this.showNotice("");
      this.clips = this.getAudioClips(scenario, choices);
      this.clipIndex = 0;
      this.offsetSeconds = 0;
      this.duration = 0;
      this.updatePlayerUI();
      if (autoPlay && !AudioEngine.muted) {
        this.playClipAt(0, 0);
      } else {
        this.loadMetadataFor(0);
      }
    },
    readRound(scenario, choices, force = false) {
      this.loadRound(scenario, choices, force || !AudioEngine.muted);
    }
  };
  SpeechEngine.init();

  /* 12-Chapter Entrepreneurial Scenario Arc */
  const SCENARIOS = [
    {
      id: "m1",
      shortLabel: "M1",
      month: "Month 1: Kickoff Sprint",
      chapter: "Discovery & Roles",
      text: "Week 2. Alex wants six weeks uninterrupted to code v1. You want 25 customer interviews before building anything.",
      getChoices: () => [
        {
          text: "Build a 2-week prototype, run 15 interviews, and define roles.",
          trust: 3,
          val: 4,
          avoided: null,
          roleClarity: true,
          tag: "Aligned",
          alexQuote: "Fair—a two-week prototype beats coding blind.",
          feedback: "Lean prototype meets real buyer input, with clear role boundaries.",
          lesson: "Pair fast prototyping with discovery and early role clarity."
        },
        {
          text: "Let Alex code v1 while you build the investor pipeline.",
          trust: 1,
          val: -3,
          avoided: "Unvalidated v1 & vague roles (M1)",
          tag: "Avoidant",
          alexQuote: "Great—ping me once investor intros heat up.",
          feedback: "Zero friction today, but you build six weeks without user proof.",
          lesson: "Divide-and-conquer fails when nobody validates demand."
        },
        {
          text: "Freeze all coding until 25 customer interviews wrap up.",
          trust: -7,
          val: 5,
          avoided: null,
          tag: "Top-Down",
          alexQuote: "Weeks of calls and zero code? Why am I even here?",
          feedback: "Research stays sharp, but benching Alex kills early momentum.",
          lesson: "Keep builders shipping testable artifacts alongside discovery."
        },
        {
          text: "Hack the MVP side-by-side now; formalize roles after launch.",
          trust: 2,
          val: 3,
          avoided: "No decision-rights split (M1)",
          tag: "Informal",
          alexQuote: "Let's just ship—no need for rules yet.",
          feedback: "Fast early energy, though unspoken role overlap will resurface.",
          lesson: "Shared hustle works in Week 1 and collides by Month 4."
        }
      ]
    },
    {
      id: "m2",
      shortLabel: "M2",
      month: "Month 2: Equity Split",
      chapter: "Equity & Vesting",
      text: "Alex worked nights on the backend while you ran user calls. Before continuing, he asks for a bigger equity slice.",
      getChoices: () => [
        {
          text: "Agree to 55/45 favoring Alex, with 4-year vesting.",
          trust: 3,
          val: 2,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "generous",
          tag: "Generous",
          alexQuote: "That feels fair—and vesting keeps us both committed.",
          feedback: "Alex feels recognized, and vesting protects the cap table.",
          lesson: "Vesting matters more than winning a few extra points."
        },
        {
          text: "Hold firm on 50/50 with a 1-year vesting cliff.",
          trust: 1,
          val: 5,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "equal",
          tag: "Balanced",
          alexQuote: "Tough talk, though a 1-year cliff keeps us accountable.",
          feedback: "Tense negotiation, but you lock in a clean equal structure.",
          lesson: "Long-term value comes equally from building and selling."
        },
        {
          text: "Counter with 55/45 for yourself as fundraising CEO.",
          trust: -10,
          val: 3,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "selfish",
          tag: "Aggressive",
          alexQuote: "Fine, sign it—just don't expect more weekend sprints.",
          feedback: "Paperwork is signed, but Alex resents losing parity.",
          lesson: "Winning extra early points often costs co-founder effort."
        },
        {
          text: "Keep it informal until first revenue so shipping doesn't stall.",
          trust: -4,
          val: 4,
          avoided: "Unvested handshake equity (M2)",
          earlyAgree: false,
          equitySplitType: "postponed",
          tag: "Avoidant",
          alexQuote: "Guess we'll revisit it later... back to code.",
          feedback: "Shipping continues, while cap-table uncertainty simmers.",
          lesson: "Handshake equity gets harder to fix every month."
        }
      ]
    },
    {
      id: "m3",
      shortLabel: "M3",
      month: "Month 3: The $100k Pivot",
      chapter: "Vision vs. Capital",
      text: "An angel offers $100k today—only if you pivot into B2B compliance. Alex hates compliance and backs your original idea.",
      getChoices: () => [
        {
          text: "Accept the $100k and pivot into B2B compliance.",
          trust: -11,
          val: 11,
          avoided: "Forced B2B pivot (M3)",
          forcedPivot: true,
          tag: "Capital-First",
          alexQuote: "We chased one check straight into a product I hate.",
          feedback: "Runway jumps fast, but Alex feels overruled on mission.",
          lesson: "Runway bought without buy-in drains builder energy."
        },
        {
          text: "Run a 2-week B2B buyer test before deciding.",
          trust: 2,
          val: 4,
          avoided: null,
          tag: "Evidence-Led",
          alexQuote: "Letting real buyers decide beats arguing hypotheticals.",
          feedback: "The angel trims the offer to $40k, but you decide on data.",
          lesson: "Small tests turn founder clashes into shared evidence."
        },
        {
          text: "Pass on the $100k and stick to your original market.",
          trust: 4,
          val: -3,
          avoided: null,
          tag: "Vision-First",
          alexQuote: "Glad you backed our vision—now we must prove traction.",
          feedback: "Conviction stays high, though cash gets tight.",
          lesson: "Passing on misaligned cash raises pressure to monetize."
        }
      ]
    },
    {
      id: "m4",
      shortLabel: "M4",
      month: "Month 4: Overpromised Pilot",
      chapter: "Crisis: Scope & Margin",
      getContextNote: (s) => {
        if (s.forcedPivot) {
          return "Pivot strain: Enterprise buyers demand heavy custom work.";
        }
        if (s.roleClarity) {
          return "Month 1 role charter helps clarify commercial boundaries.";
        }
        return null;
      },
      text: "To land your first customer, Alex promised custom features at 50% off by Friday—without asking you. The build is behind.",
      getChoices: (s) => [
        {
          text: "Crunch all week together to deliver Friday at 50% off.",
          trust: -2 + (s.roleClarity ? 3 : 0),
          val: -2,
          avoided: null,
          tag: "Constructive",
          alexQuote: "Rough week—next time pricing goes through you first.",
          feedback: "You save the client, though bad margin and crunch sting.",
          lesson: "Absorb early mistakes together, then tighten pricing rules."
        },
        {
          text: "Call the client together and push delivery back a week.",
          trust: 1,
          val: -4,
          avoided: null,
          tag: "Collaborative",
          alexQuote: "Glad we owned the delay together instead of blaming me.",
          feedback: "Honest reset protects quality, but dings early momentum.",
          lesson: "Unified external communication protects internal trust."
        },
        {
          text: "Tell the client custom scope requires full price.",
          trust: -9,
          val: 5,
          avoided: "Walked back Alex's pilot quote (M4)",
          tag: "Undermining",
          alexQuote: "Walking back my word made us look split to client one.",
          feedback: "Margins recover, but reversing Alex's quote undercuts him.",
          lesson: "Contradicting a co-founder externally breeds resentment."
        },
        {
          text: "Leave Alex to finish the build while you pitch new leads.",
          trust: -6,
          val: 2,
          avoided: "Unaddressed pricing creep (M4)",
          tag: "Avoidant",
          alexQuote: "Guess I'm eating this deadline alone.",
          feedback: "Sales keep moving while Alex burns out on half-price work.",
          lesson: "Ignoring role creep guarantees repeat pricing mistakes."
        }
      ]
    },
    {
      id: "m5",
      shortLabel: "M5",
      month: "Month 5: Unapproved Equity",
      chapter: "Governance",
      getContextNote: (s) =>
        s.equitySplitType === "postponed"
          ? "M2 hangover: Informal founder equity makes cap-table rules blurry."
          : null,
      text: "Alex brought a friend in for part-time marketing and casually promised her 2% equity without consulting you.",
      getChoices: (s) => {
        const extraPenalty = s.equitySplitType === "postponed" ? -4 : 0;
        return [
          {
            text: "Switch her offer to a small monthly cash stipend.",
            trust: 1,
            val: -2,
            avoided: null,
            tag: "Pragmatic",
            alexQuote: "Fair—cash trims runway, but saves our equity pool.",
            feedback: "Cap table stays clean, though monthly burn ticks up.",
            lesson: "Cash is replaceable; early dead equity is permanent."
          },
          {
            text: "Cap it at 0.5% advisor shares with a 2-year cliff.",
            trust: 3,
            val: 3,
            avoided: null,
            tag: "Principled",
            alexQuote: "Good middle ground—no more solo equity promises.",
            feedback: "Structured compromise sets a clear two-signature equity rule.",
            lesson: "Every equity grant needs joint sign-off and vesting."
          },
          {
            text: "Veto the hire privately and have Alex withdraw the offer.",
            trust: -8 + extraPenalty,
            val: 4,
            avoided: null,
            tag: "Top-Down",
            alexQuote: "Taking that offer back made me look awful.",
            feedback: "Zero dilution or spend, but Alex loses face with his friend.",
            lesson: "Hard vetoes protect discipline at a steep personal cost."
          },
          {
            text: "Let her help through beta and paper the terms later.",
            trust: -3 + extraPenalty,
            val: 2,
            avoided: "Informal 2% equity promise (M5)",
            tag: "Avoidant",
            alexQuote: "Cool, we'll sort the paperwork once beta lands.",
            feedback: "Marketing starts fast, leaving a messy cap-table claim.",
            lesson: "Vague equity promises turn into diligence nightmares."
          }
        ];
      }
    },
    {
      id: "m6",
      shortLabel: "M6",
      month: "Month 6: Beta Outage",
      chapter: "Crisis: Launch Week",
      getContextNote: (s) =>
        s.avoidedIssues.length > 0
          ? `${s.avoidedIssues.length} unresolved issue(s) are straining launch week.`
          : "Zero relational debt keeps communication calm under fire.",
      text: "48 hours before public beta, a severe data bug surfaces. 200 testers and two angels expect Friday's launch.",
      getChoices: (s) => {
        const list = [
          {
            text: "Cut half the features and ship a minimal beta Friday.",
            trust: -2,
            val: -2,
            avoided: null,
            tag: "Scope Control",
            alexQuote: "Hurts cutting features I built, but at least it won't crash.",
            feedback: "You hit Friday intact, though the thin beta underwhelms.",
            lesson: "Under-scoped beats broken, even when both hurt."
          },
          {
            text: "Push a 48-hour all-nighter crunch to ship full scope.",
            trust: -9,
            val: 6,
            avoided: "Beta crunch resentment (M6)",
            tag: "Top-Down",
            alexQuote: "It shipped—don't ask me for another weekend like that.",
            feedback: "Angels love the full demo; Alex is running on fumes.",
            lesson: "Repeated heroics burn out technical co-founders."
          },
          {
            text: "Slip launch by 10 days to fix everything properly.",
            trust: 1,
            val: -4,
            avoided: null,
            tag: "Cautious",
            alexQuote: "Thanks for giving me breathing room to fix it right.",
            feedback: "Engineering stays sane, though waitlist momentum cools.",
            lesson: "Protecting quality sometimes costs market momentum."
          }
        ];

        if (s.avoidedIssues.length > 0) {
          list.unshift({
            text: "Delay beta a week to fix the bug and clear past tension.",
            trust: 6,
            val: -4,
            clearsDebt: true,
            isRepair: true,
            avoided: null,
            tag: "Debt Repair",
            alexQuote: "Glad we finally talked that out before going live.",
            feedback: "Slipping launch cools hype, but heals buried friction.",
            lesson: "Paying down relational debt costs speed to save the team."
          });
        } else {
          list.push({
            text: "Roll out core flow to 25 testers; gate the rest.",
            trust: 2,
            val: 3,
            avoided: null,
            tag: "Proactive Sync",
            alexQuote: "Clean plan—small cohort first keeps risk contained.",
            feedback: "High trust lets you run a calm staged rollout.",
            lesson: "Aligned teams find steady middle paths during crises."
          });
        }

        return list;
      }
    },
    {
      id: "m7",
      shortLabel: "M7",
      month: "Month 7: Runway & Side Gig",
      chapter: "Crisis: Burnout",
      getContextNote: (s) =>
        s.forcedPivot
          ? "Alex's energy has lagged since the Month 3 pivot."
          : null,
      text: "Short on rent, Alex quietly took freelance work and missed two product sprints while you covered late-night support.",
      getChoices: (s) => [
        {
          text: "Pay modest founder stipends from runway to end freelancing.",
          trust: 2,
          val: -4,
          avoided: null,
          tag: "Structural Fix",
          alexQuote: "Bare rent covered means I'm 100% back on product.",
          feedback: "Alex returns full-time, though shorter runway tightens pressure.",
          lesson: "Survival stipends trade cash runway for focus."
        },
        {
          text: "Allow 10 freelance hours weekly and cut sprint scope 30%.",
          trust: 2 + (s.forcedPivot ? 2 : 0),
          val: -3,
          avoided: null,
          tag: "Empathetic",
          alexQuote: "Relief—now I can hit every target we commit to.",
          feedback: "Honest capacity stops missed deadlines, though growth slows.",
          lesson: "Realistic velocity beats unspoken missed deadlines."
        },
        {
          text: "Insist on full-time focus for 60 days until Seed pitches.",
          trust: -9,
          val: 5,
          avoided: null,
          tag: "Ultimatum",
          alexQuote: "Easy to demand full-time when your rent isn't overdue.",
          feedback: "Product pace rebounds, leaving Alex under financial strain.",
          lesson: "Ignoring a partner's personal runway breeds resentment."
        },
        {
          text: "Keep covering extra support yourself until revenue grows.",
          trust: -6,
          val: 1,
          avoided: "Burnout from uneven workload (M7)",
          tag: "Martyrdom",
          alexQuote: "Appreciate you covering tickets while I catch up...",
          feedback: "No fight today, but exhaustion and resentment build fast.",
          lesson: "Silent martyrdom masks capacity gaps until someone snaps."
        }
      ]
    },
    {
      id: "m8",
      shortLabel: "M8",
      month: "Month 8: $25k Custom Deal",
      chapter: "Revenue vs. Roadmap",
      text: "A corporate buyer offers $25k upfront—if you pause your roadmap a month to build their custom dashboard.",
      getChoices: () => [
        {
          text: "Take the $25k and divert the sprint to custom code.",
          trust: -8,
          val: 8,
          avoided: "Detoured roadmap for custom deal (M8)",
          tag: "Short-Term Cash",
          alexQuote: "Feels like we just became an agency for one buyer.",
          feedback: "Bank balance jumps while core product stalls a month.",
          lesson: "Bespoke revenue extends runway while taxing focus."
        },
        {
          text: "Offer only the reusable reporting half for $12k.",
          trust: 2,
          val: 5,
          avoided: null,
          tag: "Disciplined",
          alexQuote: "Smart filter—that view upgrades the whole product.",
          feedback: "Smaller check, but every line of code serves all users.",
          lesson: "Bend customer requests toward your shared roadmap."
        },
        {
          text: "Decline the deal to keep 100% focus on self-serve growth.",
          trust: 3,
          val: -3,
          avoided: null,
          tag: "Focused",
          alexQuote: "Hard passing on cash, but our core release stays on track.",
          feedback: "Roadmap stays pure, though turning down $25k stings.",
          lesson: "Saying no to off-strategy cash tests runway nerves."
        },
        {
          text: "Sign the $25k deal and outsource the custom build.",
          trust: -5,
          val: 3,
          avoided: null,
          tag: "Pragmatic",
          alexQuote: "Fixing rushed contractor code took longer than building it.",
          feedback: "Margin shrinks and Alex gets stuck debugging contractor work.",
          lesson: "Outsourcing core integrations rarely saves founder time."
        }
      ]
    },
    {
      id: "m9",
      shortLabel: "M9",
      month: "Month 9: Tight Grant Budget",
      chapter: "Crisis: Cash Squeeze",
      text: "You win a $10k grant, but overdue cloud and legal bills eat half. Alex wants a conference booth; you want QA.",
      getChoices: () => [
        {
          text: "Clear the overdue bills first; split the small remainder.",
          trust: -2,
          val: 4,
          avoided: null,
          tag: "Goal-Anchored",
          alexQuote: "Responsible call, even if killing the booth hurts.",
          feedback: "Books are clean for Seed, though both growth pushes stall.",
          lesson: "Clean fundamentals aren't flashy, but pass diligence."
        },
        {
          text: "Pay bills and spend the rest on QA stability.",
          trust: -6,
          val: 6,
          avoided: null,
          tag: "Top-Down",
          alexQuote: "Solid code won't matter if nobody hears about us.",
          feedback: "Stability improves, leaving Alex frustrated over visibility.",
          lesson: "Overruling a partner's budget priority taxes goodwill."
        },
        {
          text: "Pay bills and fund Alex's booth to chase leads.",
          trust: 2,
          val: -3,
          avoided: null,
          tag: "Compromise",
          alexQuote: "Thanks for backing the booth—bugs bit us a little though.",
          feedback: "Alex rallies hard, though unfixed bugs hurt demo signups.",
          lesson: "Marketing amplifies product readiness—good or bad."
        },
        {
          text: "Defer legal bills to fund both QA and the booth.",
          trust: 2,
          val: 4,
          avoided: "Deferred legal cleanup before Seed (M9)",
          tag: "Appeasement",
          alexQuote: "Nice—we get both! Lawyers can wait till Seed closes.",
          feedback: "Both founders get budget today, leaving legal loose ends.",
          lesson: "Pushing legal debt into fundraising creates diligence traps."
        }
      ]
    },
    {
      id: "m10",
      shortLabel: "M10",
      month: "Month 10: Control Term Sheet",
      chapter: "Loyalty vs. Leverage",
      text: "An angel offers a $150k bridge check—only if you take sole voting control and move Alex off the board.",
      getChoices: () => [
        {
          text: "Take the $150k and frame sole control as investor-standard.",
          trust: -13,
          val: 10,
          avoided: "Took sole board control (M10)",
          tag: "Backchannel",
          alexQuote: "You traded my voice on the board for bridge money.",
          feedback: "Bridge cash lands, but stripping Alex's seat fractures trust.",
          lesson: "Investor side-deals permanently scar co-founder trust."
        },
        {
          text: "Counter with joint board seats for a smaller $60k check.",
          trust: 3,
          val: 4,
          avoided: null,
          tag: "Constructive",
          alexQuote: "Taking less cash to keep us equal means everything.",
          feedback: "Smaller cushion, but you enter Seed aligned as equals.",
          lesson: "Balanced governance beats maximizing bridge cash."
        },
        {
          text: "Reject the check outright and share the story with Alex.",
          trust: 3,
          val: -3,
          avoided: null,
          tag: "Fierce Loyalty",
          alexQuote: "Thank you—now we have six weeks to close Seed.",
          feedback: "Deep loyalty, though passing on $150k leaves zero cushion.",
          lesson: "Walking away from toxic money raises execution stakes."
        }
      ]
    },
    {
      id: "m11",
      shortLabel: "M11",
      month: "Month 11: Runway & Deck Credit",
      chapter: "Crisis: Pre-Seed Crunch",
      getContextNote: (s) =>
        s.avoidedIssues.length > 0
          ? `Final chance before diligence: ${s.avoidedIssues.length} unresolved issue(s) remain.`
          : "Clean alignment keeps you focused heading into Seed pitches.",
      text: "Six weeks of cash left. Advisors want one boss on the deck—seeing 'Engineering Lead' instead of 'Co-Founder' stung Alex.",
      getChoices: (s) => {
        const list = [
          {
            text: "List equal Co-Founder titles and split every VC pitch 50/50.",
            trust: 3,
            val: 1,
            avoided: null,
            tag: "Shared Credit",
            alexQuote: "Standing on stage as true equals brings my fire back.",
            feedback: "Alex feels proud, though traditional VCs question dual command.",
            lesson: "Shared recognition fuels grit through fundraising."
          },
          {
            text: "Keep CEO-led deck framing, with Alex owning technical Q&A.",
            trust: -5,
            val: 5,
            avoided: "Sidelined co-founder title concern (M11)",
            tag: "Avoidant",
            alexQuote: "Fine, pitch it your way—I'll just answer tech questions.",
            feedback: "Crisp investor story, while Alex enters Q&A feeling demoted.",
            lesson: "Sidelining a co-founder before diligence shows in the room."
          },
          {
            text: "Quietly explore a $350k acqui-hire backup in parallel.",
            trust: -5,
            val: -3,
            avoided: null,
            tag: "Cold Feet",
            alexQuote: "Shopping an acqui-hire makes it sound like we've given up.",
            feedback: "Splitting focus weakens your Seed pitch and rattles Alex.",
            lesson: "Fundraising while hedging an exit signals weak conviction."
          }
        ];

        if (s.avoidedIssues.length > 0) {
          list.unshift({
            text: "Restore Co-Founder titles and pause pitches 4 days to reset.",
            trust: 6,
            val: -3,
            clearsDebt: true,
            isRepair: true,
            avoided: null,
            tag: "Debt Repair",
            alexQuote: "Clearing the air first makes us stronger in partner rooms.",
            feedback: "Lost pitch days slow momentum, but heal old scars before Q&A.",
            lesson: "Resolve internal cracks before VCs probe them."
          });
        } else {
          list.push({
            text: "Keep Co-Founder titles with sharp CEO/CTO decision lanes.",
            trust: 2,
            val: 5,
            avoided: null,
            tag: "Prepared",
            alexQuote: "Equal founders, clear lanes—let's go close this round.",
            feedback: "Equal credit plus clear lanes satisfies both Alex and VCs.",
            lesson: "Clear CEO/CTO lanes work best on equal footing."
          });
        }

        return list;
      }
    },
    {
      id: "m12",
      shortLabel: "M12",
      month: "Month 12: Seed Partner Grill",
      chapter: "Final Diligence",
      getContextNote: (s) =>
        s.avoidedIssues.length >= 2
          ? "Diligence warning: Partners sense tension between you two."
          : "Strong signal: Partners notice your calm chemistry.",
      text: "Final Seed partner meeting. Lead VC asks: 'What was your hardest clash this year, and what changed afterward?'",
      getChoices: (s) => [
        {
          text: "Share a real clash candidly and the rule it created.",
          trust: s.avoidedIssues.length >= 2 ? 0 : 2,
          val: s.avoidedIssues.length >= 2 ? 2 : 6,
          avoided: null,
          tag: "Authentic",
          alexQuote: "Owning our rough patches made us sound ready to scale.",
          feedback: "VCs respect teams with battle-tested conflict habits.",
          lesson: "Investors back conflict-capable teams, not perfect fronts."
        },
        {
          text: "Answer briefly and pivot straight to your revenue growth.",
          trust: -3,
          val: 4,
          avoided: null,
          tag: "Metrics-Only",
          alexQuote: "Numbers helped, though they kept probing how we decide.",
          feedback: "Metrics land well, though partners note a dodge on team depth.",
          lesson: "Traction opens doors, yet Seed VCs bet on the team."
        },
        {
          text: "Project smooth alignment and downplay past disagreements.",
          trust: -3,
          val: -5,
          avoided: "Glossed over conflict in VC pitch (M12)",
          tag: "Polished Denial",
          alexQuote: "Nobody in that room bought the 'we never clash' answer.",
          feedback: "Seasoned partners spot rehearsed harmony and discount the pitch.",
          lesson: "Pretending you never argue raises instant VC red flags."
        }
      ]
    }
  ];

  /* Runtime State */
  let state = {};
  let selectedOriginKey = "hackathon";

  /* DOM References */
  const el = (id) => document.getElementById(id);

  function loadCareer() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { runs: 0, bestEnt: 0, bestVal: 0, endings: [] };
      const parsed = JSON.parse(raw);
      return {
        runs: Number(parsed.runs) || 0,
        bestEnt: Number(parsed.bestEnt) || 0,
        bestVal: Number(parsed.bestVal) || 0,
        endings: Array.isArray(parsed.endings) ? parsed.endings : []
      };
    } catch {
      return { runs: 0, bestEnt: 0, bestVal: 0, endings: [] };
    }
  }

  function saveCareer(endingName) {
    try {
      const c = loadCareer();
      c.runs += 1;
      c.bestEnt = Math.max(c.bestEnt, state.entValue);
      c.bestVal = Math.max(c.bestVal, state.valuation * 10);
      if (endingName && !c.endings.includes(endingName)) {
        c.endings.push(endingName);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // Ignore storage quota / privacy mode issues
    }
  }

  function renderCareerSummary() {
    const c = loadCareer();
    const target = el("career-stats");
    if (!target) return;
    if (c.runs === 0) {
      target.textContent = "Keyboard shortcuts supported: keys 1–4 to choose, Enter to continue.";
    } else {
      target.textContent = `Runs: ${c.runs} • Best Ent. Value: ${c.bestEnt}% • Best Valuation: $${c.bestVal}k • Endings: ${c.endings.length}/${ALL_ENDINGS.length}`;
    }
  }

  function calcEntValue() {
    const base = 0.52 * state.trust + 0.48 * state.valuation;
    const stabilityBonus = state.earlyAgreement && state.avoidedIssues.length === 0 ? 3 : 0;
    const debtDrag = state.avoidedIssues.length * 3;
    state.entValue = Math.max(0, Math.min(100, Math.round(base + stabilityBonus - debtDrag)));
  }

  function initState(originKey) {
    const origin = ORIGINS[originKey] || ORIGINS.hackathon;
    state = {
      originKey,
      originName: origin.name,
      step: 0,
      awaitingNext: false,
      ended: false,
      trust: origin.trust,
      valuation: origin.valuation,
      entValue: 0,
      earlyAgreement: false,
      equitySplitType: null,
      roleClarity: false,
      forcedPivot: false,
      avoidedIssues: [],
      triggeredCumulative: false,
      lastAlexQuote: origin.quote,
      history: [],
      trajectory: []
    };
    calcEntValue();
    state.trajectory.push({
      label: "Start",
      trust: state.trust,
      valuation: state.valuation,
      entValue: state.entValue
    });
  }

  function getAlexVisual(trust) {
    if (trust >= 75) {
      return {
        mood: "Energized",
        moodClass: "",
        hint: "High trust & alignment",
        color: "#10b981",
        mouth: "M 15 29 Q 24 36 33 29",
        brows: "M 13 17 Q 17 15 20 17 M 28 17 Q 31 15 35 17"
      };
    }
    if (trust >= 55) {
      return {
        mood: "Collaborative",
        moodClass: "",
        hint: "Solid working rhythm",
        color: "#38bdf8",
        mouth: "M 16 30 Q 24 34 32 30",
        brows: "M 14 18 L 20 18 M 28 18 L 34 18"
      };
    }
    if (trust >= 38) {
      return {
        mood: "Guarded",
        moodClass: "guarded",
        hint: "Friction under surface",
        color: "#f59e0b",
        mouth: "M 16 31 L 32 31",
        brows: "M 14 17 L 20 19 M 28 19 L 34 17"
      };
    }
    return {
      mood: "On the Brink",
      moodClass: "strained",
      hint: "Partnership at risk",
      color: "#ef4444",
      mouth: "M 16 34 Q 24 27 32 34",
      brows: "M 13 16 L 20 20 M 28 20 L 35 16"
    };
  }

  function renderAvatar(trust) {
    const vis = getAlexVisual(trust);
    el("alex-avatar").innerHTML = `
      <svg width="42" height="42" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="20" fill="rgba(15, 23, 42, 0.9)" stroke="${vis.color}" stroke-width="2.2"/>
        <path d="${vis.brows}" stroke="${vis.color}" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="17" cy="22" r="2.2" fill="#f1f5f9"/>
        <circle cx="31" cy="22" r="2.2" fill="#f1f5f9"/>
        <path d="${vis.mouth}" stroke="${vis.color}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      </svg>
    `;
    const moodEl = el("alex-mood");
    moodEl.textContent = vis.mood;
    moodEl.className = `mood-pill ${vis.moodClass}`.trim();
    el("alex-quote").textContent = `"${state.lastAlexQuote}"`;
    el("trust-status").textContent = vis.hint;
  }

  function renderTimeline() {
    const track = el("timeline-track");
    const parts = SCENARIOS.map((sc, idx) => {
      const isLast = idx === SCENARIOS.length - 1;
      let cls = "timeline-node";
      let label = isLast ? "Seed" : String(idx + 1);
      if (idx < state.step || state.ended) {
        cls += " done";
        label = isLast ? "✓ Seed" : "✓";
      } else if (idx === state.step) {
        cls += " active";
      }
      const line = !isLast
        ? `<div class="timeline-line ${idx < state.step || state.ended ? "done" : ""}"></div>`
        : "";
      return `
        <div class="${cls}" title="${escapeHtml(sc.month)}">
          <span class="timeline-dot${isLast ? " timeline-seed" : ""}">${label}</span>
        </div>
        ${line}
      `;
    });
    track.innerHTML = `<span class="timeline-prefix">Month</span>` + parts.join("");
  }

  function flashMetric(metricName, deltaValue) {
    const card = document.querySelector(`.metric[data-metric="${metricName}"]`);
    if (!card || deltaValue === 0) return;
    const cls = deltaValue > 0 ? "pulse-up" : "pulse-down";
    card.classList.remove("pulse-up", "pulse-down");
    void card.offsetWidth; // trigger reflow for repeat animation
    card.classList.add(cls);
    setTimeout(() => card.classList.remove(cls), 950);
  }

  function showDeltaBadge(elemId, text, isPos) {
    const badge = el(elemId);
    if (!badge) return;
    if (!text) {
      badge.className = "float-delta";
      badge.textContent = "";
      return;
    }
    badge.textContent = text;
    badge.className = `float-delta show ${isPos ? "pos" : "neg"}`;
  }

  function updateUI(deltas = null) {
    state.trust = Math.max(0, Math.min(100, state.trust));
    state.valuation = Math.max(0, Math.min(100, state.valuation));
    calcEntValue();

    el("trust-val").textContent = `${state.trust}%`;
    const trustBar = el("trust-bar");
    trustBar.style.width = `${state.trust}%`;
    trustBar.className =
      "bar-fill trust-fill" + (state.trust < 35 ? " crit" : state.trust < 55 ? " warn" : "");

    el("val-val").textContent = `$${state.valuation * 10}k`;
    el("val-bar").style.width = `${state.valuation}%`;
    el("val-status").textContent =
      state.valuation >= 60
        ? "Strong Seed traction"
        : state.valuation >= 35
        ? "Growing momentum"
        : "Early prototype stage";

    el("ent-val").textContent = `${state.entValue}%`;
    el("ent-bar").style.width = `${state.entValue}%`;
    el("ent-status").textContent =
      state.entValue >= 65
        ? "Investor-grade durability"
        : state.entValue >= 45
        ? "Building foundation"
        : "Fragile venture health";

    if (deltas) {
      if (deltas.trust !== 0) {
        showDeltaBadge("trust-delta", `${deltas.trust > 0 ? "+" : ""}${deltas.trust}%`, deltas.trust > 0);
        flashMetric("trust", deltas.trust);
      } else {
        showDeltaBadge("trust-delta", "");
      }
      if (deltas.val !== 0) {
        showDeltaBadge("val-delta", `${deltas.val > 0 ? "+" : ""}$${deltas.val * 10}k`, deltas.val > 0);
        flashMetric("valuation", deltas.val);
      } else {
        showDeltaBadge("val-delta", "");
      }
      if (deltas.ent !== 0) {
        showDeltaBadge("ent-delta", `${deltas.ent > 0 ? "+" : ""}${deltas.ent}%`, deltas.ent > 0);
        flashMetric("ent", deltas.ent);
      } else {
        showDeltaBadge("ent-delta", "");
      }
    } else {
      showDeltaBadge("trust-delta", "");
      showDeltaBadge("val-delta", "");
      showDeltaBadge("ent-delta", "");
    }

    // Relational Debt tracker
    const debtBox = el("debt-box");
    el("debt-count").textContent = String(state.avoidedIssues.length);
    if (state.avoidedIssues.length > 0) {
      debtBox.classList.add("has-debt");
      el("debt-list").innerHTML = state.avoidedIssues
        .map((issue) => `<span class="debt-chip">${escapeHtml(issue)}</span>`)
        .join("");
    } else {
      debtBox.classList.remove("has-debt");
      el("debt-list").textContent = "None yet. Open communication keeps debt at zero.";
    }

    renderAvatar(state.trust);
    renderTimeline();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderScenario() {
    state.awaitingNext = false;
    renderTimeline();
    const sc = SCENARIOS[state.step];
    const choices = sc.getChoices(state);
    const contextNote = sc.getContextNote ? sc.getContextNote(state) : null;

    const area = el("game-area");
    const segmentButtonsHTML = [
      `<button type="button" class="segment-chip active" data-seg="0">Question</button>`,
      ...choices.map((_, idx) => `<button type="button" class="segment-chip" data-seg="${idx + 1}">Option ${idx + 1}</button>`)
    ].join("");

    area.innerHTML = `
      <div class="scenario-header">
        <span class="timeline-badge">${escapeHtml(sc.month)}</span>
        <span class="chapter-tag">Chapter ${state.step + 1} of ${SCENARIOS.length} • ${escapeHtml(sc.chapter)}</span>
      </div>
      <div class="audio-player" id="audio-player">
        <div class="player-main-row">
          <div class="player-controls">
            <button type="button" id="player-prev" class="player-btn" title="Previous recording (or restart current)" aria-label="Previous recording">${PLAYER_ICONS.prev}</button>
            <button type="button" id="player-toggle" class="player-btn player-play" title="Play or pause narration" aria-label="Play narration">${PLAYER_ICONS.play}</button>
            <button type="button" id="player-next" class="player-btn" title="Next recording" aria-label="Next recording">${PLAYER_ICONS.next}</button>
          </div>
          <div class="player-track">
            <div class="player-meta">
              <span id="player-label" class="player-label">Question</span>
              <span id="player-time" class="player-time mono">0:00 / 0:00</span>
            </div>
            <input type="range" id="player-seek" class="player-seek" min="0" max="1000" value="0" aria-label="Seek narration" />
          </div>
          <button type="button" id="player-speed" class="player-speed mono" title="Playback speed">1x</button>
        </div>
        <div class="player-segments" id="player-segments">${segmentButtonsHTML}</div>
      </div>
      ${contextNote ? `<div class="context-callout">⚡ ${escapeHtml(contextNote)}</div>` : ""}
      <div id="speech-notice" class="speech-notice hidden"></div>
      <p class="scenario-text">${escapeHtml(sc.text)}</p>
      <div class="choices" id="choices-box"></div>
      <div id="choices-hint" class="kbd-hint choices-hint">Tip: Press <kbd>1</kbd>–<kbd>${choices.length}</kbd> to choose an option</div>
      <div id="feedback-container"></div>
    `;

    const box = el("choices-box");
    choices.forEach((c, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn" + (c.isRepair ? " special-repair" : "");
      btn.innerHTML = `
        <span class="choice-key mono">${idx + 1}</span>
        <span>${escapeHtml(c.text)}</span>
      `;
      btn.addEventListener("click", () => selectChoice(idx));
      box.appendChild(btn);
    });

    el("player-toggle").addEventListener("click", () => SpeechEngine.togglePlay());
    el("player-prev").addEventListener("click", () => SpeechEngine.prevClip());
    el("player-next").addEventListener("click", () => SpeechEngine.nextClip());
    el("player-speed").addEventListener("click", () => SpeechEngine.cycleSpeed());
    el("player-seek").addEventListener("input", (e) => {
      SpeechEngine.seekToRatio(Number(e.target.value) / 1000);
    });
    document.querySelectorAll(".segment-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        SpeechEngine.jumpToClip(Number(chip.getAttribute("data-seg")) || 0);
      });
    });

    SpeechEngine.loadRound(sc, choices, !AudioEngine.muted);
  }

  function selectChoice(idx) {
    if (state.awaitingNext || state.ended) return;
    SpeechEngine.stop();
    const sc = SCENARIOS[state.step];
    const choices = sc.getChoices(state);
    const c = choices[idx];
    if (!c) return;

    state.awaitingNext = true;

    const prevTrust = state.trust;
    const prevVal = state.valuation;
    const prevEnt = state.entValue;

    state.trust += c.trust;
    state.valuation += c.val;
    if (c.earlyAgree !== undefined) state.earlyAgreement = c.earlyAgree;
    if (c.equitySplitType) state.equitySplitType = c.equitySplitType;
    if (c.roleClarity) state.roleClarity = true;
    if (c.forcedPivot) state.forcedPivot = true;

    let repairedIssue = null;
    if (c.clearsDebt && state.avoidedIssues.length > 0) {
      repairedIssue = state.avoidedIssues.shift();
    }
    if (c.avoided) {
      state.avoidedIssues.push(c.avoided);
    }

    // Cumulative Relational Debt checks
    let eruptionHTML = "";
    let eruptionTrustCost = 0;
    let eruptionValCost = 0;

    if (state.avoidedIssues.length >= 2 && !state.triggeredCumulative) {
      state.triggeredCumulative = true;
      eruptionTrustCost = -12;
      state.trust = Math.max(0, state.trust + eruptionTrustCost);
      eruptionHTML = `
        <div class="eruption-alert">
          <strong>Conflict Eruption (-12% Trust):</strong> Unresolved issues (${state.avoidedIssues.map(escapeHtml).join("; ")}) boiled over this week.
        </div>
      `;
      AudioEngine.playAlert();
    } else if (state.avoidedIssues.length >= 3 && c.avoided) {
      eruptionTrustCost = -6;
      eruptionValCost = -3;
      state.trust = Math.max(0, state.trust + eruptionTrustCost);
      state.valuation = Math.max(0, state.valuation + eruptionValCost);
      eruptionHTML = `
        <div class="eruption-alert">
          <strong>Avoidance Drag (-6% Trust, -$30k):</strong> ${state.avoidedIssues.length} unresolved issues are stalling execution.
        </div>
      `;
      AudioEngine.playAlert();
    } else if (c.trust >= 3 && c.val >= 0) {
      AudioEngine.playPositive();
    } else if (c.trust <= -6 || c.val <= -4) {
      AudioEngine.playNegative();
    } else {
      AudioEngine.playClick();
    }

    state.lastAlexQuote = c.alexQuote;

    // Update UI & compute total net deltas
    updateUI();
    const netTrust = state.trust - prevTrust;
    const netVal = state.valuation - prevVal;
    const netEnt = state.entValue - prevEnt;
    updateUI({ trust: netTrust, val: netVal, ent: netEnt });

    state.trajectory.push({
      label: sc.shortLabel,
      trust: state.trust,
      valuation: state.valuation,
      entValue: state.entValue
    });

    state.history.push({
      month: sc.month,
      choice: c.text,
      tag: c.tag,
      trustDelta: netTrust,
      valDelta: netVal,
      entDelta: netEnt,
      lesson: c.lesson,
      repairedIssue
    });

    // Lock choice buttons and mark selected
    const choicesHint = el("choices-hint");
    if (choicesHint) choicesHint.classList.add("hidden");
    const buttons = document.querySelectorAll(".choice-btn");
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === idx) b.classList.add("picked");
    });

    const collapsed = state.trust <= 0 || state.valuation <= 0 || state.entValue <= 0;
    const isLast = state.step + 1 >= SCENARIOS.length || collapsed;
    const nextLabel = collapsed
      ? "View Breakdown Report →"
      : isLast
      ? "See Seed Verdict →"
      : "Next Month →";

    el("feedback-container").innerHTML = `
      <div class="feedback-panel">
        <div class="feedback-outcome">
          <strong>Outcome:</strong> ${escapeHtml(c.feedback)}
        </div>
        ${eruptionHTML}
        <div class="alex-reaction">
          <strong>Alex:</strong> "${escapeHtml(c.alexQuote)}"
        </div>
        <div class="lesson-box">
          <strong>Takeaway:</strong> ${escapeHtml(c.lesson)}
        </div>
        <div class="deltas">
          <span class="delta-pill ${netTrust >= 0 ? "pos" : "neg"}">Trust ${netTrust >= 0 ? "+" : ""}${netTrust}%</span>
          <span class="delta-pill ${netVal >= 0 ? "val-pos" : "neg"}">Valuation ${netVal >= 0 ? "+" : ""}$${netVal * 10}k</span>
          <span class="delta-pill ent">Ent. Value ${state.entValue}% (${netEnt >= 0 ? "+" : ""}${netEnt})</span>
          ${repairedIssue ? `<span class="delta-pill pos">Cleared: ${escapeHtml(repairedIssue)}</span>` : ""}
        </div>
        <div class="feedback-actions">
          <span class="kbd-hint">Press <kbd>Enter</kbd> to continue</span>
          <button class="primary-btn" id="next-btn" type="button">${nextLabel}</button>
        </div>
      </div>
    `;

    el("next-btn").addEventListener("click", nextStep);
  }

  function nextStep() {
    if (!state.awaitingNext && !state.ended) return;
    if (state.trust <= 0 || state.valuation <= 0 || state.entValue <= 0) {
      return renderEnding();
    }
    state.step += 1;
    if (state.step >= SCENARIOS.length) {
      renderEnding();
    } else {
      renderScenario();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function evaluateLeadershipProfile() {
    const tags = state.history.map((h) => h.tag);
    const avoidCount = tags.filter((t) => ["Avoidant", "Informal", "Martyrdom", "Appeasement", "Polished Denial"].includes(t)).length;
    const repairCount = tags.filter((t) => t === "Debt Repair").length;
    const boldCount = tags.filter((t) => ["Aggressive", "Capital-First", "Top-Down", "Undermining", "Backchannel", "Ultimatum"].includes(t)).length;

    if (repairCount > 0 && state.trust >= 54) {
      return {
        name: "Resilient Mediator",
        desc: "You took hits early, owned them candidly, and paid down relational debt before Seed."
      };
    }
    if (avoidCount >= 3) {
      return {
        name: "Conflict Avoider",
        desc: "You repeatedly traded hard conversations for short-term peace, letting hidden debt compound."
      };
    }
    if (boldCount >= 3) {
      return {
        name: "Hard-Driving Operator",
        desc: "You pushed hard for cash and speed, often taxing co-founder trust to hit numbers."
      };
    }
    if (state.trust >= 64 && state.valuation >= 48) {
      return {
        name: "Principled Architect",
        desc: "You navigated ugly startup trade-offs with clear rules, shared sacrifice, and steady discipline."
      };
    }
    return {
      name: "Pragmatic Survivor",
      desc: "You absorbed inevitable bruises and compromises to keep both product and partnership alive."
    };
  }

  function evaluateEnding() {
    if (state.valuation <= 0) {
      return {
        key: "Breakdown",
        title: "Ending: Out of Runway (Loss)",
        badge: "Startup Folded",
        color: "#ef4444",
        win: false,
        desc: "Cash and valuation hit zero before Seed. Even good intentions fail when runway runs dry."
      };
    }
    if (state.trust <= 0 || state.entValue <= 0) {
      return {
        key: "Breakdown",
        title: "Ending: Breakdown (Loss)",
        badge: "Partnership Collapsed",
        color: "#ef4444",
        win: false,
        desc: "Co-founder trust hit zero before Seed. Alex walked out and the venture imploded."
      };
    }
    if (state.trust >= 66 && state.entValue >= 64 && state.avoidedIssues.length === 0) {
      return {
        key: "Rocketship Partnership",
        title: "Ending: Rocketship Partnership (S-Rank)",
        badge: "Oversubscribed Seed",
        color: "#10b981",
        win: true,
        desc: "Battle-tested, solvent, and debt-free. VCs fiercely competed to lead your Seed round."
      };
    }
    if (state.trust >= 52 && state.entValue >= 50 && state.avoidedIssues.length <= 1) {
      return {
        key: "Strong Partnership",
        title: "Ending: Strong Partnership (Win)",
        badge: "Seed Round Closed",
        color: "#10b981",
        win: true,
        desc: "Bruised by tough trade-offs, your team stayed aligned enough to pass Seed diligence."
      };
    }
    if (state.trust < 48 && state.earlyAgreement && state.entValue >= 40) {
      return {
        key: "Clean Split",
        title: "Ending: Clean Split (Partial Win)",
        badge: "Orderly Transition",
        color: "#38bdf8",
        win: true,
        desc: "You and Alex parted ways, but Month 2 vesting kept the cap table clean enough to raise Seed."
      };
    }
    if (state.trust >= 34 && state.entValue >= 38) {
      return {
        key: "Survived, But Strained",
        title: "Ending: Survived, But Strained",
        badge: "Small Bridge Only",
        color: "#f59e0b",
        win: false,
        desc: "Lead Seed VCs passed over lingering team cracks, leaving you on a tight bridge extension."
      };
    }
    return {
      key: "Breakdown",
      title: "Ending: Breakdown (Loss)",
      badge: "Seed Pitch Rejected",
      color: "#ef4444",
      win: false,
      desc: "After 12 grueling months, weak trust and traction failed to convince Seed investors."
    };
  }

  function buildTrajectorySVG(points) {
    const W = 680;
    const H = 210;
    const padL = 42;
    const padR = 20;
    const padT = 18;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xAt = (i) =>
      points.length <= 1 ? padL : padL + (i / (points.length - 1)) * plotW;
    const yAt = (v) => padT + ((100 - v) / 100) * plotH;

    const makePath = (key) =>
      points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(p[key]).toFixed(1)}`)
        .join(" ");

    const gridLines = [0, 25, 50, 75, 100]
      .map((val) => {
        const y = yAt(val).toFixed(1);
        return `
          <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="3 3"/>
          <text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" fill="#64748b" font-size="10" font-family="monospace">${val}</text>
        `;
      })
      .join("");

    const xLabels = points
      .map((p, i) => {
        const x = xAt(i).toFixed(1);
        return `<text x="${x}" y="${H - 10}" text-anchor="middle" fill="#94a3b8" font-size="10" font-weight="600">${escapeHtml(p.label)}</text>`;
      })
      .join("");

    const makeDots = (key, color) =>
      points
        .map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p[key]).toFixed(1)}" r="3.6" fill="${color}" stroke="#070b14" stroke-width="1.5"/>`)
        .join("");

    return `
      <svg class="trajectory-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Startup metrics trajectory chart">
        ${gridLines}
        ${xLabels}
        <path d="${makePath("valuation")}" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${makePath("entValue")}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${makePath("trust")}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${makeDots("valuation", "#8b5cf6")}
        ${makeDots("entValue", "#f59e0b")}
        ${makeDots("trust", "#10b981")}
      </svg>
    `;
  }

  function renderEnding() {
    SpeechEngine.stop();
    state.ended = true;
    state.awaitingNext = false;
    renderTimeline();

    const outcome = evaluateEnding();
    const profile = evaluateLeadershipProfile();
    saveCareer(outcome.key);
    const career = loadCareer();

    if (outcome.win) {
      AudioEngine.playVictory();
    } else {
      AudioEngine.playNegative();
    }

    const historyHTML = state.history
      .map(
        (h) => `
      <div class="history-item">
        <div class="history-top">
          <strong>${escapeHtml(h.month)}</strong>
          <span class="mono" style="font-size:0.78rem; color:#94a3b8;">
            Trust ${h.trustDelta >= 0 ? "+" : ""}${h.trustDelta}% • Val ${h.valDelta >= 0 ? "+" : ""}$${h.valDelta * 10}k
          </span>
        </div>
        <div class="history-choice">${escapeHtml(h.choice)}</div>
        <div class="history-meta">Lesson: ${escapeHtml(h.lesson)}</div>
      </div>
    `
      )
      .join("");

    const galleryHTML = ALL_ENDINGS.map((e) => {
      const unlocked = career.endings.includes(e);
      return `<span class="ending-chip ${unlocked ? "unlocked" : ""}">${unlocked ? "✓ " : "🔒 "}${escapeHtml(e)}</span>`;
    }).join("");

    el("game-area").innerHTML = `
      <div class="ending-hero">
        <span class="ending-badge" style="background:${outcome.color};">${escapeHtml(outcome.badge)}</span>
        <h2 class="ending-title">${escapeHtml(outcome.title)}</h2>
        <p class="scenario-text" style="margin-bottom:0;">${escapeHtml(outcome.desc)}</p>
      </div>

      <div class="ending-summary-grid">
        <div class="summary-stat">
          <span class="label">Final Trust</span>
          <span class="value mono" style="color:var(--trust);">${state.trust}%</span>
        </div>
        <div class="summary-stat">
          <span class="label">Final Valuation</span>
          <span class="value mono" style="color:var(--val);">$${state.valuation * 10}k</span>
        </div>
        <div class="summary-stat">
          <span class="label">Entrepreneur Value</span>
          <span class="value mono" style="color:var(--ent);">${state.entValue}%</span>
        </div>
        <div class="summary-stat">
          <span class="label">Unresolved Debt</span>
          <span class="value mono" style="color:${state.avoidedIssues.length ? "var(--danger)" : "var(--trust)"};">${state.avoidedIssues.length}</span>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-head">
          <h3>Venture Trajectory (${escapeHtml(state.originName)})</h3>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-swatch" style="background:#10b981;"></span>Trust %</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#8b5cf6;"></span>Valuation ($10k units)</span>
            <span class="legend-item"><span class="legend-swatch" style="background:#f59e0b;"></span>Ent. Value %</span>
          </div>
        </div>
        ${buildTrajectorySVG(state.trajectory)}
      </div>

      <div class="archetype-box">
        <h3>Leadership Profile: ${escapeHtml(profile.name)}</h3>
        <p>${escapeHtml(profile.desc)}</p>
      </div>

      <h3 class="section-label">Endings Discovered (${career.endings.length}/${ALL_ENDINGS.length})</h3>
      <div class="endings-gallery">${galleryHTML}</div>

      <h3 class="section-label">Decision Log &amp; Takeaways</h3>
      <div class="history-list">${historyHTML}</div>

      <div class="feedback-actions">
        <div class="start-cta-group">
          <button class="primary-btn" id="play-again-btn" type="button">Play Again &amp; Explore Another Path →</button>
          <button class="icon-btn" id="ending-reading-btn" type="button">📖 Review Reading</button>
        </div>
        <button class="icon-btn" id="change-origin-btn" type="button">Change Founding Origin</button>
      </div>
    `;

    el("play-again-btn").addEventListener("click", () => startRun(state.originKey));
    el("ending-reading-btn").addEventListener("click", openReadingModal);
    el("change-origin-btn").addEventListener("click", returnToStart);
  }

  function updateReadingContext() {
    const box = el("reading-run-context");
    if (!box) return;
    if (!state || !state.history || state.history.length === 0) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }

    const notes = [];
    if (state.equitySplitType === "postponed") {
      notes.push("You postponed your Month 2 equity split—see <strong>Section 2 (Handshake Equity)</strong> on why unvested promises escalate later.");
    } else if (state.earlyAgreement) {
      notes.push("You formalized equity with vesting early—see <strong>Section 2</strong> on how this protects your cap table.");
    }
    if (state.avoidedIssues.length > 0) {
      notes.push(`You currently carry <strong>${state.avoidedIssues.length} Relational Debt item(s)</strong>—see <strong>Section 3 (Relational Debt)</strong>.`);
    } else {
      notes.push("You have <strong>0 Relational Debt</strong>—see <strong>Section 3</strong> on staying conflict-capable.");
    }

    box.innerHTML = `<strong>Your Run Connection (${escapeHtml(state.originName)}):</strong> ${notes.join(" ")}`;
    box.classList.remove("hidden");
  }

  function openReadingModal() {
    SpeechEngine.stop();
    AudioEngine.playClick();
    updateReadingContext();
    el("reading-modal").classList.remove("hidden");
    const body = el("reading-body");
    if (body) body.scrollTop = 0;
  }

  function closeReadingModal() {
    el("reading-modal").classList.add("hidden");
  }

  function startRun(originKey) {
    initState(originKey);
    el("start-screen").classList.add("hidden");
    el("game-shell").classList.remove("hidden");
    el("restart-top-btn").classList.remove("hidden");
    updateUI();
    renderScenario();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function returnToStart() {
    SpeechEngine.stop();
    el("game-shell").classList.add("hidden");
    el("restart-top-btn").classList.add("hidden");
    el("start-screen").classList.remove("hidden");
    renderCareerSummary();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* Event Wiring */
  const bind = (id, ev, fn) => {
    const node = el(id);
    if (node) node.addEventListener(ev, fn);
  };

  document.querySelectorAll(".origin-card").forEach((card) => {
    card.addEventListener("click", () => {
      AudioEngine.playClick();
      document.querySelectorAll(".origin-card").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selectedOriginKey = card.getAttribute("data-origin") || "hackathon";
    });
  });

  bind("start-game-btn", "click", () => {
    AudioEngine.playPositive();
    startRun(selectedOriginKey);
  });

  bind("restart-top-btn", "click", returnToStart);

  bind("reading-open-btn", "click", openReadingModal);
  bind("reading-close-btn", "click", closeReadingModal);
  bind("reading-print-btn", "click", () => window.print && window.print());
  bind("reading-modal", "click", (e) => {
    if (e.target === el("reading-modal")) closeReadingModal();
  });

  bind("sound-toggle", "click", () => {
    AudioEngine.muted = !AudioEngine.muted;
    el("sound-icon").textContent = AudioEngine.muted ? "🔇" : "🔊";
    if (AudioEngine.muted) {
      SpeechEngine.pause();
    } else {
      AudioEngine.unlock();
      AudioEngine.playClick();
      if (!el("game-shell").classList.contains("hidden") && !state.awaitingNext && !state.ended) {
        if (SpeechEngine.clips.length) {
          SpeechEngine.playClipAt(SpeechEngine.clipIndex, SpeechEngine.offsetSeconds);
        } else {
          const sc = SCENARIOS[state.step];
          if (sc) SpeechEngine.loadRound(sc, sc.getChoices(state), true);
        }
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    const modal = el("reading-modal");
    if (modal && !modal.classList.contains("hidden")) {
      if (e.key === "Escape") closeReadingModal();
      return;
    }
    const shell = el("game-shell");
    if (!shell || shell.classList.contains("hidden") || state.ended) return;
    if (
      e.target &&
      (e.target.tagName === "TEXTAREA" ||
        (e.target.tagName === "INPUT" && e.target.type !== "range"))
    ) {
      return;
    }

    const digitMatch =
      ["1", "2", "3", "4"].includes(e.key)
        ? Number(e.key)
        : /^Digit([1-4])$/.test(e.code || "")
        ? Number(e.code.slice(5))
        : /^Numpad([1-4])$/.test(e.code || "")
        ? Number(e.code.slice(6))
        : 0;

    if (!state.awaitingNext && digitMatch >= 1 && digitMatch <= 4) {
      const idx = digitMatch - 1;
      const buttons = document.querySelectorAll(".choice-btn");
      if (buttons[idx] && !buttons[idx].disabled) {
        selectChoice(idx);
      }
    } else if (state.awaitingNext && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      nextStep();
    }
  });

  window.addEventListener("beforeunload", () => SpeechEngine.stop());

  renderCareerSummary();
})();
