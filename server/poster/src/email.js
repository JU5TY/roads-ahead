// Emails to customers (dispatched) and to us (an order that needs a hand), sent with
// Resend: https://resend.com/docs/api-reference/emails/send-email. Without a key
// they're only logged, which is fine while testing.

export async function sendEmail(env, { to, subject, text }) {
  if (!env.EMAIL_API_KEY || !to) {
    console.log('[email] not sent', { to, subject });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${await res.text()}`);
}

export const shippedEmail = (order, trackingUrl) => ({
  to: order.email,
  subject: `Your Roads Ahead poster is on its way (${order.ref})`,
  text: [
    `Hi${order.name ? ` ${order.name.split(' ')[0]}` : ''},`,
    '',
    `Your ${order.size} poster${order.title ? ` of ${titleCase(order.title)}` : ''} has been printed and is on its way.`,
    trackingUrl ? `Track it here: ${trackingUrl}` : null,
    '',
    `Order ${order.ref}`,
    '',
    'Roads Ahead',
  ]
    .filter((line) => line !== null)
    .join('\n'),
});

export const problemEmail = (env, order, problem) => ({
  to: env.ALERT_EMAIL,
  subject: `Poster order ${order.ref} needs attention`,
  text: `Order ${order.ref} (${order.id}), ${order.size} ${order.edition}, status ${order.status}.\n\n${problem}\n\nIt has been paid for: print it by hand or refund it in Stripe.`,
});

// The poster's title is in capitals; an email reads better without shouting.
const titleCase = (s) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
