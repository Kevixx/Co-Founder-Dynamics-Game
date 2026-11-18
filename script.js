(() => {
  "use strict";

  const STORAGE_KEY = "cofounder_dynamics_career_v2";

  const ORIGINS = {
    hackathon: {
      name: "Hackathon Partners",
      trust: 70,
      valuation: 20, // $200k
      quote: "Ready to ship this prototype and prove people actually want it."
    },
    friends: {
      name: "University Friends",
      trust: 80,
      valuation: 15, // $150k
      quote: "Building a company with my best friend—just hope business stays easy."
    },
    veterans: {
      name: "Industry Acquaintances",
      trust: 60,
      valuation: 28, // $280k
      quote: "Investors love our resumes. Let's see how we actually work together."
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
    ensure() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },
    tone(freq, duration, type = "sine", gainVal = 0.06, delay = 0) {
      const ctx = this.ensure();
      if (!ctx) return;
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

  const PLAYER_ICONS = {
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>`,
    pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>`,
    prev: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5.5" width="2.4" height="13" rx="1"/><path d="M18.5 6.2v11.6a.9.9 0 0 1-1.38.76l-8.4-5.8a.9.9 0 0 1 0-1.52l8.4-5.8a.9.9 0 0 1 1.38.76z"/></svg>`,
    next: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5.5 6.2v11.6a.9.9 0 0 0 1.38.76l8.4-5.8a.9.9 0 0 0 0-1.52l-8.4-5.8A.9.9 0 0 0 5.5 6.2z"/><rect x="16.6" y="5.5" width="2.4" height="13" rx="1"/></svg>`
  };

  /* Bundled OGG/MP3 voice narrator with interactive player controls */
  const SpeechEngine = {
    timer: null,
    rafId: null,
    activeAudio: null,
    activeSource: null,
    activeUtterances: [],
    bufferCache: new Map(),
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
      return typeof Audio === "function" || typeof AudioContext === "function" || this.speechSupported();
    },
    formatTime(sec) {
      const s = Math.max(0, Math.floor(sec || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${m}:${r < 10 ? "0" : ""}${r}`;
    },
    pickAudioExt() {
      if (typeof Audio !== "function") return "ogg";
      try {
        const probe = new Audio();
        if (probe.canPlayType && probe.canPlayType("audio/ogg; codecs=vorbis")) {
          return "ogg";
        }
        if (probe.canPlayType && probe.canPlayType("audio/mpeg")) {
          return "mp3";
        }
      } catch {
        // Ignore canPlayType errors
      }
      return "ogg";
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
          this.activeAudio.ontimeupdate = null;
          this.activeAudio.pause();
          this.activeAudio.src = "";
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
      if (this.activeAudio && !Number.isNaN(this.activeAudio.currentTime)) {
        return this.activeAudio.currentTime;
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
    decodeBase64(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let idx = 0; idx < bin.length; idx++) {
        bytes[idx] = bin.charCodeAt(idx);
      }
      return bytes.buffer;
    },
    async loadClipBuffer(clip) {
      const ctx = AudioEngine.ensure();
      if (!ctx) throw new Error("AudioContext unavailable");
      const key = clip.base;
      if (this.bufferCache.has(key)) return this.bufferCache.get(key);
      if (!window.GAME_AUDIO || !window.GAME_AUDIO[key]) {
        throw new Error(`Missing embedded clip ${key}`);
      }
      const arr = this.decodeBase64(window.GAME_AUDIO[key]);
      const buf = await ctx.decodeAudioData(arr);
      this.bufferCache.set(key, buf);
      return buf;
    },
    async loadMetadataFor(index) {
      const clip = this.clips[index];
      if (!clip) return;
      try {
        const buf = await this.loadClipBuffer(clip);
        if (this.clipIndex === index) {
          this.duration = buf.duration || 0;
          this.updatePlayerUI();
        }
      } catch {
        // Ignore preload metadata error
      }
    },
    async playClipAt(index, offset = 0) {
      if (!this.clips.length) return;
      const clampedIdx = Math.max(0, Math.min(this.clips.length - 1, index));
      this.stopCurrentPlayback();
      this.showNotice("");
      this.clipIndex = clampedIdx;
      const item = this.clips[clampedIdx];
      const token = this.playToken;

      const ctx = AudioEngine.ensure();
      if (ctx) {
        try {
          const buf = await this.loadClipBuffer(item);
          if (token !== this.playToken || AudioEngine.muted) return;

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
            if (clampedIdx + 1 < this.clips.length) {
              this.playClipAt(clampedIdx + 1, 0);
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
          return;
        } catch (err) {
          if (token !== this.playToken) return;
          // Fall through to HTML5 Audio fallback
        }
      }

      this.playHtml5At(clampedIdx, offset, token);
    },
    playHtml5At(index, offset, token) {
      const item = this.clips[index];
      const b64 = item && window.GAME_AUDIO ? window.GAME_AUDIO[item.base] : null;
      if (typeof Audio !== "function" || !b64) {
        this.showNotice("Audio playback unavailable in this browser.");
        this.updatePlayerUI();
        return;
      }

      const audio = new Audio(`data:audio/ogg;base64,${b64}`);
      audio.playbackRate = this.playbackRate;
      this.activeAudio = audio;
      this.isPlaying = true;
      this.highlightChoice(item.choiceIdx);

      audio.onloadedmetadata = () => {
        if (token !== this.playToken) return;
        this.duration = audio.duration || 0;
        if (offset > 0 && offset < this.duration) {
          audio.currentTime = offset;
        }
        this.updatePlayerUI();
      };
      audio.ontimeupdate = () => {
        if (token !== this.playToken) return;
        this.offsetSeconds = audio.currentTime || 0;
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
        if (token !== this.playToken) return;
        this.activeAudio = null;
        this.isPlaying = false;
        this.clearHighlights();
        this.showNotice("Voice narration unavailable in this browser.");
        this.updatePlayerUI();
      };

      this.updatePlayerUI();
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          if (token !== this.playToken) return;
          this.activeAudio = null;
          this.isPlaying = false;
          this.clearHighlights();
          if (err && err.name === "NotAllowedError") {
            this.showNotice("Browser paused autoplay—press ▶ in the player to start narration.");
          } else {
            this.showNotice(`Voice narration unavailable (${err ? err.message || err.name : "Playback failed"}).`);
          }
          this.updatePlayerUI();
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
      this.playClipAt(idx, 0);
    },
    seekToRatio(ratio) {
      if (!this.duration) return;
      const target = Math.max(0, Math.min(this.duration, ratio * this.duration));
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
      this.loadMetadataFor(0);
      this.updatePlayerUI();
      if (autoPlay && !AudioEngine.muted) {
        this.playClipAt(0, 0);
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
      month: "Month 1: The Coffee Shop Kickoff",
      chapter: "Discovery & Role Clarity",
      text: "Week 2 of your startup. Alex wants to lock in for six weeks to build a full-featured v1 in stealth before showing anyone. You believe you should interview 25 target customers with rough mockups first. Neither of you has written down who owns product versus commercial decisions.",
      getChoices: () => [
        {
          text: "Agree to a 2-week split sprint: Alex builds a clickable core flow while you run 20 user interviews, plus write down role ownership.",
          trust: 10,
          val: 10,
          avoided: null,
          roleClarity: true,
          tag: "Aligned",
          alexQuote: "Deal—building a lean clickable prototype while you test demand beats guessing in a vacuum.",
          feedback: "You channel Alex's builder energy into a fast prototype while validating real customer pain points and defining clear decision-rights.",
          lesson: "Pair customer discovery with rapid prototyping, and clarify founder roles before ego or overlap sets in."
        },
        {
          text: "Let Alex build in stealth for 6 weeks while you quietly work on pitch slides to avoid an early clash.",
          trust: -6,
          val: -4,
          avoided: "Unaligned stealth build & undefined roles (Month 1)",
          tag: "Avoidant",
          alexQuote: "Cool, catch you in a few weeks—I'll ping you once the backend is ready.",
          feedback: "You avoid a Day-1 debate, but building without customer validation or shared ownership leaves you disconnected from the start.",
          lesson: "Stealth building without customer feedback is one of the fastest ways startups burn their earliest months."
        },
        {
          text: "Insist on zero coding until all 25 interviews are finished, overruling Alex's prototype excitement.",
          trust: -14,
          val: 6,
          avoided: null,
          tag: "Top-Down",
          alexQuote: "Six weeks of interviews with nothing to show? Feels like I'm benched before we even start.",
          feedback: "Your customer research discipline keeps focus sharp, though shutting down Alex's builder momentum creates early friction.",
          lesson: "Technical co-founders stay energized when discovery and tangible product iteration happen side-by-side."
        },
        {
          text: "Jump straight into building together without formalizing roles—you'll figure out ownership as you go.",
          trust: 4,
          val: 4,
          avoided: "Undefined founder decision-rights (Month 1)",
          tag: "Informal",
          alexQuote: "Why overcomplicate it? We're a team of two—we'll both just do whatever needs doing.",
          feedback: "Velocity feels effortless in Week 2, yet leaving decision boundaries undefined sets the stage for stepping on each other's toes later.",
          lesson: "'We'll both do everything' works in Week 1 and breaks down the moment customers, equity, or deadlines arrive."
        }
      ]
    },
    {
      id: "m2",
      shortLabel: "M2",
      month: "Month 2: The Handshake Split",
      chapter: "Equity & Fairness",
      text: "You and Alex initially split equity on a handshake. Two months in, Alex has been coding nights and weekends on the prototype while you handled early customer interviews. One evening he tells you he's putting in far more hours than planned and wants a formal equity split before writing another line of code.",
      getChoices: () => [
        {
          text: "Propose a split that favors Alex (e.g., 60/40 with a 4-year vesting schedule).",
          trust: 15,
          val: 5,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "generous",
          tag: "Generous",
          alexQuote: "Honestly, that means a lot. Having vesting in place makes me feel we're both protected.",
          feedback: "Alex feels deeply valued and motivated. Formalizing early with vesting aligns long-term incentives, even though you gave up personal equity.",
          lesson: "Fairness isn't always 50/50—recognizing uneven early risk builds immense founder goodwill, and vesting protects the company if someone leaves."
        },
        {
          text: "Propose an equal 50/50 split with formal 4-year vesting and clear role milestones.",
          trust: 10,
          val: 10,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "equal",
          tag: "Balanced",
          alexQuote: "Deal. A 1-year cliff keeps both of us honest for the long haul.",
          feedback: "You validate Alex's prototype sprint while framing the startup as a multi-year marathon where customer discovery and engineering carry equal weight.",
          lesson: "Equal splits paired with vesting and explicit role expectations prevent early resentment and signal maturity to future investors."
        },
        {
          text: "Propose a split that favors yourself as CEO (65/35).",
          trust: -25,
          val: 0,
          avoided: null,
          earlyAgree: true,
          equitySplitType: "selfish",
          tag: "Aggressive",
          alexQuote: "Wait—I built the entire product after hours and you want two-thirds? Fine, put it on paper, but don't expect overtime.",
          feedback: "Aggressive move. Given Alex's nights and weekends on the prototype, claiming majority equity severely damages his trust and sense of fairness.",
          lesson: "Over-optimizing your personal slice at Month 2 often shrinks the whole pie by killing co-founder motivation."
        },
        {
          text: "Postpone the legal talk until after launch so you don't slow down momentum.",
          trust: -10,
          val: 5,
          avoided: "Unresolved equity split (Month 2)",
          earlyAgree: false,
          equitySplitType: "postponed",
          tag: "Avoidant",
          alexQuote: "Sure, we can talk later... I guess I'll just keep building for now.",
          feedback: "You dodge an uncomfortable negotiation today, keeping short-term velocity, but uncertainty and resentment begin simmering.",
          lesson: "Handshake deals are ticking time bombs—every milestone you hit increases the stakes and makes the eventual equity talk harder."
        }
      ]
    },
    {
      id: "m3",
      shortLabel: "M3",
      month: "Month 3: The $100,000 Pivot Offer",
      chapter: "Vision vs. Capital",
      text: "An angel investor offers $100,000 immediately—but only if you pivot your prototype into an enterprise compliance tool. Alex strongly believes in your original consumer mission and warns the pivot will kill your team's energy.",
      getChoices: () => [
        {
          text: "Accept the check and force the pivot immediately.",
          trust: -25,
          val: 28,
          avoided: "Forced pivot against co-founder's vision (Month 3)",
          forcedPivot: true,
          tag: "Capital-First",
          alexQuote: "You didn't even ask what I thought—you just took the money. I didn't sign up to build compliance forms.",
          feedback: "Your valuation jumps with the $100k injection, but overriding Alex's core passion fractures your shared sense of purpose.",
          lesson: "Chasing investor-driven pivots without co-founder buy-in buys runway at the cost of intrinsic motivation."
        },
        {
          text: "Propose a 2-week customer validation sprint before giving the investor a final answer.",
          trust: 8,
          val: 10,
          avoided: null,
          tag: "Evidence-Led",
          alexQuote: "Testing demand with real users first? That's fair—let's let the market decide, not just one check.",
          feedback: "The angel respects your discipline and leaves a smaller $40k option open. You and Alex evaluate the pivot together using real user data.",
          lesson: "Replacing ego battles with small, fast experiments turns ideological founder disagreements into shared learning."
        },
        {
          text: "Turn down the $100,000 and stay committed to your original vision.",
          trust: 15,
          val: -5,
          avoided: null,
          tag: "Vision-First",
          alexQuote: "Thank you for having our back. Now let's prove our original users will pay.",
          feedback: "Cash stays tight, slowing immediate valuation growth, but standing fast together reinforces deep co-founder solidarity.",
          lesson: "Saying no to misaligned money protects team conviction—as long as you pair conviction with relentless customer traction."
        }
      ]
    },
    {
      id: "m4",
      shortLabel: "M4",
      month: "Month 4: The Pilot Customer & Role Creep",
      chapter: "Boundaries & Early Traction",
      getContextNote: (s) => {
        if (s.forcedPivot) {
          return "Pivot Aftershock: Shifting into enterprise compliance brought complex custom demands Alex didn't anticipate.";
        }
        if (s.roleClarity) {
          return "Month 1 Charter Active: Your written role split makes it easier to separate technical scoping from commercial pricing.";
        }
        return null;
      },
      text: "Your first paying pilot customer emails Alex directly asking for a custom integration and a 50% discount. Without looping you in, Alex replies promising to build it by Friday for half price just to land the logo.",
      getChoices: (s) => [
        {
          text: "Honor Friday's deliverable together, then set a clear rule that pricing and scope need both founders' sign-off.",
          trust: 10 + (s.roleClarity ? 4 : 0),
          val: 10,
          avoided: null,
          tag: "Constructive",
          alexQuote: "Fair—I got excited to close our first logo. Next time I'll hand pricing straight to you.",
          feedback:
            "You protect the customer relationship while reinforcing healthy commercial boundaries with Alex." +
            (s.roleClarity ? " (Your Month 1 role agreement makes the reset quick and painless.)" : ""),
          lesson: "Correct boundary crossings without punishing initiative—turn one-off mistakes into clear operating rules."
        },
        {
          text: "Email the customer privately to revoke Alex's 50% discount and tell Alex afterward.",
          trust: -22,
          val: -4,
          avoided: "Undercut co-founder on pilot pricing (Month 4)",
          tag: "Undermining",
          alexQuote: "You contradicted me in writing to our very first paying user? That made both of us look amateur.",
          feedback: "Reversing Alex's promise behind his back humiliates him in front of the customer and fractures internal trust.",
          lesson: "Never contradict your co-founder externally—align privately first, then present one unified company voice."
        },
        {
          text: "Say nothing to keep the peace and quietly scramble your financial projections around the 50% discount.",
          trust: -8,
          val: -6,
          avoided: "Unaddressed role & pricing boundary cross (Month 4)",
          tag: "Avoidant",
          alexQuote: "Awesome, glad we landed them! I'll keep offering pilot discounts if it closes deals faster.",
          feedback: "You dodge an awkward conversation today, but leaving pricing discipline unaddressed hurts margins and invites repeat overlap.",
          lesson: "Unspoken role creep compounds quickly—early customers anchor on whatever sloppy precedents you allow."
        },
        {
          text: "Invite Alex onto a joint call with the customer: you lead pricing & value while Alex scopes engineering effort.",
          trust: 12,
          val: 14,
          avoided: null,
          tag: "Collaborative",
          alexQuote: "Seeing how you anchored value instead of discounting saved our margin—great teamwork.",
          feedback: "By pairing up live, you convert a half-price custom rush into a properly scoped pilot at full value.",
          lesson: "Co-founders are strongest when commercial framing and technical scoping operate as a visible tag team."
        }
      ]
    },
    {
      id: "m5",
      shortLabel: "M5",
      month: "Month 5: The Unannounced Hire",
      chapter: "Governance & Boundaries",
      getContextNote: (s) =>
        s.equitySplitType === "postponed"
          ? "Compounded Tension: Because you postponed your own equity split in Month 2, Alex assumes cap-table promises are informal."
          : null,
      text: "You walk into the workspace on Monday morning and find a stranger at the spare desk. Alex invited a friend to help with marketing 10 hours a week—and promised her 2% equity without consulting you first.",
      getChoices: (s) => {
        const extraPenalty = s.equitySplitType === "postponed" ? -8 : 0;
        return [
          {
            text: "Welcome her warmly and say nothing about the 2% equity promise for now.",
            trust: -6 + extraPenalty,
            val: 4,
            avoided: "Unapproved 2% equity promise to friend (Month 5)",
            tag: "Avoidant",
            alexQuote: "Awesome, glad you're cool with it. I'll loop you in next time—maybe.",
            feedback:
              "You keep the peace in the room, but silently accepting unauthorized equity handouts sets a dangerous governance precedent." +
              (extraPenalty ? " (Your unresolved Month 2 equity makes the cap table even messier.)" : ""),
            lesson: "What you tolerate silently becomes your company's operating standard."
          },
          {
            text: "Confront Alex right in front of her, stating he had no authority to give away equity.",
            trust: -25 + extraPenalty,
            val: -6,
            avoided: null,
            tag: "Public Clash",
            alexQuote: "Really? In front of her? You could have pulled me aside for two minutes.",
            feedback: "Publicly undermining your co-founder destroys psychological safety and embarrasses a potential team member.",
            lesson: "Praise in public, resolve governance conflicts in private—united leadership matters even during disagreement."
          },
          {
            text: "Welcome her politely, then meet Alex privately to set clear cap-table approval rules.",
            trust: 15,
            val: 10,
            avoided: null,
            tag: "Principled",
            alexQuote: "You're right—I jumped the gun. Let's agree on a written rule before offering any equity.",
            feedback: "Textbook founder leadership. You protect morale in the room while establishing firm governance boundaries behind closed doors.",
            lesson: "Strong partnerships pair high empathy with explicit decision-rights and cap-table discipline."
          },
          {
            text: "Keep her on board, but renegotiate her compensation as a small cash stipend instead of equity.",
            trust: 6,
            val: 6,
            avoided: null,
            tag: "Pragmatic",
            alexQuote: "Fair compromise—she actually prefers predictable cash right now anyway.",
            feedback: "A practical fix that protects the cap table while respecting Alex's initiative to get marketing help.",
            lesson: "Protecting equity early preserves room for full-time hires and future seed investors."
          }
        ];
      }
    },
    {
      id: "m6",
      shortLabel: "M6",
      month: "Month 6: Pre-Beta Crunch & Sync",
      chapter: "Execution Under Stress",
      getContextNote: (s) =>
        s.avoidedIssues.length > 0
          ? `Unresolved Debt (${s.avoidedIssues.length}): Tension is sitting in the room ahead of your beta launch. You can spend sprint time to clear the air.`
          : "Smooth Sailing So Far: With zero relational debt, you can focus cleanly on your beta launch strategy.",
      text: "Your private beta goes live in 48 hours, but a critical onboarding bug just surfaced. Meanwhile, friction from the past few months is palpable in how fast—or curtly—you two reply to each other.",
      getChoices: (s) => {
        const list = [
          {
            text: "Cut non-essential features together and ship a stable, narrower beta on time.",
            trust: 10,
            val: 12,
            avoided: null,
            tag: "Scope Control",
            alexQuote: "Cutting the dashboard widgets saves me 18 hours. Let's ship what actually works.",
            feedback: "By jointly cutting scope instead of pointing fingers, you hit your beta date with a clean core flow.",
            lesson: "Co-founders who de-scope together under pressure turn crunch time into a trust-building win."
          },
          {
            text: "Demand Alex pull two all-nighters to fix everything before launch without cutting scope.",
            trust: -18,
            val: 5,
            avoided: "Resentment over forced beta crunch (Month 6)",
            tag: "Top-Down",
            alexQuote: "Easy to promise the world when you aren't the one debugging at 3 a.m.",
            feedback: "The full feature set ships, but Alex feels treated like an employee rather than a partner.",
            lesson: "Treating a technical co-founder like a code factory erodes ownership and invites burnout."
          },
          {
            text: "Delay the beta silently on your own email list without aligning with Alex first.",
            trust: -12,
            val: -8,
            avoided: null,
            tag: "Unilateral",
            alexQuote: "Wait—you told users we delayed after I worked all weekend? Why didn't you ping me?",
            feedback: "Unilateral external communication makes both of you look disorganized and wastes Alex's sprint effort.",
            lesson: "Never surprise your co-founder with external commitments or schedule changes."
          }
        ];

        if (s.avoidedIssues.length > 0) {
          list.unshift({
            text: `Hold a candid "Clear the Air" retro to resolve "${s.avoidedIssues[0]}" before beta.`,
            trust: 14,
            val: -3,
            clearsDebt: true,
            isRepair: true,
            avoided: null,
            tag: "Debt Repair",
            alexQuote: "I'm really glad you brought that up. It's been bugging me for weeks—thanks for clearing the air.",
            feedback: "Delaying two sprint days trims short-term momentum (-$30k), but addressing the elephant in the room removes an avoided issue and restores deep trust.",
            lesson: "Paying down relational debt costs short-term speed, yet prevents catastrophic mid-stage blowups."
          });
        } else {
          list.push({
            text: "Run a quick 30-minute pre-beta alignment check to confirm roles for launch week.",
            trust: 8,
            val: 6,
            avoided: null,
            tag: "Proactive Sync",
            alexQuote: "Love how cleanly we're operating—I've got infra, you've got user onboarding.",
            feedback: "Because you have no backlog of unspoken conflict, a crisp sync boosts both execution and team confidence.",
            lesson: "Proactive alignment rituals prevent small misunderstandings from turning into relational debt."
          });
        }

        return list;
      }
    },
    {
      id: "m7",
      shortLabel: "M7",
      month: "Month 7: Missed Deadlines",
      chapter: "Commitment & Empathy",
      getContextNote: (s) =>
        s.forcedPivot
          ? "Pivot Aftermath: Alex has seemed noticeably less energized since the Month 3 compliance pivot."
          : null,
      text: "To pay rent, Alex quietly took a part-time consulting gig. Over the past three weeks he has missed product deadlines, leaving you working until midnight to cover customer commitments. Neither of you has brought it up yet.",
      getChoices: (s) => [
        {
          text: "Say nothing and keep quietly covering his missed tasks.",
          trust: -10,
          val: -6,
          avoided: "Silent burnout covering missed deadlines (Month 7)",
          tag: "Martyrdom",
          alexQuote: "Thanks for picking up those tickets... sorry things have been hectic.",
          feedback: "Avoiding confrontation breeds deep internal resentment and exhaustion while leaving Alex's cash crunch unsolved.",
          lesson: "Silent heroics aren't noble—they mask systemic capacity problems until one founder snaps."
        },
        {
          text: "Tell Alex that if he can't commit full-time, maybe he shouldn't be a co-founder.",
          trust: -30,
          val: -10,
          avoided: null,
          tag: "Ultimatum",
          alexQuote: "I'm literally trying not to get evicted. If that makes me 'uncommitted,' maybe we're done.",
          feedback: "Delivering an ultimatum while he's under financial stress triggers extreme defensiveness and pushes the partnership to the brink.",
          lesson: "Leading with accusation instead of curiosity turns solvable logistics problems into existential threats."
        },
        {
          text: "Sit down empathetically and recalibrate weekly hours and realistic sprint ownership.",
          trust: 15 + (s.forcedPivot ? 4 : 0),
          val: 8,
          avoided: null,
          tag: "Empathetic",
          alexQuote: "I felt awful hiding it. Having clear 20-hour deliverables means I can actually hit every deadline.",
          feedback: "Transparent scope-setting eliminates surprise misses and rebuilds mutual respect around real-life constraints.",
          lesson: "Sustainable startup velocity comes from honest capacity planning, not guilt-driven guesswork."
        },
        {
          text: "Propose paying both founders a modest survival stipend from company funds so Alex can drop the side gig.",
          trust: 14,
          val: 6,
          avoided: null,
          tag: "Structural Fix",
          alexQuote: "Even a bare-minimum stipend covers my rent—I'm 100% back on the product starting Monday.",
          feedback: "Using capital to buy back your co-founder's full focus solves the root financial cause and restores product velocity.",
          lesson: "Protecting founder survival needs is a high-ROI use of early capital."
        }
      ]
    },
    {
      id: "m8",
      shortLabel: "M8",
      month: "Month 8: The Enterprise Whale Request",
      chapter: "Product Focus vs. Revenue",
      text: "A large enterprise prospect offers $15,000 upfront—but only if you build a bespoke reporting module for them this month. Alex warns that custom one-off code will derail your core roadmap by six weeks right as you're recovering from last month's crunch.",
      getChoices: () => [
        {
          text: "Sit down with Alex to check if a lean 20% version can serve all users before replying to the prospect.",
          trust: 12,
          val: 12,
          avoided: null,
          tag: "Disciplined",
          alexQuote: "Finding the overlap that helps every user instead of building custom spaghetti? Count me in.",
          feedback: "You evaluate the deal together through product strategy, turning a risky one-off ask into a reusable feature.",
          lesson: "Great startups extract generalizable product insights from big customer asks instead of becoming a consulting shop."
        },
        {
          text: "Decline the bespoke build together and pitch them your standard product with an early-adopter discount.",
          trust: 10,
          val: 6,
          avoided: null,
          tag: "Focused",
          alexQuote: "Saying no to $15k hurts today, but our core roadmap stays intact.",
          feedback: "You turn down distracting cash to protect engineering sanity and product focus.",
          lesson: "Early focus is defined as much by the revenue you turn down as the deals you close."
        },
        {
          text: "Sign the $15,000 contract anyway and tell Alex to hack it together now and refactor later.",
          trust: -16,
          val: 14,
          avoided: "Forced custom consulting build against roadmap (Month 8)",
          tag: "Short-Term Cash",
          alexQuote: "Great—another six weeks of one-off code that nobody else will ever use.",
          feedback: "Short-term revenue bumps valuation, but overriding Alex's roadmap warning breeds technical debt and frustration.",
          lesson: "Trading product focus for custom cash traps technical teams in unscalable maintenance."
        },
        {
          text: "Avoid the call—let the prospect's emails go cold instead of aligning with Alex on a clear yes or no.",
          trust: -6,
          val: -8,
          avoided: "Stalled enterprise prospect without clear decision (Month 8)",
          tag: "Avoidant",
          alexQuote: "Did we ever reply to them, or are we just ghosting a $15k lead?",
          feedback: "Indecision wastes both a commercial opportunity and internal clarity.",
          lesson: "A fast, aligned 'no' beats drifting in ambiguity."
        }
      ]
    },
    {
      id: "m9",
      shortLabel: "M9",
      month: "Month 9: The 50,000 kr Student Grant",
      chapter: "Resource Allocation",
      text: "Great news: your startup just won a 50,000 kr innovation grant! Alex wants to put 20,000 kr toward a splashy launch event and a proper office. You believe every krone should extend runway and hire a contract developer. You must decide this week.",
      getChoices: () => [
        {
          text: "Give in and let Alex spend the 20,000 kr his way to avoid another argument.",
          trust: -6,
          val: -10,
          avoided: "Resentment over grant spending on office/event (Month 9)",
          tag: "Appeasement",
          alexQuote: "Great, I'll book the venue today. Looks like we're finally leveling up.",
          feedback: "You avoid an argument today, but watching scarce runway burn on perks erodes your confidence in Alex's judgment.",
          lesson: "Appeasement trades short-term harmony for long-term strategic doubt."
        },
        {
          text: "Wire the grant funds to a contract developer right away before Alex can object.",
          trust: -35,
          val: 10,
          avoided: null,
          tag: "Breach",
          alexQuote: "You spent the grant behind my back? We're supposed to be co-founders, not adversaries.",
          feedback: "Unilaterally spending shared company capital behind your partner's back is a severe breach of fiduciary and personal trust.",
          lesson: "Even the 'right' business spend becomes destructive if executed through betrayal."
        },
        {
          text: "Put both budgets side-by-side and score each against your 6-month Seed milestones.",
          trust: 15,
          val: 18,
          avoided: null,
          tag: "Goal-Anchored",
          alexQuote: "Looking at our Seed metrics, a contract dev actually gets us to 500 users way faster. Let's do it.",
          feedback: "Depersonalizing the debate and anchoring on objective 6-month milestones produces both strong alignment and maximum valuation impact.",
          lesson: "Great co-founders argue against shared goals, not against each other."
        },
        {
          text: "Propose a disciplined split: 5,000 kr for a lean community demo night and 45,000 kr for engineering.",
          trust: 10,
          val: 14,
          avoided: null,
          tag: "Compromise",
          alexQuote: "5,000 kr is plenty for pizza and a demo—and we still get the developer.",
          feedback: "A creative compromise that honors Alex's desire for visibility while protecting core engineering runway.",
          lesson: "Creative constraints often unlock the 'third option' that satisfies both founders' underlying needs."
        }
      ]
    },
    {
      id: "m10",
      shortLabel: "M10",
      month: "Month 10: The Investor's Backchannel",
      chapter: "Loyalty & Power",
      text: "After a pitch practice, an influential angel pulls you aside in the hallway: 'Your traction is solid, but Alex seems stretched thin. If you take 70% voting control and demote him to Lead Dev, I'll write a $150k check tomorrow.'",
      getChoices: () => [
        {
          text: "Reject the side-deal immediately and tell Alex transparently what the investor proposed.",
          trust: 16,
          val: -4,
          avoided: null,
          tag: "Fierce Loyalty",
          alexQuote: "Thank you for telling me straight up. Knowing you won't sell me out makes me want to run through walls for this company.",
          feedback: "You turn down quick conditional cash, forging unshakeable co-founder trust that seasoned Seed VCs immediately notice.",
          lesson: "Investors who try to divide co-founders before investing create toxic boards; loyalty under temptation cements true partnership."
        },
        {
          text: "Keep the conversation secret and quietly explore the angel's voting-control terms.",
          trust: -32,
          val: 16,
          avoided: "Secretly negotiating co-founder demotion with angel (Month 10)",
          tag: "Backchannel",
          alexQuote: "Why have you been taking private calls with that angel all week?",
          feedback: "Valuation ticks up on paper from investor interest, but covertly plotting against your partner poisons the core of the company.",
          lesson: "Backchanneling your co-founder almost always leaks during due diligence—and destroys the team from inside."
        },
        {
          text: "Tell the angel you only make governance decisions together, then debrief the feedback openly with Alex.",
          trust: 12,
          val: 12,
          avoided: null,
          tag: "Constructive",
          alexQuote: "Ouch—fair feedback though. Let's sharpen my investor pitch presence before Seed Week.",
          feedback: "You protect the partnership while turning harsh investor feedback into a concrete growth plan for both of you.",
          lesson: "Filtering external criticism through a united team turns investor pressure into founder growth."
        }
      ]
    },
    {
      id: "m11",
      shortLabel: "M11",
      month: "Month 11: Seed Deck & Title Friction",
      chapter: "Recognition & Readiness",
      getContextNote: (s) =>
        s.avoidedIssues.length > 0
          ? `Last Chance Before Due Diligence: You still have ${s.avoidedIssues.length} unresolved issue(s) sitting below the surface.`
          : "Pre-Seed Momentum: Your team alignment is clean heading into final investor meetings.",
      text: "Four weeks before Seed partner meetings, Alex opens the shared investor deck and sees himself listed as 'Technical Lead' while your slide bio reads 'Solo Visionary & CEO.' Exhausted from a brutal year, he asks quietly whether you still view him as an equal partner.",
      getChoices: (s) => {
        const list = [
          {
            text: "Update the deck immediately to 'Co-Founders' with shared credit and co-present the Seed narrative together.",
            trust: 12,
            val: 10,
            avoided: null,
            tag: "Shared Credit",
            alexQuote: "Seeing both our names on the cover slide as equals brings my energy right back for Seed Week.",
            feedback: "You validate Alex's sacrifices publicly in the pitch deck and project a unified founding front to Seed investors.",
            lesson: "Recognition costs zero cash and zero equity, yet withholding it destroys co-founder pride faster than almost anything."
          },
          {
            text: "Keep the 'CEO / Technical Lead' framing—say VCs want a single clear boss, without discussing his burnout.",
            trust: -16,
            val: 4,
            avoided: "Dismissed co-founder title & recognition concerns (Month 11)",
            tag: "Avoidant",
            alexQuote: "Fine. Leave the slide as-is. Just don't expect me to fake enthusiasm in Q&A.",
            feedback: "Investors see a clear org chart, but Alex enters Seed Week feeling sidelined and demoted right before diligence.",
            lesson: "Clear leadership roles never require erasing a co-founder's status—title friction right before fundraising often explodes in partner meetings."
          },
          {
            text: "Suggest entertaining a quiet $350k acqui-hire offer instead of risking Seed if Alex feels worn out.",
            trust: -8,
            val: -12,
            avoided: null,
            tag: "Cold Feet",
            alexQuote: "Wait—after everything we survived this year, you want to cash out for salaries right before the finish line?",
            feedback: "Floating an exit out of nowhere spooks Alex and signals wavering conviction right when investors look for grit.",
            lesson: "Don't confuse founder exhaustion with wanting to quit—solve burnout with recognition and support, not a premature exit."
          }
        ];

        if (s.avoidedIssues.length > 0) {
          list.unshift({
            text: `Fix the deck credit AND run a candid pre-Seed reset to resolve "${s.avoidedIssues[0]}" before VCs dig in.`,
            trust: 14,
            val: -2,
            clearsDebt: true,
            isRepair: true,
            avoided: null,
            tag: "Debt Repair",
            alexQuote: "Clearing the air before we walk into Sand Hill—or local VCs—makes me actually trust we're ready.",
            feedback: "You trade two prep days (-$20k momentum) to fix the deck recognition and finally resolve an old lingering conflict before due diligence.",
            lesson: "Cleaning up relational debt before fundraising prevents investors from discovering cracks during reference checks."
          });
        } else {
          list.push({
            text: "Pair the updated Co-Founder slide with a joint mock VC Q&A so both of you shine on stage.",
            trust: 8,
            val: 12,
            avoided: null,
            tag: "Prepared",
            alexQuote: "Practicing tough investor questions together makes us sound ten times sharper.",
            feedback: "Because your foundation is clean, joint pitch prep sharpens both your chemistry and your valuation story.",
            lesson: "Rehearsing hard questions together turns two individual founders into an investable team."
          });
        }

        return list;
      }
    },
    {
      id: "m12",
      shortLabel: "M12",
      month: "Month 12: Seed Round Due Diligence",
      chapter: "The Final Pitch",
      getContextNote: (s) =>
        s.avoidedIssues.length >= 2
          ? "Due Diligence Warning: Partners at the Seed fund sense unspoken tension between you and Alex during Q&A."
          : "Strong Signal: Investors note how effortlessly you and Alex finish each other's thoughts.",
      text: "It's final partner meeting day for your Seed Round. The lead VC asks a sharp question: 'What is the biggest disagreement you two have had this year, and how did you resolve it?'",
      getChoices: (s) => [
        {
          text: "Share an honest story of a real conflict, how you worked through it, and what governance rules came out of it.",
          trust: s.avoidedIssues.length >= 2 ? 4 : 10,
          val: s.avoidedIssues.length >= 2 ? 6 : 16,
          avoided: null,
          tag: "Authentic",
          alexQuote: "Standing up there together—we actually sound like a team built for Series A and beyond.",
          feedback: "Top-tier VCs know co-founder conflict is inevitable; showing you have a healthy system to resolve it spikes investor confidence.",
          lesson: "Resilient startups aren't conflict-free—they are conflict-capable."
        },
        {
          text: "Claim you two never really disagree because you're totally aligned on everything.",
          trust: -4,
          val: -10,
          avoided: "Presented unrealistic 'zero conflict' front to VCs (Month 12)",
          tag: "Polished Denial",
          alexQuote: "They didn't buy that 'we never disagree' line at all...",
          feedback: "Experienced investors see straight through 'we never argue'—it signals either conflict avoidance or lack of real debate.",
          lesson: "Claiming zero conflict is a classic due-diligence red flag for experienced investors."
        },
        {
          text: "Pivot the answer strictly to your revenue growth and market size, brushing past team dynamics.",
          trust: -6,
          val: 6,
          avoided: null,
          tag: "Metrics-Only",
          alexQuote: "Notice how they kept asking about team stability right after you dodged the question?",
          feedback: "Your traction metrics impress them, though the partners still jot down a question mark next to 'Founder Dynamics.'",
          lesson: "At Seed stage, investors bet as much on co-founder durability as on early numbers."
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
    const base = 0.55 * state.trust + 0.45 * state.valuation;
    const stabilityBonus = state.earlyAgreement && state.avoidedIssues.length === 0 ? 4 : 0;
    const debtDrag = state.avoidedIssues.length > 1 ? (state.avoidedIssues.length - 1) * 4 : 0;
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
      eruptionTrustCost = -20;
      state.trust = Math.max(0, state.trust + eruptionTrustCost);
      eruptionHTML = `
        <div class="eruption-alert">
          <strong>Cumulative Conflict Eruption!</strong> Because you avoided multiple disagreements
          (${state.avoidedIssues.map(escapeHtml).join("; ")}), unspoken tension boiled over into a major argument this week,
          costing an additional <strong>-20% Trust</strong>.
        </div>
      `;
      AudioEngine.playAlert();
    } else if (state.avoidedIssues.length >= 3 && c.avoided) {
      eruptionTrustCost = -10;
      eruptionValCost = -5;
      state.trust = Math.max(0, state.trust + eruptionTrustCost);
      state.valuation = Math.max(0, state.valuation + eruptionValCost);
      eruptionHTML = `
        <div class="eruption-alert">
          <strong>Chronic Avoidance Drag!</strong> With ${state.avoidedIssues.length} unresolved issues piling up,
          passive tension stalls product velocity (<strong>-10% Trust</strong>, <strong>-$50k Valuation</strong>).
        </div>
      `;
      AudioEngine.playAlert();
    } else if (c.trust >= 5) {
      AudioEngine.playPositive();
    } else if (c.trust <= -10) {
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

    const isLast = state.step + 1 >= SCENARIOS.length || state.trust <= 0 || state.entValue <= 0;
    const nextLabel = state.trust <= 0 || state.entValue <= 0
      ? "View Breakdown Report →"
      : isLast
      ? "See Seed Round Verdict →"
      : "Continue to Next Month →";

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
          <strong>Founder Lesson:</strong> ${escapeHtml(c.lesson)}
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
    if (state.trust <= 0 || state.entValue <= 0) {
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
    const boldCount = tags.filter((t) => ["Aggressive", "Capital-First", "Top-Down", "Undermining", "Breach", "Backchannel", "Ultimatum"].includes(t)).length;

    if (repairCount > 0 && state.trust >= 60) {
      return {
        name: "Resilient Mediator",
        desc: "You made mistakes early on, owned them directly, and repaired relational debt before it could sink the company."
      };
    }
    if (avoidCount >= 2) {
      return {
        name: "Conflict Avoider",
        desc: "You repeatedly prioritized short-term peace over candid governance—allowing unspoken tension to tax trust and velocity."
      };
    }
    if (boldCount >= 2) {
      return {
        name: "Unilateral Operator",
        desc: "You optimized for speed, control, or short-term capital at the expense of co-founder alignment and psychological safety."
      };
    }
    if (state.trust >= 70 && state.valuation >= 50) {
      return {
        name: "Transparent Architect",
        desc: "You paired high empathy with crisp governance—turning thorny equity, grant, and investor dilemmas into durable team strength."
      };
    }
    return {
      name: "Pragmatic Builder",
      desc: "You balanced practical compromises with steady execution, navigating early-stage ambiguity without losing sight of survival."
    };
  }

  function evaluateEnding() {
    if (state.trust <= 0 || state.entValue <= 0) {
      return {
        key: "Breakdown",
        title: "Ending: Breakdown (Loss)",
        badge: "Partnership Collapsed",
        color: "#ef4444",
        win: false,
        desc: "Trust or Entrepreneur Value hit zero before closing the Seed Round. Your co-founder walked out, and the startup imploded under internal conflict."
      };
    }
    if (state.trust >= 75 && state.entValue >= 70 && state.avoidedIssues.length === 0) {
      return {
        key: "Rocketship Partnership",
        title: "Ending: Rocketship Partnership (S-Rank!)",
        badge: "Oversubscribed Seed Round",
        color: "#10b981",
        win: true,
        desc: "Investors couldn't wire the Seed round fast enough. With zero relational debt, sky-high Trust, and strong traction, your founding team is built to scale through Series A and beyond."
      };
    }
    if (state.trust >= 60 && state.entValue >= 58 && state.avoidedIssues.length <= 1) {
      return {
        key: "Strong Partnership",
        title: "Ending: Strong Partnership (Full Win)",
        badge: "Seed Round Closed",
        color: "#10b981",
        win: true,
        desc: "You reached your Seed Round with both high Trust and high Entrepreneur Value! By confronting key disagreements constructively, your founding team passed investor due diligence with flying colors."
      };
    }
    if (state.trust < 45 && state.earlyAgreement && state.entValue >= 38) {
      return {
        key: "Clean Split",
        title: "Ending: Clean Split (Partial Win)",
        badge: "Orderly Transition",
        color: "#38bdf8",
        win: true,
        desc: "You and Alex realized your working styles had diverged and parted ways. Because you formalized equity and vesting early in Month 2, the cap table stayed clean and the startup survived to raise its Seed Round."
      };
    }
    if (state.trust >= 35 && state.entValue >= 38) {
      return {
        key: "Survived, But Strained",
        title: "Ending: Survived, But Strained",
        badge: "Bridge Round Only",
        color: "#f59e0b",
        win: false,
        desc: "You scraped together enough support to stay alive, but unresolved issues and strained trust scared off top Seed leads. Without resetting your communication habits, scaling will break the team."
      };
    }
    return {
      key: "Breakdown",
      title: "Ending: Breakdown (Loss)",
      badge: "Seed Pitch Rejected",
      color: "#ef4444",
      win: false,
      desc: "You reached Month 12, but your Trust and Entrepreneur Value were too low to convince Seed investors that your founding team could survive the next two years."
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
    window.addEventListener("beforeunload", () => SpeechEngine.stop());

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
