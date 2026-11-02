// Meeting Ghost Client API wrapper

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error || `Request failed with status ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${endpoint}:`, err.message);
    throw err;
  }
}

export const api = {
  // System Health
  getHealth: () => request('/health'),

  // Meetings
  listMeetings: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/meetings${query ? `?${query}` : ''}`);
  },
  getMeeting: (id) => request(`/meetings/${id}`),
  analyzeTranscript: (payload) => request('/meetings/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getCopilotSuggestions: (payload) => request('/meetings/copilot', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createMeeting: (payload) => request('/meetings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateMeeting: (id, updates) => request(`/meetings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }),
  deleteMeeting: (id) => request(`/meetings/${id}`, {
    method: 'DELETE',
  }),
  generateMom: (id) => request(`/meetings/${id}/mom/generate`, {
    method: 'POST',
  }),
  saveMom: (id, mom, isEdited = false) => request(`/meetings/${id}/mom`, {
    method: 'POST',
    body: JSON.stringify({ mom, isEdited }),
  }),
  generateMomDirect: (payload) => request('/meetings/mom/generate-direct', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Tasks
  listTasks: (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    return request(`/tasks${query ? `?${query}` : ''}`);
  },
  updateTask: (id, updates) => request(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  }),

  // GitHub Integration
  getGitHubStatus: () => request('/github/status'),
  getGitHubOAuthUrl: (state) => request(`/github/auth-url${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  connectGitHub: (token) => request('/github/connect', {
    method: 'POST',
    body: JSON.stringify({ token }),
  }),
  disconnectGitHub: () => request('/github/disconnect', {
    method: 'POST',
  }),
  listGitHubRepos: (perPage = 50) => request(`/github/repos?perPage=${perPage}`),
  listGitHubIssues: (owner, repo, state = 'all') => request(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}`),
  getGitHubIssueDetails: (owner, repo, number) => request(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(number)}`),
  linkTaskToGitHub: (taskId, payload) => request(`/github/tasks/${taskId}/link`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  unlinkTaskFromGitHub: (taskId) => request(`/github/tasks/${taskId}/unlink`, {
    method: 'POST',
  }),
  syncTaskWithGitHub: (taskId) => request(`/github/tasks/${taskId}/sync`, {
    method: 'POST',
  }),
  getDeveloperInsights: (owner, repo) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights${query}`);
  },
  getDeveloperSummary: (owner, repo, developer) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    if (developer) params.append('developer', developer);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/summary${query}`);
  },
  getDeveloperCommits: ({ owner, repo, branch, author, limit, page } = {}) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    if (branch) params.append('branch', branch);
    if (author) params.append('author', author);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/commits${query}`);
  },
  getDeveloperPulls: ({ owner, repo, state, author, limit, page } = {}) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    if (state) params.append('state', state);
    if (author) params.append('author', author);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/pulls${query}`);
  },
  getDeveloperIssues: ({ owner, repo, state, assignee, author, limit, page } = {}) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    if (state) params.append('state', state);
    if (assignee) params.append('assignee', assignee);
    if (author) params.append('author', author);
    if (limit) params.append('limit', limit);
    if (page) params.append('page', page);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/issues${query}`);
  },
  getDeveloperList: ({ owner, repo, hideBots, developer } = {}) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    if (hideBots !== undefined) params.append('hideBots', hideBots);
    if (developer) params.append('developer', developer);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/developers${query}`);
  },
  getDeveloperProfile: (username, { owner, repo } = {}) => {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (repo) params.append('repo', repo);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/developer-insights/developers/${encodeURIComponent(username)}${query}`);
  },

  // Commitment vs Execution Intelligence (Phase 3)
  getCommitmentInsights: ({ meetingId, owner, status, userMapping, refresh } = {}) => {
    const params = new URLSearchParams();
    if (meetingId) params.append('meetingId', meetingId);
    if (owner) params.append('owner', owner);
    if (status) params.append('status', status);
    if (userMapping) {
      params.append('userMapping', typeof userMapping === 'string' ? userMapping : JSON.stringify(userMapping));
    }
    if (refresh) params.append('refresh', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/commitment-insights${query}`);
  },
  postCommitmentInsights: (payload = {}) => request('/github/commitment-insights', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getTaskCommitmentInsight: (taskId, { mappedUser, refresh } = {}) => {
    const params = new URLSearchParams();
    if (mappedUser) params.append('mappedUser', mappedUser);
    if (refresh) params.append('refresh', 'true');
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/github/commitment-insights/${encodeURIComponent(taskId)}${query}`);
  },

  // Decisions
  listDecisions: () => request('/decisions'),

  // Analytics & Dashboard Stats
  getAnalytics: () => request('/dashboard/stats'),

  // Q&A / Ask
  askQuestion: (question) => request('/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  }),

  // Seed / Demo Data
  getSampleTranscript: () => request('/seed/sample-transcript'),
  getSampleAudioBlob: async () => {
    const res = await fetch(`${BASE_URL}/audio/sample`);
    if (!res.ok) throw new Error('Failed to load sample audio');
    return res.blob();
  },
  seedDemoData: () => request('/seed', { method: 'POST' }),
  resetData: () => request('/seed/reset', { method: 'POST' }),

  // Audio Upload with progress tracking
  uploadAudio: (audioFile, onProgress) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('audio', audioFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/audio/transcribe`);

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || `Upload failed with status ${xhr.status}`));
          }
        } catch (e) {
          reject(new Error('Invalid response received from server.'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error occurred during audio upload.'));
      };

      xhr.send(formData);
    });
  },
};
