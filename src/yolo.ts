import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { YOLO_MODES, YOLO_LABELS, YOLO_ENTRY_TYPE } from "./types.js";
import type { YoloMode } from "./types.js";

export type { YoloMode };

/** Mutable YOLO state shared across the extension lifecycle. */
export interface YoloState {
  mode: YoloMode;
}

export function createYoloState(): YoloState {
  return { mode: "off" };
}

/**
 * Resolve a raw flag value to a `YoloMode`, or `undefined` if it is not one of
 * the known modes. Used by the `--nolo-mode` CLI flag; `undefined` lets the
 * caller fall back to the restored/default mode instead of overriding it.
 */
export function parseYoloMode(raw: unknown): YoloMode | undefined {
  if (typeof raw === "string" && YOLO_MODES.includes(raw as YoloMode)) {
    return raw as YoloMode;
  }
  return undefined;
}

/**
 * Apply the `--nolo-mode` CLI flag over the restored/default mode. A valid
 * value always wins; an invalid non-empty value is reported (UI sessions only)
 * but never applied, leaving the prior mode intact; an absent flag is a no-op.
 *
 * A valid mode is persisted via `appendEntry` so it becomes the latest session
 * entry. Without this, `/reload` (which re-runs `restoreYoloMode` from the
 * persisted history and skips the flag) would restore an older persisted mode,
 * silently dropping the flag — e.g. launching `--nolo-mode off` over a session
 * persisted as `full` would snap back to `full` on reload.
 */
export function applyFlagMode(
  state: YoloState,
  pi: Pick<ExtensionAPI, "appendEntry">,
  rawFlag: unknown,
  ctx: { hasUI: boolean; ui: { notify: (msg: string, type: string) => void } },
): void {
  const flagMode = parseYoloMode(rawFlag);
  if (flagMode) {
    state.mode = flagMode;
    pi.appendEntry(YOLO_ENTRY_TYPE, { mode: state.mode });
  } else if (typeof rawFlag === "string" && rawFlag !== "" && ctx.hasUI) {
    ctx.ui.notify(`Invalid --nolo-mode "${rawFlag}"; using ${state.mode}`, "warning");
  }
}

/** Restore persisted mode from the session history (call on session_start). */
export function restoreYoloMode(
  entries: Array<{ type: string; customType?: string; data?: unknown }>,
  state: YoloState,
): void {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === YOLO_ENTRY_TYPE) {
      const saved = (entry.data as { mode?: YoloMode })?.mode;
      if (saved && YOLO_MODES.includes(saved)) {
        state.mode = saved;
      }
      break;
    }
  }
}

/** Render the status bar label for the current mode. */
export function renderStatus(
  state: YoloState,
  theme: { fg: (color: string, text: string) => string },
): string {
  if (state.mode === "off") return theme.fg("dim", YOLO_LABELS.off);
  if (state.mode === "writes") return theme.fg("warning", YOLO_LABELS.writes);
  return theme.fg("error", YOLO_LABELS.full);
}

/** Cycle mode, persist to session, and notify the user. */
export function cycleYoloMode(
  state: YoloState,
  pi: ExtensionAPI,
  ctx: { hasUI: boolean; ui: { setStatus: (id: string, text: string) => void; theme: any; notify: (msg: string, type: string) => void } },
): void {
  const currentIndex = YOLO_MODES.indexOf(state.mode);
  state.mode = YOLO_MODES[(currentIndex + 1) % YOLO_MODES.length];

  // Persist so mode survives /reload
  pi.appendEntry(YOLO_ENTRY_TYPE, { mode: state.mode });

  if (!ctx.hasUI) return;

  ctx.ui.setStatus("nolo", renderStatus(state, ctx.ui.theme));

  const label = YOLO_LABELS[state.mode];
  if (state.mode === "off") {
    ctx.ui.notify(`${label} — all mutations require confirmation`, "info");
  } else if (state.mode === "writes") {
    ctx.ui.notify(`${label} — write/edit auto-approved; bash still guarded`, "info");
  } else {
    ctx.ui.notify(`${label} — ALL tool calls auto-approved, no confirmations`, "info");
  }
}
