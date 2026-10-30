import mongoose from 'mongoose';
import { Meeting } from '../models/Meeting.js';
import { Task } from '../models/Task.js';
import { isDbConnected, connectToDatabase, getLastDiagnostic } from '../config/db.js';
import { extractWithRuleFallback, analyzeMeetingTranscript } from './geminiService.js';
import { generateMinutesOfMeeting, sanitizeMomOutput } from './momService.js';

async function ensureConnected() {
  if (!isDbConnected()) {
    await connectToDatabase();
  }
  if (!isDbConnected()) {
    const diag = getLastDiagnostic();
    const error = new Error(diag?.message || 'Database not connected. Please verify your MongoDB Atlas connection.');
    error.status = 503;
    throw error;
  }
}

/**
 * Save meeting and its action items atomically with rollback on error.
 * Prevents duplicate task creation when retrying or reprocessing.
 */
export async function saveMeetingWithTasks({
  meetingId,
  id,
  title,
  meetingDate,
  date,
  department = 'General',
  rawTranscript,
  transcript,
  summary,
  detailedSummary,
  keyPoints = [],
  actionItems = [],
  decisions = [],
  followUpAgenda = [],
  preparation = {},
  isDemo = false,
}) {
  await ensureConnected();

  const finalTranscript = rawTranscript || transcript;
  if (!finalTranscript || finalTranscript.trim().length === 0) {
    throw new Error('Transcript is required to save meeting.');
  }

  const meetingTitle = (title && title.trim()) ? title.trim() : 'Team Alignment Meeting';
  const effectiveDate = meetingDate || date || new Date().toISOString().split('T')[0];
  const targetId = meetingId || id;

  let meeting = null;
  if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
    meeting = await Meeting.findById(targetId);
  }

  // If no targetId or meeting not found by ID, look up by exact title to prevent duplicates
  if (!meeting && meetingTitle) {
    meeting = await Meeting.findOne({ title: meetingTitle });
  }

  // If actionItems were not passed or are empty, extract them from transcript
  let finalActionItems = Array.isArray(actionItems) ? [...actionItems] : [];
  let finalDecisions = Array.isArray(decisions) ? [...decisions] : [];
  let finalFollowUp = Array.isArray(followUpAgenda) ? [...followUpAgenda] : [];
  let finalKeyPoints = Array.isArray(keyPoints) ? [...keyPoints] : [];
  let finalSummary = summary;
  let finalDetailedSummary = detailedSummary;

  if (finalActionItems.length === 0 && finalTranscript) {
    console.log(`[MeetingService] Action items empty for "${meetingTitle}". Running deterministic extractor.`);
    const fallbackData = extractWithRuleFallback(finalTranscript, meetingTitle, effectiveDate);
    if (fallbackData.actionItems && fallbackData.actionItems.length > 0) {
      finalActionItems = fallbackData.actionItems;
    }
    if (finalDecisions.length === 0 && fallbackData.decisions?.length > 0) {
      finalDecisions = fallbackData.decisions;
    }
    if (finalFollowUp.length === 0 && fallbackData.followUpAgenda?.length > 0) {
      finalFollowUp = fallbackData.followUpAgenda;
    }
    if (!finalSummary) {
      finalSummary = fallbackData.summary;
    }
    if (!finalDetailedSummary) {
      finalDetailedSummary = fallbackData.detailedSummary;
    }
  }

  const formattedPrep = preparation && typeof preparation === 'object' ? {
    personName: (preparation.personName || '').trim(),
    linkedinUrl: (preparation.linkedinUrl || '').trim(),
    purpose: (preparation.purpose || '').trim(),
    agenda: Array.isArray(preparation.agenda)
      ? preparation.agenda.map(a => String(a).trim()).filter(Boolean)
      : [],
    desiredOutcome: (preparation.desiredOutcome || '').trim(),
  } : {};

  if (meeting) {
    // Update existing meeting document
    meeting.title = meetingTitle;
    meeting.date = effectiveDate;
    meeting.department = department || meeting.department || 'General';
    meeting.transcript = finalTranscript.trim();
    meeting.summary = finalSummary || meeting.summary || 'Meeting summary extracted from transcript.';
    meeting.detailedSummary = finalDetailedSummary || meeting.detailedSummary || finalSummary || '';
    if (finalKeyPoints.length > 0) meeting.keyPoints = finalKeyPoints;
    if (finalDecisions.length > 0) {
      meeting.decisions = finalDecisions.map(d => ({
        decision: d.decision || 'Recorded decision',
        rationale: d.rationale || 'Agreed upon during discussion',
      }));
    }
    if (finalFollowUp.length > 0) meeting.followUpAgenda = finalFollowUp;
    if (Object.keys(formattedPrep).some(k => formattedPrep[k])) {
      meeting.preparation = formattedPrep;
    }
    meeting.isDemo = Boolean(isDemo);
    await meeting.save();

    // Prevent duplicate task creation: remove previous tasks before inserting new ones
    await Task.deleteMany({ meetingId: meeting._id });
  } else {
    meeting = new Meeting({
      title: meetingTitle,
      date: effectiveDate,
      department: department || 'General',
      transcript: finalTranscript.trim(),
      summary: finalSummary || 'Meeting summary extracted from transcript.',
      detailedSummary: finalDetailedSummary || finalSummary || '',
      keyPoints: finalKeyPoints,
      decisions: finalDecisions.map(d => ({
        decision: d.decision || 'Recorded decision',
        rationale: d.rationale || 'Agreed upon during discussion',
      })),
      followUpAgenda: finalFollowUp,
      preparation: formattedPrep,
      isDemo: Boolean(isDemo),
    });
    await meeting.save();
  }

  let savedTasks = [];
  try {
    if (finalActionItems.length > 0) {
      const taskDocs = finalActionItems.map(item => {
        let due = null;
        if (item.dueDateTime) {
          const d = new Date(item.dueDateTime);
          if (!isNaN(d.getTime())) due = d;
        }

        const taskStatus = ['Pending', 'In Progress', 'Completed'].includes(item.status) ? item.status : 'Pending';
        let started = null;
        if (item.startedAt) {
          const s = new Date(item.startedAt);
          if (!isNaN(s.getTime())) started = s;
        } else if (taskStatus === 'In Progress') {
          started = new Date();
        }

        let completed = null;
        if (item.completedAt) {
          const c = new Date(item.completedAt);
          if (!isNaN(c.getTime())) completed = c;
        } else if (taskStatus === 'Completed') {
          completed = new Date();
        }

        return {
          meetingId: meeting._id,
          meetingTitle: meeting.title,
          task: (item.task || item.description || 'Unspecified task').trim(),
          owner: (item.owner && item.owner.trim()) ? item.owner.trim() : 'Unassigned',
          deadline: (item.deadline && item.deadline.trim()) ? item.deadline.trim() : 'Not specified',
          dueDateTime: due,
          startedAt: started,
          completedAt: completed,
          priority: ['High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
          status: taskStatus,
        };
      });

      savedTasks = await Task.insertMany(taskDocs);
      meeting.actionItems = savedTasks.map(t => t._id);
      await meeting.save();
    } else {
      meeting.actionItems = [];
      await meeting.save();
    }

    const meetingObj = meeting.toObject();
    meetingObj.actionItems = savedTasks.map(t => t.toObject());
    return meetingObj;
  } catch (err) {
    console.error('[MeetingService] Error creating action items:', err.message);
    throw new Error(`Failed to save meeting intelligence: ${err.message}`);
  }
}

