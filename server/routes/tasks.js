import express from 'express';
import mongoose from 'mongoose';
import { listTasks, updateTask } from '../services/meetingService.js';

const router = express.Router();

/**
 * GET /api/tasks
 * Filter action items by status, priority, owner, or meetingId
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, owner, meetingId } = req.query;
    const tasks = await listTasks({ status, priority, owner, meetingId });

    res.json({
      success: true,
      count: tasks.length,
      data: tasks,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task status, owner, deadline, priority, or description
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, owner, deadline, dueDateTime, startedAt, completedAt, task, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid task ID format.' });
    }

    if (status && !['Pending', 'In Progress', 'Completed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Pending, In Progress, or Completed.' });
    }

    if (priority && !['High', 'Medium', 'Low'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be High, Medium, or Low.' });
    }

    const updated = await updateTask(id, {
      status,
      priority,
      owner,
      deadline,
      dueDateTime,
      startedAt,
      completedAt,
      task,
      description,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err.message === 'Task not found') {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
