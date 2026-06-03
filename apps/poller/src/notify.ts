import webpush from 'web-push';
import { getClient } from '@pir/db';

// VAPID keys are set as Fly secrets. If not configured, push notifications
// are silently skipped so the poller still runs in environments without them.
const VAPID_SUBJECT    = process.env.VAPID_SUBJECT    ?? '';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE_KEY= process.env.VAPID_PRIVATE_KEY ?? '';

const configured = VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY;

if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function fetchSubscriptions(): Promise<PushSubscription[]> {
  const { data, error } = await getClient()
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');
  if (error) {
    console.error('[notify] failed to fetch subscriptions:', error.message);
    return [];
  }
  return (data ?? []) as PushSubscription[];
}

async function deleteSubscription(endpoint: string): Promise<void> {
  await getClient()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
}

export async function sendViolationAlert(dbValue: number, limitDb: number): Promise<void> {
  if (!configured) {
    console.log('[notify] VAPID not configured — skipping push notification');
    return;
  }

  const subscriptions = await fetchSubscriptions();
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: `PIR noise violation — ${dbValue} dB`,
    body:  `Current reading (${dbValue} dB) exceeds the ${limitDb} dB limit. Consider filing a noise complaint.`,
    url:   'https://pir-sound-tracker.vercel.app',
  });

  console.log(`[notify] sending push to ${subscriptions.length} subscriber(s): ${dbValue} dB > ${limitDb} dB`);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          // Subscription expired or revoked — clean it up
          console.log(`[notify] removing stale subscription (${status}): ${sub.endpoint.slice(0, 50)}…`);
          await deleteSubscription(sub.endpoint);
        } else {
          throw err;
        }
      }
    }),
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(`[notify] ${failed}/${subscriptions.length} push(es) failed`);
  }
}