/**
 * List all meetings with newest first, search, and pagination
 */
export async function listMeetings({ search = '', page = 1, limit = 50 } = {}) {
  await ensureConnected();

  const query = {};
  if (search && search.trim().length > 0) {
    const regex = new RegExp(search.trim(), 'i');
    query.$or = [
      { title: regex },
      { summary: regex },
      { department: regex },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 50);
  const skip = (pageNum - 1) * limitNum;

  const [total, meetings] = await Promise.all([
    Meeting.countDocuments(query),
    Meeting.find(query)
      .populate('actionItems')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
  ]);

  return {
    meetings: meetings.map(m => m.toObject()),
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Get single meeting by ID with populated action items.
 * Performs self-healing if action items were not yet extracted from transcript.
 */
export async function getMeetingById(id) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }

  const meeting = await Meeting.findById(id).populate('actionItems');
  if (!meeting) {
    return null;
  }

  const meetingObj = meeting.toObject();

  // If actionItems were not populated or linked directly, fetch by meetingId
  if (!meetingObj.actionItems || meetingObj.actionItems.length === 0) {
    let tasks = await Task.find({ meetingId: meeting._id }).sort({ createdAt: 1 });

    // Self-healing: If still 0 tasks and transcript has substantive text, extract and persist
    if (tasks.length === 0 && meeting.transcript && meeting.transcript.trim().length > 20) {
      console.log(`[MeetingService] Meeting "${meeting.title}" has 0 action items. Extracting from transcript...`);
      try {
        const intel = extractWithRuleFallback(meeting.transcript, meeting.title, meeting.date);
        if (intel.actionItems && intel.actionItems.length > 0) {
          const taskDocs = intel.actionItems.map(item => ({
            meetingId: meeting._id,
            meetingTitle: meeting.title,
            task: (item.task || item.description || 'Unspecified task').trim(),
            owner: (item.owner && item.owner.trim()) ? item.owner.trim() : 'Unassigned',
            deadline: (item.deadline && item.deadline.trim()) ? item.deadline.trim() : 'Not specified',
            dueDateTime: item.dueDateTime ? new Date(item.dueDateTime) : null,
            startedAt: item.status === 'In Progress' ? new Date() : (item.startedAt ? new Date(item.startedAt) : null),
            completedAt: item.status === 'Completed' ? new Date() : (item.completedAt ? new Date(item.completedAt) : null),
            priority: ['High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
            status: ['Pending', 'In Progress', 'Completed'].includes(item.status) ? item.status : 'Pending',
          }));
          tasks = await Task.insertMany(taskDocs);
          meeting.actionItems = tasks.map(t => t._id);
          await meeting.save();
        }
      } catch (err) {
        console.error(`[MeetingService] Self-healing failed for ${meeting._id}:`, err.message);
      }
    }

    meetingObj.actionItems = tasks.map(t => (t.toObject ? t.toObject() : t));
  }

  return meetingObj;
}

/**
 * Reprocess an existing meeting: re-analyze transcript and refresh action items
 */
export async function reprocessMeetingById(id) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid meeting ID format');
  }

  const meeting = await Meeting.findById(id);
  if (!meeting) {
    throw new Error('Meeting not found');
  }

  console.log(`[MeetingService] Reprocessing meeting "${meeting.title}" (${meeting._id})...`);
  const intel = await analyzeMeetingTranscript({
    transcript: meeting.transcript,
    title: meeting.title,
    meetingDate: meeting.date,
    preparation: meeting.preparation,
  });

  return await saveMeetingWithTasks({
    meetingId: meeting._id,
    title: meeting.title,
    meetingDate: meeting.date,
    department: meeting.department,
    rawTranscript: meeting.transcript,
    summary: intel.summary,
    detailedSummary: intel.detailedSummary,
    keyPoints: intel.keyPoints,
    actionItems: intel.actionItems,
    decisions: intel.decisions,
    followUpAgenda: intel.followUpAgenda,
    preparation: meeting.preparation,
    isDemo: meeting.isDemo,
  });
}

