# Local Study Planner & Timer

A local-first study planner built with Python, FastAPI, SQLite, and a lightweight English web UI. It is designed for personal study tracking, Todo planning, schedule management, analytics, and optional GPT-assisted planning.

## What It Does

- Tracks study time with count-up and countdown timers.
- Supports configurable Pomodoro focus cycles.
- Manages custom subjects with daily, weekly, and monthly study goals.
- Manages Todo tasks with subject, priority, due date, estimate, notes, and completion state.
- Provides a day/week schedule view for study blocks.
- Provides day, week, and month calendar modes.
- Shows a forced in-app reminder modal five minutes before a scheduled study block starts while the app page is open.
- Shows analytics for total time, subject distribution, task ranking, streaks, goal completion, and study balance.
- Connects to an OpenAI-compatible GPT endpoint with custom `base_url`, `api_key`, and `model`.
- Creates AI planning and analysis drafts. AI output is never written to formal tasks or schedule events until you apply the draft.
- Exports/imports full local JSON backups.
- Keeps a disabled daily news API placeholder for future development.

## Requirements

- Python 3.11 or newer. Python 3.12 is recommended.
- Chrome or Edge on desktop.
- No cloud database, account, login, or sync service is required.

## First-Time Setup on macOS

Open Terminal in the project folder:

```bash
cd /path/to/self_development
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Start the local server:

```bash
uvicorn app.main:app --reload
```

Open the app:

```text
http://127.0.0.1:8000
```

## First-Time Setup on Windows

Open PowerShell in the project folder:

```powershell
cd C:\path\to\self_development
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell blocks virtual environment activation, run this once in the same PowerShell window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Start the local server:

```powershell
uvicorn app.main:app --reload
```

Open the app:

```text
http://127.0.0.1:8000
```

## Starting the App Again Later

macOS:

```bash
cd /path/to/self_development
source .venv/bin/activate
uvicorn app.main:app --reload
```

Windows PowerShell:

```powershell
cd C:\path\to\self_development
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

If port `8000` is already in use, start on another port:

```bash
uvicorn app.main:app --reload --port 8001
```

Then open:

```text
http://127.0.0.1:8001
```

## Closing the App

The web page itself can be closed like any browser tab. To stop the backend server:

- macOS Terminal: press `Control + C` in the terminal running `uvicorn`.
- Windows PowerShell: press `Ctrl + C` in the PowerShell window running `uvicorn`.

After the server stops, `http://127.0.0.1:8000` will no longer load until you start it again.

## Local Data and Backups

The default SQLite database is stored at:

```text
data/study.db
```

Backups are exported from the Settings page as JSON files. Importing a backup replaces the local database records after creating a pre-import backup in:

```text
backups/
```

Recommended habit:

1. Export a JSON backup before major changes.
2. Keep backup files outside the project folder if you are sharing the source code with another person.
3. Do not share `data/study.db` unless you intentionally want to share your personal study records.

## GPT Configuration

Open `Settings -> GPT` and fill:

- `Base URL`: for example `https://api.openai.com/v1`, or another OpenAI-compatible endpoint.
- `API Key`: your own key for that endpoint.
- `Model`: for example `gpt-4o-mini`, or the model name supported by your endpoint.

The app sends selected local study details to the configured model service only when you trigger AI planning or AI analysis. The app does not call GPT in the background.

AI planning creates a draft. You must click `Apply Draft` before generated tasks or schedule events are written into the app.

## Basic Usage

### 1. Create Subjects

Open `Settings`, then add subjects such as:

- Mathematics
- English
- Physics
- Reading

Each subject can have:

- Color
- Daily goal minutes
- Weekly goal minutes
- Monthly goal minutes

Subject colors are used in the timer, task labels, calendar, and analytics views.

### 2. Create Tasks

Open `Tasks` and create Todo items. A task can include:

- Title
- Subject
- Priority
- Due date
- Estimated minutes
- Notes

Use `Start Focus` on a task to begin a count-up focus session linked to that task.

### 3. Plan Calendar Blocks

Open `Calendar` to add study blocks. Use:

- `Day` to show today.
- `Week` to show the current week.
- `Month` to show the current month.
- Date fields to load a custom range.

Each event can be linked to a subject and optionally to a task.

When the app is open in the browser, scheduled events trigger an in-app modal reminder five minutes before their start time. If browser notifications are enabled, the app also attempts to show a system notification.

### 4. Start a Focus Session

Open `Focus`.

Free timer options:

- `Count up`: tracks an open-ended session until you stop it.
- `Countdown`: runs for a chosen number of minutes and saves when finished.

Pomodoro options:

- Focus minutes
- Short break minutes
- Long break minutes
- Number of rounds

Only focus time is counted as study time. Break time is not counted.

### 5. Enable Notifications

On the `Focus` page, click `Enable Notifications`. Your browser may ask for permission.

When a countdown or Pomodoro focus round finishes, the app tries to show:

- In-page completion dialog
- Short sound
- Browser system notification

If browser notifications are denied, the in-page dialog and sound still work while the page is open.

### 6. Review Analytics

Open `Analytics` and select a date range. The page shows:

- Total focus time
- Session count
- Study streak
- Subject distribution
- Task time ranking
- Day-by-day trend chart
- Balance and goal signals

Use `Ask GPT` to generate an AI analysis draft for the selected date range.

### 7. Generate AI Plans

Open `Settings -> AI Planner`, choose a date range, and write an instruction such as:

```text
Plan my next study blocks based on overdue tasks and weak subjects.
```

The model returns a structured draft. Review it, then click `Apply Draft` if you want to create the proposed tasks or schedule events.

## Tests

Run tests from the activated virtual environment:

```bash
pytest
```

The test suite uses a separate test database path and mocks no external GPT calls.

## Troubleshooting

### The browser says the site cannot be reached

Make sure the `uvicorn` command is still running. If the terminal was closed, start the app again.

### Port 8000 is already in use

Use another port:

```bash
uvicorn app.main:app --reload --port 8001
```

### GPT requests fail

Check:

- Base URL ends at the API root, usually `/v1`.
- API key is valid.
- Model name exists on the configured endpoint.
- The endpoint supports OpenAI-compatible `chat/completions`.

### Notifications do not appear

Check:

- Browser notification permission.
- System notification settings.
- The Focus page is open.

If the browser or local server is fully closed, immediate notifications are not guaranteed. Timer state is reconciled when the app is opened again.

## Clearing All Data

Open `Settings -> Danger Zone` and click `Clear All Data`.

The app asks you to type `CLEAR` before it calls the clear-data API. A pre-clear backup JSON file is created in `backups/`, then the local database records are removed.
