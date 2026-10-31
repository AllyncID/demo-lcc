import { AsyncLocalStorage } from 'node:async_hooks';

// A transaction belongs to its async call chain, never to another request.
export function asyncDatabase(source, { remote = false } = {}) {
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  const serial = work => {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  };
  const execute = (sql, args, method) => {
    const query = async target => {
      if (!remote) return target.prepare(sql)[method](...args);
      const result = await target.execute({ sql, args });
      if (method === 'run') return { changes: result.rowsAffected, lastInsertRowid: Number(result.lastInsertRowid) };
      const rows = result.rows.map(row => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])));
      return method === 'get' ? rows[0] : rows;
    };
    const transaction = context.getStore();
    return transaction ? query(transaction) : remote ? query(source) : serial(() => query(source));
  };
  return {
    prepare(sql) { return Object.fromEntries(['get', 'all', 'run'].map(method => [method, (...args) => execute(sql, args, method)])); },
    async transaction(work) {
      if (context.getStore()) return work();
      const run = async () => {
        const transaction = remote ? await source.transaction('write') : source;
        if (!remote) source.exec('BEGIN IMMEDIATE');
        try {
          const result = await context.run(transaction, work);
          if (remote) await transaction.commit(); else source.exec('COMMIT');
          return result;
        } catch (error) {
          if (remote) await transaction.rollback().catch(() => {}); else source.exec('ROLLBACK');
          throw error;
        } finally { if (remote) transaction.close(); }
      };
      return remote ? run() : serial(run);
    },
    async exec(sql) {
      const target = context.getStore();
      if (remote) return (target || source).executeMultiple(sql);
      return target ? target.exec(sql) : serial(() => source.exec(sql));
    },
    close() { return source.close(); }
  };
}
