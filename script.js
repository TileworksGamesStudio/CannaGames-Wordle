/**
 * Word Guess — Professional Cannabis Rebrand
 * Preserves all underlying game systems, state keys, and mechanics intact.
 * Implements:
 *  - Floating cannabis leaves using the exact supplied verbatim SVG.
 *  - Atmospheric multi-depth movement with gentle natural rotation.
 *  - Authoritative time synchronization.
 *  - Full gameplay and modal orchestration.
 */

(function () {
  "use strict";

  // System Configuration
  const HOME_HUB_URL = "#"; // Parent portal link
  const STORAGE_KEY = "word_guess_data_v1";
  const SETTINGS_KEY = "word_guess_settings_v1";
  const CSV_FILE = "puzzles.csv";
  const WORDS_FILE = "words.txt";
  const RELEASE_TIMEZONE = "Europe/London";

  // Exact Verbatim Cannabis Leaf SVG Asset (Preserved Character-for-Character)
  const CANNABIS_LEAF_SVG = `<svg xmlns="http://w3.org" viewBox="0 0 512 546" width="512" height="546">
  <g fill="#2e7d32">
    <!-- Center / Main Leaf Blade -->
    <path d="M256,20 C240,100 245,180 256,260 C267,180 272,100 256,20 Z" />
    <!-- Upper Side Lobes -->
    <path d="M256,260 C210,140 140,100 80,110 C140,160 200,230 256,260 Z" />
    <path d="M256,260 C302,140 372,100 432,110 C372,160 312,230 256,260 Z" />
    <!-- Middle Side Lobes -->
    <path d="M256,260 C180,200 100,210 50,250 C110,280 180,290 256,260 Z" />
    <path d="M256,260 C332,200 412,210 462,250 C402,280 332,290 256,260 Z" />
    <!-- Lower Side Lobes -->
    <path d="M256,260 C190,270 130,310 90,360 C140,360 200,340 256,260 Z" />
    <path d="M256,260 C322,270 382,310 422,360 C372,360 312,340 256,260 Z" />
    <!-- Stem / Petiole -->
    <path d="M246,260 L246,510 L266,510 L266,260 Z" />
  </g>
</svg>`;

  // Built-in Fallback Puzzle Dataset
  const FALLBACK_PUZZLES = [
    { date: "2025-05-18", word: "PRIDE", definition: "A feeling of deep satisfaction from one's achievements." },
    { date: "2025-05-19", word: "CLEAN", definition: "Free from dirt, marks, or unwanted matter." },
    { date: "2025-05-20", word: "LIGHT", definition: "The natural agent that stimulates sight." },
    { date: "2025-05-21", word: "BRAVE", definition: "Ready to face danger or pain; showing courage." },
    { date: "2025-05-22", word: "SHARP", definition: "Having an edge or point that is able to cut or pierce." },
    { date: "2025-05-23", word: "SWIFT", definition: "Happening quickly or moving with great speed." },
    { date: "2025-05-24", word: "CRANE", definition: "A large tall machine used for moving heavy objects." }
  ];

  const VALID_WORDS = new Set();

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { bgAnimation: true };
      const parsed = JSON.parse(raw);
      return { bgAnimation: parsed.bgAnimation !== false };
    } catch (e) {
      return { bgAnimation: true };
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  function loadGameState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getInitialState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.stats) {
        return getInitialState();
      }
      return parsed;
    } catch (e) {
      return getInitialState();
    }
  }

  function saveGameState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getInitialState() {
    return {
      version: 1,
      stats: {
        played: 0,
        wins: 0,
        streak: 0,
        maxStreak: 0,
        distribution: [0, 0, 0, 0, 0, 0],
        lastDate: null
      },
      puzzles: {}
    };
  }

  function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQuotes && text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if ((c === "\n" || c === "\r") && !inQuotes) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else {
        currentField += c;
      }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) rows.push(currentRow);
    }
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => h.toLowerCase());
    return rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] || "";
      });
      return obj;
    });
  }

  function formatDateInTimezone(dateObj, timezone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
      return formatter.format(dateObj);
    } catch (e) {
      const year = dateObj.getUTCFullYear();
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
      const day = String(dateObj.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }

  // ==========================================================================
  // FLOATING BACKGROUND CANNABIS LEAF SYSTEM (Calm bottom -> top motion, 3 depths)
  // Utilizes the exact supplied SVG asset embedded verbatim
  // ==========================================================================
  class BackgroundAtmosphere {
    constructor(containerEl, isEnabled) {
      this.container = containerEl;
      this.enabled = isEnabled;
      this.activeTiles = [];
      this.animFrameId = null;
      this.lastSpawn = 0;
      this.maxTiles = 18;

      if (this.enabled) {
        this.init();
      }
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (enabled) {
        if (!this.animFrameId) this.loop(performance.now());
      } else {
        if (this.animFrameId) {
          cancelAnimationFrame(this.animFrameId);
          this.animFrameId = null;
        }
      }
    }

    init() {
      // Pre-distribute leaves throughout entire height so they're immediately visible
      const initialCount = 12;
      for (let i = 0; i < initialCount; i++) {
        const y = Math.random() * window.innerHeight;
        this.spawnTile(y);
      }
      this.loop(performance.now());
    }

    spawnTile(forcedY) {
      if (this.activeTiles.length >= this.maxTiles) return;

      const el = document.createElement("div");
      el.className = "float-tile";
      el.innerHTML = CANNABIS_LEAF_SVG;

      // 3 Depth layers: far, mid, near
      const depth = Math.random();
      let width, height, speed, opacity, blur;

      if (depth < 0.35) {
        // Far depth: small, subtle, slow
        width = 32;
        height = Math.round(width * (546 / 512));
        speed = 0.22 + Math.random() * 0.12;
        opacity = 0.18;
        blur = 0.8;
      } else if (depth < 0.75) {
        // Mid depth: medium presence
        width = 46;
        height = Math.round(width * (546 / 512));
        speed = 0.36 + Math.random() * 0.16;
        opacity = 0.28;
        blur = 0.3;
      } else {
        // Near depth: crisp botanical focal leaves
        width = 62;
        height = Math.round(width * (546 / 512));
        speed = 0.50 + Math.random() * 0.20;
        opacity = 0.40;
        blur = 0;
      }

      // Responsive scale compacting on narrow mobile viewports
      if (window.innerWidth < 420) {
        width = Math.round(width * 0.82);
        height = Math.round(width * (546 / 512));
      }

      const x = Math.random() * (window.innerWidth - width);
      const y = forcedY !== undefined ? forcedY : window.innerHeight + height + 10;
      const rot = (Math.random() - 0.5) * 40;
      const rotSpeed = (Math.random() - 0.5) * 0.06;
      const swayPhase = Math.random() * Math.PI * 2;
      const swaySpeed = 0.007 + Math.random() * 0.005;
      const swayAmp = 0.3 + Math.random() * 0.4;

      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.opacity = opacity;
      if (blur > 0) el.style.filter = `blur(${blur}px)`;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;

      this.container.appendChild(el);
      this.activeTiles.push({ el, x, y, width, height, speed, rot, rotSpeed, swayPhase, swaySpeed, swayAmp });
    }

    loop(timestamp) {
      if (!this.enabled) return;

      if (timestamp - this.lastSpawn > 2200 && this.activeTiles.length < this.maxTiles) {
        this.spawnTile();
        this.lastSpawn = timestamp;
      }

      for (let i = this.activeTiles.length - 1; i >= 0; i--) {
        const tile = this.activeTiles[i];
        tile.y -= tile.speed;
        tile.rot += tile.rotSpeed;
        tile.swayPhase += tile.swaySpeed;
        const currentX = tile.x + Math.sin(tile.swayPhase) * tile.swayAmp * 14;

        tile.el.style.transform = `translate3d(${currentX}px, ${tile.y}px, 0) rotate(${tile.rot}deg)`;

        if (tile.y < -tile.height - 30) {
          tile.el.remove();
          this.activeTiles.splice(i, 1);
        }
      }

      this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }
  }

  // ==========================================================================
  // WORD GUESS APPLICATION CONTROLLER
  // ==========================================================================
  class WordGuessApp {
    constructor() {
      this.settings = loadSettings();
      this.state = loadGameState();
      this.puzzles = [];
      this.currentPuzzle = null;
      this.authoritativeToday = null;
      this.activeInput = "";
      this.guesses = [];
      this.isComplete = false;
      this.toastTimeout = null;

      this.cacheElements();
      this.initAtmosphere();
      this.setupHomeLink();
      this.initBoard();
      this.initKeyboard();
      this.attachEvents();
      this.initAuthoritativeSession();
    }

    cacheElements() {
      this.views = {
        menu: document.getElementById("view-menu"),
        vault: document.getElementById("view-vault"),
        game: document.getElementById("view-game")
      };

      this.dom = {
        homeBtn: document.getElementById("btn-home"),
        headerGameControls: document.getElementById("header-game-controls"),

        navDaily: document.getElementById("nav-daily"),
        navVault: document.getElementById("nav-vault"),
        navSettings: document.getElementById("nav-settings"),
        navRules: document.getElementById("nav-rules"),

        menuDailyStatus: document.getElementById("menu-daily-status"),
        menuVaultCount: document.getElementById("menu-vault-count"),

        btnUtilityStats: document.getElementById("btn-utility-stats"),
        btnUtilityShare: document.getElementById("btn-utility-share"),
        btnUtilityPlus: document.getElementById("btn-utility-plus"),

        btnVaultBack: document.getElementById("btn-vault-back"),
        vaultList: document.getElementById("vault-list"),

        btnGameBack: document.getElementById("btn-game-back"),
        btnGameRules: document.getElementById("btn-game-rules"),
        btnGameStats: document.getElementById("btn-game-stats"),
        gamePuzzleTitle: document.getElementById("game-puzzle-title"),
        gamePuzzleDate: document.getElementById("game-puzzle-date"),
        gameStatusPill: document.getElementById("game-status-pill"),
        board: document.getElementById("board"),
        keyboard: document.getElementById("keyboard"),

        // How to Play Slide Panel (Right to Left)
        panelRulesOverlay: document.getElementById("panel-rules-overlay"),
        btnRulesClose: document.getElementById("btn-rules-close"),
        btnRulesDone: document.getElementById("btn-rules-done"),

        // Modals
        modalSettings: document.getElementById("modal-settings"),
        settingAnimOn: document.getElementById("setting-anim-on"),
        settingAnimOff: document.getElementById("setting-anim-off"),

        modalStats: document.getElementById("modal-stats"),
        statPlayed: document.getElementById("stat-played"),
        statWinrate: document.getElementById("stat-winrate"),
        statStreak: document.getElementById("stat-streak"),
        statMaxstreak: document.getElementById("stat-maxstreak"),
        distributionChart: document.getElementById("distribution-chart"),

        modalResult: document.getElementById("modal-result"),
        resultTitle: document.getElementById("result-title"),
        resultWord: document.getElementById("result-word"),
        resultDefinition: document.getElementById("result-definition"),
        resultSummary: document.getElementById("result-summary"),
        btnShareResult: document.getElementById("btn-share-result"),
        btnResultVault: document.getElementById("btn-result-vault"),

        toast: document.getElementById("toast")
      };
    }

    initAtmosphere() {
      const container = document.getElementById("bg-icons");
      this.atmosphere = new BackgroundAtmosphere(container, this.settings.bgAnimation);
      this.updateSettingUI();
    }

    setupHomeLink() {
      if (this.dom.homeBtn) {
        this.dom.homeBtn.setAttribute("href", HOME_HUB_URL);
      }
    }

    switchView(viewName) {
      Object.keys(this.views).forEach((key) => {
        if (key === viewName) {
          this.views[key].classList.remove("hidden");
        } else {
          this.views[key].classList.add("hidden");
        }
      });

      if (viewName === "game") {
        this.dom.headerGameControls.classList.remove("hidden");
      } else {
        this.dom.headerGameControls.classList.add("hidden");
      }

      if (viewName === "menu") {
        this.updateMenuSummary();
      } else if (viewName === "vault") {
        this.renderVault();
      }
    }

    async fetchAuthoritativeDate() {
      try {
        const response = await fetch(`${CSV_FILE}?_t=${Date.now()}`, { method: "HEAD" });
        const serverDate = response.headers.get("Date");
        if (serverDate) {
          const parsedMs = Date.parse(serverDate);
          if (!isNaN(parsedMs)) {
            return formatDateInTimezone(new Date(parsedMs), RELEASE_TIMEZONE);
          }
        }
      } catch (err) {}
      return formatDateInTimezone(new Date(), RELEASE_TIMEZONE);
    }

    async initAuthoritativeSession() {
      this.authoritativeToday = await this.fetchAuthoritativeDate();
      await Promise.all([this.loadPuzzleData(), this.loadWordList()]);
    }

    async loadWordList() {
      try {
        const response = await fetch(WORDS_FILE);
        if (!response.ok) throw new Error("Dictionary fetch failed");
        const text = await response.text();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const w = lines[i].trim().toUpperCase();
          if (w.length === 5) VALID_WORDS.add(w);
        }
      } catch (err) {
        console.warn("Could not load words.txt; falling back to puzzle words:", err);
      }
    }

    async loadPuzzleData() {
      try {
        const response = await fetch(CSV_FILE);
        if (!response.ok) throw new Error("Puzzles CSV fetch failed");
        const text = await response.text();
        const parsed = parseCSV(text);

        const list = parsed
          .filter((p) => p.date && p.word && p.word.length === 5)
          .map((p) => ({
            date: p.date,
            word: p.word.toUpperCase().trim(),
            definition: p.definition ? p.definition.trim() : ""
          }));

        this.puzzles = list.length > 0 ? list : FALLBACK_PUZZLES;
      } catch (err) {
        this.puzzles = FALLBACK_PUZZLES;
      }

      this.puzzles.forEach((p) => VALID_WORDS.add(p.word));
      this.updateMenuSummary();
    }

    getDailyPuzzle() {
      if (!this.authoritativeToday) return null;
      const todayMatch = this.puzzles.find((p) => p.date === this.authoritativeToday);
      if (todayMatch) return todayMatch;

      const pastOrToday = this.puzzles
        .filter((p) => p.date <= this.authoritativeToday)
        .sort((a, b) => b.date.localeCompare(a.date));

      return pastOrToday.length > 0 ? pastOrToday[0] : null;
    }

    updateMenuSummary() {
      const daily = this.getDailyPuzzle();

      if (!daily) {
        this.dom.menuDailyStatus.textContent = "No puzzle available";
        this.dom.navDaily.classList.add("disabled");
      } else {
        this.dom.navDaily.classList.remove("disabled");
        const record = this.state.puzzles[daily.date];
        if (record && record.completed) {
          this.dom.menuDailyStatus.textContent = record.won
            ? `Completed (${record.guesses.length}/6)`
            : "Completed (X/6)";
        } else if (record && record.guesses && record.guesses.length > 0) {
          this.dom.menuDailyStatus.textContent = `In Progress (${record.guesses.length}/6)`;
        } else {
          this.dom.menuDailyStatus.textContent = "Ready to play";
        }
      }

      if (this.authoritativeToday) {
        const releasedPast = this.puzzles.filter(
          (p) => p.date < this.authoritativeToday && (!daily || p.date !== daily.date)
        );
        this.dom.menuVaultCount.textContent = `${releasedPast.length} available`;
      } else {
        this.dom.menuVaultCount.textContent = "0 available";
      }
    }

    initBoard() {
      this.dom.board.innerHTML = "";
      for (let r = 0; r < 6; r++) {
        const row = document.createElement("div");
        row.className = "board-row";
        row.setAttribute("role", "row");
        for (let c = 0; c < 5; c++) {
          const tile = document.createElement("div");
          tile.className = "tile";
          tile.setAttribute("role", "gridcell");
          tile.setAttribute("aria-label", "Empty");
          row.appendChild(tile);
        }
        this.dom.board.appendChild(row);
      }
    }

    initKeyboard() {
      const layout = [
        ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
        ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
        ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"]
      ];

      this.dom.keyboard.innerHTML = "";
      layout.forEach((rowKeys) => {
        const rowEl = document.createElement("div");
        rowEl.className = "keyboard-row";
        rowKeys.forEach((key) => {
          const btn = document.createElement("button");
          btn.className = "key";
          btn.dataset.key = key;
          btn.setAttribute("type", "button");
          btn.textContent = key === "BACK" ? "⌫" : key;
          btn.setAttribute("aria-label", key === "BACK" ? "Backspace" : key);

          if (key === "ENTER" || key === "BACK") {
            btn.classList.add("key-wide");
          }

          btn.addEventListener("click", () => this.handleInput(key));
          rowEl.appendChild(btn);
        });
        this.dom.keyboard.appendChild(rowEl);
      });
    }

    attachEvents() {
      window.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const activeDialog = document.querySelector("dialog[open]");
        const rulesPanelOpen = this.dom.panelRulesOverlay.classList.contains("active");
        if (activeDialog || rulesPanelOpen) return;

        if (this.views.game.classList.contains("hidden")) return;

        if (e.key === "Enter") {
          this.handleInput("ENTER");
        } else if (e.key === "Backspace") {
          this.handleInput("BACK");
        } else if (/^[a-zA-Z]$/.test(e.key)) {
          this.handleInput(e.key.toUpperCase());
        }
      });

      this.dom.navDaily.addEventListener("click", () => {
        const daily = this.getDailyPuzzle();
        if (daily) this.startPuzzle(daily, true);
        else this.showToast("No puzzle currently released");
      });

      this.dom.navVault.addEventListener("click", () => this.switchView("vault"));
      this.dom.navSettings.addEventListener("click", () => this.openDialog(this.dom.modalSettings));
      this.dom.navRules.addEventListener("click", () => this.openRulesPanel());

      this.dom.btnUtilityStats.addEventListener("click", () => this.renderStatsModal());
      this.dom.btnUtilityShare.addEventListener("click", () => this.shareGameLink());
      this.dom.btnUtilityPlus.addEventListener("click", () => {
        this.showToast("Tileworks Games Suite");
      });

      this.dom.btnVaultBack.addEventListener("click", () => this.switchView("menu"));
      this.dom.btnGameBack.addEventListener("click", () => this.switchView("menu"));
      this.dom.btnGameRules.addEventListener("click", () => this.openRulesPanel());
      this.dom.btnGameStats.addEventListener("click", () => this.renderStatsModal());

      this.dom.btnRulesClose.addEventListener("click", () => this.closeRulesPanel());
      this.dom.btnRulesDone.addEventListener("click", () => this.closeRulesPanel());
      this.dom.panelRulesOverlay.addEventListener("click", (e) => {
        if (e.target === this.dom.panelRulesOverlay) {
          this.closeRulesPanel();
        }
      });

      this.dom.settingAnimOn.addEventListener("click", () => this.setAnimationPreference(true));
      this.dom.settingAnimOff.addEventListener("click", () => this.setAnimationPreference(false));

      this.dom.btnShareResult.addEventListener("click", () => this.shareResult());
      this.dom.btnResultVault.addEventListener("click", () => {
        this.dom.modalResult.close();
        this.switchView("vault");
      });

      document.querySelectorAll("[data-close]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.dataset.close);
          if (target && typeof target.close === "function") target.close();
        });
      });
    }

    openRulesPanel() {
      this.dom.panelRulesOverlay.classList.add("active");
      this.dom.panelRulesOverlay.setAttribute("aria-hidden", "false");
    }

    closeRulesPanel() {
      this.dom.panelRulesOverlay.classList.remove("active");
      this.dom.panelRulesOverlay.setAttribute("aria-hidden", "true");
    }

    setAnimationPreference(on) {
      this.settings.bgAnimation = on;
      saveSettings(this.settings);
      this.atmosphere.setEnabled(on);
      this.updateSettingUI();
    }

    updateSettingUI() {
      if (this.settings.bgAnimation) {
        this.dom.settingAnimOn.classList.add("active");
        this.dom.settingAnimOff.classList.remove("active");
      } else {
        this.dom.settingAnimOn.classList.remove("active");
        this.dom.settingAnimOff.classList.add("active");
      }
    }

    startPuzzle(puzzle, isDaily) {
      if (!puzzle || !puzzle.date) return;

      if (this.authoritativeToday && puzzle.date > this.authoritativeToday) {
        this.showToast("This puzzle is not yet released.");
        return;
      }

      this.currentPuzzle = puzzle;
      this.activeInput = "";
      this.guesses = [];
      this.isComplete = false;

      this.dom.gamePuzzleTitle.textContent = isDaily ? "DAILY PUZZLE" : `VAULT: ${puzzle.date}`;
      this.dom.gamePuzzleDate.textContent = isDaily ? `Today (${puzzle.date})` : puzzle.date;

      this.resetBoardAndKeyboard();

      const saved = this.state.puzzles[puzzle.date];
      if (saved && Array.isArray(saved.guesses)) {
        saved.guesses.forEach((guess) => this.applyGuess(guess));

        if (saved.completed) {
          this.isComplete = true;
          this.dom.gameStatusPill.textContent = saved.won ? "SOLVED" : "GAME OVER";
          this.dom.gameStatusPill.classList.remove("hidden");
        } else {
          this.dom.gameStatusPill.classList.add("hidden");
        }
      } else {
        this.dom.gameStatusPill.classList.add("hidden");
      }

      this.switchView("game");
    }

    resetBoardAndKeyboard() {
      const tiles = this.dom.board.querySelectorAll(".tile");
      tiles.forEach((t) => {
        t.textContent = "";
        t.className = "tile";
        t.removeAttribute("data-state");
        t.setAttribute("aria-label", "Empty");
      });

      const keys = this.dom.keyboard.querySelectorAll(".key");
      keys.forEach((k) => k.classList.remove("correct", "present", "absent"));
    }

    handleInput(key) {
      if (this.isComplete) return;

      if (key === "ENTER") {
        this.submitGuess();
      } else if (key === "BACK") {
        if (this.activeInput.length > 0) {
          this.activeInput = this.activeInput.slice(0, -1);
          this.renderActiveRow();
        }
      } else if (/^[A-Z]$/.test(key)) {
        if (this.activeInput.length < 5) {
          this.activeInput += key;
          this.renderActiveRow();
        }
      }
    }

    renderActiveRow() {
      const rowIndex = this.guesses.length;
      if (rowIndex >= 6) return;

      const row = this.dom.board.children[rowIndex];
      for (let c = 0; c < 5; c++) {
        const tile = row.children[c];
        const letter = this.activeInput[c] || "";
        tile.textContent = letter;
        tile.dataset.state = letter ? "active" : "";
        tile.setAttribute("aria-label", letter || "Empty");
      }
    }

    submitGuess() {
      if (this.activeInput.length !== 5) {
        this.showToast("Not enough letters");
        return;
      }

      const guess = this.activeInput.toUpperCase();
      if (!VALID_WORDS.has(guess)) {
        this.showToast("Not in word list");
        return;
      }

      this.applyGuess(guess);
      this.activeInput = "";

      const won = guess === this.currentPuzzle.word;
      const lost = !won && this.guesses.length >= 6;

      if (won || lost) {
        this.isComplete = true;
        this.dom.gameStatusPill.textContent = won ? "SOLVED" : "GAME OVER";
        this.dom.gameStatusPill.classList.remove("hidden");
        this.recordProgress(won);
        setTimeout(() => this.openResultModal(won), 450);
      } else {
        this.saveCurrentProgress(false, false);
      }
    }

    evaluateGuess(guess, target) {
      const evaluation = Array(5).fill("absent");
      const targetLetters = target.split("");
      const guessLetters = guess.split("");
      const targetFreq = {};

      for (const char of targetLetters) {
        targetFreq[char] = (targetFreq[char] || 0) + 1;
      }

      for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
          evaluation[i] = "correct";
          targetFreq[guessLetters[i]]--;
        }
      }

      for (let i = 0; i < 5; i++) {
        if (evaluation[i] !== "correct" && targetFreq[guessLetters[i]] > 0) {
          evaluation[i] = "present";
          targetFreq[guessLetters[i]]--;
        }
      }

      return evaluation;
    }

    applyGuess(guess) {
      const rowIndex = this.guesses.length;
      if (rowIndex >= 6) return;

      const row = this.dom.board.children[rowIndex];
      const evaluation = this.evaluateGuess(guess, this.currentPuzzle.word);

      this.guesses.push(guess);

      for (let c = 0; c < 5; c++) {
        const tile = row.children[c];
        const status = evaluation[c];
        tile.textContent = guess[c];
        tile.className = `tile ${status}`;
        tile.removeAttribute("data-state");
        tile.setAttribute("aria-label", `${guess[c]}, ${status}`);

        const keyBtn = this.dom.keyboard.querySelector(`[data-key="${guess[c]}"]`);
        if (keyBtn) {
          const isCorrect = keyBtn.classList.contains("correct");
          const isPresent = keyBtn.classList.contains("present");

          if (status === "correct") {
            keyBtn.className = "key correct";
          } else if (status === "present" && !isCorrect) {
            keyBtn.className = "key present";
          } else if (status === "absent" && !isCorrect && !isPresent) {
            keyBtn.className = "key absent";
          }
        }
      }
    }

    saveCurrentProgress(completed, won) {
      this.state.puzzles[this.currentPuzzle.date] = {
        guesses: this.guesses,
        completed,
        won
      };
      saveGameState(this.state);
    }

    recordProgress(won) {
      this.saveCurrentProgress(true, won);

      const daily = this.getDailyPuzzle();
      const isDaily = daily && this.currentPuzzle.date === daily.date;

      if (isDaily) {
        const stats = this.state.stats;
        if (stats.lastDate !== daily.date) {
          stats.played++;
          stats.lastDate = daily.date;
          if (won) {
            stats.wins++;
            stats.streak++;
            if (stats.streak > stats.maxStreak) stats.maxStreak = stats.streak;
            const guessIdx = this.guesses.length - 1;
            if (guessIdx >= 0 && guessIdx < 6) {
              stats.distribution[guessIdx]++;
            }
          } else {
            stats.streak = 0;
          }
          saveGameState(this.state);
        }
      }
    }

    renderVault() {
      this.dom.vaultList.innerHTML = "";

      if (!this.authoritativeToday) {
        const msg = document.createElement("p");
        msg.className = "section-note";
        msg.textContent = "Loading vault...";
        this.dom.vaultList.appendChild(msg);
        return;
      }

      const archiveItems = this.puzzles
        .filter((p) => p.date < this.authoritativeToday)
        .sort((a, b) => b.date.localeCompare(a.date));

      if (archiveItems.length === 0) {
        const msg = document.createElement("p");
        msg.className = "section-note";
        msg.textContent = "No archived puzzles released yet.";
        this.dom.vaultList.appendChild(msg);
        return;
      }

      archiveItems.forEach((p) => {
        const card = document.createElement("div");
        card.className = "vault-card";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");

        const progress = this.state.puzzles[p.date];
        let badgeClass = "unplayed";
        let badgeText = "UNPLAYED";
        let statusText = "Tap to solve";

        if (progress && progress.completed) {
          if (progress.won) {
            badgeClass = "solved";
            badgeText = `${progress.guesses.length}/6`;
            statusText = "Completed";
          } else {
            badgeClass = "failed";
            badgeText = "FAILED";
            statusText = "Not solved";
          }
        } else if (progress && progress.guesses && progress.guesses.length > 0) {
          badgeClass = "unplayed";
          badgeText = `${progress.guesses.length}/6`;
          statusText = "In progress";
        }

        card.innerHTML = `
          <div class="vault-card-info">
            <span class="vault-card-date">${p.date}</span>
            <span class="vault-card-status">${statusText}</span>
          </div>
          <span class="vault-badge ${badgeClass}">${badgeText}</span>
        `;

        const startAction = () => this.startPuzzle(p, false);
        card.addEventListener("click", startAction);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startAction();
          }
        });

        this.dom.vaultList.appendChild(card);
      });
    }

    renderStatsModal() {
      const stats = this.state.stats;
      this.dom.statPlayed.textContent = stats.played;
      this.dom.statWinrate.textContent =
        stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) + "%" : "0%";
      this.dom.statStreak.textContent = stats.streak;
      this.dom.statMaxstreak.textContent = stats.maxStreak;

      this.dom.distributionChart.innerHTML = "";
      const maxCount = Math.max(...stats.distribution, 1);

      stats.distribution.forEach((count, i) => {
        const row = document.createElement("div");
        row.className = "dist-row";

        const label = document.createElement("span");
        label.textContent = i + 1;

        const track = document.createElement("div");
        track.className = "dist-bar-track";

        const bar = document.createElement("div");
        bar.className = "dist-bar-fill";
        bar.style.width = `${Math.max((count / maxCount) * 100, 8)}%`;
        bar.textContent = count;

        const currentSolvedIndex = this.guesses.length - 1;
        if (
          this.isComplete &&
          this.state.puzzles[this.currentPuzzle?.date]?.won &&
          currentSolvedIndex === i
        ) {
          bar.classList.add("highlight");
        }

        track.appendChild(bar);
        row.appendChild(label);
        row.appendChild(track);
        this.dom.distributionChart.appendChild(row);
      });

      this.openDialog(this.dom.modalStats);
    }

    openResultModal(won) {
      this.dom.resultTitle.textContent = won ? "WELL DONE!" : "BETTER LUCK NEXT TIME";
      this.dom.resultWord.textContent = this.currentPuzzle.word;
      this.dom.resultDefinition.textContent = this.currentPuzzle.definition || "";
      this.dom.resultSummary.textContent = won
        ? `Solved in ${this.guesses.length} of 6 attempts.`
        : "Did not guess the word in 6 attempts.";

      this.openDialog(this.dom.modalResult);
    }

    shareResult() {
      const record = this.state.puzzles[this.currentPuzzle.date];
      const count = record && record.won ? this.guesses.length : "X";
      let text = `Word Guess (${this.currentPuzzle.date}) ${count}/6\n\n`;

      this.guesses.forEach((guess) => {
        const evalResult = this.evaluateGuess(guess, this.currentPuzzle.word);
        evalResult.forEach((status) => {
          text += status === "correct" ? "🟩" : status === "present" ? "🟨" : "⬛";
        });
        text += "\n";
      });

      if (navigator.share) {
        navigator.share({ title: "Word Guess", text: text.trim() }).catch(() => {
          this.copyToClipboard(text.trim());
        });
      } else {
        this.copyToClipboard(text.trim());
      }
    }

    shareGameLink() {
      const shareData = {
        title: "Word Guess",
        text: "Can you solve today's Word Guess puzzle?",
        url: window.location.href
      };

      if (navigator.share) {
        navigator.share(shareData).catch(() => {
          this.copyToClipboard(window.location.href);
        });
      } else {
        this.copyToClipboard(window.location.href);
      }
    }

    copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          this.showToast("Link copied to clipboard!");
        });
      } else {
        this.showToast("Clipboard unavailable");
      }
    }

    showToast(message) {
      this.dom.toast.textContent = message;
      this.dom.toast.classList.remove("hidden");
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        this.dom.toast.classList.add("hidden");
      }, 2200);
    }

    openDialog(modal) {
      if (modal && typeof modal.showModal === "function") {
        modal.showModal();
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    new WordGuessApp();
  });
})();