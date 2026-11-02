import mongoose from 'mongoose';
import { Task } from '../models/Task.js';
import { config } from '../config/env.js';

async function main() {
  await mongoose.connect(config.mongoUri, { dbName: config.dbName });
  const tasks = await Task.find({}).lean();
  console.log('Total tasks in DB:', tasks.length);
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.github) {
      console.log(`\n--- Task [${i}] ---`);
      console.log('ID:', t._id);
      console.log('Task Title:', t.task);
      console.log('Local Status:', t.status);
      console.log('GitHub field:', JSON.stringify(t.github, null, 2));
    }
  }
  await mongoose.disconnect();
}

main().catch(console.error);

