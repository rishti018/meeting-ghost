import mongoose from 'mongoose';

const githubResourceSchema = new mongoose.Schema({
  repoOwner: { type: String, default: '', trim: true },
  repoName: { type: String, default: '', trim: true },
  repoFullName: { type: String, default: '', trim: true },
  resourceType: {
    type: String,
    enum: ['issue', 'pull_request', 'repository'],
    default: 'issue',
  },
  issueNumber: { type: Number, default: null },
  issueTitle: { type: String, default: '', trim: true },
  issueState: { type: String, default: '', trim: true }, // "open" | "closed"
  htmlUrl: { type: String, default: '', trim: true },
  assignee: { type: String, default: '', trim: true },
  // Checklist information
  checklistTotal: { type: Number, default: 0 },
  checklistCompleted: { type: Number, default: 0 },
  // Pull request info
  isPullRequest: { type: Boolean, default: false },
  prMerged: { type: Boolean, default: false },
  // Commit activity
  commitCount: { type: Number, default: 0 },
  lastCommitMessage: { type: String, default: '', trim: true },
  lastCommitDate: { type: Date, default: null },
  // Sync metadata
  lastSyncedAt: { type: Date, default: null },
  syncStatus: {
    type: String,
    enum: ['synced', 'error', 'pending', 'not_linked'],
    default: 'synced',
  },
  syncError: { type: String, default: '', trim: true },
}, { _id: false });

const taskSchema = new mongoose.Schema({
  meetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: [true, 'Meeting ID is required'],
    index: true,
  },
  meetingTitle: {
    type: String,
    default: '',
    trim: true,
  },
  task: {
    type: String,
    required: [true, 'Task description is required'],
    trim: true,
  },
  owner: {
    type: String,
    default: 'Unassigned',
    trim: true,
  },
  deadline: {
    type: String,
    default: 'Not specified',
    trim: true,
  },
  dueDateTime: {
    type: Date,
    default: null,
  },
  startedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium',
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending',
    index: true,
  },
  github: {
    type: githubResourceSchema,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.description = ret.task;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.description = ret.task;
      return ret;
    },
  },
});

// Alias description to task
taskSchema.virtual('description')
  .get(function () {
    return this.task;
  })
  .set(function (value) {
    this.task = value;
  });

export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);
export default Task;

