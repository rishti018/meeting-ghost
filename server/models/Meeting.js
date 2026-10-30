import mongoose from 'mongoose';

const decisionSchema = new mongoose.Schema({
  decision: {
    type: String,
    required: [true, 'Decision text is required'],
    trim: true,
  },
  rationale: {
    type: String,
    default: 'Agreed upon during discussion',
    trim: true,
  },
}, { _id: true, timestamps: false });

const preparationSchema = new mongoose.Schema({
  personName: {
    type: String,
    default: '',
    trim: true,
  },
  linkedinUrl: {
    type: String,
    default: '',
    trim: true,
  },
  purpose: {
    type: String,
    default: '',
    trim: true,
  },
  agenda: {
    type: [String],
    default: [],
  },
  desiredOutcome: {
    type: String,
    default: '',
    trim: true,
  },
}, { _id: false });

const momQuestionSchema = new mongoose.Schema({
  question: { type: String, default: '' },
  response: { type: String, default: '' },
  askedBy: { type: String, default: 'Not specified' },
}, { _id: false });

const momActionItemSchema = new mongoose.Schema({
  task: { type: String, default: '' },
  owner: { type: String, default: 'Unassigned' },
  deadline: { type: String, default: 'Not specified' },
  priority: { type: String, default: 'Medium' },
  status: { type: String, default: 'Pending' },
}, { _id: false });

const momDecisionSchema = new mongoose.Schema({
  decision: { type: String, default: '' },
  rationale: { type: String, default: 'Agreed upon during discussion' },
}, { _id: false });

const momFollowUpSchema = new mongoose.Schema({
  details: { type: String, default: 'Not specified' },
  date: { type: String, default: 'Not specified' },
  time: { type: String, default: 'Not specified' },
  agenda: { type: String, default: 'Not specified' },
}, { _id: false });

const momSchema = new mongoose.Schema({
  title: { type: String, default: 'Not specified' },
  meetingDate: { type: String, default: 'Not specified' },
  meetingTime: { type: String, default: 'Not specified' },
  department: { type: String, default: 'Not specified' },
  participants: { type: [String], default: [] },
  objective: { type: String, default: 'Not specified' },
  agenda: { type: [String], default: [] },
  keyDiscussionPoints: { type: [String], default: [] },
  questionsAndResponses: { type: [momQuestionSchema], default: [] },
  decisions: { type: [momDecisionSchema], default: [] },
  actionItems: { type: [momActionItemSchema], default: [] },
  pendingIssues: { type: [String], default: [] },
  followUpMeeting: { type: momFollowUpSchema, default: () => ({}) },
  conclusion: { type: String, default: 'Not specified' },
  generatedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  isEdited: { type: Boolean, default: false },
}, { _id: false });

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Meeting title is required'],
    trim: true,
  },
  date: {
    type: String,
    default: () => new Date().toISOString().split('T')[0],
  },
  department: {
    type: String,
    default: 'General',
    trim: true,
  },
  transcript: {
    type: String,
    required: [true, 'Meeting transcript is required'],
  },
  summary: {
    type: String,
    required: [true, 'Summary is required'],
  },
  detailedSummary: {
    type: String,
    default: '',
  },
  keyPoints: {
    type: [String],
    default: [],
  },
  decisions: {
    type: [decisionSchema],
    default: [],
  },
  actionItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
  }],
  followUpAgenda: {
    type: [String],
    default: [],
  },
  preparation: {
    type: preparationSchema,
    default: () => ({}),
  },
  mom: {
    type: momSchema,
    default: null,
  },
  isDemo: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.rawTranscript = ret.transcript;
      return ret;
    },
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.rawTranscript = ret.transcript;
      return ret;
    },
  },
});

// Virtual getter for rawTranscript
meetingSchema.virtual('rawTranscript').get(function () {
  return this.transcript;
});

export const Meeting = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
export default Meeting;

