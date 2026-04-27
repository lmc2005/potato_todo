(function () {
  const state = {
    subjects: [],
    tasks: [],
    timer: null,
    completionKey: null,
    calendarMode: "day",
    activeReminderId: null,
    activeReminderEvent: null,
  };
  const DATA_COLORS = ["#2563eb", "#0f766e", "#d97706", "#e11d48", "#0891b2", "#7c3aed", "#15803d"];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const namedField = (form, name) => form?.elements?.namedItem(name) || null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...options,
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const detail = data && data.detail ? data.detail : `Request failed: ${response.status}`;
      throw new Error(detail);
    }
    return data;
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("visible"), 2400);
  }

  function formData(form) {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (value === "") {
        data[key] = null;
        return;
      }
      if (key.endsWith("_id") || key.endsWith("_minutes") || key === "total_rounds" || key === "estimated_minutes" || key === "duration_minutes") {
        data[key] = Number(value);
        return;
      }
      data[key] = value;
    });
    return data;
  }

  function formatDuration(seconds) {
    seconds = Math.max(Number(seconds || 0), 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${m}m ${String(s).padStart(2, "0")}s`;
  }

  function formatClock(seconds) {
    seconds = Math.max(Number(seconds || 0), 0);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function dateTimeLabel(value) {
    if (!value) return "No date";
    const date = new Date(value);
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function dateLabel(value) {
    if (!value) return "No date";
    const date = new Date(value);
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function toLocalInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function localDateKey(date) {
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function currentWeekRange() {
    const today = new Date(`${window.APP_BOOT.today}T00:00:00`);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(today.getDate() + diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: localDateKey(start), end: localDateKey(end) };
  }

  function dateRangeAroundToday(daysAhead = 1) {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + daysAhead);
    return { start: localDateKey(start), end: localDateKey(end) };
  }

  function subjectById(id) {
    return state.subjects.find((subject) => Number(subject.id) === Number(id));
  }

  function cssVar(name, root = document.body) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function setupCanvas(canvas, height = 320, minWidth = 520) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(rect.width || minWidth, minWidth);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return { ctx, width, height };
  }

  function drawEmptyChart(canvas, message = "No data") {
    const chart = setupCanvas(canvas);
    if (!chart) return;
    const { ctx, width, height } = chart;
    ctx.fillStyle = "rgba(102, 112, 133, 0.86)";
    ctx.font = "600 14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(message, width / 2, height / 2);
    ctx.textAlign = "start";
  }

  function colorForIndex(index) {
    return DATA_COLORS[index % DATA_COLORS.length];
  }

  function initSceneCanvas() {
    const canvas = $("#scene-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const particles = Array.from({ length: 22 }, (_, index) => ({
      seed: index * 0.37 + 1,
      depth: 0.22 + (index % 7) * 0.11,
      speed: 0.14 + (index % 5) * 0.03,
      spread: 0.16 + (index % 4) * 0.13,
      size: 18 + (index % 6) * 8,
    }));
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frameId = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (timestamp) => {
      const accent = cssVar("--accent") || "#4f7cff";
      const accent2 = cssVar("--accent-2") || "#22c7cf";
      const accent3 = cssVar("--accent-3") || "#ff9f43";
      const t = timestamp * 0.001;
      const horizon = height * 0.32;
      const vanishingX = width * (0.54 + Math.sin(t * 0.17) * 0.06);

      ctx.clearRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(width * 0.52, height * 0.34, 0, width * 0.52, height * 0.34, width * 0.42);
      glow.addColorStop(0, "rgba(255,255,255,0.06)");
      glow.addColorStop(0.34, "rgba(79,124,255,0.08)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.lineWidth = 1;
      for (let i = 1; i <= 9; i += 1) {
        const ratio = i / 9;
        const y = horizon + Math.pow(ratio, 1.82) * (height - horizon);
        ctx.strokeStyle = `rgba(255,255,255,${0.035 + ratio * 0.06})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      for (let i = -8; i <= 8; i += 1) {
        const x = vanishingX + i * (width / 11);
        ctx.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)";
        ctx.beginPath();
        ctx.moveTo(vanishingX, horizon);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      ctx.restore();

      particles.forEach((particle, index) => {
        const wave = t * particle.speed + particle.seed;
        const depth = 0.5 + Math.sin(wave * 0.7) * 0.5;
        const px = width * (0.14 + particle.spread) + Math.sin(wave) * width * 0.24 + (index % 3) * width * 0.08;
        const py = horizon + Math.cos(wave * 0.9) * height * 0.12 + depth * height * 0.38;
        const size = particle.size * (0.72 + depth * 0.72);
        const angle = wave * 0.6;
        const color = index % 3 === 0 ? accent : index % 3 === 1 ? accent2 : accent3;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.strokeStyle = `${color}44`;
        ctx.fillStyle = `${color}14`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.roundRect(-size * 0.6, -size * 0.2, size * 1.2, size * 0.4, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });

      ctx.strokeStyle = `${accent}88`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(width * 0.72, height * 0.2, 72 + Math.sin(t * 1.4) * 12, 0, Math.PI * 2);
      ctx.stroke();

      frameId = window.requestAnimationFrame(draw);
    };

    resize();
    frameId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (!document.hidden && !frameId) {
        resize();
        frameId = window.requestAnimationFrame(draw);
      }
    });
  }

  function bindTiltPanels() {
    if (!window.matchMedia("(pointer:fine)").matches) return;
    $$("[data-tilt]").forEach((panel) => {
      panel.addEventListener("pointermove", (event) => {
        const rect = panel.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        const rotateY = (px - 0.5) * 7;
        const rotateX = (0.5 - py) * 7;
        panel.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
        panel.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
      });
      panel.addEventListener("pointerleave", () => {
        panel.style.setProperty("--tilt-x", "0deg");
        panel.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  async function loadBasics() {
    const [subjects, tasks] = await Promise.all([api("/api/subjects"), api("/api/tasks")]);
    state.subjects = subjects;
    state.tasks = tasks;
    fillSubjectSelects();
    fillTaskSelects();
  }

  function fillSubjectSelects() {
    $$("select[name='subject_id']").forEach((select) => {
      const keepEmpty = select.querySelector("option[value='']") !== null;
      const current = select.value;
      select.innerHTML = keepEmpty ? '<option value="">No subject</option>' : "";
      state.subjects.forEach((subject) => {
        const option = document.createElement("option");
        option.value = subject.id;
        option.textContent = subject.name;
        select.appendChild(option);
      });
      if (current) select.value = current;
    });
  }

  function fillTaskSelects() {
    $$("select[name='task_id']").forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">No linked task</option>';
      state.tasks
        .filter((task) => task.status !== "done")
        .forEach((task) => {
          const option = document.createElement("option");
          option.value = task.id;
          option.textContent = task.title;
          select.appendChild(option);
        });
      if (current) select.value = current;
    });
  }

  async function pollTimer() {
    try {
      const timer = await api("/api/timer/current");
      state.timer = timer;
      renderTimer(timer);
      if (timer.completed) notifyCompletion(timer.completed);
    } catch (error) {
      console.error(error);
    }
  }

  function renderTimer(timer) {
    const dashTitle = $("#dash-active-timer");
    const dashMeta = $("#dash-active-meta");
    const focusCard = $("#focus-card");
    const timerStage = $("#timer-stage");
    const focusClock = $("#focus-clock");
    const focusMode = $("#focus-mode");
    const focusMeta = $("#focus-meta");
    const subjectPill = $("#focus-subject-pill");
    const phasePill = $("#focus-phase-pill");
    const progressPill = $("#focus-progress-pill");
    const elapsedStat = $("#focus-elapsed");
    const remainingStat = $("#focus-remaining");
    const roundStat = $("#focus-round");
    const sessionFlow = $("#session-flow");
    const pauseResume = $("#pause-resume");
    const stopButton = $("#stop-timer");
    const skipButton = $("#skip-pomodoro");

    if (!timer || !timer.active) {
      if (focusCard) {
        focusCard.dataset.state = "idle";
        focusCard.style.setProperty("--session-color", "#2563eb");
      }
      if (timerStage) {
        timerStage.style.setProperty("--progress", "0deg");
        timerStage.style.setProperty("--session-color", "#2563eb");
      }
      if (dashTitle) dashTitle.textContent = "No active timer";
      if (dashMeta) dashMeta.textContent = "Ready when you are.";
      if (focusClock) focusClock.textContent = "00:00:00";
      if (focusMode) focusMode.textContent = "Ready";
      if (focusMeta) focusMeta.textContent = "Choose a subject and start.";
      if (subjectPill) subjectPill.textContent = "No subject";
      if (phasePill) phasePill.textContent = "Idle";
      if (progressPill) progressPill.textContent = "0%";
      if (elapsedStat) elapsedStat.textContent = "0m 00s";
      if (remainingStat) remainingStat.textContent = "Open";
      if (roundStat) roundStat.textContent = "--";
      if (sessionFlow) {
        sessionFlow.style.setProperty("--session-color", "#2563eb");
        $$("span", sessionFlow).forEach((bar) => bar.classList.remove("active"));
      }
      if (pauseResume) {
        pauseResume.disabled = true;
        pauseResume.textContent = "Pause";
      }
      if (stopButton) stopButton.disabled = true;
      if (skipButton) skipButton.disabled = true;
      return;
    }

    const subject = subjectById(timer.subject_id);
    const task = state.tasks.find((item) => Number(item.id) === Number(timer.task_id));
    const hasRemaining = timer.remaining_seconds !== null && timer.remaining_seconds !== undefined;
    const seconds = hasRemaining ? timer.remaining_seconds : timer.elapsed_seconds;
    const mode = timer.mode === "pomodoro" ? `Pomodoro ${timer.pomodoro_phase}` : timer.mode.replace("_", " ");
    const meta = [subject ? subject.name : "Unknown subject", task ? task.title : null, timer.is_paused ? "Paused" : null].filter(Boolean).join(" / ");
    const isBreak = timer.mode === "pomodoro" && timer.pomodoro_phase === "break";
    const visualColor = isBreak ? "#0f766e" : (subject ? subject.color : "#2563eb");
    const progressRatio = timer.countdown_seconds && hasRemaining
      ? Math.max(0, Math.min(1, 1 - (timer.remaining_seconds / timer.countdown_seconds)))
      : Math.max(0.04, Math.min(1, (timer.elapsed_seconds % 3600) / 3600));

    if (focusCard) {
      focusCard.dataset.state = timer.is_paused ? "paused" : (isBreak ? "break" : "active");
      focusCard.style.setProperty("--session-color", visualColor);
    }
    if (timerStage) {
      timerStage.style.setProperty("--session-color", visualColor);
      timerStage.style.setProperty("--progress", `${Math.round(progressRatio * 360)}deg`);
    }
    if (sessionFlow) {
      sessionFlow.style.setProperty("--session-color", visualColor);
      const activeBars = Math.max(1, Math.ceil(progressRatio * 12));
      $$("span", sessionFlow).forEach((bar, index) => {
        bar.classList.toggle("active", index < activeBars && !timer.is_paused);
      });
    }

    if (dashTitle) dashTitle.textContent = timer.remaining_seconds !== null && timer.remaining_seconds !== undefined ? formatClock(timer.remaining_seconds) : formatDuration(timer.elapsed_seconds);
    if (dashMeta) dashMeta.textContent = `${mode} / ${meta}`;
    if (focusClock) focusClock.textContent = formatClock(seconds);
    if (focusMode) focusMode.textContent = mode;
    if (focusMeta) focusMeta.textContent = meta;
    if (subjectPill) subjectPill.textContent = subject ? subject.name : "Unknown subject";
    if (phasePill) phasePill.textContent = timer.is_paused ? "Paused" : (isBreak ? "Break" : "Focus");
    if (progressPill) progressPill.textContent = timer.mode === "count_up" ? "Live" : `${Math.round(progressRatio * 100)}%`;
    if (elapsedStat) elapsedStat.textContent = formatDuration(timer.elapsed_seconds);
    if (remainingStat) remainingStat.textContent = hasRemaining ? formatDuration(timer.remaining_seconds) : "Open";
    if (roundStat) roundStat.textContent = timer.mode === "pomodoro" ? `${timer.pomodoro_round}/${timer.pomodoro_total_rounds}` : "--";
    if (pauseResume) {
      pauseResume.disabled = false;
      pauseResume.textContent = timer.is_paused ? "Resume" : "Pause";
    }
    if (stopButton) stopButton.disabled = false;
    if (skipButton) skipButton.disabled = timer.mode !== "pomodoro";
  }

  function notifyCompletion(reason) {
    const key = `${reason}-${Date.now()}`;
    if (state.completionKey && Date.now() - state.completionKey < 1000) return;
    state.completionKey = Date.now();
    const title = reason === "focus_complete" ? "Focus round complete" : reason === "break_complete" ? "Break complete" : "Focus complete";
    const message = reason === "pomodoro_complete" ? "Your Pomodoro cycle is complete." : "Your study data has been saved.";
    toast(title);
    playBeep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body: message });
    }
    const modal = $("#completion-modal");
    if (modal) {
      $("#completion-title").textContent = title;
      $("#completion-message").textContent = message;
      if (typeof modal.showModal === "function" && !modal.open) modal.showModal();
    }
    refreshCurrentPage();
  }

  function playBeep() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.04;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        ctx.close();
      }, 180);
    } catch (error) {
      console.debug("Audio notification unavailable", error);
    }
  }

  async function refreshCurrentPage() {
    const page = document.body.dataset.page;
    if (page === "dashboard") await loadDashboard();
    if (page === "tasks") await loadTasks();
    if (page === "calendar") await loadEvents();
    if (page === "analytics") await loadAnalytics();
  }

  async function checkScheduleReminders() {
    try {
      const range = dateRangeAroundToday(1);
      const events = await api(`/api/schedule-events?start=${range.start}&end=${range.end}`);
      const now = new Date();
      const upcoming = events
        .map((event) => ({ ...event, startDate: new Date(event.start_at) }))
        .filter((event) => {
          const diff = event.startDate - now;
          return diff > 0 && diff <= 5 * 60 * 1000 + 15000 && !isReminderAcknowledged(event);
        })
        .sort((a, b) => a.startDate - b.startDate)[0];
      if (upcoming) showScheduleReminder(upcoming);
    } catch (error) {
      console.debug("Schedule reminder check failed", error);
    }
  }

  function isReminderAcknowledged(event) {
    const key = reminderKey(event);
    return localStorage.getItem(key) === "acknowledged";
  }

  function reminderKey(event) {
    return `study-reminder:${event.id}:${event.start_at}`;
  }

  function showScheduleReminder(event) {
    if (state.activeReminderId === `${event.id}:${event.start_at}`) return;
    state.activeReminderId = `${event.id}:${event.start_at}`;
    state.activeReminderEvent = event;
    const modal = $("#schedule-reminder-modal");
    const subject = subjectById(event.subject_id);
    $("#schedule-reminder-title").textContent = event.title;
    $("#schedule-reminder-message").textContent = "This study block starts in five minutes. Prepare your materials and open the task if needed.";
    $("#schedule-reminder-time").textContent = dateTimeLabel(event.start_at);
    $("#schedule-reminder-subject").textContent = subject ? subject.name : "No subject";
    playBeep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Study block starts soon", { body: `${event.title} starts at ${dateTimeLabel(event.start_at)}.` });
    }
    if (modal && typeof modal.showModal === "function" && !modal.open) {
      const onClose = () => {
        modal.removeEventListener("close", onClose);
        localStorage.setItem(reminderKey(event), "acknowledged");
        state.activeReminderId = null;
        state.activeReminderEvent = null;
      };
      modal.addEventListener("close", onClose);
      modal.showModal();
      return;
    }
    alert(`Study block starts soon: ${event.title}`);
    localStorage.setItem(reminderKey(event), "acknowledged");
    state.activeReminderId = null;
    state.activeReminderEvent = null;
  }

  function renderTaskItem(task, compact = false) {
    const isDone = task.status === "done";
    const subject = task.subject ? `<span class="chip subject-chip" style="border-color:${escapeHtml(task.subject_color)}">${escapeHtml(task.subject)}</span>` : "";
    const due = task.due_at ? `<span class="chip">Due ${escapeHtml(dateTimeLabel(task.due_at))}</span>` : "";
    const estimate = task.estimated_minutes ? `<span class="chip">${task.estimated_minutes} min</span>` : "";
    const completed = task.completed_at ? `<span class="chip task-complete-chip">Completed ${escapeHtml(dateTimeLabel(task.completed_at))}</span>` : "";
    const notes = task.notes ? `<small>${escapeHtml(task.notes)}</small>` : "";
    const actions = compact
      ? ""
      : `<div class="row-actions">
          ${isDone ? "" : `<button class="secondary-button task-start" data-id="${task.id}" data-subject="${task.subject_id || ""}">Start Focus</button>`}
          <button class="secondary-button task-done" data-id="${task.id}">${task.status === "done" ? "Reopen" : "Done"}</button>
          <button class="danger-button task-delete" data-id="${task.id}">Delete</button>
        </div>`;
    return `<div class="list-item task-list-item ${isDone ? "is-done" : ""}">
      <div class="list-item-header">
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          ${notes}
        </div>
        <span class="chip task-status-chip ${isDone ? "is-done" : ""}">${escapeHtml(task.status.replace("_", " "))}</span>
      </div>
      <div class="tag-row">${subject}<span class="chip">${escapeHtml(task.priority)}</span>${due}${estimate}${completed}</div>
      ${actions}
    </div>`;
  }

  function sortTasksForDisplay(tasks, filter = "") {
    const statusRank = { todo: 0, in_progress: 1, done: 2 };
    const dueValue = (task) => task.due_at ? new Date(task.due_at).getTime() : Number.POSITIVE_INFINITY;
    const createdValue = (task) => task.created_at ? new Date(task.created_at).getTime() : 0;
    return tasks.slice().sort((left, right) => {
      if (!filter) {
        const leftRank = statusRank[left.status] ?? 99;
        const rightRank = statusRank[right.status] ?? 99;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      const dueDiff = dueValue(left) - dueValue(right);
      if (dueDiff !== 0) return dueDiff;
      return createdValue(right) - createdValue(left);
    });
  }

  function launchCelebration() {
    const canvas = $("#celebration-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add("is-active");

    const originY = height * 0.72;
    const bursts = [width * 0.28, width * 0.5, width * 0.72];
    const particles = [];
    bursts.forEach((originX, burstIndex) => {
      for (let index = 0; index < 34; index += 1) {
        const angle = (Math.PI * 2 * index) / 34 + burstIndex * 0.2;
        const speed = 2.4 + Math.random() * 4.1;
        particles.push({
          x: originX,
          y: originY - Math.random() * 70,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.8 - Math.random() * 2.4,
          life: 50 + Math.random() * 16,
          size: 3 + Math.random() * 4,
          color: DATA_COLORS[(index + burstIndex) % DATA_COLORS.length],
        });
      }
    });

    let frame = 0;
    const step = () => {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        if (particle.life <= 0) return;
        particle.life -= 1;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.12;
        particle.vx *= 0.992;
        const alpha = Math.max(0, particle.life / 66);
        ctx.fillStyle = `${particle.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      });

      frame += 1;
      if (frame < 72) {
        window.requestAnimationFrame(step);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      canvas.classList.remove("is-active");
    };
    window.requestAnimationFrame(step);
  }

  function showTaskCompleteModal(taskTitle) {
    const modal = $("#task-complete-modal");
    const message = $("#task-complete-message");
    const name = $("#task-complete-name");
    if (message) message.textContent = "Completed tasks +1";
    if (name) name.textContent = taskTitle;
    if (modal && typeof modal.showModal === "function" && !modal.open) {
      modal.showModal();
      return;
    }
    toast("Completed tasks +1");
  }

  function celebrateTaskCompletion(taskTitle) {
    launchCelebration();
    showTaskCompleteModal(taskTitle);
  }

  function renderEventItem(event) {
    const subject = subjectById(event.subject_id);
    return `<div class="timeline-item" style="border-left-color:${subject ? escapeHtml(subject.color) : "#2563eb"}">
      <strong>${escapeHtml(event.title)}</strong>
      <small>${escapeHtml(dateTimeLabel(event.start_at))} - ${escapeHtml(dateTimeLabel(event.end_at))}${subject ? ` / ${escapeHtml(subject.name)}` : ""}</small>
      ${event.notes ? `<small>${escapeHtml(event.notes)}</small>` : ""}
      <form class="event-edit-form" data-id="${event.id}">
        <input type="datetime-local" name="start_at" value="${toLocalInputValue(event.start_at)}" required>
        <input type="datetime-local" name="end_at" value="${toLocalInputValue(event.end_at)}" required>
        <button class="secondary-button" type="submit">Save</button>
      </form>
      <div class="row-actions">
        <button class="danger-button event-delete" data-id="${event.id}">Delete</button>
      </div>
    </div>`;
  }

  function renderEventSummary(event) {
    const subject = subjectById(event.subject_id);
    return `<div class="list-item">
      <div class="list-item-header">
        <strong>${escapeHtml(event.title)}</strong>
        <span class="chip">${escapeHtml(new Date(event.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span>
      </div>
      <div class="tag-row">
        <span class="chip">${escapeHtml(dateLabel(event.start_at))}</span>
        ${subject ? `<span class="chip subject-chip" style="border-color:${escapeHtml(subject.color)}">${escapeHtml(subject.name)}</span>` : ""}
      </div>
      ${event.notes ? `<small>${escapeHtml(event.notes)}</small>` : ""}
    </div>`;
  }

  async function loadDashboard() {
    const form = $("#dashboard-range");
    const params = new URLSearchParams(new FormData(form));
    const [stats, tasks, events] = await Promise.all([
      api(`/api/stats?${params}`),
      api("/api/tasks?status=todo"),
      api(`/api/schedule-events?start=${window.APP_BOOT.today}&end=${window.APP_BOOT.today}`),
    ]);
    $("#dash-total").textContent = formatDuration(stats.total_seconds);
    $("#dash-hero-total").textContent = formatDuration(stats.total_seconds);
    $("#dash-hero-subtitle").textContent = `${stats.session_count} sessions / ${stats.streak_days} day streak`;
    $("#dash-session-count").textContent = `${stats.session_count} sessions`;
    $("#dash-streak").textContent = `${stats.streak_days} days`;
    $("#dash-open-tasks").textContent = tasks.length;
    const heroMeter = $("#dash-hero-meter");
    if (heroMeter) {
      const topSubject = stats.subject_breakdown[0];
      heroMeter.style.setProperty("--meter-color", topSubject ? topSubject.color : "#2563eb");
      heroMeter.style.setProperty("--meter-progress", `${Math.max(8, Math.round((topSubject ? topSubject.share : 0) * 360))}deg`);
    }
    drawDashboardSparkline(stats.daily_trend, stats.subject_breakdown[0]?.color || "#2563eb");

    const subjects = $("#dash-subjects");
    if (subjects) {
      subjects.classList.toggle("empty-state", stats.subject_breakdown.length === 0);
      subjects.innerHTML = stats.subject_breakdown.length
        ? stats.subject_breakdown.map((row, index) => `<div class="subject-bar" style="--bar-color:${escapeHtml(row.color || colorForIndex(index))}; --share:${Math.max(4, Math.round(row.share * 100))}%;">
            <div class="subject-bar-header"><span>${escapeHtml(row.name)}</span><span>${formatDuration(row.seconds)}</span></div>
            <div class="subject-track"><div class="subject-fill"></div></div>
            <small>${Math.round(row.share * 100)}% of selected range</small>
          </div>`).join("")
        : "No study data in this range.";
    }

    const taskList = $("#dash-tasks");
    if (taskList) {
      taskList.classList.toggle("empty-state", tasks.length === 0);
      taskList.innerHTML = tasks.length ? tasks.slice(0, 5).map((task) => renderTaskItem(task, true)).join("") : "No tasks yet.";
    }

    const eventList = $("#dash-events");
    if (eventList) {
      eventList.classList.toggle("empty-state", events.length === 0);
      eventList.innerHTML = events.length ? events.slice(0, 5).map(renderEventSummary).join("") : "No events today.";
    }
  }

  function drawDashboardSparkline(rows, color) {
    const canvas = $("#dash-sparkline");
    const chart = setupCanvas(canvas, 130, 320);
    if (!chart) return;
    const { ctx, width, height } = chart;
    if (!rows || rows.length === 0 || rows.every((row) => !row.seconds)) {
      ctx.fillStyle = "rgba(102, 112, 133, 0.82)";
      ctx.font = "600 13px system-ui";
      ctx.fillText("Trend appears here after sessions", 18, height / 2);
      return;
    }
    const max = Math.max(...rows.map((row) => row.seconds), 1);
    const padding = 18;
    const points = rows.map((row, index) => {
      const x = padding + (index / Math.max(rows.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - (row.seconds / max) * (height - padding * 2);
      return { x, y };
    });
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.45, "#0f766e");
    gradient.addColorStop(1, "#d97706");
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineTo(points[points.length - 1].x, height - padding);
    ctx.lineTo(points[0].x, height - padding);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, padding, 0, height);
    fill.addColorStop(0, "rgba(37, 99, 235, 0.18)");
    fill.addColorStop(1, "rgba(217, 119, 6, 0.02)");
    ctx.fillStyle = fill;
    ctx.fill();
    points.forEach((point, index) => {
      if (index === points.length - 1 || rows[index].seconds === max) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    });
  }

  function bindDashboard() {
    const form = $("#dashboard-range");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadDashboard();
      } catch (error) {
        toast(error.message);
      }
    });
    loadDashboard().catch((error) => toast(error.message));
  }

  async function startFocusForTask(taskId, subjectId) {
    if (!subjectId) {
      toast("Assign a subject before starting focus.");
      return;
    }
    await api("/api/timer/start", {
      method: "POST",
      body: JSON.stringify({ mode: "count_up", subject_id: Number(subjectId), task_id: Number(taskId) }),
    });
    toast("Focus timer started.");
    await pollTimer();
  }

  async function loadTasks() {
    const filter = $("#task-status-filter")?.value || "";
    const tasks = await api(`/api/tasks${filter ? `?status=${encodeURIComponent(filter)}` : ""}`);
    const orderedTasks = sortTasksForDisplay(tasks, filter);
    state.tasks = orderedTasks;
    fillTaskSelects();
    const list = $("#task-list");
    if (!list) return;
    list.classList.toggle("empty-state", orderedTasks.length === 0);
    list.innerHTML = orderedTasks.length ? orderedTasks.map((task) => renderTaskItem(task)).join("") : "No tasks yet.";
  }

  function bindTasks() {
    $("#task-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("/api/tasks", { method: "POST", body: JSON.stringify(formData(form)) });
        form.reset();
        toast("Task created.");
        await loadTasks();
      } catch (error) {
        toast(error.message);
      }
    });
    $("#task-status-filter")?.addEventListener("change", () => loadTasks().catch((error) => toast(error.message)));
    $("#task-list")?.addEventListener("click", async (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      try {
        if (target.classList.contains("task-start")) await startFocusForTask(target.dataset.id, target.dataset.subject);
        if (target.classList.contains("task-done")) {
          const task = state.tasks.find((item) => Number(item.id) === Number(target.dataset.id));
          const completing = Boolean(task && task.status !== "done");
          await api(`/api/tasks/${target.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: task && task.status === "done" ? "todo" : "done" }),
          });
          await loadTasks();
          if (completing && task) celebrateTaskCompletion(task.title);
        }
        if (target.classList.contains("task-delete")) {
          await api(`/api/tasks/${target.dataset.id}`, { method: "DELETE" });
          await loadTasks();
        }
      } catch (error) {
        toast(error.message);
      }
    });
    loadTasks().catch((error) => toast(error.message));
  }

  async function loadEvents() {
    const form = $("#calendar-range");
    const params = form ? new URLSearchParams(new FormData(form)) : new URLSearchParams({ start: window.APP_BOOT.today, end: window.APP_BOOT.today });
    const events = await api(`/api/schedule-events?${params}`);
    const list = $("#event-list");
    if (!list) return;
    list.classList.toggle("empty-state", events.length === 0);
    updateCalendarSummary(events);
    updateCalendarModeButtons();
    const boardTitle = $("#calendar-board-title");
    const boardSubtitle = $("#calendar-board-subtitle");
    if (boardTitle) boardTitle.textContent = state.calendarMode === "month" ? "Month Schedule" : state.calendarMode === "week" ? "Week Schedule" : state.calendarMode === "custom" ? "Custom Schedule" : "Day Schedule";
    if (boardSubtitle) boardSubtitle.textContent = `${state.calendarMode[0].toUpperCase()}${state.calendarMode.slice(1)} view`;
    if (!events.length) {
      list.innerHTML = "No events in this range.";
      return;
    }
    list.innerHTML = state.calendarMode === "month" ? renderMonthCalendar(events, form) : renderEventsByDay(events);
  }

  function updateCalendarSummary(events) {
    const totalSeconds = events.reduce((sum, event) => {
      const start = new Date(event.start_at);
      const end = new Date(event.end_at);
      return sum + Math.max(0, (end - start) / 1000);
    }, 0);
    const upcoming = events
      .map((event) => ({ ...event, startDate: new Date(event.start_at) }))
      .filter((event) => event.startDate > new Date())
      .sort((a, b) => a.startDate - b.startDate)[0];
    const count = $("#calendar-event-count");
    const planned = $("#calendar-planned-time");
    const next = $("#calendar-next-event");
    if (count) count.textContent = String(events.length);
    if (planned) planned.textContent = formatDuration(totalSeconds);
    if (next) next.textContent = upcoming ? upcoming.title : "None";
  }

  function updateCalendarModeButtons() {
    $$("#calendar-mode-control button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.calendarMode);
    });
  }

  function renderEventsByDay(events) {
    const groups = new Map();
    events.forEach((event) => {
      const key = new Date(event.start_at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });
    return Array.from(groups.entries())
      .map(([day, rows]) => `<section class="day-section"><h3>${escapeHtml(day)}</h3>${rows.map(renderEventItem).join("")}</section>`)
      .join("");
  }

  function renderMonthCalendar(events, form) {
    const startValue = namedField(form, "start")?.value || window.APP_BOOT.today;
    const start = new Date(`${startValue}T00:00:00`);
    const gridStart = new Date(start);
    gridStart.setDate(1);
    const firstDay = gridStart.getDay();
    gridStart.setDate(gridStart.getDate() - firstDay);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return date;
    });
    const eventsByDate = new Map();
    events.forEach((event) => {
      const key = event.start_at.slice(0, 10);
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key).push(event);
    });
    const month = start.getMonth();
    return `<div class="month-grid">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="month-weekday">${day}</div>`).join("")}
      ${days.map((day) => {
        const key = localDateKey(day);
        const rows = eventsByDate.get(key) || [];
        const isMuted = day.getMonth() !== month;
        const isToday = key === window.APP_BOOT.today;
        return `<button class="month-cell ${isMuted ? "muted-month" : ""} ${isToday ? "today" : ""}" type="button" data-date="${key}">
          <div class="month-date">${day.getDate()}</div>
          <div class="month-events">
            ${rows.slice(0, 3).map(renderMonthEvent).join("")}
            ${rows.length > 3 ? `<span class="month-more">+${rows.length - 3} more</span>` : ""}
          </div>
        </button>`;
      }).join("")}
    </div>`;
  }

  function renderMonthEvent(event) {
    const subject = subjectById(event.subject_id);
    const color = subject ? subject.color : "#2563eb";
    return `<span class="month-event" style="--event-color:${escapeHtml(color)}">${escapeHtml(new Date(event.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))} ${escapeHtml(event.title)}</span>`;
  }

  function setEventDefaults() {
    const form = $("#event-form");
    if (!form) return;
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const startField = namedField(form, "start_at");
    const endField = namedField(form, "end_at");
    if (startField) startField.value = toLocalInputValue(now.toISOString());
    if (endField) endField.value = toLocalInputValue(end.toISOString());
  }

  function bindCalendar() {
    setEventDefaults();
    const setModeRange = (mode) => {
      state.calendarMode = mode;
      const form = $("#calendar-range");
      const startField = namedField(form, "start");
      const endField = namedField(form, "end");
      const today = new Date(`${window.APP_BOOT.today}T00:00:00`);
      if (mode === "day") {
        if (startField) startField.value = window.APP_BOOT.today;
        if (endField) endField.value = window.APP_BOOT.today;
      }
      if (mode === "week") {
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const start = new Date(today);
        start.setDate(today.getDate() + diff);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        if (startField) startField.value = localDateKey(start);
        if (endField) endField.value = localDateKey(end);
      }
      if (mode === "month") {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        if (startField) startField.value = localDateKey(start);
        if (endField) endField.value = localDateKey(end);
      }
      loadEvents().catch((error) => toast(error.message));
    };
    $("#calendar-day")?.addEventListener("click", () => {
      setModeRange("day");
    });
    $("#calendar-week")?.addEventListener("click", () => {
      setModeRange("week");
    });
    $("#calendar-month")?.addEventListener("click", () => {
      setModeRange("month");
    });
    $("#calendar-range")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        state.calendarMode = "custom";
        await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });
    $("#event-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("/api/schedule-events", { method: "POST", body: JSON.stringify(formData(form)) });
        form.reset();
        setEventDefaults();
        toast("Event created.");
        await loadBasics();
        await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });
    $("#event-list")?.addEventListener("submit", async (event) => {
      if (!event.target.classList.contains("event-edit-form")) return;
      event.preventDefault();
      try {
        await api(`/api/schedule-events/${event.target.dataset.id}`, { method: "PATCH", body: JSON.stringify(formData(event.target)) });
        toast("Event updated.");
        await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });
    $("#event-list")?.addEventListener("click", async (event) => {
      const monthCell = event.target.closest(".month-cell[data-date]");
      if (monthCell) {
        state.calendarMode = "day";
        updateCalendarModeButtons();
        const form = $("#calendar-range");
        const startField = namedField(form, "start");
        const endField = namedField(form, "end");
        if (startField) startField.value = monthCell.dataset.date;
        if (endField) endField.value = monthCell.dataset.date;
        await loadEvents();
        $("#event-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const button = event.target.closest(".event-delete");
      if (!button) return;
      try {
        await api(`/api/schedule-events/${button.dataset.id}`, { method: "DELETE" });
        await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });
    loadEvents().catch((error) => toast(error.message));
  }

  async function loadAnalytics() {
    const form = $("#analytics-range");
    const params = new URLSearchParams(new FormData(form));
    const week = currentWeekRange();
    const [stats, todayStats, weekStats] = await Promise.all([
      api(`/api/stats?${params}`),
      api(`/api/stats?start=${window.APP_BOOT.today}&end=${window.APP_BOOT.today}`),
      api(`/api/stats?start=${week.start}&end=${week.end}`),
    ]);
    $("#analytics-total").textContent = formatDuration(stats.total_seconds);
    $("#analytics-sessions").textContent = `${stats.session_count} sessions`;
    $("#analytics-streak").textContent = `${stats.streak_days} days`;
    $("#analytics-active-subjects").textContent = String(stats.subject_breakdown.length);
    $("#analytics-active-subjects-detail").textContent = stats.subject_breakdown.length
      ? `${stats.subject_breakdown.length} subjects with tracked focus time`
      : "No study sessions yet.";

    const subjectList = $("#analytics-subjects");
    subjectList.classList.toggle("empty-state", stats.subject_breakdown.length === 0);
    subjectList.innerHTML = stats.subject_breakdown.length
      ? stats.subject_breakdown.map((row, index) => `<div class="subject-bar" style="--bar-color:${escapeHtml(row.color || colorForIndex(index))}; --share:${Math.max(4, Math.round(row.share * 100))}%;">
          <div class="subject-bar-header"><span>${escapeHtml(row.name)}</span><span>${formatDuration(row.seconds)}</span></div>
          <div class="subject-track"><div class="subject-fill"></div></div>
          <small>${Math.round(row.share * 100)}% share / ${row.minutes} minutes</small>
        </div>`).join("")
      : "No subject data.";

    const taskList = $("#analytics-tasks");
    taskList.classList.toggle("empty-state", stats.task_ranking.length === 0);
    taskList.innerHTML = stats.task_ranking.length
      ? stats.task_ranking.map((row) => `<div class="list-item"><div class="list-item-header"><strong>${escapeHtml(row.title)}</strong><span>${formatDuration(row.seconds)}</span></div></div>`).join("")
      : "No task timing data.";
    drawTrend(stats.daily_trend);
    drawTodayFocusTime(todayStats.subject_breakdown);
    drawWeeklySubjectProgress(weekStats.goal_completion);
    drawRhythmHeatmap(stats.sessions);
  }

  function drawTrend(rows) {
    const canvas = $("#trend-chart");
    const chart = setupCanvas(canvas, 320, 640);
    if (!chart) return;
    const { ctx, width, height } = chart;
    if (!rows || rows.length === 0 || rows.every((row) => !row.seconds)) {
      drawEmptyChart(canvas, "No daily trend data");
      return;
    }
    const max = Math.max(...rows.map((row) => row.seconds), 1);
    const left = 62;
    const right = 24;
    const top = 30;
    const bottom = 54;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const points = rows.map((row, index) => {
      const x = left + (index / Math.max(rows.length - 1, 1)) * plotW;
      const y = top + plotH - (row.seconds / max) * plotH;
      return { x, y, row };
    });

    ctx.strokeStyle = "rgba(23,32,42,0.10)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(102,112,133,0.92)";
    ctx.font = "600 11px system-ui";
    [0, 0.5, 1].forEach((tick) => {
      const y = top + plotH - tick * plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(formatDuration(max * tick), 10, y + 4);
    });
    ctx.beginPath();
    ctx.moveTo(left, top + plotH);
    ctx.lineTo(width - right, top + plotH);
    ctx.strokeStyle = "rgba(23,32,42,0.18)";
    ctx.stroke();

    const lineGradient = ctx.createLinearGradient(left, 0, width - right, 0);
    lineGradient.addColorStop(0, "#2563eb");
    lineGradient.addColorStop(0.45, "#0f766e");
    lineGradient.addColorStop(0.72, "#d97706");
    lineGradient.addColorStop(1, "#e11d48");
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
        return;
      }
      const previous = points[index - 1];
      const midX = (previous.x + point.x) / 2;
      ctx.quadraticCurveTo(previous.x, previous.y, midX, (previous.y + point.y) / 2);
      ctx.quadraticCurveTo(point.x, point.y, point.x, point.y);
    });
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.lineTo(points[points.length - 1].x, top + plotH);
    ctx.lineTo(points[0].x, top + plotH);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, top, 0, top + plotH);
    fill.addColorStop(0, "rgba(37,99,235,0.18)");
    fill.addColorStop(0.55, "rgba(15,118,110,0.08)");
    fill.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = fill;
    ctx.fill();

    points.forEach((point, index) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.row.seconds ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = point.row.seconds ? colorForIndex(index) : "rgba(23,32,42,0.22)";
      ctx.fill();
      const shouldLabel = rows.length <= 10 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0;
      if (shouldLabel) {
        ctx.fillStyle = "rgba(23, 32, 42, 0.64)";
        ctx.font = "600 11px system-ui";
        ctx.fillText(dateLabel(point.row.date), Math.max(8, point.x - 20), height - 18);
      }
    });
  }

  function drawTodayFocusTime(rows) {
    const canvas = $("#subject-chart");
    const chart = setupCanvas(canvas, 320, 440);
    if (!chart) return;
    const { ctx, width, height } = chart;
    if (!rows || rows.length === 0) {
      drawEmptyChart(canvas, "No focus time today");
      return;
    }
    const cx = width * 0.38;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.30;
    const total = rows.reduce((sum, row) => sum + row.seconds, 0) || 1;
    let start = -Math.PI / 2;
    rows.forEach((row, index) => {
      const angle = (row.seconds / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.strokeStyle = row.color || colorForIndex(index);
      ctx.lineWidth = 28;
      ctx.stroke();
      start += angle;
    });
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 26, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.76)";
    ctx.fill();
    ctx.fillStyle = "#17202a";
    ctx.font = "700 20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(formatDuration(total), cx, cy - 2);
    ctx.font = "600 12px system-ui";
    ctx.fillStyle = "rgba(102,112,133,0.92)";
    ctx.fillText("today", cx, cy + 20);
    ctx.textAlign = "start";
    rows.slice(0, 5).forEach((row, index) => {
      const y = 68 + index * 38;
      ctx.fillStyle = row.color || colorForIndex(index);
      ctx.fillRect(width * 0.68, y - 10, 14, 14);
      ctx.fillStyle = "#17202a";
      ctx.font = "700 13px system-ui";
      ctx.fillText(row.name, width * 0.68 + 22, y);
      ctx.fillStyle = "rgba(102,112,133,0.92)";
      ctx.font = "600 12px system-ui";
      ctx.fillText(`${Math.round(row.share * 100)}% / ${row.minutes}m`, width * 0.68 + 22, y + 16);
    });
  }

  function drawWeeklySubjectProgress(rows) {
    const canvas = $("#goal-chart");
    const chart = setupCanvas(canvas, 320, 440);
    if (!chart) return;
    const { ctx, width } = chart;
    if (!rows || rows.length === 0) {
      drawEmptyChart(canvas, "No weekly subject progress");
      return;
    }
    const sorted = rows.slice().sort((a, b) => b.completion - a.completion).slice(0, 6);
    const left = 118;
    const right = 26;
    const trackWidth = width - left - right;
    sorted.forEach((row, index) => {
      const y = 46 + index * 42;
      const color = colorForIndex(index + 1);
      const pct = Math.max(0, Math.min(row.completion, 1.25));
      ctx.fillStyle = "#17202a";
      ctx.font = "700 13px system-ui";
      ctx.fillText(row.name.slice(0, 16), 22, y + 8);
      ctx.fillStyle = "rgba(23,32,42,0.09)";
      ctx.fillRect(left, y, trackWidth, 13);
      const gradient = ctx.createLinearGradient(left, y, left + trackWidth, y);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "#0f766e");
      ctx.fillStyle = gradient;
      ctx.fillRect(left, y, trackWidth * Math.min(pct, 1), 13);
      if (pct > 1) {
        ctx.fillStyle = "rgba(217,119,6,0.86)";
        ctx.fillRect(left + trackWidth - 3, y - 3, 6, 19);
      }
      ctx.fillStyle = "rgba(102,112,133,0.95)";
      ctx.font = "600 12px system-ui";
      ctx.fillText(`${Math.round(row.completion * 100)}%`, left + trackWidth - 44, y + 31);
    });
  }

  function drawRhythmHeatmap(sessions) {
    const canvas = $("#rhythm-chart");
    const chart = setupCanvas(canvas, 320, 640);
    if (!chart) return;
    const { ctx, width } = chart;
    if (!sessions || sessions.length === 0) {
      drawEmptyChart(canvas, "No rhythm data");
      return;
    }
    const hours = Array.from({ length: 16 }, (_, index) => index + 6);
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const matrix = Array.from({ length: 7 }, () => Array(hours.length).fill(0));
    sessions.forEach((session) => {
      const started = new Date(session.started_at);
      const day = (started.getDay() + 6) % 7;
      const hourIndex = hours.indexOf(started.getHours());
      if (hourIndex >= 0) matrix[day][hourIndex] += session.focus_seconds;
    });
    const max = Math.max(...matrix.flat(), 1);
    const left = 54;
    const top = 34;
    const cellGap = 5;
    const cellW = Math.max(18, (width - left - 24 - cellGap * hours.length) / hours.length);
    const cellH = 25;
    ctx.fillStyle = "rgba(102,112,133,0.92)";
    ctx.font = "600 11px system-ui";
    hours.forEach((hour, index) => {
      if (index % 2 === 0) ctx.fillText(String(hour), left + index * (cellW + cellGap), 22);
    });
    labels.forEach((label, day) => {
      const y = top + day * (cellH + cellGap);
      ctx.fillStyle = "rgba(102,112,133,0.92)";
      ctx.font = "700 12px system-ui";
      ctx.fillText(label, 16, y + 17);
      hours.forEach((_, hourIndex) => {
        const value = matrix[day][hourIndex];
        const intensity = value / max;
        const x = left + hourIndex * (cellW + cellGap);
        const hueColor = intensity > 0.66 ? "217,119,6" : intensity > 0.33 ? "15,118,110" : "37,99,235";
        ctx.fillStyle = value ? `rgba(${hueColor}, ${0.18 + intensity * 0.72})` : "rgba(23,32,42,0.055)";
        ctx.fillRect(x, y, cellW, cellH);
      });
    });
  }

  function renderJsonResult(root, payload, applyId = null) {
    root.classList.remove("empty-state");
    root.innerHTML = `${applyId ? `<div class="button-row"><button class="primary-button apply-draft" data-id="${applyId}">Apply Draft</button></div>` : ""}<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
  }

  function bindAnalytics() {
    $("#analytics-range")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadAnalytics();
      } catch (error) {
        toast(error.message);
      }
    });
    $("#ai-analyze-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const range = new FormData($("#analytics-range"));
      const body = { start: range.get("start"), end: range.get("end"), instruction: new FormData(event.currentTarget).get("instruction") || null };
      const root = $("#ai-analysis-result");
      root.textContent = "Asking GPT...";
      try {
        const draft = await api("/api/ai/analyze", { method: "POST", body: JSON.stringify(body) });
        renderJsonResult(root, draft.payload);
      } catch (error) {
        root.textContent = error.message;
        root.classList.add("empty-state");
      }
    });
    loadAnalytics().catch((error) => toast(error.message));
  }

  function bindFocus() {
    $("#request-notification")?.addEventListener("click", async () => {
      if (!("Notification" in window)) {
        toast("Browser notifications are unavailable.");
        return;
      }
      const permission = await Notification.requestPermission();
      toast(permission === "granted" ? "Notifications enabled." : "Notifications were not enabled.");
    });

    $("#free-timer-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = formData(event.currentTarget);
      if (body.mode === "count_up") delete body.duration_minutes;
      try {
        await api("/api/timer/start", { method: "POST", body: JSON.stringify(body) });
        toast("Timer started.");
        await pollTimer();
      } catch (error) {
        toast(error.message);
      }
    });

    const freeMode = $("#free-timer-form select[name='mode']");
    freeMode?.addEventListener("change", updateFreeTimerDurationVisibility);
    updateFreeTimerDurationVisibility();

    $("#pomodoro-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/pomodoro/start", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("Pomodoro started.");
        await pollTimer();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#pause-resume")?.addEventListener("click", async () => {
      try {
        await api(state.timer && state.timer.is_paused ? "/api/timer/resume" : "/api/timer/pause", { method: "POST" });
        await pollTimer();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#stop-timer")?.addEventListener("click", async () => {
      try {
        if (state.timer && state.timer.mode === "count_up" && state.timer.elapsed_seconds > 90 * 60) {
          const review = await openCountUpReviewModal(state.timer.elapsed_seconds);
          if (review.cancelled) return;
          await stopCurrentTimer(review.adjusted_focus_minutes ? { adjusted_focus_minutes: review.adjusted_focus_minutes } : null);
        } else {
          await stopCurrentTimer();
        }
        toast("Timer stopped.");
        await pollTimer();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#skip-pomodoro")?.addEventListener("click", async () => {
      try {
        await api("/api/pomodoro/skip", { method: "POST" });
        await pollTimer();
      } catch (error) {
        toast(error.message);
      }
    });

    api("/api/settings/pomodoro").then((settings) => {
      const form = $("#pomodoro-form");
      if (!form) return;
      Object.keys(settings).forEach((key) => {
        const input = namedField(form, key);
        if (input) input.value = settings[key];
      });
    }).catch(() => {});
  }

  function updateFreeTimerDurationVisibility() {
    const form = $("#free-timer-form");
    const field = $("#countdown-duration-field");
    if (!form || !field) return;
    const modeField = namedField(form, "mode");
    const durationField = namedField(form, "duration_minutes");
    const isCountUp = modeField?.value === "count_up";
    field.classList.toggle("duration-hidden", isCountUp);
    if (durationField) {
      durationField.disabled = isCountUp;
      durationField.required = !isCountUp;
    }
  }

  async function stopCurrentTimer(payload = null) {
    const options = { method: "POST" };
    if (payload) options.body = JSON.stringify(payload);
    return api("/api/timer/stop", options);
  }

  function openCountUpReviewModal(elapsedSeconds) {
    const modal = $("#count-up-review-modal");
    const form = $("#count-up-review-form");
    if (!modal || !form || typeof modal.showModal !== "function") {
      const adjusted = window.prompt("This count-up session is longer than 90 minutes. Enter saved focus minutes, or leave blank to keep the current duration.", String(Math.round(elapsedSeconds / 60)));
      if (adjusted === null) return Promise.resolve({ cancelled: true });
      const minutes = Number(adjusted);
      return Promise.resolve(Number.isFinite(minutes) && minutes > 0 ? { adjusted_focus_minutes: Math.round(minutes) } : {});
    }
    const input = namedField(form, "adjusted_focus_minutes");
    const message = $("#count-up-review-message");
    if (!input) return Promise.resolve({});
    input.value = String(Math.round(elapsedSeconds / 60));
    if (message) {
      message.textContent = `This count-up session is ${formatDuration(elapsedSeconds)}. Adjust the saved focus time if part of it was not active study.`;
    }
    return new Promise((resolve) => {
      const onClose = () => {
        modal.removeEventListener("close", onClose);
        if (!modal.returnValue) {
          resolve({ cancelled: true });
          return;
        }
        if (modal.returnValue === "adjust") {
          const rawMinutes = Number(input.value || 0);
          if (!Number.isFinite(rawMinutes) || rawMinutes <= 0) {
            resolve({ cancelled: true });
            return;
          }
          const minutes = Math.max(1, Math.min(1440, Math.round(rawMinutes)));
          resolve({ adjusted_focus_minutes: minutes });
          return;
        }
        resolve({});
      };
      modal.addEventListener("close", onClose);
      modal.showModal();
    });
  }

  async function loadSubjectsForSettings() {
    const subjects = await api("/api/subjects");
    state.subjects = subjects;
    fillSubjectSelects();
    const list = $("#subject-list");
    if (!list) return;
    list.innerHTML = subjects.length ? subjects.map((subject) => `<div class="list-item subject-settings-item">
      <div class="list-item-header">
        <div><strong>${escapeHtml(subject.name)}</strong><small>${subject.daily_goal_minutes}m daily / ${subject.weekly_goal_minutes}m weekly / ${subject.monthly_goal_minutes}m monthly</small></div>
        <span class="chip" style="border-color:${escapeHtml(subject.color)}; background:${escapeHtml(subject.color)}18">Active</span>
      </div>
    </div>`).join("") : '<div class="empty-state">No subjects yet. Add one to start tracking focus.</div>';
  }

  function bindSettings() {
    $("#subject-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await api("/api/subjects", { method: "POST", body: JSON.stringify(formData(form)) });
        form.reset();
        toast("Subject added.");
        await loadBasics();
        await loadSubjectsForSettings();
      } catch (error) {
        toast(error.message);
      }
    });

    api("/api/settings/llm").then((settings) => {
      const form = $("#llm-form");
      if (!form) return;
      const baseField = namedField(form, "base_url");
      const keyField = namedField(form, "api_key");
      const modelField = namedField(form, "model");
      if (baseField) baseField.value = settings.base_url || "";
      if (keyField) keyField.value = settings.api_key || "";
      if (modelField) modelField.value = settings.model || "";
    }).catch(() => {});

    $("#llm-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/settings/llm", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("GPT settings saved.");
      } catch (error) {
        toast(error.message);
      }
    });

    api("/api/settings/pomodoro").then((settings) => {
      const form = $("#pomodoro-settings-form");
      if (!form) return;
      Object.keys(settings).forEach((key) => {
        const input = namedField(form, key);
        if (input) input.value = settings[key];
      });
    }).catch(() => {});

    $("#pomodoro-settings-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/settings/pomodoro", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("Pomodoro defaults saved.");
      } catch (error) {
        toast(error.message);
      }
    });

    $("#backup-import-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = new FormData(event.currentTarget);
        await api("/api/backup/import", { method: "POST", body: payload });
        toast("Backup imported.");
        await loadBasics();
        await loadSubjectsForSettings();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#ai-plan-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const root = $("#ai-draft-result");
      root.textContent = "Asking GPT...";
      try {
        const draft = await api("/api/ai/plan", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        renderJsonResult(root, draft.payload, draft.id);
      } catch (error) {
        root.textContent = error.message;
        root.classList.add("empty-state");
      }
    });

    $("#ai-draft-result")?.addEventListener("click", async (event) => {
      const button = event.target.closest(".apply-draft");
      if (!button) return;
      try {
        const result = await api(`/api/ai/drafts/${button.dataset.id}/apply`, { method: "POST" });
        toast(`Applied: ${result.created_tasks} tasks, ${result.created_events} events.`);
        await loadBasics();
        if (document.body.dataset.page === "calendar") await loadEvents();
        if (document.body.dataset.page === "tasks") await loadTasks();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#clear-data-open")?.addEventListener("click", () => {
      const modal = $("#clear-data-modal");
      const form = $("#clear-data-form");
      if (!modal || !form || typeof modal.showModal !== "function") return;
      const confirmationField = namedField(form, "confirmation");
      if (confirmationField) confirmationField.value = "";
      modal.showModal();
    });

    $("#clear-data-form")?.addEventListener("submit", async (event) => {
      const form = event.currentTarget;
      if (event.submitter?.value !== "clear") return;
      event.preventDefault();
      const confirmationField = namedField(form, "confirmation");
      if (confirmationField?.value !== "CLEAR") {
        toast("Type CLEAR to confirm.");
        return;
      }
      try {
        const result = await api("/api/data/clear", { method: "POST", body: JSON.stringify({ confirm: true }) });
        $("#clear-data-modal")?.close();
        toast(`All data cleared. Backup: ${result.pre_clear_backup}`);
        await loadBasics();
        await loadSubjectsForSettings();
        if ($("#task-list")) await loadTasks();
        if ($("#event-list")) await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });

    loadSubjectsForSettings().catch((error) => toast(error.message));
  }

  function bindGlobalDialogs() {
    $("#schedule-reminder-open-calendar")?.addEventListener("click", (event) => {
      const modal = $("#schedule-reminder-modal");
      if (state.activeReminderEvent) {
        localStorage.setItem(reminderKey(state.activeReminderEvent), "acknowledged");
        state.activeReminderId = null;
        state.activeReminderEvent = null;
      }
      if (modal?.open) {
        modal.close();
      }
    });
  }

  async function init() {
    initSceneCanvas();
    bindTiltPanels();

    try {
      await loadBasics();
    } catch (error) {
      toast(error.message);
    }

    const page = document.body.dataset.page;
    if (page === "dashboard") bindDashboard();
    if (page === "focus") bindFocus();
    if (page === "tasks") bindTasks();
    if (page === "calendar") bindCalendar();
    if (page === "analytics") bindAnalytics();
    if (page === "settings") bindSettings();
    bindGlobalDialogs();

    pollTimer();
    setInterval(pollTimer, 1000);
    checkScheduleReminders();
    setInterval(checkScheduleReminders, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