/**
 * Update editable meeting details
 */
export async function updateMeeting(id, updateFields) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid meeting ID format');
  }

  const allowedUpdates = {};
  if (updateFields.title !== undefined) allowedUpdates.title = updateFields.title.trim();
  if (updateFields.date !== undefined) allowedUpdates.date = updateFields.date;
  if (updateFields.department !== undefined) allowedUpdates.department = updateFields.department.trim();
  if (updateFields.summary !== undefined) allowedUpdates.summary = updateFields.summary.trim();
  if (updateFields.detailedSummary !== undefined) allowedUpdates.detailedSummary = updateFields.detailedSummary.trim();
  if (Array.isArray(updateFields.keyPoints)) allowedUpdates.keyPoints = updateFields.keyPoints;
  if (Array.isArray(updateFields.followUpAgenda)) allowedUpdates.followUpAgenda = updateFields.followUpAgenda;
  if (updateFields.preparation !== undefined && typeof updateFields.preparation === 'object') {
    allowedUpdates.preparation = {
      personName: (updateFields.preparation.personName || '').trim(),
      linkedinUrl: (updateFields.preparation.linkedinUrl || '').trim(),
      purpose: (updateFields.preparation.purpose || '').trim(),
      agenda: Array.isArray(updateFields.preparation.agenda)
        ? updateFields.preparation.agenda.map(a => String(a).trim()).filter(Boolean)
        : [],
      desiredOutcome: (updateFields.preparation.desiredOutcome || '').trim(),
    };
  }

  const updatedMeeting = await Meeting.findByIdAndUpdate(
    id,
    { $set: allowedUpdates },
    { returnDocument: 'after', runValidators: true }
  ).populate('actionItems');

  if (!updatedMeeting) {
    throw new Error('Meeting not found');
  }

  // Update meetingTitle in associated tasks if title was updated
  if (allowedUpdates.title) {
    await Task.updateMany({ meetingId: id }, { $set: { meetingTitle: allowedUpdates.title } });
  }

  return updatedMeeting.toObject();
}

