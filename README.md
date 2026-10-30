# 👻 Meeting Ghost — AI Meeting Intelligence Platform

> **"No note-taker needed. Every meeting becomes actionable."**

---

## 📌 Executive Overview

**Meeting Ghost** is an editorial-grade, full-stack AI Meeting Intelligence Platform designed to eliminate manual note-taking and turn raw transcripts, meeting dialogue, and conversational notes into structured, accountable deliverables.

Meeting Ghost parses conversations into:
1. **Audio Recording & Multimodal Transcription**: Direct in-browser microphone capture (`MediaRecorder` API) or audio file upload (`.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg`) transcribed automatically using Gemini Multimodal Audio.
2. **Executive Summaries & Proceedings**: Concise high-level overviews alongside detailed topical proceedings.
3. **Key Discussion Points**: Uncluttered takeaways capturing the flow of discussion.
4. **Action Items & Deliverables**: Assigned task owner, relative or explicit deadline, priority level, and live synchronization with an organization-wide task tracker.
5. **Decision Register (ADR)**: Confirmed architectural and product decisions documented with their explicitly stated rationale.
6. **Follow-Up Agenda**: Carry-over topics for upcoming checkpoints.
7. **"Ask Your Meetings" Grounded Q&A**: A factual query engine grounded strictly in saved meeting context, citing exact verbatim transcript excerpts without hallucinations.
8. **Workspace Briefing**: Real-time actionable metrics (meeting counts, open tasks, completed tasks, completion rate, decision counts, and task counts by owner).

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Framework** | **Node.js (v18+) with Express (ESM)** | RESTful API, request validation, centralized error handling |
| **Database & Persistence** | **MongoDB Atlas with Mongoose** | Real database records, schemas for Meetings and Action Items |
| **AI Intelligence Engine** | **Google Gemini API (`@google/genai`)** | Official SDK with Gemini 2.5 Flash structured JSON extraction |
| **Frontend Framework** | **React 18 with Vite** | Responsive single-page application with modular components |
| **Styling & Design System** | **Tailwind CSS** | Professional editorial UI palette with clean typography |
| **Routing** | **React Router DOM v6** | Client-side routing with nested layout shell |

---

## 🚀 Quick Start & Setup Instructions

### 1. Prerequisites
- **Node.js** v18+ or v20+ (tested on Node v24)
- **npm** v9+ (tested on npm v11)
- **MongoDB Atlas** account (or local MongoDB)
- **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/))

### 2. Installation
From the project root:
```bash
# Install root, backend, and frontend dependencies
npm run install:all
```

### 3. Environment Configuration
Create or configure `server/.env` (using `.env.example` as a template):
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database Configuration (MongoDB Atlas using Mongoose)
# Example Atlas URI: mongodb+srv://<username>:<password>@cluster0.mongodb.net/meeting_ghost?retryWrites=true&w=majority
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/meeting_ghost?retryWrites=true&w=majority
MONGODB_DB_NAME=meeting_ghost

# Google Gemini API Key (Official @google/genai SDK)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Audio Upload & Transcription Configuration
MAX_AUDIO_SIZE_MB=25
```

> **Note on Credentials:**
> - When `MONGODB_URI` is provided, Mongoose connects directly to your MongoDB Atlas cluster.
> - When `GEMINI_API_KEY` is provided, live analysis and grounded Q&A use Gemini via `@google/genai`.
> - If credentials are not yet entered, the backend gracefully runs deterministic NLP extraction so evaluation and health checks never crash.

### 4. Running the Application
From the project root:
```bash
# Run both Backend (Port 5000) and Frontend (Port 5173) concurrently:
npm run dev
```

Or run them individually:
```bash
# Start backend server only:
npm run dev:server

# Start frontend client only:
npm run dev:client
```

Open your browser at: **`http://localhost:5173`**

### 5. Running Tests
Run the comprehensive automated test suite:
```bash
# Run complete test suite (Services & Models + API Routes + Audio Pipeline):
npm test

# Or run the Audio speech-to-text pipeline test specifically:
npm run test:audio
```
The test suite validates:
- Core Gemini intelligence extraction and NLP rule fallbacks
- Mongoose schema constraints and cascading deletions
- Real-time MongoDB Atlas connectivity and ping latency
- All REST API routes, status codes, input validations, and error handlers
- Audio upload, multimodal speech-to-text transcription, and end-to-end meeting ingestion

---

