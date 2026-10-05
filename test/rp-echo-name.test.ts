import { describe, expect, it } from "bun:test";
import { hideEchoedName } from "../src/lib/echo-name";

describe("hideEchoedName", () => {
  it("cuts a plain echo", () => {
    expect(hideEchoedName("Aria: Sure thing.", "Aria")).toBe("Sure thing.");
    expect(hideEchoedName("Aria:Sure thing.", "Aria")).toBe("Sure thing.");
  });
  it("cuts a name with a space before the colon", () => {
    expect(hideEchoedName("Aria : Sure.", "Aria")).toBe("Sure.");
  });
  it("cuts both bold forms", () => {
    expect(hideEchoedName("**Aria:** Sure.", "Aria")).toBe("Sure.");
    expect(hideEchoedName("**Aria**: Sure.", "Aria")).toBe("Sure.");
  });
  it("cuts both italic forms", () => {
    expect(hideEchoedName("*Aria:* Sure.", "Aria")).toBe("Sure.");
    expect(hideEchoedName("*Aria*: Sure.", "Aria")).toBe("Sure.");
  });
  it("cuts the underscore forms", () => {
    expect(hideEchoedName("__Aria:__ Sure.", "Aria")).toBe("Sure.");
    expect(hideEchoedName("_Aria:_ Sure.", "Aria")).toBe("Sure.");
  });
  it("ignores case", () => {
    expect(hideEchoedName("ARIA: Sure.", "Aria")).toBe("Sure.");
    expect(hideEchoedName("**aria:** Sure.", "Aria")).toBe("Sure.");
  });
  it("works with a Cyrillic name", () => {
    expect(hideEchoedName("Ярина: Добре.", "Ярина")).toBe("Добре.");
    expect(hideEchoedName("ярина: Добре.", "Ярина")).toBe("Добре.");
    expect(hideEchoedName("**Ярина:** Добре.", "Ярина")).toBe("Добре.");
  });
  it("matches a name with regex characters literally", () => {
    expect(hideEchoedName("A.J. (Bot): Hi.", "A.J. (Bot)")).toBe("Hi.");
    expect(hideEchoedName("*A.J. (Bot)*: Hi.", "A.J. (Bot)")).toBe("Hi.");
    expect(hideEchoedName("AxJx (Bot): Hi.", "A.J. (Bot)")).toBe("AxJx (Bot): Hi.");
  });
  it("allows leading whitespace and newlines, and trims the rest", () => {
    expect(hideEchoedName("  \n Aria:\n\n  Sure.", "Aria")).toBe("Sure.");
  });
  it("keeps a name that is not at the start", () => {
    expect(hideEchoedName("Well, Aria: sure.", "Aria")).toBe("Well, Aria: sure.");
    expect(hideEchoedName("She said:\nAria: sure.", "Aria")).toBe("She said:\nAria: sure.");
  });
  it("keeps another name", () => {
    expect(hideEchoedName("Bram: Sure.", "Aria")).toBe("Bram: Sure.");
    expect(hideEchoedName("Arian: Sure.", "Aria")).toBe("Arian: Sure.");
  });
  it("keeps a name without a colon", () => {
    expect(hideEchoedName("Aria smiled.", "Aria")).toBe("Aria smiled.");
    expect(hideEchoedName("**Aria** smiled.", "Aria")).toBe("**Aria** smiled.");
  });
  it("leaves the text alone for an empty or missing name", () => {
    expect(hideEchoedName("Aria: Sure.", "")).toBe("Aria: Sure.");
    expect(hideEchoedName("Aria: Sure.", undefined)).toBe("Aria: Sure.");
    expect(hideEchoedName("Aria: Sure.", null)).toBe("Aria: Sure.");
    expect(hideEchoedName("Aria: Sure.", "   ")).toBe("Aria: Sure.");
  });
  it("cuts only once", () => {
    expect(hideEchoedName("Aria: Aria: hi", "Aria")).toBe("Aria: hi");
  });
});
