const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let memo;

async function startTestDb() {
  memo = await MongoMemoryServer.create();
  const uri = memo.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
  return uri;
}

async function stopTestDb() {
  await mongoose.disconnect();
  if (memo) await memo.stop();
}

async function clearAll() {
  const cols = await mongoose.connection.db.collections();
  for (const c of cols) await c.deleteMany({});
}

module.exports = { startTestDb, stopTestDb, clearAll };
