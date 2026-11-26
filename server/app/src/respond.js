// Answers every route shares.

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/** An error the app can show as it is. */
export const problem = (message, status = 400) => json({ error: message, message }, status);
