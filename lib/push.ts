import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { isNativeEndpoint } from "@/lib/push-native-core";
import { sendNativePush } from "@/lib/push-native";

type VapidPair = { publicKey: string; privateKey: string };

let cached: VapidPair | null = null;

export async function ensureVapid(): Promise<VapidPair> {
  if (cached?.publicKey && cached.privateKey) return cached;
  const envPublic = process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  if (envPublic && envPrivate) {
    cached = { publicKey: envPublic, privateKey: envPrivate };
    return cached;
  }
  const row = await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", periodAnchor: new Date() },
    update: {},
  });
  if (row.vapidPublic && row.vapidPrivate) {
    cached = { publicKey: row.vapidPublic, privateKey: row.vapidPrivate };
    return cached;
  }
  const generated = webpush.generateVAPIDKeys();
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { vapidPublic: generated.publicKey, vapidPrivate: generated.privateKey },
  });
  cached = generated;
  return cached;
}

function bindVapid(keys: VapidPair, email: string) {
  const subject = email.includes("@") ? `mailto:${email}` : "mailto:jobcommandofficial@gmail.com";
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  const fcm = process.env.FCM_SERVER_KEY?.trim() || process.env.FIREBASE_SERVER_KEY?.trim() || "";
  if (fcm) webpush.setGCMAPIKey(fcm);
}

export async function sendWebPush(input: {
  title: string;
  body: string;
  href: string;
  tag?: string;
}) {
  const keys = await ensureVapid();
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  bindVapid(keys, settings?.ownerEmail || "");
  const all = await prisma.pushDevice.findMany();
  // iPhone-app tokens go through APNs, not web push.
  const native = await sendNativePush(all, input).catch(() => ({ sent: 0, mock: true, reason: "native push failed" }));
  const devices = all.filter((device) => !isNativeEndpoint(device.endpoint));
  if (!devices.length) return { sent: native.sent, mock: native.sent === 0 };
  let sent = native.sent;
  await Promise.all(
    devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: device.endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          JSON.stringify({
            title: input.title,
            body: input.body,
            href: input.href,
            id: input.tag,
          })
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushDevice.delete({ where: { id: device.id } }).catch(() => undefined);
        }
      }
    })
  );
  return { sent, mock: false };
}
