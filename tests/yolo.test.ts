import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createYoloState,
  restoreYoloMode,
  renderStatus,
  cycleYoloMode,
  parseYoloMode,
  applyFlagMode,
} from "../src/yolo.js";
import { YOLO_ENTRY_TYPE } from "../src/types.js";

// Minimal theme stub
const theme = {
  fg: (color: string, text: string) => `[${color}]${text}`,
};

describe("createYoloState", () => {
  it("starts in off mode", () => {
    const state = createYoloState();
    assert.equal(state.mode, "off");
  });
});

describe("restoreYoloMode", () => {
  it("does nothing when entries are empty", () => {
    const state = createYoloState();
    restoreYoloMode([], state);
    assert.equal(state.mode, "off");
  });

  it("restores mode from last yolo entry", () => {
    const state = createYoloState();
    const entries = [
      { type: "custom", customType: YOLO_ENTRY_TYPE, data: { mode: "writes" } },
    ];
    restoreYoloMode(entries, state);
    assert.equal(state.mode, "writes");
  });

  it("restores full mode", () => {
    const state = createYoloState();
    const entries = [
      { type: "custom", customType: YOLO_ENTRY_TYPE, data: { mode: "full" } },
    ];
    restoreYoloMode(entries, state);
    assert.equal(state.mode, "full");
  });

  it("uses the last yolo entry when multiple exist", () => {
    const state = createYoloState();
    const entries = [
      { type: "custom", customType: YOLO_ENTRY_TYPE, data: { mode: "writes" } },
      { type: "custom", customType: YOLO_ENTRY_TYPE, data: { mode: "full" } },
    ];
    restoreYoloMode(entries, state);
    assert.equal(state.mode, "full");
  });

  it("ignores entries of other types", () => {
    const state = createYoloState();
    const entries = [
      { type: "custom", customType: "something-else", data: { mode: "full" } },
      { type: "message", data: {} },
    ];
    restoreYoloMode(entries, state);
    assert.equal(state.mode, "off");
  });

  it("ignores invalid mode value in entry", () => {
    const state = createYoloState();
    const entries = [
      { type: "custom", customType: YOLO_ENTRY_TYPE, data: { mode: "turbo" } },
    ];
    restoreYoloMode(entries, state);
    assert.equal(state.mode, "off");
  });
});

describe("parseYoloMode", () => {
  it("returns matching mode for valid values", () => {
    assert.equal(parseYoloMode("off"), "off");
    assert.equal(parseYoloMode("writes"), "writes");
    assert.equal(parseYoloMode("full"), "full");
  });

  it("returns undefined for unknown string values", () => {
    assert.equal(parseYoloMode("turbo"), undefined);
  });

  it("returns undefined for the empty string", () => {
    assert.equal(parseYoloMode(""), undefined);
  });

  it("returns undefined for undefined", () => {
    assert.equal(parseYoloMode(undefined), undefined);
  });

  it("returns undefined for non-string input", () => {
    assert.equal(parseYoloMode(true), undefined);
    assert.equal(parseYoloMode(0), undefined);
    assert.equal(parseYoloMode(null), undefined);
  });
});