/**
 * Delete a meeting and all its associated action items
 */
export async function deleteMeeting(id) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return false;
  }

  const meeting = await Meeting.findById(id);
  if (!meeting) {
    return false;
  }

  await Task.deleteMany({ meetingId: id });
  await Meeting.findByIdAndDelete(id);
  return true;
}

/**
 * List all tasks with filtering by status, priority, owner, meetingId
 */
export async function listTasks({ status, priority, owner, meetingId } = {}) {
  await ensureConnected();

  const query = {};

  if (status && status !== 'All') {
    query.status = status;
  }
  if (priority && priority !== 'All') {
    query.priority = priority;
  }
  if (owner && owner !== 'All') {
    query.owner = owner;
  }
  if (meetingId && meetingId !== 'All' && mongoose.Types.ObjectId.isValid(meetingId)) {
    query.meetingId = meetingId;
  }

  const tasks = await Task.find(query)
    .populate('meetingId', 'title date')
    .sort({ createdAt: -1 });

  return tasks.map(t => {
    const obj = t.toObject();
    if (obj.meetingId && typeof obj.meetingId === 'object') {
      if (!obj.meetingTitle) {
        obj.meetingTitle = obj.meetingId.title || '';
      }
      obj.meetingId = obj.meetingId._id ? obj.meetingId._id.toString() : obj.meetingId.toString();
    }
    return obj;
  });
}

/**
 * Update task status, owner, deadline, priority, or description
 */
