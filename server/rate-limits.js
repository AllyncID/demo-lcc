export async function databaseRateLimit(db, key, maximum, window, time) {
  const row = await db.prepare(`INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at<=? OR count<? RETURNING count`).get(key, time+window, time, time, time, maximum);
  return !!row;
}
