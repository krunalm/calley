# Run Verification Issue Tracker

This file records issues found while building and verifying the project locally,
in the order they were discovered.

1. **E2E web servers could not start without a global `pnpm` binary.**
   - **Observed:** `corepack pnpm test:e2e` failed before tests began because
     Playwright's `webServer` commands invoked `pnpm` directly.
   - **Fix:** Environment setup, not a config change: run `corepack enable` once
     so the `pnpm` shim for the declared `packageManager` is on `PATH`.
   - **Reconciled:** the handoff patch originally switched the `webServer`
     commands to `corepack pnpm`. That was reverted because Node 25+ no longer
     bundles Corepack (`engines` allows Node ≥26) and `pnpm test:e2e` already
     runs under pnpm, so the commands keep invoking `pnpm` directly.

2. **The API E2E server started before its workspace dependency existed.**
   - **Observed:** the API exited with `ERR_MODULE_NOT_FOUND` for
     `@calley/shared/dist/index.js` on a clean checkout.
   - **Fix:** Build `@calley/shared` before launching the API in Playwright's
     E2E web-server lifecycle, so the runtime export is always available.

3. **The documented API development command did not load `apps/api/.env`.**
   - **Observed:** after following the README setup, `pnpm --filter api dev`
     crashed with `DATABASE_URL environment variable is required`.
   - **Fix:** Pass `--env-file-if-exists=.env` to `tsx watch` in the API
     development script. This makes `pnpm dev` and the E2E server honor
     `apps/api/.env`, while variables exported in the shell still take
     precedence and a missing file is not an error.
   - **Reconciled:** the handoff patch originally used
     `node --env-file=.env --import tsx --watch`. Node exits with
     `.env: not found` under `--env-file` when the file is absent, which broke the
     export-in-the-shell workflow documented in `e2e/README.md`.

4. **Clicking a calendar event did not open its detail popover.**
   - **Observed:** three E2E edit/delete tests timed out waiting for the Edit
     action after a visible event pill was clicked.
   - **Fix:** Use a Radix popover anchor (not its built-in toggle trigger) and
     control the popover from the event wrapper itself. This makes both the
     draggable event wrapper and its keyboard-focusable child open the same
     detail UI, without competing toggle handlers. The custom click callback
     remains available when popovers are intentionally disabled.

5. **The local cross-browser E2E matrix could not launch Firefox or WebKit.**
   - **Observed:** Firefox UI tests failed with a missing Playwright Firefox
     executable; Playwright also reported missing native libraries for WebKit.
   - **Fix:** Install the pinned Firefox and WebKit browsers and their Linux
     runtime dependencies with `playwright install firefox webkit` and
     `playwright install-deps firefox webkit`.

6. **Mobile header controls overlapped and blocked the create action.**
   - **Observed:** the view tabs intercepted taps on “Create new” in the mobile
     viewport, causing critical-path E2E flows to stall.
   - **Fix:** Let the topbar wrap on small screens and move date navigation and
     view tabs to a centered second row; keep the desktop topbar on one row.

7. **The task panel had no visible mobile toggle.**
   - **Observed:** the topbar hid its task-panel control below the small-screen
     breakpoint, so users could not open tasks on a phone.
   - **Fix:** Keep the labeled task-panel button visible at all viewport sizes.

8. **Some mobile E2E assertions required desktop-only calendar views.**
   - **Observed:** the cross-browser suite expected all four tabs and a week
     drag flow on phone layouts, where month and week are intentionally hidden.
   - **Fix:** Assert only the two available tabs on phones, exercise recurring
     event editing through Agenda, and skip the week-only drag case on mobile.

9. **The recurring-event E2E flow could wait a full minute for optional telemetry.**
   - **Observed:** its best-effort response wait could consume the entire test
     timeout even though the UI had already saved the event.
   - **Fix:** Cap that optional response wait at five seconds; persistence and
     UI assertions remain the checks that determine success.

10. **The mobile sidebar overlay covered the wrapped header row.**
    - **Observed:** after the topbar moved its date and view controls to a
      second row, the sidebar backdrop still started at 60px and blocked taps.
    - **Fix:** Start the mobile sidebar and backdrop below the 88px wrapped
      header, then return to the 60px offset from the small breakpoint upward.

11. **Editing a recurring event from mobile Agenda omitted its occurrence date.**
    - **Observed:** saving an occurrence returned
      `instanceDate is required when editing a single instance` because Agenda
      opened the edit drawer without the parent event ID and occurrence timestamp.
    - **Fix:** Pass the recurring parent ID and `instanceDate` from the expanded
      Agenda occurrence. The E2E flow also supports Agenda's direct edit drawer.

12. **Mobile E2E coverage expected hidden view tabs and obscured controls.**
    - **Observed:** phone layouts expose Day and Agenda only, and the open
      sidebar backdrop intercepts taps on the second header row. One logout
      navigation was also aborted before the browser's `load` event.
    - **Fix:** Test the available phone views after closing the sidebar and
      wait for logout navigation at document commit.

13. **Drag sensors intercepted clicks on nested event and task controls.**
    - **Observed:** the full Chromium E2E run could not open an event popover
      or task edit drawer because pointer-down on the child buttons bubbled to
      the draggable parent and started a drag.
    - **Fix:** Stop pointer-down propagation on event buttons, task edit buttons,
      and task completion checkboxes. The two previously failing E2E cases pass.