export async function updateTask(id, updateFields) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid task ID format');
  }

  const currentTask = await Task.findById(id);
  if (!currentTask) {
    throw new Error('Task not found');
  }

  const allowedUpdates = {};
  if (updateFields.status) {
    if (!['Pending', 'In Progress', 'Completed'].includes(updateFields.status)) {
      throw new Error('Status must be Pending, In Progress, or Completed.');
    }
    allowedUpdates.status = updateFields.status;

    if (updateFields.status === 'In Progress') {
      // Record start date and time if not yet set; do not reset during subsequent updates
      if (!currentTask.startedAt) {
        allowedUpdates.startedAt = new Date();
      }
      if (currentTask.completedAt) {
        allowedUpdates.completedAt = null;
      }
    } else if (updateFields.status === 'Completed') {
      // Record completion date and time
      if (!currentTask.completedAt) {
        allowedUpdates.completedAt = new Date();
      }
      if (!currentTask.startedAt) {
        allowedUpdates.startedAt = currentTask.createdAt || new Date();
      }
    } else if (updateFields.status === 'Pending') {
      // Reopened to Pending clears completedAt, but preserves startedAt if already started
      allowedUpdates.completedAt = null;
    }
  }

  if (updateFields.priority) {
    if (!['High', 'Medium', 'Low'].includes(updateFields.priority)) {
      throw new Error('Priority must be High, Medium, or Low.');
    }
    allowedUpdates.priority = updateFields.priority;
  }

  if (updateFields.owner !== undefined) {
    allowedUpdates.owner = updateFields.owner ? updateFields.owner.trim() : 'Unassigned';
  }

  if (updateFields.deadline !== undefined) {
    allowedUpdates.deadline = updateFields.deadline ? updateFields.deadline.trim() : 'Not specified';
  }

  if (updateFields.dueDateTime !== undefined) {
    if (updateFields.dueDateTime === null || updateFields.dueDateTime === '') {
      allowedUpdates.dueDateTime = null;
    } else {
      const parsedDue = new Date(updateFields.dueDateTime);
      if (!isNaN(parsedDue.getTime())) {
        allowedUpdates.dueDateTime = parsedDue;
      }
    }
  }

  if (updateFields.startedAt !== undefined) {
    if (updateFields.startedAt === null || updateFields.startedAt === '') {
      allowedUpdates.startedAt = null;
    } else {
      const parsedStart = new Date(updateFields.startedAt);
      if (!isNaN(parsedStart.getTime())) {
        allowedUpdates.startedAt = parsedStart;
      }
    }
  }

  if (updateFields.completedAt !== undefined) {
    if (updateFields.completedAt === null || updateFields.completedAt === '') {
      allowedUpdates.completedAt = null;
    } else {
      const parsedComp = new Date(updateFields.completedAt);
      if (!isNaN(parsedComp.getTime())) {
        allowedUpdates.completedAt = parsedComp;
      }
    }
  }

  if (updateFields.task || updateFields.description) {
    allowedUpdates.task = (updateFields.task || updateFields.description).trim();
  }

  const updatedTask = await Task.findByIdAndUpdate(
    id,
    { $set: allowedUpdates },
    { returnDocument: 'after', runValidators: true }
  ).populate('meetingId', 'title date');

  if (!updatedTask) {
    throw new Error('Task not found');
  }

  const taskObj = updatedTask.toObject();
  if (taskObj.meetingId && typeof taskObj.meetingId === 'object') {
    if (!taskObj.meetingTitle) {
      taskObj.meetingTitle = taskObj.meetingId.title || '';
    }
    taskObj.meetingId = taskObj.meetingId._id ? taskObj.meetingId._id.toString() : taskObj.meetingId.toString();
  }

  return taskObj;
}

/**
 * Get all confirmed decisions across meetings
 */
export async function listAllDecisions() {
  await ensureConnected();

  const meetings = await Meeting.find(
    { 'decisions.0': { $exists: true } },
    'title date decisions createdAt'
  ).sort({ createdAt: -1 });

  const allDecisions = [];
  for (const m of meetings) {
    if (Array.isArray(m.decisions)) {
      for (const d of m.decisions) {
        allDecisions.push({
          id: d._id ? d._id.toString() : undefined,
          decision: d.decision,
          rationale: d.rationale || 'Agreed upon during discussion',
          meetingId: m._id.toString(),
          meetingTitle: m.title,
          meetingDate: m.date || (m.createdAt ? m.createdAt.toISOString().split('T')[0] : 'Unknown'),
        });
      }
    }
  }

  return allDecisions;
}

/**
 * Compute real-time dashboard analytics from stored database records.
 * Handles empty meetings, empty tasks, and missing optional fields gracefully.
 */