## 📡 Complete REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | System health check (uptime, database readyState & connection mode, AI engine status) |
| `POST` | `/api/audio/transcribe` | Accepts audio file upload (`multipart/form-data`), converts speech to text via Gemini Multimodal Audio |
| `GET` | `/api/meetings` | Lists meetings, newest first, with optional `search`, `page`, and `limit` query parameters |
| `POST` | `/api/meetings` | Accepts `title` and `transcript`, runs Gemini AI analysis, validates output, and saves meeting + tasks to MongoDB |
| `POST` | `/api/meetings/analyze` | AI analysis preview of transcript without saving to database |
| `GET` | `/api/meetings/:id` | Retrieves a single meeting by MongoDB ID with associated action items |
| `PATCH` | `/api/meetings/:id` | Updates editable meeting details (`title`, `date`, `department`, `summary`, etc.) |
| `DELETE` | `/api/meetings/:id` | Deletes meeting and cascades removal to all associated action items |
| `GET` | `/api/tasks` | Lists action items with optional `status`, `priority`, `owner`, and `meetingId` filters |
| `PATCH` | `/api/tasks/:id` | Updates task `status`, `owner`, `deadline`, `priority`, or `task`/`description` |
| `GET` | `/api/decisions` | Lists all confirmed decisions across meetings with meeting title, date, and ID |
| `POST` | `/api/ask` | Answers natural language questions grounded strictly in saved meetings, with transcript citations |
| `GET` | `/api/dashboard/stats` | Returns real meeting counts, open tasks, completed tasks, completion rate, decision counts, and task counts by owner |
| `POST` | `/api/seed` | Injects the official sample meeting (Priya, Aryan, Rahul) into MongoDB |
| `POST` | `/api/seed/reset` | Clears workspace collections in MongoDB |

---

## 🎙️ Audio Recording & Transcription Workflow

Meeting Ghost provides a first-class multimodal audio intake pipeline:

1. **Microphone Capture**:
   - Accesses browser microphone using the native `MediaRecorder` API with permission checking.
   - Features real-time recording timer (`MM:SS`), Pause/Resume, Stop, and Playback Preview before submission.
2. **File Upload**:
   - Accepts `.mp3`, `.wav`, `.m4a`, `.webm`, and `.ogg` files up to 25MB (configured via `MAX_AUDIO_SIZE_MB`).
   - Displays real-time upload progress (0%–100%) tracked with `XMLHttpRequest`.
3. **State Machine & Pipeline**:
   - Clear visual progression: `Uploading` ➔ `Transcribing` ➔ `Analyzing` ➔ `Saving` ➔ `Completed` (or `Failed` with retry).
   - Once transcribed, the text is automatically analyzed for executive summary, key points, action items (with owner and deadline), decisions, and follow-up agenda.
   - The audio-derived meeting and its deliverables are persisted directly into MongoDB Atlas and immediately queryable in **Ask Meetings**, **Action Tracker**, and the **Decision Register**.

---

## 🧪 Demonstration & Verification Walkthrough

1. **Health Verification**:
   - Query `GET /api/health` or navigate to **Settings** (`/settings`) in the UI to inspect database connection and AI engine diagnostics.
2. **Ingest Meeting (Audio or Text)**:
   - Navigate to **"Ingest Meeting"** (`/new`).
   - **Audio Record/Upload Mode**:
     - Switch to the **"Record / Upload Audio"** tab.
     - Click **"Start Recording"** (allowing microphone permissions) to record live speech, or click **"Browse Files"** to upload an audio file (`.mp3`, `.wav`, `.m4a`, `.webm`, `.ogg` up to 25MB).
     - Preview the recorded audio with the inline HTML5 player.
     - Click **"Transcribe & Ingest Meeting"** to watch the real-time processing stepper (`Uploading` ➔ `Transcribing` ➔ `Analyzing` ➔ `Saving` ➔ `Completed`).
   - **Text Transcript Mode**:
     - Click **"Insert Sample Dialogue"** to populate the official test dialogue:
       > *"Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting."*
     - Click **"Extract Meeting Intelligence"** to see extracted deliverables, decisions, and follow-up agenda.
     - Click **"Commit to Library"** to save to MongoDB.
3. **Action Tracker**:
   - Navigate to **"Action Tracker"** (`/tasks`) to update statuses (`Pending` ➔ `In Progress` ➔ `Completed`).
4. **Decision Register**:
   - Navigate to **"Decision Register"** (`/decisions`) to review confirmed decisions and rationale.
5. **Ask Your Meetings**:
   - Navigate to **"Ask Meetings"** (`/ask`) and query: *"Who owns the backend development tasks?"*
   - Inspect the verbatim transcript citation and grounded answer.

---

## 🔒 Security & Reliability Guarantees

1. **Credentials Isolation**:
   - Gemini API keys and MongoDB Atlas credentials reside exclusively in server environment variables and are never sent to the client.
2. **Input Validation**:
   - MongoDB IDs are strictly validated (`mongoose.Types.ObjectId.isValid`).
   - Request bodies, statuses, priorities, and transcripts are sanitized and validated.
3. **Payload & File Upload Limits**:
   - Express JSON body parsing is capped at 10MB to prevent memory exhaustion.
   - Audio file uploads are strictly limited to 25MB and verified against allowed audio MIME types (`audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/ogg`).
4. **Resilient Multimodal Failover**:
   - Audio transcription automatically handles quota and model fallback seamlessly (`gemini-3.1-flash-lite` ➔ `gemini-2.5-flash` ➔ `gemini-3.5-flash`).
5. **Zero-Hallucination Guardrails**:
   - Grounded Q&A strictly constrains responses to stored meeting data. When evidence is not found, it reports insufficient evidence.
