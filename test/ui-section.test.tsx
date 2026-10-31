// Section and Chip: a titled group of settings, plain (heading over a Card of rows) or tinted (one task card with a
// tone-filled header). Rendered to static markup; no DOM library is installed in this repo.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Star } from "@phosphor-icons/react";

(globalThis as unknown as { location: unknown }).location = { pathname: "/app/u/roleplay/", origin: "http://x", hash: "", search: "" };
const { Section, Chip } = await import("../src/components/ui/section");
const { TONES } = await import("../src/components/ui/tone");

describe("Chip", () => {
  it("takes the tone's chip classes, and the neutral ones without a tone", () => {
    expect(renderToStaticMarkup(<Chip tone="emerald">On</Chip>)).toContain(TONES.emerald.chip.split(" ")[0]!);
    const neutral = renderToStaticMarkup(<Chip>Off</Chip>);
    expect(neutral).toContain("border-border bg-muted text-muted-foreground");
    expect(neutral).toContain("rounded-full");
    expect(neutral).toContain("text-caption");
  });
});

describe("Section, plain", () => {
  it("renders the heading and the children, with the heading id on aria-labelledby", () => {
    const html = renderToStaticMarkup(
      <Section title="Limits">
        <p>ROW ONE</p>
      </Section>
    );
    expect(html).toContain("<h3");
    expect(html).toContain("Limits</h3>");
    expect(html).toContain("ROW ONE");
    const labelled = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelled).toBeTruthy();
    expect(html).toContain(`<h3 id="${labelled}"`);
  });

  it("puts the children in a rows Card and the tone square before the title", () => {
    const html = renderToStaticMarkup(
      <Section title="Profile" tone="emerald" aside="3 of 9">
        <p>x</p>
      </Section>
    );
    expect(html).toContain(TONES.emerald.square);
    expect(html).toContain("3 of 9");
    expect(html).toContain('data-slot="card"');
  });

  it("the note sits above the rows; dimmed dims the rows only", () => {
    const html = renderToStaticMarkup(
      <Section title="Dice" note="Needs the DM on" dimmed>
        <p>ROW</p>
      </Section>
    );
    expect(html).toContain("Needs the DM on");
    expect(html).toMatch(/<div[^>]*data-slot="card"[^>]*class="[^"]*opacity-60/);
    const plain = renderToStaticMarkup(<Section title="Dice"><p>ROW</p></Section>);
    expect(plain).not.toContain("opacity-60");
  });

  it("takes an id for the test hook section-<id>", () => {
    const html = renderToStaticMarkup(<Section title="A" id="limits"><p>x</p></Section>);
    expect(html).toContain('data-testid="section-limits"');
  });
});

describe("Section, tinted", () => {
  it("renders the icon, the title, the chips and the tone's fill in the header", () => {
    const html = renderToStaticMarkup(
      <Section title="Dice" variant="tinted" tone="amber" icon={Star} chips={["Hint", "30%"]}>
        <p>ROW</p>
      </Section>
    );
    expect(html).toContain("<svg");
    expect(html).toContain("Dice</h3>");
    expect(html).toContain("Hint");
    expect(html).toContain("30%");
    // the header bar carries the tone's soft fill
    for (const cls of TONES.amber.fill.split(" ")) expect(html).toContain(cls);
    expect(html).toContain("divide-y divide-border");
  });

  it("the default tone is slate", () => {
    const html = renderToStaticMarkup(<Section title="Misc" variant="tinted"><p>x</p></Section>);
    expect(html).toContain(TONES.slate.fill.split(" ")[1]!);
  });

  it("a note sits under the header and dimmed dims the rows area", () => {
    const html = renderToStaticMarkup(
      <Section title="Dice" variant="tinted" tone="violet" note="Turn the DM on to change these" dimmed>
        <p>ROW</p>
      </Section>
    );
    expect(html).toContain("Turn the DM on to change these");
    expect(html).toMatch(/<div class="divide-y divide-border opacity-60">/);
  });

  it("aria-labelledby points at the heading id, and the section carries no card-level dim", () => {
    const html = renderToStaticMarkup(<Section title="Dice" variant="tinted" id="dice"><p>x</p></Section>);
    const labelled = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelled).toBeTruthy();
    expect(html).toContain(`<h3 id="${labelled}"`);
    expect(html).toContain('data-testid="section-dice"');
    expect(html).not.toContain("opacity-60");
  });
});