describe("applyFlagMode", () => {
  function makeCtx(hasUI: boolean) {
    const notifications: Array<{ msg: string; type: string }> = [];
    return {
      hasUI,
      notifications,
      ui: {
        notify(msg: string, type: string) { notifications.push({ msg, type }); },
      },
    };
  }

  function makePi() {
    const appended: Array<{ type: string; data: unknown }> = [];
    return {
      appended,
      appendEntry(type: string, data: unknown) { appended.push({ type, data }); },
    };
  }

  it("overrides the restored/default mode with a valid flag", () => {
    const state = createYoloState();
    state.mode = "writes"; // simulate a restored mode
    const pi = makePi();
    const ctx = makeCtx(true);
    applyFlagMode(state, pi as any, "full", ctx as any);
    assert.equal(state.mode, "full");
    assert.equal(ctx.notifications.length, 0);
  });

  it("persists a valid flag mode so it survives /reload", () => {
    const state = createYoloState();
    state.mode = "full"; // simulate a session persisted as full
    const pi = makePi();
    const ctx = makeCtx(true);
    applyFlagMode(state, pi as any, "off", ctx as any);
    assert.equal(state.mode, "off");
    assert.equal(pi.appended.length, 1);
    assert.equal(pi.appended[0].type, YOLO_ENTRY_TYPE);
    assert.deepEqual((pi.appended[0].data as any).mode, "off");
  });

  it("leaves the mode untouched when the flag is absent", () => {
    const state = createYoloState();
    state.mode = "writes";
    const pi = makePi();
    const ctx = makeCtx(true);
    applyFlagMode(state, pi as any, undefined, ctx as any);
    assert.equal(state.mode, "writes");
    assert.equal(ctx.notifications.length, 0);
    assert.equal(pi.appended.length, 0);
  });

  it("leaves the mode untouched and stays silent for the empty string", () => {
    const state = createYoloState();
    const pi = makePi();
    const ctx = makeCtx(true);
    applyFlagMode(state, pi as any, "", ctx as any);
    assert.equal(state.mode, "off");
    assert.equal(ctx.notifications.length, 0);
    assert.equal(pi.appended.length, 0);
  });

  it("keeps the prior mode and warns on an invalid value in UI sessions", () => {
    const state = createYoloState();
    state.mode = "writes";
    const pi = makePi();
    const ctx = makeCtx(true);
    applyFlagMode(state, pi as any, "turbo", ctx as any);
    assert.equal(state.mode, "writes");
    assert.equal(ctx.notifications.length, 1);
    assert.equal(ctx.notifications[0].type, "warning");
    assert.match(ctx.notifications[0].msg, /turbo/);
    assert.match(ctx.notifications[0].msg, /writes/);
    assert.equal(pi.appended.length, 0);
  });

  it("does not notify on an invalid value when hasUI is false", () => {
    const state = createYoloState();
    const pi = makePi();
    const ctx = makeCtx(false);
    applyFlagMode(state, pi as any, "turbo", ctx as any);
    assert.equal(state.mode, "off");
    assert.equal(ctx.notifications.length, 0);
    assert.equal(pi.appended.length, 0);
  });
});

describe("renderStatus", () => {
  it("renders off mode as dim", () => {
    const state = createYoloState();
    const result = renderStatus(state, theme);
    assert.match(result, /\[dim\]/);
    assert.match(result, /nolo/);
  });

  it("renders writes mode as warning", () => {
    const state = createYoloState();
    state.mode = "writes";
    const result = renderStatus(state, theme);
    assert.match(result, /\[warning\]/);
    assert.match(result, /writes/);
  });

  it("renders full mode as error", () => {
    const state = createYoloState();
    state.mode = "full";
    const result = renderStatus(state, theme);
    assert.match(result, /\[error\]/);
    assert.match(result, /yolo/);
  });
});

describe("cycleYoloMode", () => {
  function makeCtx() {
    const notifications: Array<{ msg: string; type: string }> = [];
    const statuses: Array<{ id: string; text: string }> = [];
    return {
      hasUI: true,
      notifications,
      statuses,
      ui: {
        theme,
        setStatus(id: string, text: string) { statuses.push({ id, text }); },
        notify(msg: string, type: string) { notifications.push({ msg, type }); },
      },
    };
  }

  function makePi() {
    const appended: Array<{ type: string; data: unknown }> = [];
    return {
      appended,
      appendEntry(type: string, data: unknown) { appended.push({ type, data }); },
    };
  }

  it("cycles off → writes → full → off", () => {
    const state = createYoloState();
    const pi = makePi() as any;
    const ctx = makeCtx();

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(state.mode, "writes");

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(state.mode, "full");

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(state.mode, "off");
  });

  it("appends a session entry on each cycle", () => {
    const state = createYoloState();
    const pi = makePi() as any;
    const ctx = makeCtx();

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(pi.appended.length, 1);
    assert.equal(pi.appended[0].type, YOLO_ENTRY_TYPE);
    assert.deepEqual((pi.appended[0].data as any).mode, "writes");
  });

  it("sets status bar text", () => {
    const state = createYoloState();
    const pi = makePi() as any;
    const ctx = makeCtx();

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(ctx.statuses.length, 1);
    assert.equal(ctx.statuses[0].id, "nolo");
  });

  it("sends a notification with info type", () => {
    const state = createYoloState();
    const pi = makePi() as any;
    const ctx = makeCtx();

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(ctx.notifications.length, 1);
    assert.equal(ctx.notifications[0].type, "info");
  });

  it("does not touch UI when hasUI is false", () => {
    const state = createYoloState();
    const pi = makePi() as any;
    const ctx = { hasUI: false, ui: { theme, setStatus: () => {}, notify: () => {} } };

    cycleYoloMode(state, pi, ctx as any);
    assert.equal(state.mode, "writes"); // still cycles
  });
});
