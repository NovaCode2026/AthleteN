# AthleteN navigation rules

## Shared navigation contract

- The More destination (explore) is mandatory and cannot be removed.
- More is pinned to the final position on both web and mobile.
- Users can select and order up to five additional shortcuts.
- Available shortcuts are filtered by the signed-in user's plan and role on mobile. Web and mobile use the same destination IDs and the same server preference RPCs.
- The preference is stored through get_my_navigation_preferences and set_my_navigation_preferences; mobile also keeps a local AsyncStorage copy for fast/offline startup.
- The server migration enforces the required More item even if a client sends an old or malformed preference list.

## User experience

1. Open More → Customize Navigation (or Settings → Navigation settings).
2. Add any available shortcut, reorder it with the arrow controls, or remove it from the active bar.
3. Save. The selected shortcuts sync to the other platform.
4. More remains at the end and exposes the complete feature directory.

## Limits and verification

The bottom bar intentionally has six slots: five user-selected shortcuts plus the required More destination. This keeps the touch targets readable on phones while retaining access to the full feature set. Apply migration 20261110130000_require_more_in_navigation.sql before relying on the database-side invariant. Verify web/mobile sync with two signed-in clients and confirm More cannot be removed.
