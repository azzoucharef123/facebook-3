import { Pool } from "pg";
import { config } from "./config.js";

let pool = null;

function getPool() {
  if (!config.databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl
    });
  }

  return pool;
}

export function isDatabaseConfigured() {
  return Boolean(config.databaseUrl);
}

export async function initDatabase() {
  const db = getPool();
  if (!db) {
    return false;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id BIGINT PRIMARY KEY,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS published_posts (
      id TEXT PRIMARY KEY,
      queue_id BIGINT,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  return true;
}

export async function ensureDatabaseSeededFromState(state) {
  const db = getPool();
  if (!db) {
    return false;
  }

  const counts = await db.query(`
    SELECT
      (SELECT COUNT(*)::INT FROM scheduled_posts) AS scheduled_count,
      (SELECT COUNT(*)::INT FROM published_posts) AS published_count
  `);

  const row = counts.rows[0] || { scheduled_count: 0, published_count: 0 };
  if (Number(row.scheduled_count) > 0 || Number(row.published_count) > 0) {
    return false;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const post of state.queuedPosts || []) {
      await client.query(
        `
          INSERT INTO scheduled_posts (id, message, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO NOTHING
        `,
        [post.id, post.text, post.createdAt || new Date().toISOString()]
      );
    }

    for (const post of state.posts || []) {
      await client.query(
        `
          INSERT INTO published_posts (id, queue_id, message, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO NOTHING
        `,
        [post.id, post.queueId || null, post.message || "", post.createdAt || new Date().toISOString()]
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadDatabaseSnapshot() {
  const db = getPool();
  if (!db) {
    return null;
  }

  const [scheduledResult, publishedResult] = await Promise.all([
    db.query(`
      SELECT id, message, created_at
      FROM scheduled_posts
      ORDER BY id ASC
    `),
    db.query(`
      SELECT id, queue_id, message, created_at
      FROM published_posts
      ORDER BY created_at ASC, id ASC
    `)
  ]);

  const queuedPosts = scheduledResult.rows.map((row) => ({
    id: Number(row.id),
    text: row.message,
    createdAt: new Date(row.created_at).toISOString()
  }));

  const posts = publishedResult.rows.map((row) => ({
    id: row.id,
    queueId: row.queue_id === null ? null : Number(row.queue_id),
    message: row.message,
    createdAt: new Date(row.created_at).toISOString()
  }));

  const maxScheduledId = queuedPosts.reduce((max, post) => Math.max(max, Number(post.id) || 0), 0);
  const maxPublishedQueueId = posts.reduce((max, post) => Math.max(max, Number(post.queueId) || 0), 0);

  return {
    queuedPosts,
    posts,
    queueCounter: Math.max(maxScheduledId, maxPublishedQueueId)
  };
}

export async function insertScheduledPosts(posts) {
  const db = getPool();
  if (!db || !posts.length) {
    return;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const post of posts) {
      await client.query(
        `
          INSERT INTO scheduled_posts (id, message, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE
          SET message = EXCLUDED.message,
              created_at = EXCLUDED.created_at
        `,
        [post.id, post.text, post.createdAt || new Date().toISOString()]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteScheduledPost(postId) {
  const db = getPool();
  if (!db) {
    return;
  }

  await db.query("DELETE FROM scheduled_posts WHERE id = $1", [postId]);
}

export async function moveScheduledPostToPublished({ queueId, facebookPostId, message, createdAt }) {
  const db = getPool();
  if (!db) {
    return;
  }

  const client = await db.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM scheduled_posts WHERE id = $1", [queueId]);
    await client.query(
      `
        INSERT INTO published_posts (id, queue_id, message, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET queue_id = EXCLUDED.queue_id,
            message = EXCLUDED.message,
            created_at = EXCLUDED.created_at
      `,
      [facebookPostId, queueId, message, createdAt]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
