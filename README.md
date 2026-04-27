# POTATO-TODO

POTATO-TODO is a local-first study planner for desktop browsers. It runs from source on your own machine, stores data in local SQLite, and covers focus timing, tasks, calendar scheduling, analytics, backups, and GPT-assisted planning/chat.

The UI is fully English. Time is based on the local machine clock. There is no account system, sync, or shared cloud database.

## Current Feature Set

- Dashboard with daily quote, total focus time, live timer handoff, current streak, pending task count, today's tasks, and today's calendar.
- Focus workspace with count up, countdown, Pomodoro, pause/resume, notification prompts, and subject-linked sessions.
- Subject Library inside the Focus page with color and goal settings.
- Task management with `todo`, `in_progress`, `undone`, and `done` states.
- Automatic overdue handling: a task past its due time becomes `undone` until you explicitly finish it.
- Overdue completion flow: changing an `undone` task to `done` requires an actual completion timestamp.
- Calendar in day, week, month, and custom range modes.
- Forced schedule reminder modal five minutes before an event starts while the app is open.
- Analytics with subject breakdown, goal progress, study rhythm heatmap, daily trend, task ranking, and completion-rate trends.
- GPT Assistant with two modes:
  - `Planning`: creates draft tasks and, only when time/date intent is detected, draft calendar events.
  - `Chat`: general chat with saved conversation history.
- Per-item draft control in planning mode: each drafted task/event can be applied or dropped individually.
- Daily quote endpoint powered by the configured model service, with fallback quote text if GPT is not configured.
- JSON export/import backups and one-click clear-all-data with confirmation.
- Backend console logging for HTTP requests/responses and full LLM request/response bodies.

## Project Layout

```text
potato_todo/
├── app/                  FastAPI app, templates, static assets, services
├── backups/              Exported backups and automatic pre-import / pre-clear backups
├── data/
│   └── study.db          Local SQLite database
├── scripts/
│   └── seed_demo_data.py Demo data generator for analytics validation
├── requirements.txt
└── README.md
```

## Requirements

- Python 3.11 or newer
- Chrome, Edge, or Safari on desktop
- Network access only if you want to use GPT features

## First-Time Setup

### macOS

Open Terminal in the project folder:

```bash
cd /path/to/potato_todo
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Start the app:

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

### Windows PowerShell

Open PowerShell in the project folder:

```powershell
cd C:\path\to\potato_todo
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If activation is blocked:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Start the app:

```powershell
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Start the App Later

### macOS

```bash
cd /path/to/potato_todo
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Windows PowerShell

```powershell
cd C:\path\to\potato_todo
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

If you already use a local environment named `.potato_todo_env`, that is also fine. Activate that environment instead of `.venv`.

## Stop the App

- Close the browser tab whenever you want. That only closes the UI.
- Stop the backend server in the terminal running `uvicorn`:
  - macOS: `Control + C`
  - Windows: `Ctrl + C`

Once the server stops, the local URL will stop responding until you launch it again.

## Port Already in Use

If `uvicorn` reports `Address already in use`, either switch ports or kill the old process.

Start on another port:

```bash
uvicorn app.main:app --reload --port 8001
```

Then open:

```text
http://127.0.0.1:8001
```

Find and kill the old process on macOS:

```bash
lsof -iTCP:8000 -sTCP:LISTEN
kill <PID>
```

Force kill if needed:

```bash
kill -9 <PID>
```

Find and kill the old process on Windows:

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

## Local Data and Sharing

All user data stays local by default:

- database: `data/study.db`
- backups: `backups/`

If you give this project to another person, they run their own local copy and generate their own local database. There is no built-in sync.

Recommended practice:

1. Export JSON before major changes.
2. Keep backup files outside the repo if you are sharing the source code.
3. Do not share `data/study.db` unless you intentionally want to share your own study records.

## GPT Configuration

GPT-related settings are now split across two places.

### Settings Page

Use `Settings -> Model Service` for connection details:

- `Base URL`
- `API Key`

Examples:

- OpenAI: `https://api.openai.com/v1`
- any other OpenAI-compatible endpoint that supports `/chat/completions`

### GPT Assistant Page

Use `GPT Assistant` for runtime choices:

- `Model`
  - `gpt-5.4` (default)
  - `gpt-5.5`
  - `gpt-5.3-codex`
- `Reasoning`
  - `Extra-high`
  - `High`
  - `Medium`
  - `Low`

### How GPT Is Used

- `Planning` mode uses structured prompts and returns draft tasks/events.
- `Chat` mode sends the user's message and saved conversation history without a built-in system prompt.
- `AI Analysis` in the Analytics page sends the selected date-range snapshot for feedback.
- The app prints full HTTP and LLM request/response logs to the backend console.

Important:

- Planning output is not written directly into formal data tables.
- Draft tasks and calendar items must be applied manually, item by item.
- If the planning prompt does not mention time/date intent, the planner favors tasks and avoids creating calendar blocks.

## Basic Usage

### 1. Dashboard

Open `/`.

Use it to check:

- the daily quote
- today's total focus time, or the live timer if a session is running
- current streak
- pending task count
- today's tasks
- today's schedule

The date strip under the main visual lets you refresh the central summary for any custom range.

