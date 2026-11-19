// The floating box of the places map (#454): defaults, the kept shape, fold and open, drag, resize, a phone.
import { describe, expect, it } from "bun:test";
import { CHIP, MIN_H, MIN_W, boxRect, defaultBox, dragTo, loadBox, normalizeBox, openSize, resizeTo, saveBox, setFolded } from "../src/lib/float-box";

const desk = { x: 300, y: 0, w: 900, h: 800 };
const phoneArea = { x: 0, y: 60, w: 390, h: 540 };
const inside = (r: { x: number; y: number; w: number; h: number }, a: typeof desk) =>
  r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;

describe("normalizeBox and the kept copy", () => {
  it("a box starts folded, with nothing placed", () => {
    expect(defaultBox()).toEqual({ x: null, y: null, w: null, h: null, folded: true });
    expect(normalizeBox(null)).toEqual(defaultBox());
    expect(normalizeBox("junk")).toEqual(defaultBox());
  });
  it("keeps numbers, raises a size to the minimum, drops half a position", () => {
    expect(normalizeBox({ x: 10.4, y: 20, w: 100, h: 999, folded: false })).toEqual({ x: 10, y: 20, w: MIN_W, h: 999, folded: false });
    expect(normalizeBox({ x: 10, y: "a" })).toMatchObject({ x: null, y: null });
  });
  it("round-trips through a storage, survives one that throws", () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const b = { x: 5, y: 6, w: 300, h: 250, folded: false };
    saveBox("map", "c1", b, s);
    expect(loadBox("map", "c1", s)).toEqual(b);
    expect(loadBox("map", "c2", s)).toEqual(defaultBox());
    const bad = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } };
    expect(() => saveBox("map", "c1", b, bad)).not.toThrow();
    expect(loadBox("map", "c1", bad)).toEqual(defaultBox());
  });
});

describe("boxRect", () => {
  it("the default chip is low at the left on a desktop and at the top right on a phone", () => {
    const d = boxRect(defaultBox(), desk, false);
    expect(d).toMatchObject({ w: CHIP, h: CHIP });
    expect(inside(d, desk)).toBe(true);
    expect(d.x).toBeLessThan(desk.x + 100);
    const p = boxRect(defaultBox(), phoneArea, true);
    expect(inside(p, phoneArea)).toBe(true);
    expect(p.x).toBeGreaterThan(300);
    expect(p.y).toBeLessThan(phoneArea.y + 30);
  });
  it("an open default is 360 x 300 at the lower right of a desktop; a phone's is the width of the area, standing on the bottom", () => {
    const d = boxRect({ ...defaultBox(), folded: false }, desk, false);
    expect(d).toMatchObject({ w: 360, h: 300 });
    expect(inside(d, desk)).toBe(true);
    const p = boxRect({ ...defaultBox(), folded: false }, phoneArea, true);
    expect(p.w).toBe(phoneArea.w - 24);
    expect(inside(p, phoneArea)).toBe(true);
    expect(p.y + p.h).toBeGreaterThan(phoneArea.y + phoneArea.h - 30);
  });
  it("a kept place is pulled back inside when the area shrank", () => {
    const r = boxRect({ x: 5000, y: 5000, w: null, h: null, folded: false }, desk, false);
    expect(inside(r, desk)).toBe(true);
    expect(inside(boxRect({ x: -50, y: -50, w: null, h: null, folded: true }, desk, false), desk)).toBe(true);
  });
  it("a size bigger than the area is cut to it", () => {
    const s = openSize({ x: null, y: null, w: 5000, h: 5000, folded: false }, desk, false);
    expect(s.w).toBeLessThanOrEqual(desk.w);
    expect(s.h).toBeLessThanOrEqual(desk.h);
  });
});

describe("fold, drag, resize", () => {
  it("unfolding opens where the chip is, wholly inside; folding keeps the corner; the same state is the same object", () => {
    const chip = { x: 1150, y: 760, w: null, h: null, folded: true };
    const open = setFolded(chip, false, desk, false);
    expect(open.folded).toBe(false);
    expect(inside(boxRect(open, desk, false), desk)).toBe(true);
    const back = setFolded(open, true, desk, false);
    expect(back.folded).toBe(true);
    expect(setFolded(back, true, desk, false)).toBe(back);
  });
  it("a drag stays inside the area", () => {
    const open = { ...defaultBox(), folded: false };
    const d = dragTo(open, { x: -999, y: 9999 }, desk, false);
    expect(inside(boxRect(d, desk, false), desk)).toBe(true);
  });
  it("a resize keeps the minimum and the area; a phone changes the height only", () => {
    const open = { x: 400, y: 100, w: 360, h: 300, folded: false };
    const small = resizeTo(open, { w: 10, h: 10 }, desk, false);
    expect(small.w).toBe(MIN_W);
    expect(small.h).toBe(MIN_H);
    const big = resizeTo(open, { w: 9999, h: 9999 }, desk, false);
    expect(inside(boxRect(big, desk, false), desk)).toBe(true);
    const ph = resizeTo({ x: 12, y: 100, w: null, h: 300, folded: false }, { w: 50, h: 350 }, phoneArea, true);
    expect(ph.w).toBeNull();
    expect(ph.h).toBe(350);
  });
});
