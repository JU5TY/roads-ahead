// Orders in D1 (see schema.sql) and their files in R2, which deletes them after 14 days.

// Easy to read out over the phone: no 0/O, 1/I/L, U.
const REF_LETTERS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const randomId = () =>
  [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

const randomRef = () =>
  `RA-${[...crypto.getRandomValues(new Uint8Array(5))]
    .map((b) => REF_LETTERS[b % REF_LETTERS.length])
    .join('')}`;

export const files = {
  spec: (id) => `orders/${id}/spec.json`,
  photo: (id) => `orders/${id}/photo`,
  pdf: (id) => `orders/${id}/poster.pdf`,
};

export async function createOrder(db, { id, size, edition, title }) {
  const now = Date.now();
  // A clash of five-letter references is rare; try a few before giving up.
  for (let tries = 0; tries < 5; tries++) {
    const ref = randomRef();
    try {
      await db
        .prepare(
          `INSERT INTO orders (id, ref, status, size, edition, title, created_at, updated_at)
           VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)`
        )
        .bind(id, ref, size, edition, title, now, now)
        .run();
      return ref;
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err;
    }
  }
  throw new Error('No free order reference');
}

export const getOrder = (db, id) => db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();

export const getOrderByProdigiId = (db, prodigiId) =>
  db.prepare('SELECT * FROM orders WHERE prodigi_id = ?').bind(prodigiId).first();

/** Set `fields` on order `id`, only if it's still in one of `from` (when given). */
export async function updateOrder(db, id, fields, { from } = {}) {
  const keys = Object.keys(fields);
  const sets = [...keys.map((k) => `${k} = ?`), 'updated_at = ?'].join(', ');
  const where = from ? ` AND status IN (${from.map(() => '?').join(', ')})` : '';
  const res = await db
    .prepare(`UPDATE orders SET ${sets} WHERE id = ?${where}`)
    .bind(...keys.map((k) => fields[k]), Date.now(), id, ...(from ?? []))
    .run();
  return res.meta.changes > 0;
}

/** Forget customers' names and emails once their poster is long delivered. */
export const forgetOldCustomers = (db, before) =>
  db
    .prepare('UPDATE orders SET email = NULL, name = NULL WHERE created_at < ? AND email IS NOT NULL')
    .bind(before)
    .run();
