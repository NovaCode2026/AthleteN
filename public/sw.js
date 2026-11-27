self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedTarget = event.notification?.data?.url;
  let target = "/";
  try {
    const candidate = typeof requestedTarget === "string" ? requestedTarget : "/";
    const parsed = new URL(candidate, self.location.origin);
    if (parsed.origin === self.location.origin) {
      target = parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    target = "/";
  }
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
