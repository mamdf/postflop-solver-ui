import type { EvModel } from "./api";

export type EvMode = "chip_ev" | "icm_bubble_factor" | "terminal_icm";

// Form state of the ICM panel; lists are comma-separated text.
export type EvSettings = {
  mode: EvMode;
  bubbleOop: number;
  bubbleIp: number;
  stacks: string;
  payouts: string;
  oopSeat: number;
  ipSeat: number;
};

export const defaultEvSettings = (): EvSettings => ({
  mode: "chip_ev",
  bubbleOop: 1,
  bubbleIp: 1,
  stacks: "",
  payouts: "",
  oopSeat: 0,
  ipSeat: 1,
});

const parseList = (s: string) =>
  s.trim() === "" ? [] : s.split(",").map((e) => Number(e.trim()));

export const evModelRequest = (s: EvSettings): EvModel => {
  switch (s.mode) {
    case "icm_bubble_factor":
      return { type: "icm_bubble_factor", oop: s.bubbleOop, ip: s.bubbleIp };
    case "terminal_icm":
      return {
        type: "terminal_icm",
        stacks: parseList(s.stacks),
        payouts: parseList(s.payouts),
        oop_seat: s.oopSeat,
        ip_seat: s.ipSeat,
      };
    default:
      return { type: "chip_ev" };
  }
};

export const evSettingsFromRequest = (m: EvModel | undefined): EvSettings => {
  const s = defaultEvSettings();
  if (m?.type === "icm_bubble_factor") {
    s.mode = m.type;
    s.bubbleOop = m.oop;
    s.bubbleIp = m.ip;
  } else if (m?.type === "terminal_icm") {
    s.mode = m.type;
    s.stacks = m.stacks.join(", ");
    s.payouts = m.payouts.join(", ");
    s.oopSeat = m.oop_seat;
    s.ipSeat = m.ip_seat;
  }
  return s;
};

// Mirrors EvModelRequest::validate in the API (plus seat checks and rake).
export const evSettingsErrors = (s: EvSettings, rakePercent = 0): string[] => {
  const errors: string[] = [];

  if (s.mode === "icm_bubble_factor") {
    if (!(s.bubbleOop > 0)) errors.push("OOP bubble factor must be positive");
    if (!(s.bubbleIp > 0)) errors.push("IP bubble factor must be positive");
  }

  if (s.mode === "terminal_icm") {
    const stacks = parseList(s.stacks);
    const payouts = parseList(s.payouts);

    if (stacks.length === 0) {
      errors.push("Stacks must not be empty");
    } else if (stacks.some((x) => !isFinite(x) || x <= 0)) {
      errors.push("Stacks must be positive numbers");
    }

    if (payouts.length === 0) {
      errors.push("Payouts must not be empty");
    } else if (payouts.some((x) => !Number.isInteger(x))) {
      errors.push("Payouts must be integers");
    } else if (stacks.length > 0) {
      // flat ladders have no ICM gradient (normalized like the solver does)
      const norm = [...payouts].sort((a, b) => b - a);
      while (norm.length < stacks.length) norm.push(0);
      if (norm.every((p) => p === norm[0])) {
        errors.push("Payouts must not be a flat ladder");
      }
    }

    const n = stacks.length;
    const seatOk = (x: number) => Number.isInteger(x) && x >= 0 && x < n;
    if (n > 0 && (!seatOk(s.oopSeat) || !seatOk(s.ipSeat))) {
      errors.push(`Seats must be integers from 0 to ${n - 1}`);
    } else if (s.oopSeat === s.ipSeat) {
      errors.push("OOP and IP seats must differ");
    }

    if (rakePercent > 0) {
      errors.push("Tournament ICM cannot be combined with rake");
    }
  }

  return errors;
};