export async function getDashboardAnalytics() {
  await ensureConnected();

  const [
    totalMeetings,
    totalTasks,
    pendingTasks,
    inProgressTasks,
    completedTasks,
    highPriority,
    mediumPriority,
    lowPriority,
    meetingsWithDecisions,
    recentMeetingsRaw,
    ownerAgg
  ] = await Promise.all([
    Meeting.countDocuments({}),
    Task.countDocuments({}),
    Task.countDocuments({ status: 'Pending' }),
    Task.countDocuments({ status: 'In Progress' }),
    Task.countDocuments({ status: 'Completed' }),
    Task.countDocuments({ priority: 'High' }),
    Task.countDocuments({ priority: 'Medium' }),
    Task.countDocuments({ priority: 'Low' }),
    Meeting.find({}, 'decisions').lean().catch(() => []),
    Meeting.find({}).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    Task.aggregate([
      { $match: { owner: { $nin: ['Unassigned', '', null] } } },
      { $group: { _id: '$owner', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).catch(() => [])
  ]);

  const validTotalMeetings = Math.max(0, Number(totalMeetings) || 0);
  const validTotalTasks = Math.max(0, Number(totalTasks) || 0);
  const validPendingTasks = Math.max(0, Number(pendingTasks) || 0);
  const validInProgressTasks = Math.max(0, Number(inProgressTasks) || 0);
  const validCompletedTasks = Math.max(0, Number(completedTasks) || 0);
  const validHighPriority = Math.max(0, Number(highPriority) || 0);
  const validMediumPriority = Math.max(0, Number(mediumPriority) || 0);
  const validLowPriority = Math.max(0, Number(lowPriority) || 0);

  const openTasks = validPendingTasks + validInProgressTasks;
  const completionPercentage = validTotalTasks > 0
    ? Math.round((validCompletedTasks / validTotalTasks) * 100)
    : 0;

  const totalDecisions = Array.isArray(meetingsWithDecisions)
    ? meetingsWithDecisions.reduce(
        (acc, m) => acc + (Array.isArray(m?.decisions) ? m.decisions.length : 0),
        0
      )
    : 0;

  const topOwners = Array.isArray(ownerAgg)
    ? ownerAgg
        .filter(o => o && o._id && String(o._id).trim() !== '' && String(o._id).trim() !== 'Unassigned')
        .map(o => ({ owner: String(o._id).trim(), count: Number(o.count) || 0 }))
    : [];

  const tasksByOwner = {};
  for (const o of topOwners) {
    if (o.owner) {
      tasksByOwner[o.owner] = o.count;
    }
  }

  const safeRecentRaw = Array.isArray(recentMeetingsRaw) ? recentMeetingsRaw : [];
  const recentMeetings = await Promise.all(
    safeRecentRaw.map(async (m, idx) => {
      let actionCount = Array.isArray(m?.actionItems) ? m.actionItems.length : 0;
      if (actionCount === 0 && m?._id) {
        actionCount = await Task.countDocuments({ meetingId: m._id }).catch(() => 0);
      }

      let meetingId = '';
      if (m?._id) {
        meetingId = typeof m._id === 'object' && m._id.toString ? m._id.toString() : String(m._id);
      } else if (m?.id) {
        meetingId = String(m.id);
      } else {
        meetingId = `recent-meeting-${idx}`;
      }

      const rawDate = m?.date || (m?.createdAt ? new Date(m.createdAt).toISOString().split('T')[0] : '');
      const safeDate = rawDate || new Date().toISOString().split('T')[0];

      return {
        id: meetingId,
        title: m?.title || 'Untitled Meeting',
        date: safeDate,
        summary: m?.summary || 'No summary recorded.',
        actionCount,
        decisionCount: Array.isArray(m?.decisions) ? m.decisions.length : 0,
        isDemo: Boolean(m?.isDemo),
      };
    })
  );

  return {
    meetingCount: validTotalMeetings,
    totalMeetings: validTotalMeetings,
    totalTasks: validTotalTasks,
    openTasks,
    pendingTasks: validPendingTasks,
    inProgressTasks: validInProgressTasks,
    completedTasks: validCompletedTasks,
    completionRate: completionPercentage,
    completionPercentage,
    decisionCount: totalDecisions,
    totalDecisions,
    priorityBreakdown: {
      High: validHighPriority,
      Medium: validMediumPriority,
      Low: validLowPriority,
    },
    statusBreakdown: {
      Pending: validPendingTasks,
      'In Progress': validInProgressTasks,
      Completed: validCompletedTasks,
    },
    tasksByOwner,
    topOwners,
    recentMeetings,
  };
}

/**
 * Generate Minutes of Meeting (MoM) for a saved meeting record
 */
export async function generateMeetingMom(id) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid meeting ID format');
  }

  const meeting = await Meeting.findById(id).populate('actionItems');
  if (!meeting) {
    throw new Error('Meeting not found');
  }

  const momData = await generateMinutesOfMeeting({
    transcript: meeting.transcript || meeting.rawTranscript || '',
    title: meeting.title,
    meetingDate: meeting.date,
    department: meeting.department,
    preparation: meeting.preparation || {},
    existingIntel: {
      title: meeting.title,
      date: meeting.date,
      department: meeting.department,
      summary: meeting.summary,
      detailedSummary: meeting.detailedSummary,
      keyPoints: meeting.keyPoints,
      decisions: meeting.decisions,
      actionItems: meeting.actionItems,
      followUpAgenda: meeting.followUpAgenda,
    },
  });

  return {
    meetingId: meeting._id.toString(),
    mom: momData,
  };
}

/**
 * Save / Update Minutes of Meeting (MoM) for a meeting.
 * Synchronizes new action items and decisions without creating duplicates.
 */
export async function saveMeetingMom(id, momInput, { isEdited = false } = {}) {
  await ensureConnected();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid meeting ID format');
  }

  const meeting = await Meeting.findById(id).populate('actionItems');
  if (!meeting) {
    throw new Error('Meeting not found');
  }

  const sanitizedMom = sanitizeMomOutput(momInput, {
    title: meeting.title,
    meetingDate: meeting.date,
    department: meeting.department,
    preparation: meeting.preparation,
    existingIntel: meeting,
  });

  sanitizedMom.isEdited = Boolean(isEdited);
  sanitizedMom.updatedAt = new Date();
  meeting.mom = sanitizedMom;

  // Requirement 6: Connect MoM action items to Action Tracker without duplicates
  if (Array.isArray(sanitizedMom.actionItems) && sanitizedMom.actionItems.length > 0) {
    const existingTasks = await Task.find({ meetingId: meeting._id });
    const existingTaskMap = new Map();
    existingTasks.forEach(t => {
      existingTaskMap.set((t.task || '').trim().toLowerCase(), t);
    });

    const newTasksToInsert = [];

    for (const item of sanitizedMom.actionItems) {
      const taskText = (item.task || '').trim();
      if (!taskText) continue;

      const key = taskText.toLowerCase();
      if (existingTaskMap.has(key)) {
        // Update existing task if fields changed
        const existingTask = existingTaskMap.get(key);
        let modified = false;
        if (item.owner && item.owner !== 'Unassigned' && existingTask.owner !== item.owner) {
          existingTask.owner = item.owner;
          modified = true;
        }
        if (item.deadline && item.deadline !== 'Not specified' && existingTask.deadline !== item.deadline) {
          existingTask.deadline = item.deadline;
          modified = true;
        }
        if (item.priority && existingTask.priority !== item.priority) {
          existingTask.priority = item.priority;
          modified = true;
        }
        if (modified) {
          await existingTask.save();
        }
      } else {
        // Create new task in Action Tracker
        newTasksToInsert.push({
          meetingId: meeting._id,
          meetingTitle: meeting.title,
          task: taskText,
          owner: (item.owner && item.owner.trim()) ? item.owner.trim() : 'Unassigned',
          deadline: (item.deadline && item.deadline.trim()) ? item.deadline.trim() : 'Not specified',
          priority: ['High', 'Medium', 'Low'].includes(item.priority) ? item.priority : 'Medium',
          status: ['Pending', 'In Progress', 'Completed'].includes(item.status) ? item.status : 'Pending',
        });
      }
    }

    if (newTasksToInsert.length > 0) {
      const insertedTasks = await Task.insertMany(newTasksToInsert);
      const insertedIds = insertedTasks.map(t => t._id);
      meeting.actionItems = [...(meeting.actionItems || []), ...insertedIds];
    }
  }

  // Requirement 6: Connect confirmed decisions to Decision Register without duplicates
  if (Array.isArray(sanitizedMom.decisions) && sanitizedMom.decisions.length > 0) {
    const existingDecisionsSet = new Set((meeting.decisions || []).map(d => (d.decision || '').trim().toLowerCase()));

    for (const d of sanitizedMom.decisions) {
      const decText = (d.decision || '').trim();
      if (!decText) continue;

      const key = decText.toLowerCase();
      if (!existingDecisionsSet.has(key)) {
        meeting.decisions.push({
          decision: decText,
          rationale: d.rationale || 'Agreed upon during discussion',
        });
        existingDecisionsSet.add(key);
      }
    }
  }

  await meeting.save();
  const updatedMeeting = await Meeting.findById(id).populate('actionItems');
  return updatedMeeting.toObject();
}

