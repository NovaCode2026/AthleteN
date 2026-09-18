export type DesktopNotificationOptions = { title: string; body?: string; tag?: string; url?: string };

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function desktopNotificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopNotificationPermission(): NotificationPermission | "unsupported" {
  return desktopNotificationsSupported() ? Notification.permission : "unsupported";
}

export async function registerDesktopNotifications() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register("/sw.js").catch(() => null);
  }
  return registrationPromise;
}

export async function requestDesktopNotifications() {
  if (!desktopNotificationsSupported()) return "unsupported" as const;
  const permission = await Notification.requestPermission();
  if (permission === "granted") await registerDesktopNotifications();
  return permission;
}

export async function showDesktopNotification(options: DesktopNotificationOptions) {
  if (!desktopNotificationsSupported() || Notification.permission !== "granted") return false;
  const registration = await registerDesktopNotifications();
  if (registration) {
    await registration.showNotification(options.title, {
      body: options.body,
      tag: options.tag,
      icon: "/athleten-mark.svg",
      badge: "/athleten-mark.svg",
      data: { url: options.url || window.location.href },
    });
    return true;
  }
  new Notification(options.title, { body: options.body, tag: options.tag, icon: "/athleten-mark.svg" });
  return true;
}