### 2. Focus

Open `/focus`.

You can:

- start a `Count up` session
- start a `Countdown` session
- run a `Pomodoro`
- pause, resume, stop, or skip Pomodoro break/focus transitions
- enable browser notifications
- add/edit subjects in the Subject Library

Important timer behavior:

- `Count up` does not need a custom duration.
- `Countdown` saves automatically when it finishes.
- if a `Count up` session runs longer than 90 minutes and you stop it, the app asks whether to keep the recorded time or save an adjusted focus duration
- only Pomodoro focus phases count toward study time; breaks do not

### 3. Subjects

Subjects are managed from the bottom section of the Focus page.

Each subject has:

- name
- color
- daily goal minutes
- weekly goal minutes
- monthly goal minutes

Those colors flow into tasks, calendar items, focus visuals, and analytics charts.

### 4. Tasks

Open `/tasks`.

Use Tasks for things you need to finish, regardless of whether you already know the exact study time slot.

Each task supports:

- title
- subject
- priority
- due datetime
- estimated minutes
- notes

Task statuses:

- `todo`
- `in_progress`
- `undone`
- `done`

Behavior:

- tasks past their due time automatically become `undone` if they were not completed
- `done` tasks are visually separated from unfinished tasks
- marking an `undone` task as `done` opens a dialog asking for the real completion time
- `Start Focus` launches a study session directly from a task

When to use `Task` vs `Calendar`:

- use `Task` for work that must be completed
- use `Calendar` when the timing of that work matters
- one task can exist without a calendar slot
- one calendar block can optionally link to a task

### 5. Calendar

Open `/calendar`.

Available views:

- `Day`
- `Week`
- `Month`
- custom date range

Calendar behavior:

- add manual study blocks with start/end time
- optionally link a block to a subject or task
- click a day in month view to jump into that day's event details
- while the app is open, a reminder modal appears five minutes before an event begins

If browser notifications are allowed, the app also tries to show a system notification.

### 6. Analytics

Open `/analytics`.

Select a range and review:

- `Total focus`
- `Streak`
- `Focus Time by Subject`
- `Subject Goal Completion`
- `Study Rhythm`
- `Subject Details`
- `Task Ranking`
- `Daily Trend`
- `Completion Rate Trend`
- `AI Analysis`

Chart meaning:

- `Focus Time by Subject`: current-day focus distribution by subject
- `Subject Goal Completion`: current-week progress against each subject's configured goals
- `Study Rhythm`: weekday/hour heatmap
  - `No focus`: no sessions recorded
  - `Light focus`: low activity
  - `Steady focus`: regular concentration
  - `Peak focus`: strongest concentration window
- `Daily Trend`: line chart of total focus time per day
- `Completion Rate Trend`: two daily curves
  - overall task completion rate
  - on-time completion rate

### 7. GPT Assistant

Open `/assistant`.

It has two modes.

#### Planning Mode

Use this when you want GPT to turn your current tasks, schedule, and study history into an actionable draft.

Flow:

1. choose `Start` and `End`
2. enter a planning instruction
3. send the prompt
4. review the planner thread
5. apply or drop each drafted task/event individually

If you do not mention time windows or dates, the planner mainly returns tasks. If you explicitly mention time blocks, days, or hours, it may also return calendar entries.

#### Chat Mode

Use this for free conversation, similar to a general chatbot.

Features:

- saved conversation history
- reopen previous chats
- delete a chat thread
- `Enter` sends
- `Shift + Enter` adds a new line

### 8. Settings

Open `/settings`.

This page handles:

- GPT connection settings
- default Pomodoro values
- JSON export/import
- full local data clear with confirmation

When importing or clearing data, the app automatically creates a backup first.

## Demo Data for Analytics Validation

If you want realistic sample data from `2026-03-10` through `2026-04-27`, use the seeding script:

### macOS / Linux

```bash
cd /path/to/potato_todo
source .venv/bin/activate
PYTHONPATH=. python scripts/seed_demo_data.py
```

### Windows PowerShell

```powershell
cd C:\path\to\potato_todo
.\.venv\Scripts\Activate.ps1
$env:PYTHONPATH="."
python scripts\seed_demo_data.py
```

What it does:

- creates a safety backup first
- clears current app data
- inserts demo subjects
- inserts demo tasks
- inserts schedule events
- inserts focus sessions with varied durations and dates

Use it only when you want to replace current local data with test/demo content.

## Tests

Run the test suite from an activated virtual environment:

```bash
pytest
```

## Troubleshooting

### The page opens but no data changes happen

Make sure the `uvicorn` terminal is still running. If the server was stopped, the browser page may remain open but API requests will fail.

### Countdown or reminders do not show system notifications

The app still works without system notifications. You need to:

1. keep the page open
2. click `Enable Alerts`
3. grant browser notification permission

The in-page dialog and sound are still used when possible.

### GPT calls fail

Check all of the following:

1. `Settings -> Model Service` has a valid `Base URL` and `API Key`
2. `GPT Assistant` has a valid model selected
3. the endpoint supports `/chat/completions`
4. the backend console output for the exact request and full response body

### I want a clean reset

Use `Settings -> Clear All Data`. The app requires confirmation and creates a backup first.
