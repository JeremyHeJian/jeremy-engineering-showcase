import { describe, it, expect } from "vitest";
import { inSeasonStatus } from "./in-season";

// cherry-blossom: start 82, peak 96, end 116
const cherry = { typical_start_doy: 82, peak_doy: 96, typical_end_doy: 116 };
// bald-eagle: start 335, peak 355, end 30 (wraps the new year)
const eagle = { typical_start_doy: 335, peak_doy: 355, typical_end_doy: 30 };

describe("inSeasonStatus", () => {
  it("is off-season before the window and after the window", () => {
    expect(inSeasonStatus(cherry, 60, 0)).toBeNull();
    expect(inSeasonStatus(cherry, 140, 0)).toBeNull();
  });

  it("reports peak around the peak day", () => {
    expect(inSeasonStatus(cherry, 96, 0)).toBe("peak");
  });

  it("reports early before peak and late after peak", () => {
    expect(inSeasonStatus(cherry, 84, 0)).toBe("early");
    expect(inSeasonStatus(cherry, 114, 0)).toBe("late");
  });

  it("a negative offset (season running early) pulls a phenomenon into season", () => {
    // At doy 64 cherry is normally off (starts 82). With an 18-day-early offset
    // it should be in season — exactly eval case 17.
    expect(inSeasonStatus(cherry, 64, 0)).toBeNull();
    expect(inSeasonStatus(cherry, 64, -18)).not.toBeNull();
  });

  it("handles a window that wraps the year boundary", () => {
    expect(inSeasonStatus(eagle, 362, 0)).not.toBeNull(); // late December
    expect(inSeasonStatus(eagle, 20, 0)).not.toBeNull(); // early January
    expect(inSeasonStatus(eagle, 200, 0)).toBeNull(); // mid-summer
  });
});
