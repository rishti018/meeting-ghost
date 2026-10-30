// Official Hackathon Sample Meeting and Preloaded Demo Data for Meeting Ghost

export const HACKATHON_DEMO_TRANSCRIPT = `Priya will finish the UI design by Wednesday. Aryan will complete backend APIs by Friday. Rahul will prepare the deployment checklist by Thursday. The team decided to use MongoDB instead of MySQL. The team will review API integration in the next meeting.`;

export const DEMO_MEETINGS = [
  {
    id: 'demo-meeting-1',
    title: 'Sprint Kickoff & Database Architecture Review',
    date: '2026-10-28',
    department: 'Engineering',
    duration: '25 mins',
    rawTranscript: HACKATHON_DEMO_TRANSCRIPT,
    summary: 'The engineering team aligned on core responsibilities for the sprint, confirmed architectural choice of MongoDB over MySQL, and scheduled an integration checkpoint for the next meeting.',
    detailedSummary: 'During the sprint kickoff, the team finalized architectural and implementation milestones for the project. Priya committed to delivering the full UI/UX design mockups and design system by Wednesday. Aryan accepted ownership of the backend API endpoints with a targeted completion date of Friday. Rahul took responsibility for the deployment checklist and CI/CD preparation by Thursday. On the architecture front, the team formally decided to adopt MongoDB rather than MySQL, citing schema flexibility and document-oriented queries. The team concluded by agreeing to review end-to-end API integration in the upcoming meeting.',
    keyPoints: [
      'Priya is responsible for UI design with a Wednesday deadline.',
      'Aryan owns backend API delivery by Friday.',
      'Rahul is handling the deployment checklist with a Thursday target.',
      'Selected MongoDB over MySQL for the primary datastore.',
      'Scheduled an integration review session for the next team meeting.'
    ],
    decisions: [
      {
        id: 'dec-1-1',
        decision: 'Use MongoDB instead of MySQL',
        rationale: 'Explicitly decided by the team during architecture review to support flexible document schemas.',
        meetingId: 'demo-meeting-1',
        meetingTitle: 'Sprint Kickoff & Database Architecture Review',
        date: '2026-10-28'
      }
    ],
    followUpAgenda: [
      'Review API integration between React frontend and Node.js backend',
      'Verify deployment checklist against target cloud hosting environment'
    ],
    actionItems: [
      {
        id: 'task-1-1',
        meetingId: 'demo-meeting-1',
        meetingTitle: 'Sprint Kickoff & Database Architecture Review',
        task: 'Finish UI design mockups and design tokens',
        owner: 'Priya',
        deadline: 'Wednesday',
        priority: 'High',
        status: 'In Progress',
        createdAt: '2026-10-28T10:00:00.000Z'
      },
      {
        id: 'task-1-2',
        meetingId: 'demo-meeting-1',
        meetingTitle: 'Sprint Kickoff & Database Architecture Review',
        task: 'Complete backend APIs and endpoints',
        owner: 'Aryan',
        deadline: 'Friday',
        priority: 'High',
        status: 'Pending',
        createdAt: '2026-10-28T10:00:00.000Z'
      },
      {
        id: 'task-1-3',
        meetingId: 'demo-meeting-1',
        meetingTitle: 'Sprint Kickoff & Database Architecture Review',
        task: 'Prepare the deployment checklist and environment configs',
        owner: 'Rahul',
        deadline: 'Thursday',
        priority: 'Medium',
        status: 'Completed',
        createdAt: '2026-10-28T10:00:00.000Z'
      }
    ],
    isDemo: true,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:30:00.000Z'
  },
  {
    id: 'demo-meeting-2',
    title: 'Product Strategy & Security Alignment',
    date: '2026-10-27',
    department: 'Product & Security',
    duration: '40 mins',
    rawTranscript: `Dev: We need to determine how we handle API keys and tenant isolation. Ananya: All AI credentials must remain strictly on the backend. The frontend should never touch the Gemini API key. Rohit: Agreed. For audio transcription, let's make sure file uploads are capped at 25MB and only allowed for authenticated sessions. Dev will write the rate-limiting middleware by Tuesday. Ananya will conduct a vulnerability assessment on Friday. We decided not to support third-party OAuth until v2 to focus on core intelligence features.`,
    summary: 'Security guidelines were established to keep AI credentials strictly on the backend, enforce upload limits for audio files, and defer OAuth integrations to version 2.',
    detailedSummary: 'The security review addressed data privacy and API protection. Ananya and Dev established that the Gemini API keys must reside solely in server environment variables. Rohit defined audio file limits capped at 25MB. Action assignments were confirmed: Dev owns rate-limiting middleware by Tuesday, and Ananya will conduct vulnerability testing on Friday. The team formally agreed to postpone third-party OAuth providers until v2.',
    keyPoints: [
      'Gemini API keys are confined exclusively to backend environment variables.',
      'Audio uploads capped at 25MB with mime-type validation.',
      'Rate limiting middleware scheduled for Tuesday.',
      'Vulnerability audit planned for Friday.',
      'Postponed third-party OAuth integrations to v2.'
    ],
    decisions: [
      {
        id: 'dec-2-1',
        decision: 'Keep all AI credentials strictly backend-only',
        rationale: 'Prevent API key leakage and protect quota.',
        meetingId: 'demo-meeting-2',
        meetingTitle: 'Product Strategy & Security Alignment',
        date: '2026-10-27'
      },
      {
        id: 'dec-2-2',
        decision: 'Defer third-party OAuth until v2',
        rationale: 'Focus hackathon development on core meeting intelligence workflows.',
        meetingId: 'demo-meeting-2',
        meetingTitle: 'Product Strategy & Security Alignment',
        date: '2026-10-27'
      }
    ],
    followUpAgenda: [
      'Review rate limiting load test results',
      'Audit OWASP Top 10 compliance for API endpoints'
    ],
    actionItems: [
      {
        id: 'task-2-1',
        meetingId: 'demo-meeting-2',
        meetingTitle: 'Product Strategy & Security Alignment',
        task: 'Implement rate-limiting and input validation middleware',
        owner: 'Dev',
        deadline: 'Tuesday',
        priority: 'High',
        status: 'Completed',
        createdAt: '2026-10-27T14:00:00.000Z'
      },
      {
        id: 'task-2-2',
        meetingId: 'demo-meeting-2',
        meetingTitle: 'Product Strategy & Security Alignment',
        task: 'Conduct vulnerability assessment on backend endpoints',
        owner: 'Ananya',
        deadline: 'Friday',
        priority: 'Medium',
        status: 'Pending',
        createdAt: '2026-10-27T14:00:00.000Z'
      }
    ],
    isDemo: true,
    createdAt: '2026-10-27T14:00:00.000Z',
    updatedAt: '2026-10-27T14:45:00.000Z'
  }
];
