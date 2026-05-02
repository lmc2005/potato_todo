(function () {
  const state = {
    subjects: [],
    tasks: [],
    timer: null,
    completionKey: null,
    calendarMode: "day",
    activeReminderId: null,
    activeReminderEvent: null,
    assistantMode: "planning",
    aiPlanConversation: [],
    latestPlanDraft: null,
    selectedPlanDraftId: null,
    draftItemDecisions: {},
    assistantTypingToken: 0,
    aiChatSessions: [],
    aiChatConversationId: null,
    aiChatTitle: "New Chat",
    aiChatThread: [],
    chatTypingToken: 0,
    taskPeriod: "week",
    dashboardClockStarted: false,
    dashboardStats: null,
    focusStageStarted: false,
    editingSubjectId: null,
    rooms: [],
    activeRoomSnapshot: null,
    roomEventSource: null,
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

  function truncateText(value, max = 180) {
    const text = String(value ?? "").trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(String(value || ""));
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

  function formatGoalHours(minutes, cadence) {
    const value = Math.max(Number(minutes || 0), 0) / 60;
    return `${value.toFixed(1)} hour/${cadence}`;
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

  function emailAlias(value) {
    const text = String(value || "").trim();
    if (!text) return "Member";
    return text.split("@")[0] || text;
  }

  function shortDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  function defaultAnalyticsRange(days = 20) {
    const end = new Date(`${window.APP_BOOT.today}T00:00:00`);
    const start = new Date(end);
    start.setDate(end.getDate() - (days - 1));
    return { start: localDateKey(start), end: localDateKey(end) };
  }

  function currentDayRange() {
    return { start: window.APP_BOOT.today, end: window.APP_BOOT.today };
  }

  function currentMonthRange() {
    const today = new Date(`${window.APP_BOOT.today}T00:00:00`);
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start: localDateKey(start), end: localDateKey(end) };
  }

  function taskPeriodRange(mode = state.taskPeriod) {
    if (mode === "day") return currentDayRange();
    if (mode === "month") return currentMonthRange();
    return currentWeekRange();
  }

  function taskPeriodLabel(mode = state.taskPeriod) {
    if (mode === "day") return "Today";
    if (mode === "month") return "This month";
    return "This week";
  }

  function isoDateKey(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function isDateWithinRange(value, range) {
    const key = isoDateKey(value);
    if (!key) return false;
    return key >= range.start && key <= range.end;
  }

  function taskPeriodAnchor(task) {
    if (task.status === "done" && task.completed_at) return task.completed_at;
    if (task.due_at) return task.due_at;
    return task.created_at || null;
  }

  function taskInPeriod(task, range) {
    return isDateWithinRange(taskPeriodAnchor(task), range);
  }

  function taskSummaryForPeriod(tasks, range) {
    return {
      done: tasks.filter((task) => task.status === "done" && isDateWithinRange(task.completed_at, range)).length,
      unfinished: tasks.filter((task) => task.status !== "done" && taskInPeriod(task, range)).length,
      lateDone: tasks.filter((task) => task.status === "done" && task.due_at && task.completed_at && new Date(task.completed_at) > new Date(task.due_at) && isDateWithinRange(task.completed_at, range)).length,
    };
  }

  function updateTaskPeriodControls() {
    const root = $("#task-period-filter");
    if (!root) return;
    $$("button[data-period]", root).forEach((button) => {
      button.classList.toggle("active", button.dataset.period === state.taskPeriod);
    });
  }

  function renderTaskPeriodSummary(tasks, range) {
    const summary = taskSummaryForPeriod(tasks, range);
    const caption = $("#task-period-caption");
    const done = $("#task-period-done");
    const open = $("#task-period-open");
    const late = $("#task-period-late");
    if (caption) caption.textContent = taskPeriodLabel();
    if (done) done.textContent = String(summary.done);
    if (open) open.textContent = String(summary.unfinished);
    if (late) late.textContent = String(summary.lateDone);
  }

  function subjectById(id) {
    return state.subjects.find((subject) => Number(subject.id) === Number(id));
  }

  function cssVar(name, root = document.body) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  function scrollToBottom(root) {
    if (!root) return;
    root.scrollTop = root.scrollHeight;
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

  function colorWithAlpha(color, alpha = 1) {
    const value = String(color || "").trim();
    if (!value) return `rgba(80, 167, 255, ${alpha})`;
    if (value.startsWith("#")) {
      let hex = value.slice(1);
      if (hex.length === 3) hex = hex.split("").map((char) => char + char).join("");
      const int = Number.parseInt(hex, 16);
      const r = (int >> 16) & 255;
      const g = (int >> 8) & 255;
      const b = int & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const rgb = value.match(/\d+(\.\d+)?/g);
    if (rgb && rgb.length >= 3) {
      return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
    }
    return value;
  }

  function safeCssColor(value, fallback = "#8ea2ff") {
    const color = String(value || "").trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
    return fallback;
  }

  function priorityColor(priority) {
    if (priority === "high") return "#ff5f8f";
    if (priority === "low") return "#4bd6c8";
    return "#f6b85f";
  }

  function isTodayRange(start, end) {
    return start === window.APP_BOOT.today && end === window.APP_BOOT.today;
  }

  function subjectLabel(subjectId) {
    const subject = subjectById(subjectId);
    return subject ? subject.name : "No subject";
  }

  function draftItemKey(draftId, kind, index) {
    return `${draftId}:${kind}:${index}`;
  }

  function getDraftItemDecision(draftId, kind, index) {
    return state.draftItemDecisions[draftItemKey(draftId, kind, index)] || "pending";
  }

  function setDraftItemDecision(draftId, kind, index, decision) {
    state.draftItemDecisions[draftItemKey(draftId, kind, index)] = decision;
  }

  function normalizeDraftEvents(payload) {
    return Array.isArray(payload?.schedule_events) ? payload.schedule_events : Array.isArray(payload?.events) ? payload.events : [];
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
    const meteors = Array.from({ length: 5 }, (_, index) => ({
      seed: 2.1 + index * 0.81,
      speed: 0.1 + index * 0.02,
      offset: index * 0.22,
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

      const aurora = ctx.createLinearGradient(width * 0.12, 0, width * 0.86, height);
      aurora.addColorStop(0, "rgba(80,167,255,0.06)");
      aurora.addColorStop(0.46, "rgba(117,244,255,0.04)");
      aurora.addColorStop(1, "rgba(255,180,92,0.05)");
      ctx.fillStyle = aurora;
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

      for (let index = 0; index < 14; index += 1) {
        const progress = (t * 0.018 + index * 0.11) % 1;
        const streakX = width * (0.1 + progress * 0.9);
        const streakY = height * (0.12 + ((index * 37) % 100) / 100 * 0.48);
        const streakLength = 80 + (index % 5) * 32;
        const streak = ctx.createLinearGradient(streakX - streakLength, streakY + streakLength * 0.18, streakX, streakY);
        streak.addColorStop(0, "rgba(255,255,255,0)");
        streak.addColorStop(1, `rgba(255,255,255,${0.06 + (index % 4) * 0.02})`);
        ctx.strokeStyle = streak;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(streakX - streakLength, streakY + streakLength * 0.18);
        ctx.lineTo(streakX, streakY);
        ctx.stroke();
      }

      meteors.forEach((meteor, index) => {
        const cycle = (t * meteor.speed + meteor.offset) % 1;
        const x = width * (1.08 - cycle * 1.2);
        const y = height * (0.08 + cycle * 0.42 + index * 0.02);
        const tail = 140 + index * 26;
        const meteorGradient = ctx.createLinearGradient(x - tail, y - tail * 0.2, x, y);
        meteorGradient.addColorStop(0, "rgba(255,255,255,0)");
        meteorGradient.addColorStop(0.45, `${accent}22`);
        meteorGradient.addColorStop(1, "rgba(255,255,255,0.84)");
        ctx.strokeStyle = meteorGradient;
        ctx.lineWidth = 1.6 + index * 0.2;
        ctx.beginPath();
        ctx.moveTo(x - tail, y - tail * 0.2);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 1.8 + index * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fill();
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

  function initDashboardParallax() {
    if (document.body.dataset.page !== "dashboard") return;
    const sync = () => {
      const y = window.scrollY || 0;
      document.documentElement.style.setProperty("--dashboard-scroll-half", `${(-y * 0.5).toFixed(2)}px`);
      document.documentElement.style.setProperty("--dashboard-scroll-mid", `${(-y * 0.38).toFixed(2)}px`);
      document.documentElement.style.setProperty("--dashboard-scroll-near", `${(-y * 0.26).toFixed(2)}px`);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
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

  function syncSubjectFormState() {
    const form = $("#focus-subject-form");
    const modeChip = $("#focus-subject-mode");
    const submitButton = $("#focus-subject-submit");
    const cancelButton = $("#focus-subject-cancel");
    if (!form || !modeChip || !submitButton || !cancelButton) return;
    const editing = Boolean(state.editingSubjectId);
    form.dataset.mode = editing ? "edit" : "create";
    modeChip.textContent = editing ? "Edit mode" : "Create mode";
    submitButton.textContent = editing ? "Save Subject" : "Add Subject";
    cancelButton.hidden = !editing;
  }

  function resetSubjectForm() {
    const form = $("#focus-subject-form");
    if (!form) return;
    form.reset();
    const subjectIdField = namedField(form, "subject_id");
    const colorField = namedField(form, "color");
    const dailyGoalField = namedField(form, "daily_goal_minutes");
    const weeklyGoalField = namedField(form, "weekly_goal_minutes");
    const monthlyGoalField = namedField(form, "monthly_goal_minutes");
    if (subjectIdField) subjectIdField.value = "";
    if (colorField && !colorField.value) colorField.value = "#5E8CFF";
    if (dailyGoalField && !dailyGoalField.value) dailyGoalField.value = "60";
    if (weeklyGoalField && !weeklyGoalField.value) weeklyGoalField.value = "420";
    if (monthlyGoalField && !monthlyGoalField.value) monthlyGoalField.value = "1800";
    state.editingSubjectId = null;
    syncSubjectFormState();
  }

  function startSubjectEditing(subjectId) {
    const subject = subjectById(subjectId);
    const form = $("#focus-subject-form");
    if (!subject || !form) return;
    const subjectIdField = namedField(form, "subject_id");
    const nameField = namedField(form, "name");
    const colorField = namedField(form, "color");
    const dailyGoalField = namedField(form, "daily_goal_minutes");
    const weeklyGoalField = namedField(form, "weekly_goal_minutes");
    const monthlyGoalField = namedField(form, "monthly_goal_minutes");
    if (subjectIdField) subjectIdField.value = String(subject.id);
    if (nameField) nameField.value = subject.name || "";
    if (colorField) colorField.value = subject.color || "#5E8CFF";
    if (dailyGoalField) dailyGoalField.value = String(subject.daily_goal_minutes ?? 60);
    if (weeklyGoalField) weeklyGoalField.value = String(subject.weekly_goal_minutes ?? 420);
    if (monthlyGoalField) monthlyGoalField.value = String(subject.monthly_goal_minutes ?? 1800);
    state.editingSubjectId = Number(subject.id);
    syncSubjectFormState();
    nameField?.focus();
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
    const focusCard = $("#focus-card");
    const timerStage = $("#timer-stage");
    const focusClock = $("#focus-clock");
    const focusMode = $("#focus-mode");
    const focusDisplayFlip = $("#focus-display-flip");
    const activeSubject = $("#focus-active-subject");
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
      if (focusClock) focusClock.textContent = "00:00:00";
      if (focusMode) focusMode.textContent = "Ready";
      if (focusDisplayFlip) focusDisplayFlip.classList.remove("is-paused");
      if (activeSubject) activeSubject.textContent = "No subject selected";
      if (focusMeta) focusMeta.textContent = "Choose a subject and start.";
      if (subjectPill) {
        subjectPill.textContent = "No subject";
        subjectPill.style.background = "";
        subjectPill.style.borderColor = "";
        subjectPill.style.color = "";
      }
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
      updateDashboardHeroDisplay();
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
    if (focusDisplayFlip) {
      focusDisplayFlip.classList.toggle("is-paused", Boolean(timer.is_paused));
    }
    if (sessionFlow) {
      sessionFlow.style.setProperty("--session-color", visualColor);
      const activeBars = Math.max(1, Math.ceil(progressRatio * 12));
      $$("span", sessionFlow).forEach((bar, index) => {
        bar.classList.toggle("active", index < activeBars && !timer.is_paused);
      });
    }

    if (focusClock) focusClock.textContent = formatClock(seconds);
    if (focusMode) focusMode.textContent = timer.is_paused ? "Paused" : mode;
    if (activeSubject) activeSubject.textContent = subject ? subject.name : "Unknown subject";
    if (focusMeta) focusMeta.textContent = meta;
    if (subjectPill) {
      subjectPill.textContent = subject ? subject.name : "Unknown subject";
      subjectPill.style.background = colorWithAlpha(visualColor, 0.16);
      subjectPill.style.borderColor = colorWithAlpha(visualColor, 0.34);
      subjectPill.style.color = colorWithAlpha(visualColor, 1);
    }
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
    updateDashboardHeroDisplay();
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
    const status = task.status || "todo";
    const priority = ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium";
    const accent = safeCssColor(task.subject_color, priorityColor(priority));
    const dueDate = task.due_at ? new Date(task.due_at) : null;
    const isOverdue = Boolean(dueDate && !isDone && dueDate.getTime() < Date.now());
    const isDueToday = Boolean(dueDate && dueDate.toDateString() === new Date().toDateString());
    const dueClass = isOverdue ? "is-overdue" : isDueToday ? "is-today" : "";
    const subject = task.subject ? `<span class="chip subject-chip" style="border-color:${escapeHtml(accent)}">${escapeHtml(task.subject)}</span>` : "";
    const due = task.due_at ? `<span class="chip task-due-chip ${dueClass}">Due ${escapeHtml(dateTimeLabel(task.due_at))}</span>` : "";
    const estimate = task.estimated_minutes ? `<span class="chip task-estimate-chip">${task.estimated_minutes} min</span>` : "";
    const completed = task.completed_at ? `<span class="chip task-complete-chip">Completed ${escapeHtml(dateTimeLabel(task.completed_at))}</span>` : "";
    const notes = task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : "";
    const meta = `${subject}<span class="chip task-priority-chip">${escapeHtml(priority)}</span>${due}${estimate}`;
    const actions = compact
      ? ""
      : `<div class="task-actions">
          ${isDone ? "" : `<button class="secondary-button task-start" data-id="${task.id}" data-subject="${task.subject_id || ""}">Start Focus</button>`}
          <button class="secondary-button task-done" data-id="${task.id}">${task.status === "done" ? "Reopen" : "Done"}</button>
          <button class="danger-button task-delete" data-id="${task.id}">Delete</button>
        </div>`;
    const classes = [
      "list-item",
      "task-list-item",
      `priority-${priority}`,
      `status-${status}`,
      isDone ? "is-done" : "",
      compact ? "is-compact" : "",
      dueClass,
    ].filter(Boolean).join(" ");
    return `<article class="${classes}" style="--task-accent:${escapeHtml(accent)}">
      <div class="task-accent-rail"><span></span></div>
      <div class="task-main">
        <div class="task-title-line">
          <span class="task-priority-dot"></span>
          <strong>${escapeHtml(task.title)}</strong>
        </div>
        ${notes}
        <div class="tag-row task-meta">${meta}</div>
      </div>
      <div class="task-status-zone">
        <span class="chip task-status-chip status-${escapeHtml(status)} ${isDone ? "is-done" : ""}">${escapeHtml(status.replace("_", " "))}</span>
        ${completed}
      </div>
      ${actions}
    </article>`;
  }

  function sortTasksForDisplay(tasks, filter = "") {
    const statusRank = { todo: 0, in_progress: 1, undone: 2, done: 3 };
    const priorityRank = { high: 0, medium: 1, low: 2 };
    const now = Date.now();
    const dueValue = (task) => task.due_at ? new Date(task.due_at).getTime() : Number.POSITIVE_INFINITY;
    const dueDistance = (task) => task.due_at ? Math.abs(new Date(task.due_at).getTime() - now) : Number.POSITIVE_INFINITY;
    const hasDue = (task) => Boolean(task.due_at);
    const priorityValue = (task) => priorityRank[task.priority] ?? 99;
    const createdValue = (task) => task.created_at ? new Date(task.created_at).getTime() : 0;
    return tasks.slice().sort((left, right) => {
      if (!filter) {
        const leftRank = statusRank[left.status] ?? 99;
        const rightRank = statusRank[right.status] ?? 99;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      const duePresenceDiff = Number(hasDue(right)) - Number(hasDue(left));
      if (duePresenceDiff !== 0) return duePresenceDiff;
      if (hasDue(left) && hasDue(right)) {
        const distanceDiff = dueDistance(left) - dueDistance(right);
        if (distanceDiff !== 0) return distanceDiff;
        const dueDiff = dueValue(left) - dueValue(right);
        if (dueDiff !== 0) return dueDiff;
      } else {
        const priorityDiff = priorityValue(left) - priorityValue(right);
        if (priorityDiff !== 0) return priorityDiff;
      }
      return createdValue(right) - createdValue(left);
    });
  }

  function launchCelebration(canvas = $("#celebration-canvas")) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width || window.innerWidth), 320);
    const height = Math.max(Math.round(rect.height || window.innerHeight), 220);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add("is-active");

    const originY = height * 0.74;
    const bursts = [width * 0.2, width * 0.5, width * 0.8];
    const particles = [];
    bursts.forEach((originX, burstIndex) => {
      for (let index = 0; index < 40; index += 1) {
        const angle = (Math.PI * 2 * index) / 40 + burstIndex * 0.22;
        const speed = 2.2 + Math.random() * 4.8;
        particles.push({
          x: originX,
          y: originY - Math.random() * 54,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.2 - Math.random() * 2.6,
          life: 54 + Math.random() * 20,
          size: 2 + Math.random() * 4.5,
          color: DATA_COLORS[(index + burstIndex) % DATA_COLORS.length],
          spin: (Math.random() - 0.5) * 0.3,
          rotation: Math.random() * Math.PI,
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
        particle.rotation += particle.spin;
        const alpha = Math.max(0, particle.life / 66);
        const size = Math.max(1.4, particle.size * alpha);
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = `${particle.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        ctx.fillRect(-size * 0.5, -size * 0.5, size, size * 1.8);
        ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.lineTo(size, 0);
        ctx.moveTo(0, -size);
        ctx.lineTo(0, size);
        ctx.stroke();
        ctx.restore();
      });

      frame += 1;
      if (frame < 84) {
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
    if (modal && typeof modal.showModal === "function") {
      if (!modal.open) {
        modal.showModal();
      }
      window.requestAnimationFrame(() => {
        launchCelebration($("#task-complete-fireworks"));
      });
      return;
    }
    launchCelebration();
    toast("Completed tasks +1");
  }

  function celebrateTaskCompletion(taskTitle) {
    showTaskCompleteModal(taskTitle);
  }

  function requestTaskCompletionTime(task) {
    return new Promise((resolve) => {
      const modal = $("#task-completion-time-modal");
      const form = $("#task-completion-time-form");
      if (!modal || !form || typeof modal.showModal !== "function") {
        resolve(toLocalInputValue(new Date().toISOString()));
        return;
      }
      const taskIdField = namedField(form, "task_id");
      const completedAtField = namedField(form, "completed_at");
      const message = $("#task-completion-time-message");
      if (taskIdField) taskIdField.value = task.id;
      if (completedAtField) completedAtField.value = toLocalInputValue(task.due_at || new Date().toISOString());
      if (message) message.textContent = `${task.title} is overdue. Enter the actual completion time before saving it as done.`;
      let settled = false;
      const cleanup = () => {
        form.removeEventListener("submit", onSubmit);
        modal.removeEventListener("close", onClose);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        if (event.submitter?.value === "cancel") {
          finish(null);
          modal.close();
          return;
        }
        const value = completedAtField?.value || "";
        if (!value) {
          toast("Completion time is required.");
          return;
        }
        finish(value);
        modal.close();
      };
      const onClose = () => finish(null);
      form.addEventListener("submit", onSubmit);
      modal.addEventListener("close", onClose);
      modal.showModal();
      completedAtField?.focus();
    });
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
    const [stats, tasks, events, quote] = await Promise.all([
      api(`/api/stats?${params}`),
      api("/api/tasks?status=pending"),
      api(`/api/schedule-events?start=${window.APP_BOOT.today}&end=${window.APP_BOOT.today}`),
      api("/api/ai/daily-quote").catch(() => null),
    ]);
    state.dashboardStats = stats;
    $("#dash-total").textContent = formatDuration(stats.total_seconds);
    $("#dash-session-count").textContent = `${stats.session_count} sessions`;
    $("#dash-streak").textContent = `${stats.streak_days} days`;
    $("#dash-open-tasks").textContent = tasks.filter((task) => task.status !== "done").length;
    renderDashboardQuote(quote);
    initDashboardClock();
    updateDashboardHeroDisplay();

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
      const dashboardTasks = sortTasksForDisplay(tasks, "").slice(0, 5);
      taskList.classList.toggle("empty-state", dashboardTasks.length === 0);
      taskList.innerHTML = dashboardTasks.length ? dashboardTasks.map((task) => renderTaskItem(task, true)).join("") : "No tasks yet.";
    }

    const eventList = $("#dash-events");
    if (eventList) {
      eventList.classList.toggle("empty-state", events.length === 0);
      eventList.innerHTML = events.length ? events.slice(0, 5).map(renderEventSummary).join("") : "No events today.";
    }
  }

  function updateDashboardHeroDisplay() {
    const labelEl = $("#dashboard-hero-label");
    const valueEl = $("#dashboard-local-time");
    const metaEl = $("#dashboard-local-date");
    const form = $("#dashboard-range");
    if (!labelEl || !valueEl || !metaEl) return;

    const start = namedField(form, "start")?.value || window.APP_BOOT.today;
    const end = namedField(form, "end")?.value || window.APP_BOOT.today;
    const timer = state.timer;
    const stats = state.dashboardStats;
    if (timer && timer.active) {
      const subject = subjectById(timer.subject_id);
      labelEl.textContent = timer.is_paused ? "Paused focus" : "Live focus";
      valueEl.textContent = formatClock(timer.elapsed_seconds || 0);
      metaEl.textContent = [subject?.name, timer.mode === "pomodoro" ? `Round ${timer.pomodoro_round}/${timer.pomodoro_total_rounds}` : timer.mode.replace("_", " ")].filter(Boolean).join(" / ");
      return;
    }
    if (!stats) {
      labelEl.textContent = "Today's total";
      valueEl.textContent = "0h 00m";
      metaEl.textContent = "No sessions yet";
      return;
    }
    labelEl.textContent = isTodayRange(start, end) ? "Today's total" : "Selected focus";
    valueEl.textContent = formatDuration(stats.total_seconds);
    metaEl.textContent = isTodayRange(start, end)
      ? `${stats.session_count} sessions today`
      : `${start} to ${end} / ${stats.session_count} sessions`;
  }

  function renderDashboardQuote(payload) {
    const targets = [
      {
        text: $("#dash-quote-text"),
        author: $("#dash-quote-author"),
        source: $("#dash-quote-source"),
      },
      {
        text: $("#dashboard-top-quote-text"),
        author: $("#dashboard-top-quote-author"),
        source: $("#dashboard-top-quote-source"),
      },
    ].filter((item) => item.text && item.author && item.source);
    if (!targets.length) return;
    if (!payload || !payload.quote || !payload.author) {
      targets.forEach((target) => {
        target.text.textContent = "Connect GPT Assistant to load today's quote.";
        target.author.textContent = "-- POTATO-TODO";
        target.source.textContent = "Local reminder";
      });
      return;
    }
    targets.forEach((target) => {
      target.text.textContent = payload.quote;
      target.author.textContent = `-- ${payload.author}`;
      target.source.textContent = payload.source || "Unknown source";
    });
  }

  function initDashboardClock() {
    if (state.dashboardClockStarted) return;
    const canvas = $("#dashboard-clock-canvas");
    if (!canvas) return;
    state.dashboardClockStarted = true;
    const ctx = canvas.getContext("2d");
    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(420, Math.round(rect.width || 680));
      height = Math.max(360, Math.round(rect.height || 520));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const particles = Array.from({ length: 42 }, (_, index) => ({
      seed: 1 + index * 0.37,
      orbit: 0.56 + (index % 9) * 0.065,
      speed: 0.08 + (index % 7) * 0.013,
      size: 1.3 + (index % 4) * 0.8,
      axis: index % 2 === 0 ? 1 : -1,
    }));

    const draw = (timestamp) => {
      const t = timestamp * 0.001;
      const cx = width / 2;
      const cy = height / 2 + 6;
      const radius = Math.min(width, height) * 0.23;
      ctx.clearRect(0, 0, width, height);

      const accent = cssVar("--accent") || "#84deff";
      const accent2 = cssVar("--accent-2") || "#ffd39f";
      const accent3 = cssVar("--accent-3") || "#98a2ff";

      const backgroundGlow = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius * 2.6);
      backgroundGlow.addColorStop(0, "rgba(255,255,255,0.72)");
      backgroundGlow.addColorStop(0.18, colorWithAlpha(accent, 0.28));
      backgroundGlow.addColorStop(0.48, colorWithAlpha(accent2, 0.18));
      backgroundGlow.addColorStop(0.74, colorWithAlpha(accent3, 0.14));
      backgroundGlow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = backgroundGlow;
      ctx.fillRect(0, 0, width, height);

      const shadowY = cy + radius * 1.36;
      ctx.save();
      ctx.translate(cx, shadowY);
      ctx.scale(1.14, 0.24);
      const shadow = ctx.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius * 1.36);
      shadow.addColorStop(0, "rgba(7,12,22,0.34)");
      shadow.addColorStop(1, "rgba(7,12,22,0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const drawHex = (scale, rotation, strokeStyle, lineWidth, alpha = 1) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        ctx.beginPath();
        for (let index = 0; index <= 6; index += 1) {
          const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
          const x = Math.cos(angle) * radius * scale;
          const y = Math.sin(angle) * radius * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.restore();
      };

      drawHex(1.56, t * 0.08, colorWithAlpha(accent, 0.12), 1.4);
      drawHex(1.22, -t * 0.12, colorWithAlpha(accent3, 0.14), 1.2);
      drawHex(0.94, t * 0.18, colorWithAlpha(accent2, 0.16), 1.1);

      const orbitLayers = [
        { rx: radius * 1.86, ry: radius * 0.56, lineWidth: 1.2, color: colorWithAlpha(accent, 0.18), speed: 0.16, rotate: 0.1 },
        { rx: radius * 1.28, ry: radius * 1.52, lineWidth: 1.6, color: colorWithAlpha(accent3, 0.18), speed: -0.12, rotate: Math.PI / 4 },
        { rx: radius * 2.02, ry: radius * 0.86, lineWidth: 1.1, color: colorWithAlpha(accent2, 0.18), speed: 0.09, rotate: Math.PI / 1.8 },
      ];
      orbitLayers.forEach((layer) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(layer.rotate + t * layer.speed);
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.lineWidth;
        ctx.beginPath();
        ctx.ellipse(0, 0, layer.rx, layer.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      particles.forEach((particle, index) => {
        const angle = t * particle.speed * particle.axis + particle.seed;
        const orbitX = radius * (1.34 + particle.orbit);
        const orbitY = radius * (0.74 + particle.orbit * 0.54);
        const x = cx + Math.cos(angle) * orbitX;
        const y = cy + Math.sin(angle * 1.18) * orbitY * 0.62;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, particle.size * 7);
        const color = index % 3 === 0 ? accent : index % 3 === 1 ? accent2 : accent3;
        glow.addColorStop(0, colorWithAlpha(color, 0.88));
        glow.addColorStop(1, colorWithAlpha(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, particle.size * 4.2, 0, Math.PI * 2);
        ctx.fill();
      });

      const arcGradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      arcGradient.addColorStop(0, colorWithAlpha(accent, 0.92));
      arcGradient.addColorStop(0.48, colorWithAlpha(accent2, 0.88));
      arcGradient.addColorStop(1, colorWithAlpha(accent3, 0.92));
      ctx.strokeStyle = arcGradient;
      ctx.lineWidth = 12;
      ctx.shadowColor = colorWithAlpha(accent, 0.24);
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.02, -Math.PI / 2 + Math.sin(t * 0.4) * 0.16, Math.PI * 1.38 + Math.sin(t * 0.6) * 0.22);
      ctx.stroke();
      ctx.shadowBlur = 0;

      const sweepAngle = t * 0.92;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sweepAngle);
      const beam = ctx.createLinearGradient(radius * 0.12, 0, radius * 1.18, 0);
      beam.addColorStop(0, colorWithAlpha(accent, 0.02));
      beam.addColorStop(1, colorWithAlpha(accent2, 0.56));
      ctx.strokeStyle = beam;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(radius * 0.12, 0);
      ctx.lineTo(radius * 1.18, 0);
      ctx.stroke();
      ctx.restore();

      const portal = ctx.createRadialGradient(cx, cy, radius * 0.18, cx, cy, radius * 0.92);
      portal.addColorStop(0, "rgba(255,255,255,0.92)");
      portal.addColorStop(0.38, "rgba(247,250,255,0.54)");
      portal.addColorStop(0.72, "rgba(236,244,255,0.18)");
      portal.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = portal;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.94, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.74, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      for (let index = 0; index < 18; index += 1) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 18;
        const inner = radius * 0.8;
        const outer = index % 3 === 0 ? radius * 1.08 : radius * 0.96;
        ctx.strokeStyle = index % 3 === 0 ? "rgba(23,32,42,0.16)" : "rgba(255,255,255,0.14)";
        ctx.lineWidth = index % 3 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      ctx.fill();
      ctx.strokeStyle = "rgba(23,32,42,0.14)";
      ctx.lineWidth = 2;
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

  function initFocusStageCanvas() {
    if (state.focusStageStarted) return;
    const canvas = $("#focus-stage-canvas");
    const root = $("#timer-stage");
    if (!canvas || !root) return;
    state.focusStageStarted = true;

    const ctx = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frameId = 0;
    const shards = Array.from({ length: 24 }, (_, index) => ({
      seed: 0.7 + index * 0.41,
      orbit: 0.34 + (index % 7) * 0.085,
      speed: 0.18 + (index % 5) * 0.04,
      radius: 2 + (index % 4) * 0.8,
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(420, Math.round(rect.width || 760));
      height = Math.max(420, Math.round(rect.height || 760));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawPolygon = (sides, radius, rotation, color, lineWidth = 1) => {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate(rotation);
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let index = 0; index <= sides; index += 1) {
        const angle = (Math.PI * 2 * index) / sides;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    const draw = (timestamp) => {
      const t = timestamp * 0.001;
      const progressValue = Number.parseFloat(root.style.getPropertyValue("--progress")) || 0;
      const progressRatio = Math.max(0, Math.min(1, progressValue / 360));
      const sessionColor = cssVar("--session-color", root) || cssVar("--accent");
      const accent2 = cssVar("--accent-2");
      const accent3 = cssVar("--accent-3");
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.34;

      ctx.clearRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.14, cx, cy, radius * 1.4);
      glow.addColorStop(0, colorWithAlpha(sessionColor, 0.28));
      glow.addColorStop(0.46, colorWithAlpha(accent2, 0.12));
      glow.addColorStop(0.76, colorWithAlpha(accent3, 0.08));
      glow.addColorStop(1, colorWithAlpha(sessionColor, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(cx, cy + radius * 0.78);
      ctx.scale(1.1, 0.24);
      const shadow = ctx.createRadialGradient(0, 0, radius * 0.16, 0, 0, radius * 1.12);
      shadow.addColorStop(0, "rgba(8,12,24,0.28)");
      shadow.addColorStop(1, "rgba(8,12,24,0)");
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      for (let index = 0; index < 18; index += 1) {
        const row = index / 17;
        const y = cy + radius * 0.18 + row * radius * 0.92;
        ctx.strokeStyle = colorWithAlpha(sessionColor, 0.02 + row * 0.03);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - radius * 1.26, y);
        ctx.lineTo(cx + radius * 1.26, y);
        ctx.stroke();
      }

      for (let index = -7; index <= 7; index += 1) {
        ctx.strokeStyle = colorWithAlpha(accent2, index % 2 === 0 ? 0.08 : 0.04);
        ctx.beginPath();
        ctx.moveTo(cx + index * radius * 0.18, cy + radius * 0.18);
        ctx.lineTo(cx + index * radius * 0.46, cy + radius * 1.14);
        ctx.stroke();
      }

      drawPolygon(6, radius * 1.04, t * 0.18, colorWithAlpha(sessionColor, 0.22), 1.2);
      drawPolygon(6, radius * 0.78, -t * 0.14, colorWithAlpha(accent2, 0.18), 1.1);
      drawPolygon(3, radius * 0.94, Math.PI / 2 + t * 0.24, colorWithAlpha(accent3, 0.16), 1);

      const arcGradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      arcGradient.addColorStop(0, colorWithAlpha(sessionColor, 0.92));
      arcGradient.addColorStop(0.54, colorWithAlpha(accent2, 0.88));
      arcGradient.addColorStop(1, colorWithAlpha(accent3, 0.9));
      ctx.strokeStyle = arcGradient;
      ctx.lineWidth = 9;
      ctx.shadowColor = colorWithAlpha(sessionColor, 0.26);
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.92, -Math.PI / 2, -Math.PI / 2 + progressRatio * Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.92, 0, Math.PI * 2);
      ctx.stroke();

      shards.forEach((shard, index) => {
        const angle = shard.seed + t * shard.speed;
        const orbitX = radius * (1.06 + shard.orbit);
        const orbitY = radius * (0.72 + shard.orbit * 0.56);
        const x = cx + Math.cos(angle) * orbitX;
        const y = cy + Math.sin(angle * 1.2) * orbitY * 0.72;
        const color = index % 3 === 0 ? sessionColor : index % 3 === 1 ? accent2 : accent3;
        const particle = ctx.createRadialGradient(x, y, 0, x, y, shard.radius * 7);
        particle.addColorStop(0, colorWithAlpha(color, 0.9));
        particle.addColorStop(1, colorWithAlpha(color, 0));
        ctx.fillStyle = particle;
        ctx.beginPath();
        ctx.arc(x, y, shard.radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
      });

      const beamAngle = -Math.PI / 2 + progressRatio * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(beamAngle);
      const beam = ctx.createLinearGradient(0, 0, radius * 1.02, 0);
      beam.addColorStop(0, colorWithAlpha(sessionColor, 0.02));
      beam.addColorStop(1, colorWithAlpha(accent2, 0.48));
      ctx.strokeStyle = beam;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(radius * 0.18, 0);
      ctx.lineTo(radius * 1.02, 0);
      ctx.stroke();
      ctx.restore();

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
    const allTasks = await api("/api/tasks");
    const range = taskPeriodRange();
    const periodTasks = allTasks.filter((task) => taskInPeriod(task, range));
    const filteredTasks = filter ? periodTasks.filter((task) => task.status === filter) : periodTasks;
    const orderedTasks = sortTasksForDisplay(filteredTasks, filter);
    state.tasks = allTasks;
    fillTaskSelects();
    updateTaskPeriodControls();
    renderTaskPeriodSummary(allTasks, range);
    const list = $("#task-list");
    if (!list) return;
    list.classList.toggle("empty-state", orderedTasks.length === 0);
    if (!orderedTasks.length) {
      const statusLabel = filter ? `${filter.replace("_", " ")} ` : "";
      list.innerHTML = `No ${statusLabel}tasks in ${taskPeriodLabel().toLowerCase()}.`;
      return;
    }
    list.innerHTML = orderedTasks.map((task) => renderTaskItem(task)).join("");
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
    $("#task-period-filter")?.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-period]");
      if (!button || button.dataset.period === state.taskPeriod) return;
      state.taskPeriod = button.dataset.period;
      loadTasks().catch((error) => toast(error.message));
    });
    $("#task-list")?.addEventListener("click", async (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      try {
        if (target.classList.contains("task-start")) await startFocusForTask(target.dataset.id, target.dataset.subject);
        if (target.classList.contains("task-done")) {
          const task = state.tasks.find((item) => Number(item.id) === Number(target.dataset.id));
          const completing = Boolean(task && task.status !== "done");
          const payload = { status: task && task.status === "done" ? "todo" : "done" };
          if (task?.status === "undone") {
            const completedAt = await requestTaskCompletionTime(task);
            if (!completedAt) return;
            payload.completed_at = completedAt;
          }
          await api(`/api/tasks/${target.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
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
    drawTaskRateTrend(stats.task_completion_trend);
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

  function drawTaskRateTrend(rows) {
    const canvas = $("#task-rate-chart");
    const chart = setupCanvas(canvas, 320, 640);
    if (!chart) return;
    const { ctx, width, height } = chart;
    if (!rows || rows.length === 0 || rows.every((row) => !row.total)) {
      drawEmptyChart(canvas, "No due-task data in this range");
      return;
    }
    const left = 62;
    const right = 28;
    const top = 36;
    const bottom = 56;
    const plotW = width - left - right;
    const plotH = height - top - bottom;
    const points = rows.map((row, index) => ({
      x: left + (index / Math.max(rows.length - 1, 1)) * plotW,
      row,
    }));

    ctx.strokeStyle = "rgba(23,32,42,0.10)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(72,84,108,0.92)";
    ctx.font = "650 11px system-ui";
    [0, 0.5, 1].forEach((tick) => {
      const y = top + plotH - tick * plotH;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.fillText(`${Math.round(tick * 100)}%`, 18, y + 4);
    });
    ctx.fillStyle = "#ff2d7a";
    ctx.fillRect(left, 12, 18, 5);
    ctx.fillStyle = "rgba(23,32,42,0.78)";
    ctx.fillText("Completion rate", left + 26, 18);
    ctx.fillStyle = "#00d5ff";
    ctx.fillRect(left + 168, 12, 18, 5);
    ctx.fillStyle = "rgba(23,32,42,0.78)";
    ctx.fillText("On-time rate", left + 194, 18);

    const valueToY = (value) => top + plotH - Math.max(0, Math.min(Number(value || 0), 1)) * plotH;
    const drawSeries = (key, color) => {
      ctx.beginPath();
      let started = false;
      let previous = null;
      points.forEach((point) => {
        const value = point.row[key];
        if (value === null || value === undefined) {
          previous = null;
          return;
        }
        const current = { x: point.x, y: valueToY(value), value };
        if (!started || !previous) {
          ctx.moveTo(current.x, current.y);
          started = true;
        } else {
          const midX = (previous.x + current.x) / 2;
          ctx.quadraticCurveTo(previous.x, previous.y, midX, (previous.y + current.y) / 2);
          ctx.quadraticCurveTo(current.x, current.y, current.x, current.y);
        }
        previous = current;
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      points.forEach((point) => {
        const value = point.row[key];
        if (value === null || value === undefined) return;
        const y = valueToY(value);
        ctx.beginPath();
        ctx.arc(point.x, y, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(point.x, y, 7, 0, Math.PI * 2);
        ctx.strokeStyle = colorWithAlpha(color, 0.22);
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    };

    drawSeries("completion_rate", "#ff2d7a");
    drawSeries("on_time_rate", "#00d5ff");

    points.forEach((point, index) => {
      const shouldLabel = rows.length <= 10 || index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 6) === 0;
      if (!shouldLabel) return;
      ctx.fillStyle = "rgba(23, 32, 42, 0.62)";
      ctx.font = "600 11px system-ui";
      ctx.fillText(dateLabel(point.row.date), Math.max(8, point.x - 20), height - 18);
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
        let fill = "rgba(23,32,42,0.060)";
        let glow = "rgba(23,32,42,0)";
        if (value) {
          if (intensity >= 0.68) {
            fill = `rgba(255, 184, 95, ${0.38 + intensity * 0.48})`;
            glow = "rgba(255, 184, 95, 0.26)";
          } else if (intensity >= 0.34) {
            fill = `rgba(157, 178, 255, ${0.34 + intensity * 0.48})`;
            glow = "rgba(157, 178, 255, 0.22)";
          } else {
            fill = `rgba(122, 230, 221, ${0.30 + intensity * 0.50})`;
            glow = "rgba(122, 230, 221, 0.18)";
          }
        }
        ctx.shadowColor = glow;
        ctx.shadowBlur = value ? 10 : 0;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, cellH, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    });
  }

  function renderJsonResult(root, payload, applyId = null) {
    root.classList.remove("empty-state");
    root.innerHTML = `${applyId ? `<div class="button-row"><button class="primary-button apply-draft" data-id="${applyId}">Apply Draft</button></div>` : ""}<pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>`;
  }

  function replaceLineBreaks(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  function buildPlanNarrative(payload) {
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    const events = Array.isArray(payload?.schedule_events) ? payload.schedule_events : Array.isArray(payload?.events) ? payload.events : [];
    const risks = Array.isArray(payload?.risks) ? payload.risks : [];
    const lines = [];
    if (payload?.summary) lines.push(String(payload.summary).trim());
    if (tasks.length) {
      lines.push(`Tasks:\n${tasks.map((task, index) => `${index + 1}. ${task.title}${task.estimated_minutes ? ` (${task.estimated_minutes} min)` : ""}${task.reason ? ` - ${task.reason}` : task.notes ? ` - ${task.notes}` : ""}`).join("\n")}`);
    }
    if (events.length) {
      lines.push(`Calendar blocks:\n${events.map((event, index) => `${index + 1}. ${event.title} | ${dateTimeLabel(event.start_at)} - ${dateTimeLabel(event.end_at)}${event.reason ? ` | ${event.reason}` : event.notes ? ` | ${event.notes}` : ""}`).join("\n")}`);
    }
    if (risks.length) {
      lines.push(`Risks:\n${risks.map((risk, index) => `${index + 1}. ${risk}`).join("\n")}`);
    }
    return lines.join("\n\n").trim() || "Draft ready.";
  }

  function renderAnalysisResult(root, payload) {
    const sections = [
      { title: "Summary", rows: payload?.summary ? [payload.summary] : [] },
      { title: "Patterns", rows: Array.isArray(payload?.patterns) ? payload.patterns : [] },
      { title: "Problems", rows: Array.isArray(payload?.problems) ? payload.problems : [] },
      { title: "Goal Progress", rows: Array.isArray(payload?.goal_progress) ? payload.goal_progress : [] },
      { title: "Recommendations", rows: Array.isArray(payload?.recommendations) ? payload.recommendations : [] },
      { title: "Risks", rows: Array.isArray(payload?.risks) ? payload.risks : [] },
    ].filter((section) => section.rows.length);
    root.classList.remove("empty-state");
    root.innerHTML = sections.length
      ? sections.map((section) => `<section class="analysis-result-section">
          <h4>${escapeHtml(section.title)}</h4>
          <div class="analysis-result-list">
            ${section.rows.map((row) => `<div class="analysis-result-item">${replaceLineBreaks(String(row))}</div>`).join("")}
          </div>
        </section>`).join("")
      : '<div class="analysis-result-item">No analysis content returned.</div>';
  }

  function aiPlanConversationPayload() {
    return state.aiPlanConversation.map((entry) => ({ role: entry.role, content: entry.content }));
  }

  function planDraftStats(payload) {
    const eventRows = Array.isArray(payload?.schedule_events) ? payload.schedule_events : Array.isArray(payload?.events) ? payload.events : [];
    return {
      taskCount: Array.isArray(payload?.tasks) ? payload.tasks.length : 0,
      eventCount: eventRows.length,
      riskCount: Array.isArray(payload?.risks) ? payload.risks.length : 0,
    };
  }

  function draftDecisionSummary(draft) {
    const payload = draft?.payload || {};
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const events = normalizeDraftEvents(payload);
    let applied = 0;
    let dropped = 0;
    tasks.forEach((_, index) => {
      const decision = getDraftItemDecision(draft.id, "task", index);
      if (decision === "applied") applied += 1;
      if (decision === "dropped") dropped += 1;
    });
    events.forEach((_, index) => {
      const decision = getDraftItemDecision(draft.id, "event", index);
      if (decision === "applied") applied += 1;
      if (decision === "dropped") dropped += 1;
    });
    const total = tasks.length + events.length;
    return { total, applied, dropped, pending: Math.max(0, total - applied - dropped) };
  }

  function syncAiDraftStatusBadge() {
    const badge = $("#ai-draft-status");
    if (!badge) return;
    if (!state.latestPlanDraft) {
      badge.textContent = "No draft";
      badge.className = "chip";
      return;
    }
    const summary = draftDecisionSummary(state.latestPlanDraft);
    if (summary.total === 0) {
      badge.textContent = "Empty";
      badge.className = "chip ai-draft-status-chip is-pending";
      return;
    }
    if (summary.pending === 0) {
      badge.textContent = "Handled";
      badge.className = "chip ai-draft-status-chip is-applied";
      return;
    }
    badge.textContent = `${summary.pending} pending`;
    badge.className = "chip ai-draft-status-chip is-pending";
  }

  function renderAiPlanThread() {
    const root = $("#ai-plan-thread");
    if (!root) return;
    if (!state.aiPlanConversation.length) {
      root.classList.add("empty-state");
      root.textContent = "Start a planning conversation. Ask for tasks first, and mention dates or time windows only when you want calendar blocks.";
      return;
    }
    root.classList.remove("empty-state");
    root.innerHTML = state.aiPlanConversation.map((entry, index) => {
      if (entry.role === "user") {
        return `<article class="ai-thread-message is-user">
          <div class="ai-thread-meta"><span>You</span><span>${index + 1}</span></div>
          <div class="ai-thread-body">${replaceLineBreaks(entry.display || entry.content)}</div>
        </article>`;
      }
      const draft = entry.draft || {};
      const stats = planDraftStats(draft.payload || {});
      const selected = Number(state.selectedPlanDraftId) === Number(draft.id);
      const isLoading = Boolean(entry.loading);
      const body = isLoading ? "Planning your next draft..." : (entry.displayText || "Thinking through your plan...");
      const meta = isLoading ? "Drafting" : (stats.eventCount ? `${stats.taskCount} tasks / ${stats.eventCount} blocks` : `${stats.taskCount} tasks`);
      return `<article class="ai-thread-message is-assistant ${selected ? "is-selected" : ""} ${isLoading ? "is-loading" : ""}" ${draft.id ? `data-draft-id="${draft.id}"` : ""}>
        <div class="ai-thread-meta"><span>Planner</span><span>${meta}</span></div>
        <div class="ai-thread-body">${replaceLineBreaks(body)}</div>
      </article>`;
    }).join("");
  }

  function renderPlanTask(task, draftId, index) {
    const decision = getDraftItemDecision(draftId, "task", index);
    const subject = task.subject_id ? subjectLabel(task.subject_id) : "No subject";
    return `<div class="plan-item ${decision !== "pending" ? `is-${decision}` : ""}">
      <div class="plan-item-head">
        <strong>${escapeHtml(task.title || "Untitled task")}</strong>
        <span class="chip">${escapeHtml(task.priority || "medium")}</span>
      </div>
      <div class="tag-row">
        <span class="chip">${escapeHtml(subject)}</span>
        ${task.estimated_minutes ? `<span class="chip">${escapeHtml(task.estimated_minutes)} min</span>` : ""}
      </div>
      <div class="plan-item-actions">
        <button class="primary-button plan-apply-task" type="button" data-draft-id="${draftId}" data-index="${index}" ${decision === "applied" ? "disabled" : ""}>${decision === "applied" ? "Applied" : "Apply"}</button>
        <button class="secondary-button plan-drop-task" type="button" data-draft-id="${draftId}" data-index="${index}" ${decision === "dropped" ? "disabled" : ""}>${decision === "dropped" ? "Dropped" : "Drop"}</button>
      </div>
    </div>`;
  }

  function renderPlanEvent(event, draftId, index) {
    const decision = getDraftItemDecision(draftId, "event", index);
    const subject = event.subject_id ? subjectLabel(event.subject_id) : "No subject";
    return `<div class="plan-item ${decision !== "pending" ? `is-${decision}` : ""}">
      <div class="plan-item-head">
        <strong>${escapeHtml(event.title || "Untitled block")}</strong>
        <span class="chip">${escapeHtml(dateTimeLabel(event.start_at))}</span>
      </div>
      <div class="tag-row">
        <span class="chip">${escapeHtml(dateTimeLabel(event.start_at))}</span>
        <span class="chip">${escapeHtml(dateTimeLabel(event.end_at))}</span>
        <span class="chip">${escapeHtml(subject)}</span>
      </div>
      <div class="plan-item-actions">
        <button class="primary-button plan-apply-event" type="button" data-draft-id="${draftId}" data-index="${index}" ${decision === "applied" ? "disabled" : ""}>${decision === "applied" ? "Applied" : "Apply"}</button>
        <button class="secondary-button plan-drop-event" type="button" data-draft-id="${draftId}" data-index="${index}" ${decision === "dropped" ? "disabled" : ""}>${decision === "dropped" ? "Dropped" : "Drop"}</button>
      </div>
    </div>`;
  }

  function renderAiPlanDraftPreview() {
    const root = $("#ai-draft-result");
    if (!root) return;
    syncAiDraftStatusBadge();
    if (!state.latestPlanDraft) {
      root.classList.add("empty-state");
      root.textContent = "No draft generated yet.";
      return;
    }
    const draft = state.latestPlanDraft;
    const payload = draft.payload || {};
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const events = normalizeDraftEvents(payload);
    const summary = draftDecisionSummary(draft);
    root.classList.remove("empty-state");
    const countBits = [`${tasks.length} tasks`];
    if (events.length) countBits.push(`${events.length} blocks`);
    countBits.push(`${summary.pending} pending`);
    root.innerHTML = `
      <div class="plan-preview-meta">${countBits.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>
      <section class="ai-plan-section">
        <h4>Tasks</h4>
        <div class="ai-plan-list">${tasks.length ? tasks.map((task, index) => renderPlanTask(task, draft.id, index)).join("") : '<div class="plan-empty">No task suggestions in this draft.</div>'}</div>
      </section>
      ${events.length ? `<section class="ai-plan-section">
        <h4>Calendar Blocks</h4>
        <div class="ai-plan-list">${events.map((event, index) => renderPlanEvent(event, draft.id, index)).join("")}</div>
      </section>` : ""}
    `;
  }

  function pushAiPlanUserMessage(text) {
    state.aiPlanConversation.push({
      role: "user",
      content: text,
      display: text,
    });
    state.aiPlanConversation = state.aiPlanConversation.slice(-12);
  }

  function pushAiPlanAssistantPending() {
    state.assistantTypingToken += 1;
    state.aiPlanConversation.push({
      role: "assistant",
      content: "",
      displayText: "Planning...",
      narrative: "",
      typed: false,
      loading: true,
      draft: null,
    });
    state.aiPlanConversation = state.aiPlanConversation.slice(-12);
    renderAiPlanThread();
  }

  function animateLatestAssistantMessage() {
    const entry = [...state.aiPlanConversation].reverse().find((item) => item.role === "assistant" && item.narrative && !item.loading);
    if (!entry) return;
    state.assistantTypingToken += 1;
    const token = state.assistantTypingToken;
    const root = $("#ai-plan-thread");
    const finalText = entry.narrative;
    let index = 0;
    let lastTick = 0;
    let nextDelay = 28;
    renderAiPlanThread();
    const resolveBodyNode = () => {
      if (!root) return null;
      const nodes = root.querySelectorAll(".ai-thread-message.is-assistant .ai-thread-body");
      return nodes.length ? nodes[nodes.length - 1] : null;
    };
    let bodyNode = resolveBodyNode();
    const step = (timestamp) => {
      if (token !== state.assistantTypingToken) return;
      if (!lastTick) lastTick = timestamp;
      if (timestamp - lastTick < nextDelay) {
        window.requestAnimationFrame(step);
        return;
      }
      if (!bodyNode || !bodyNode.isConnected) {
        bodyNode = resolveBodyNode();
      }
      const nextChar = finalText.charAt(index) || "";
      index = Math.min(finalText.length, index + 1);
      entry.displayText = finalText.slice(0, index);
      if (bodyNode) {
        bodyNode.innerHTML = replaceLineBreaks(entry.displayText);
      } else {
        renderAiPlanThread();
      }
      if (root) root.scrollTop = root.scrollHeight;
      lastTick = timestamp;
      nextDelay = [".", "!", "?", "\n"].includes(nextChar) ? 90 : [",", ":"].includes(nextChar) ? 54 : nextChar === " " ? 10 : 18;
      if (index < finalText.length) {
        window.requestAnimationFrame(step);
        return;
      }
      entry.displayText = finalText;
      entry.typed = true;
      entry.loading = false;
      renderAiPlanThread();
    };
    window.requestAnimationFrame(step);
  }

  function pushAiPlanAssistantDraft(draft) {
    const narrative = buildPlanNarrative(draft.payload || {});
    state.latestPlanDraft = draft;
    state.selectedPlanDraftId = draft.id;
    state.draftItemDecisions = Object.fromEntries(Object.entries(state.draftItemDecisions).filter(([key]) => !key.startsWith(`${draft.id}:`)));
    const pendingEntry = [...state.aiPlanConversation].reverse().find((item) => item.role === "assistant" && item.loading);
    if (pendingEntry) {
      pendingEntry.content = narrative;
      pendingEntry.displayText = "";
      pendingEntry.narrative = narrative;
      pendingEntry.typed = false;
      pendingEntry.loading = false;
      pendingEntry.draft = draft;
    } else {
      state.aiPlanConversation.push({
        role: "assistant",
        content: narrative,
        displayText: "",
        narrative,
        typed: false,
        loading: false,
        draft,
      });
      state.aiPlanConversation = state.aiPlanConversation.slice(-12);
    }
    animateLatestAssistantMessage();
  }

  function clearAiPlanThread() {
    state.assistantTypingToken += 1;
    state.aiPlanConversation = [];
    state.latestPlanDraft = null;
    state.selectedPlanDraftId = null;
    state.draftItemDecisions = {};
    renderAiPlanThread();
    renderAiPlanDraftPreview();
  }

  function setAssistantMode(mode) {
    state.assistantMode = mode === "chat" ? "chat" : "planning";
    const shell = $(".assistant-shell");
    if (shell) shell.dataset.assistantMode = state.assistantMode;
    $$("#assistant-mode-control button").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.assistantMode);
    });
  }

  function syncChatHeader() {
    const title = $("#chat-thread-title");
    const status = $("#ai-chat-status");
    const count = $("#ai-chat-count");
    const deleteButton = $("#ai-chat-delete");
    if (title) title.textContent = state.aiChatTitle || "New Chat";
    if (status) {
      if (!state.aiChatThread.length) status.textContent = "Local chat history";
      else if (state.aiChatConversationId) status.textContent = `${state.aiChatThread.length} messages`;
      else status.textContent = "Unsaved draft";
    }
    if (count) count.textContent = `${state.aiChatSessions.length} ${state.aiChatSessions.length === 1 ? "chat" : "chats"}`;
    if (deleteButton) deleteButton.disabled = !state.aiChatConversationId;
  }

  function chatMessageMetaLabel(message) {
    if (message.loading) return "Thinking";
    return shortDateTime(message.created_at) || (message.role === "user" ? "You" : "Assistant");
  }

  function renderAiChatThread() {
    const root = $("#ai-chat-thread");
    if (!root) return;
    syncChatHeader();
    if (!state.aiChatThread.length) {
      root.classList.add("empty-state");
      root.textContent = "Start a free conversation. Previous chats stay available in the history panel.";
      return;
    }
    root.classList.remove("empty-state");
    root.innerHTML = state.aiChatThread.map((entry) => `<article class="ai-thread-message ${entry.role === "user" ? "is-user" : "is-assistant"} ${entry.loading ? "is-loading" : ""}">
      <div class="ai-thread-meta"><span>${entry.role === "user" ? "You" : "Assistant"}</span><span>${escapeHtml(chatMessageMetaLabel(entry))}</span></div>
      <div class="ai-thread-body">${replaceLineBreaks(entry.displayText || entry.content || "")}</div>
    </article>`).join("");
    scrollToBottom(root);
  }

  function renderAiChatSessions() {
    const root = $("#ai-chat-session-list");
    if (!root) return;
    syncChatHeader();
    if (!state.aiChatSessions.length) {
      root.className = "assistant-session-list empty-state";
      root.textContent = "No saved chats yet.";
      return;
    }
    root.className = "assistant-session-list";
    root.innerHTML = state.aiChatSessions.map((session) => {
      const isActive = Number(session.id) === Number(state.aiChatConversationId);
      return `<button class="assistant-session-row ${isActive ? "is-active" : ""}" type="button" data-conversation-id="${session.id}">
        <div class="assistant-session-copy">
          <strong>${escapeHtml(session.title || "New Chat")}</strong>
          <small>${escapeHtml(truncateText(session.preview || "No preview yet.", 84))}</small>
        </div>
        <span>${escapeHtml(shortDateTime(session.updated_at) || "")}</span>
      </button>`;
    }).join("");
  }

  function resetAiChatThread() {
    state.chatTypingToken += 1;
    state.aiChatConversationId = null;
    state.aiChatTitle = "New Chat";
    state.aiChatThread = [];
    renderAiChatThread();
    renderAiChatSessions();
  }

  function hydrateAiChatConversation(conversation) {
    state.aiChatConversationId = conversation?.id ?? null;
    state.aiChatTitle = conversation?.title || "New Chat";
    state.aiChatThread = Array.isArray(conversation?.messages)
      ? conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          displayText: message.content,
          created_at: message.created_at,
          loading: false,
        }))
      : [];
    renderAiChatThread();
    renderAiChatSessions();
  }

  function pushAiChatUserMessage(text) {
    state.aiChatThread.push({
      role: "user",
      content: text,
      displayText: text,
      created_at: new Date().toISOString(),
      loading: false,
    });
    renderAiChatThread();
  }

  function pushAiChatAssistantPending() {
    state.chatTypingToken += 1;
    state.aiChatThread.push({
      role: "assistant",
      content: "",
      displayText: "Thinking...",
      created_at: new Date().toISOString(),
      loading: true,
    });
    renderAiChatThread();
  }

  function animateLatestChatAssistantMessage() {
    const entry = [...state.aiChatThread].reverse().find((item) => item.role === "assistant" && item.content && !item.loading && !item.typed);
    if (!entry) return;
    state.chatTypingToken += 1;
    const token = state.chatTypingToken;
    const root = $("#ai-chat-thread");
    const finalText = entry.content;
    let index = 0;
    let lastTick = 0;
    let nextDelay = 18;
    let buffer = "";
    renderAiChatThread();

    const resolveBodyNode = () => {
      if (!root) return null;
      const nodes = root.querySelectorAll(".ai-thread-message.is-assistant .ai-thread-body");
      return nodes.length ? nodes[nodes.length - 1] : null;
    };
    let bodyNode = resolveBodyNode();

    const step = (timestamp) => {
      if (token !== state.chatTypingToken) return;
      if (!lastTick) lastTick = timestamp;
      if (timestamp - lastTick < nextDelay) {
        window.requestAnimationFrame(step);
        return;
      }
      if (!bodyNode || !bodyNode.isConnected) bodyNode = resolveBodyNode();
      const remaining = finalText.length - index;
      const batch = remaining > 40 ? 3 : remaining > 12 ? 2 : 1;
      const slice = finalText.slice(index, index + batch);
      index = Math.min(finalText.length, index + batch);
      buffer += slice;
      entry.displayText = buffer;
      if (bodyNode) {
        bodyNode.innerHTML = replaceLineBreaks(entry.displayText);
      } else {
        renderAiChatThread();
      }
      scrollToBottom(root);
      lastTick = timestamp;
      const pivot = slice.slice(-1);
      nextDelay = [".", "!", "?", "\n"].includes(pivot) ? 68 : [",", ":"].includes(pivot) ? 34 : pivot === " " ? 8 : 14;
      if (index < finalText.length) {
        window.requestAnimationFrame(step);
        return;
      }
      entry.displayText = finalText;
      entry.typed = true;
      renderAiChatThread();
    };
    window.requestAnimationFrame(step);
  }

  async function loadAiChatSessions() {
    state.aiChatSessions = await api("/api/ai/chat/sessions");
    renderAiChatSessions();
  }

  async function loadAiChatConversation(conversationId) {
    const conversation = await api(`/api/ai/chat/sessions/${conversationId}`);
    hydrateAiChatConversation(conversation);
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
        renderAnalysisResult(root, draft.payload);
      } catch (error) {
        root.textContent = error.message;
        root.classList.add("empty-state");
      }
    });
    loadAnalytics().catch((error) => toast(error.message));
  }

  function bindFocus() {
    initFocusStageCanvas();

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

    $("#focus-subject-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        const payload = formData(form);
        const subjectId = Number(payload.subject_id || 0);
        delete payload.subject_id;
        if (subjectId) {
          await api(`/api/subjects/${subjectId}`, { method: "PATCH", body: JSON.stringify(payload) });
          toast("Subject updated.");
        } else {
          await api("/api/subjects", { method: "POST", body: JSON.stringify(payload) });
          toast("Subject added.");
        }
        resetSubjectForm();
        await loadBasics();
        await loadSubjectLibraryPanel();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#focus-subject-cancel")?.addEventListener("click", () => {
      resetSubjectForm();
    });

    $("#focus-subject-list")?.addEventListener("click", async (event) => {
      const editButton = event.target.closest(".subject-edit");
      if (editButton) {
        startSubjectEditing(Number(editButton.dataset.id));
        return;
      }
      const deleteButton = event.target.closest(".subject-delete");
      if (!deleteButton) return;
      const subjectId = Number(deleteButton.dataset.id);
      const subjectName = deleteButton.dataset.name || "this subject";
      const confirmed = window.confirm(
        `Delete "${subjectName}"? Linked tasks and calendar blocks will lose the subject label. Subjects with recorded focus history cannot be deleted.`,
      );
      if (!confirmed) return;
      try {
        await api(`/api/subjects/${subjectId}`, { method: "DELETE" });
        if (Number(state.editingSubjectId) === subjectId) resetSubjectForm();
        toast("Subject deleted.");
        await loadBasics();
        await loadSubjectLibraryPanel();
      } catch (error) {
        toast(error.message);
      }
    });

    syncSubjectFormState();
    loadSubjectLibraryPanel().catch((error) => toast(error.message));
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

  async function loadSubjectLibraryPanel() {
    const subjects = await api("/api/subjects");
    state.subjects = subjects;
    fillSubjectSelects();
    const list = $("#focus-subject-list");
    if (!list) return;
    if (state.editingSubjectId && !subjects.some((subject) => Number(subject.id) === Number(state.editingSubjectId))) {
      resetSubjectForm();
    }
    list.innerHTML = subjects.length ? subjects.map((subject) => `<article class="focus-subject-card ${Number(subject.id) === Number(state.editingSubjectId) ? "is-editing" : ""}" style="--subject-color:${escapeHtml(subject.color)}">
      <div class="focus-subject-card-head">
        <strong>${escapeHtml(subject.name)}</strong>
        <span class="focus-subject-dot"></span>
      </div>
      <div class="focus-subject-total">
        <span>Total focus</span>
        <strong>${escapeHtml(formatDuration(subject.total_focus_seconds || 0))}</strong>
      </div>
      <div class="focus-subject-goals">
        <span>${escapeHtml(formatGoalHours(subject.daily_goal_minutes, "day"))}</span>
        <span>${escapeHtml(formatGoalHours(subject.weekly_goal_minutes, "week"))}</span>
        <span>${escapeHtml(formatGoalHours(subject.monthly_goal_minutes, "month"))}</span>
      </div>
      <div class="focus-subject-actions">
        <button class="secondary-button subject-edit" type="button" data-id="${subject.id}">Edit</button>
        <button class="danger-button subject-delete" type="button" data-id="${subject.id}" data-name="${escapeHtml(subject.name)}">Delete</button>
      </div>
    </article>`).join("") : '<div class="empty-state">No subjects yet. Add one to start tracking focus.</div>';
  }

  function taskPayloadFromDraft(task) {
    return {
      title: String(task.title || "").trim(),
      subject_id: task.subject_id || null,
      priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
      estimated_minutes: task.estimated_minutes || null,
      notes: task.notes || task.reason || null,
    };
  }

  function eventPayloadFromDraft(event) {
    return {
      title: String(event.title || "").trim(),
      subject_id: event.subject_id || null,
      task_id: event.task_id || null,
      start_at: event.start_at,
      end_at: event.end_at,
      source: "ai",
      notes: event.notes || event.reason || null,
    };
  }

  async function applyDraftTaskItem(draftId, index) {
    const draft = state.latestPlanDraft;
    const task = draft?.payload?.tasks?.[index];
    if (!draft || !task) return;
    await api("/api/tasks", { method: "POST", body: JSON.stringify(taskPayloadFromDraft(task)) });
    setDraftItemDecision(draftId, "task", index, "applied");
    renderAiPlanDraftPreview();
    syncAiDraftStatusBadge();
    await loadBasics();
    await loadTasks().catch(() => {});
    toast("Task applied.");
  }

  async function applyDraftEventItem(draftId, index) {
    const draft = state.latestPlanDraft;
    const event = normalizeDraftEvents(draft?.payload || {})[index];
    if (!draft || !event) return;
    await api("/api/schedule-events", { method: "POST", body: JSON.stringify(eventPayloadFromDraft(event)) });
    setDraftItemDecision(draftId, "event", index, "applied");
    renderAiPlanDraftPreview();
    syncAiDraftStatusBadge();
    await loadBasics();
    await loadEvents().catch(() => {});
    toast("Calendar block applied.");
  }

  function bindAssistant() {
    api("/api/settings/llm").then((settings) => {
      const form = $("#llm-model-form");
      if (!form) return;
      const modelField = namedField(form, "model");
      const reasoningField = namedField(form, "reasoning_effort");
      if (modelField) modelField.value = settings.model || "gpt-5.4";
      if (reasoningField) reasoningField.value = settings.reasoning_effort || "medium";
    }).catch(() => {});

    $("#llm-model-form")?.addEventListener("change", async (event) => {
      const form = event.currentTarget;
      try {
        await api("/api/settings/llm", { method: "POST", body: JSON.stringify(formData(form)) });
        toast("Runtime updated.");
      } catch (error) {
        toast(error.message);
      }
    });

    const bindEnterToSend = (formSelector, fieldName) => {
      namedField($(formSelector), fieldName)?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        const form = $(formSelector);
        const submitButton = form?.querySelector("button[type='submit']");
        if (form && typeof form.requestSubmit === "function") {
          form.requestSubmit(submitButton || undefined);
          return;
        }
        submitButton?.click();
      });
    };
    bindEnterToSend("#ai-plan-form", "instruction");
    bindEnterToSend("#ai-chat-form", "message");

    $("#assistant-mode-control")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-mode]");
      if (!button) return;
      setAssistantMode(button.dataset.mode);
      if (button.dataset.mode === "chat") {
        try {
          await loadAiChatSessions();
        } catch (error) {
          toast(error.message);
        }
      }
    });

    $("#ai-plan-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const instructionField = namedField(form, "instruction");
      const submitButton = event.submitter;
      const instruction = String(instructionField?.value || "").trim();
      if (!instruction) {
        toast("Enter a planning instruction.");
        return;
      }
      const conversation = aiPlanConversationPayload();
      if (instructionField) instructionField.value = "";
      pushAiPlanUserMessage(instruction);
      pushAiPlanAssistantPending();
      if (submitButton) submitButton.disabled = true;
      const root = $("#ai-draft-result");
      const threadRoot = $("#ai-plan-thread");
      if (threadRoot) threadRoot.scrollTop = threadRoot.scrollHeight;
      root.classList.remove("empty-state");
      root.innerHTML = '<div class="plan-empty">Planner is drafting tasks and calendar blocks...</div>';
      try {
        const draft = await api("/api/ai/plan", {
          method: "POST",
          body: JSON.stringify({
            start: namedField(form, "start")?.value || null,
            end: namedField(form, "end")?.value || null,
            instruction,
            conversation,
          }),
        });
        pushAiPlanAssistantDraft(draft);
        renderAiPlanDraftPreview();
        toast("Planner draft updated.");
      } catch (error) {
        const pendingEntry = [...state.aiPlanConversation].reverse().find((item) => item.role === "assistant" && item.loading);
        if (pendingEntry) {
          pendingEntry.loading = false;
          pendingEntry.displayText = error.message;
          pendingEntry.content = error.message;
          pendingEntry.narrative = "";
          pendingEntry.typed = true;
        }
        renderAiPlanThread();
        root.textContent = error.message;
        root.classList.add("empty-state");
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });

    $("#ai-plan-clear")?.addEventListener("click", () => {
      clearAiPlanThread();
      toast("Planner thread cleared.");
    });

    $("#ai-plan-thread")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-draft-id]");
      if (!card) return;
      const draftId = Number(card.dataset.draftId);
      const entry = state.aiPlanConversation.find((item) => item.draft && Number(item.draft.id) === draftId);
      if (!entry?.draft) return;
      state.latestPlanDraft = entry.draft;
      state.selectedPlanDraftId = draftId;
      renderAiPlanThread();
      renderAiPlanDraftPreview();
    });

    $("#ai-draft-result")?.addEventListener("click", async (event) => {
      try {
        const applyTaskButton = event.target.closest(".plan-apply-task");
        if (applyTaskButton) {
          await applyDraftTaskItem(Number(applyTaskButton.dataset.draftId), Number(applyTaskButton.dataset.index));
          return;
        }
        const dropTaskButton = event.target.closest(".plan-drop-task");
        if (dropTaskButton) {
          setDraftItemDecision(Number(dropTaskButton.dataset.draftId), "task", Number(dropTaskButton.dataset.index), "dropped");
          renderAiPlanDraftPreview();
          syncAiDraftStatusBadge();
          toast("Task dropped.");
          return;
        }
        const applyEventButton = event.target.closest(".plan-apply-event");
        if (applyEventButton) {
          await applyDraftEventItem(Number(applyEventButton.dataset.draftId), Number(applyEventButton.dataset.index));
          return;
        }
        const dropEventButton = event.target.closest(".plan-drop-event");
        if (dropEventButton) {
          setDraftItemDecision(Number(dropEventButton.dataset.draftId), "event", Number(dropEventButton.dataset.index), "dropped");
          renderAiPlanDraftPreview();
          syncAiDraftStatusBadge();
          toast("Calendar block dropped.");
        }
      } catch (error) {
        toast(error.message);
      }
    });

    $("#ai-chat-new")?.addEventListener("click", () => {
      setAssistantMode("chat");
      resetAiChatThread();
      toast("New chat started.");
    });

    $("#ai-chat-delete")?.addEventListener("click", async () => {
      if (!state.aiChatConversationId) return;
      if (!window.confirm("Delete this saved chat?")) return;
      try {
        await api(`/api/ai/chat/sessions/${state.aiChatConversationId}`, { method: "DELETE" });
        resetAiChatThread();
        await loadAiChatSessions();
        toast("Chat deleted.");
      } catch (error) {
        toast(error.message);
      }
    });

    $("#ai-chat-session-list")?.addEventListener("click", async (event) => {
      const row = event.target.closest("[data-conversation-id]");
      if (!row) return;
      try {
        setAssistantMode("chat");
        await loadAiChatConversation(Number(row.dataset.conversationId));
      } catch (error) {
        toast(error.message);
      }
    });

    $("#ai-chat-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const messageField = namedField(form, "message");
      const submitButton = event.submitter;
      const message = String(messageField?.value || "").trim();
      if (!message) {
        toast("Enter a message.");
        return;
      }
      if (messageField) messageField.value = "";
      setAssistantMode("chat");
      pushAiChatUserMessage(message);
      pushAiChatAssistantPending();
      if (submitButton) submitButton.disabled = true;
      try {
        const response = await api("/api/ai/chat/send", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: state.aiChatConversationId,
            message,
          }),
        });
        state.aiChatSessions = Array.isArray(response.sessions) ? response.sessions : state.aiChatSessions;
        hydrateAiChatConversation(response.conversation);
        const latestAssistant = [...state.aiChatThread].reverse().find((entry) => entry.role === "assistant");
        if (latestAssistant) {
          latestAssistant.content = response.assistant_message || latestAssistant.content;
          latestAssistant.displayText = "";
          latestAssistant.loading = false;
          latestAssistant.typed = false;
        }
        renderAiChatSessions();
        renderAiChatThread();
        animateLatestChatAssistantMessage();
      } catch (error) {
        const pendingEntry = [...state.aiChatThread].reverse().find((item) => item.role === "assistant" && item.loading);
        if (pendingEntry) {
          pendingEntry.loading = false;
          pendingEntry.content = error.message;
          pendingEntry.displayText = error.message;
          pendingEntry.typed = true;
        }
        renderAiChatThread();
        toast(error.message);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });

    setAssistantMode("planning");
    renderAiPlanThread();
    renderAiPlanDraftPreview();
    renderAiChatThread();
    loadAiChatSessions().catch((error) => toast(error.message));
  }

  function bindSettings() {
    api("/api/settings/llm").then((settings) => {
      const form = $("#llm-connection-form");
      if (!form) return;
      const baseField = namedField(form, "base_url");
      const keyField = namedField(form, "api_key");
      if (baseField) baseField.value = settings.base_url || "";
      if (keyField) keyField.value = settings.api_key || "";
    }).catch(() => {});

    $("#llm-connection-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/settings/llm", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("Connection saved.");
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
        if ($("#task-list")) await loadTasks();
        if ($("#event-list")) await loadEvents();
      } catch (error) {
        toast(error.message);
      }
    });
  }

  function renderRoomsList() {
    const root = $("#rooms-list");
    const count = $("#rooms-count");
    if (!root) return;
    const rooms = Array.isArray(state.rooms) ? state.rooms : [];
    if (count) count.textContent = `${rooms.length} room${rooms.length === 1 ? "" : "s"}`;
    if (!rooms.length) {
      root.classList.add("empty-state");
      root.textContent = "No rooms yet. Create one or join with a room code.";
      return;
    }
    root.classList.remove("empty-state");
    root.innerHTML = rooms.map((room) => `
      <article class="glass-inset room-list-card" data-room-id="${room.room_id}">
        <div class="room-list-head">
          <div class="room-list-copy">
            <h3>${escapeHtml(room.name)}</h3>
            <p>${escapeHtml(room.role)} · ${escapeHtml(room.membership_status)} · ${escapeHtml(room.timezone)}</p>
          </div>
          <div class="room-list-capacity">
            <span class="chip">${room.member_count}/${room.member_limit}</span>
            <small>${escapeHtml(room.status)}</small>
          </div>
        </div>
        <div class="room-list-meta">
          <div>
            <span>Join code</span>
            <strong>${escapeHtml(room.join_code)}</strong>
          </div>
          <div>
            <span>Room state</span>
            <strong>${escapeHtml(room.status)}</strong>
          </div>
        </div>
        <a class="primary-button room-open-link" href="/rooms/${room.room_id}">Open Room</a>
      </article>
    `).join("");
  }

  async function loadRooms() {
    state.rooms = await api("/api/rooms");
    renderRoomsList();
  }

  function renderRoomMembers(snapshot) {
    const root = $("#room-members-board");
    const activeFocus = $("#room-active-focus-count");
    const memberCount = $("#room-detail-member-count");
    const name = $("#room-detail-name");
    const code = $("#room-detail-code");
    const timezone = $("#room-detail-timezone");
    const status = $("#room-detail-status");
    if (!root || !snapshot) return;
    state.activeRoomSnapshot = snapshot;
    if (activeFocus) activeFocus.textContent = `${snapshot.active_focus_count || 0} focusing`;
    if (memberCount) memberCount.textContent = String(snapshot.member_count || 0);
    if (name) name.textContent = snapshot.room?.name || name.textContent;
    if (code) code.textContent = snapshot.room?.join_code || code.textContent;
    if (timezone) timezone.textContent = snapshot.room?.timezone || timezone.textContent;
    if (status) status.textContent = snapshot.room?.status || status.textContent;
    const members = Array.isArray(snapshot.members) ? snapshot.members : [];
    if (!members.length) {
      root.classList.add("empty-state");
      root.textContent = "No active members in this room.";
      return;
    }
    root.classList.remove("empty-state");
    root.innerHTML = members.map((member) => {
      const completed = (member.completed_titles_today || []).map((title) => `<li>${escapeHtml(truncateText(title, 56))}</li>`).join("");
      const inProgress = (member.in_progress_titles_today || []).map((title) => `<li>${escapeHtml(truncateText(title, 56))}</li>`).join("");
      const actions = window.ROOM_BOOT?.is_owner && !member.role?.includes("owner")
        ? `<button class="secondary-button room-kick-button" type="button" data-kick-user="${member.user_id}">Kick</button>`
        : "";
      return `
        <article class="glass-inset room-member-card ${member.is_focusing ? "is-focusing" : ""}">
          <div class="room-member-head">
            <div class="room-member-copy">
              <span class="room-rank">#${member.rank || "--"}</span>
              <h3>${escapeHtml(member.label || emailAlias(member.email))}</h3>
              <p>${escapeHtml(member.role || "member")}</p>
            </div>
            <div class="room-focus-badge">${member.is_focusing ? "Focusing now" : "Idle"}</div>
          </div>
          <div class="room-member-metrics">
            <div><span>Focus</span><strong>${formatDuration(member.focus_seconds_today || 0)}</strong></div>
            <div><span>Done</span><strong>${member.done_count_today || 0}</strong></div>
            <div><span>Open</span><strong>${member.unfinished_count_today || 0}</strong></div>
            <div><span>Late done</span><strong>${member.late_done_count_today || 0}</strong></div>
          </div>
          <div class="room-member-lists">
            <section>
              <h4>Completed today</h4>
              <ul>${completed || "<li>None</li>"}</ul>
              ${(member.completed_titles_more || 0) > 0 ? `<small>+${member.completed_titles_more} more</small>` : ""}
            </section>
            <section>
              <h4>In progress</h4>
              <ul>${inProgress || "<li>None</li>"}</ul>
              ${(member.in_progress_titles_more || 0) > 0 ? `<small>+${member.in_progress_titles_more} more</small>` : ""}
            </section>
          </div>
          <div class="button-row room-member-actions">${actions}</div>
        </article>
      `;
    }).join("");
  }

  async function loadRoomSnapshot(roomId) {
    const snapshot = await api(`/api/rooms/${roomId}/snapshot`);
    renderRoomMembers(snapshot);
  }

  function connectRoomStream(roomId) {
    if (state.roomEventSource) {
      state.roomEventSource.close();
      state.roomEventSource = null;
    }
    const status = $("#room-connection-status");
    const source = new EventSource(`/api/rooms/${roomId}/stream`);
    state.roomEventSource = source;
    if (status) status.textContent = "Live";

    source.addEventListener("room_update", async () => {
      try {
        await loadRoomSnapshot(roomId);
        if (status) status.textContent = "Live";
      } catch (error) {
        if (status) status.textContent = "Refresh needed";
      }
    });
    source.addEventListener("ping", () => {
      if (status) status.textContent = "Live";
    });
    source.onerror = () => {
      if (status) status.textContent = "Reconnecting...";
    };
  }

  function bindRooms() {
    $("#room-create-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const room = await api("/api/rooms", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("Room created.");
        window.location.href = `/rooms/${room.id}`;
      } catch (error) {
        toast(error.message);
      }
    });

    $("#room-join-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const room = await api("/api/rooms/join", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
        toast("Joined room.");
        window.location.href = `/rooms/${room.id}`;
      } catch (error) {
        toast(error.message);
      }
    });

    loadRooms().catch((error) => toast(error.message));
  }

  function bindRoomDetail() {
    const root = $(".room-detail-stage");
    const roomId = Number(root?.dataset.roomId || window.ROOM_BOOT?.id || 0);
    if (!roomId) return;

    loadRoomSnapshot(roomId).catch((error) => toast(error.message));
    connectRoomStream(roomId);

    $("#room-copy-code")?.addEventListener("click", async () => {
      try {
        await copyText($("#room-detail-code")?.textContent || "");
        toast("Room code copied.");
      } catch (error) {
        toast("Copy failed.");
      }
    });

    $("#room-reset-code")?.addEventListener("click", async () => {
      try {
        await api(`/api/rooms/${roomId}/reset-code`, { method: "POST" });
        await loadRoomSnapshot(roomId);
        toast("Room code reset.");
      } catch (error) {
        toast(error.message);
      }
    });

    $("#room-close")?.addEventListener("click", async () => {
      try {
        await api(`/api/rooms/${roomId}/close`, { method: "POST" });
        await loadRoomSnapshot(roomId);
        toast("Room closed.");
      } catch (error) {
        toast(error.message);
      }
    });

    $("#room-leave")?.addEventListener("click", async () => {
      try {
        await api(`/api/rooms/${roomId}/leave`, { method: "POST" });
        toast("Left room.");
        window.location.href = "/rooms";
      } catch (error) {
        toast(error.message);
      }
    });

    $("#room-members-board")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-kick-user]");
      if (!button) return;
      try {
        await api(`/api/rooms/${roomId}/members/${button.dataset.kickUser}/kick`, { method: "POST" });
        await loadRoomSnapshot(roomId);
        toast("Member removed.");
      } catch (error) {
        toast(error.message);
      }
    });
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
    initDashboardParallax();
    bindTiltPanels();

    const page = document.body.dataset.page;
    if (page === "auth") {
      return;
    }

    try {
      await loadBasics();
    } catch (error) {
      toast(error.message);
    }

    if (page === "dashboard") bindDashboard();
    if (page === "focus") bindFocus();
    if (page === "tasks") bindTasks();
    if (page === "calendar") bindCalendar();
    if (page === "analytics") bindAnalytics();
    if (page === "assistant") bindAssistant();
    if (page === "rooms" && $(".room-detail-stage")) bindRoomDetail();
    if (page === "rooms" && !$(".room-detail-stage")) bindRooms();
    if (page === "settings") bindSettings();
    bindGlobalDialogs();

    pollTimer();
    setInterval(pollTimer, 1000);
    checkScheduleReminders();
    setInterval(checkScheduleReminders, 30000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
