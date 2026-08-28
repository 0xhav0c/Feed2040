import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getAppSetting, setAppSetting } from "@/lib/settings";

const VAPID_SETTING_KEY = "vapid_keys";

type VapidKeys = { publicKey: string; privateKey: string };

function vapidSubject(): string {
  const s = process.env.VAPID_SUBJECT || "mailto:admin@feed2040.local";
  // web-push requires a mailto: or https: subject.
  return /^(mailto:|https:)/.test(s) ? s : `mailto:${s}`;
}

/**
 * Get-or-create the instance VAPID keypair (persisted, encrypted, in
 * AppSettings). Self-hosted friendly: no manual env setup required.
 */
export async function getVapidKeys(): Promise<VapidKeys> {
  const existing = await getAppSetting(VAPID_SETTING_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as VapidKeys;
      if (parsed.publicKey && parsed.privateKey) return parsed;
    } catch {
      /* fall through and regenerate */
    }
  }
  const keys = webpush.generateVAPIDKeys();
  await setAppSetting(VAPID_SETTING_KEY, JSON.stringify(keys));
  return keys;
}

export async function getVapidPublicKey(): Promise<string> {
  return (await getVapidKeys()).publicKey;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Send a push notification to every subscription a user has. Expired/gone
 * subscriptions (404/410) are pruned automatically.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const keys = await getVapidKeys();
  webpush.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s: (typeof subs)[number]) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error(`[Push] Failed to send to ${userId} (status ${code ?? "?"})`);
        }
      }
    })
  );
}
