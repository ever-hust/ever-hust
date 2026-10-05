import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownText } from "../../components/chat/markdown-text";

const render = (text: string) => renderToStaticMarkup(createElement(MarkdownText, { text }));

describe("MarkdownText lists", () => {
  it("nests indented bullets under their numbered item and keeps one ordered list", () => {
    const html = render(
      [
        "1. **UI/React Developer** — GBI",
        "   - $120,000 – $160,000/yr",
        "   - Mid-level fintech role",
        "2. **React Developer** — Busigence",
        "   - Salary not listed",
      ].join("\n"),
    );

    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html).toMatch(/<li[^>]*>.*UI\/React Developer.*<ul[^>]*>.*\$120,000.*Mid-level.*<\/ul><\/li>/);
    expect(html).toMatch(/<li[^>]*>.*React Developer<\/strong> — Busigence.*<ul[^>]*>.*Salary not listed/);
  });

  it("keeps a loose list (blank lines between items) as one ordered list", () => {
    const html = render("1. First\n\n   - detail\n\n2. Second\n\n3. Third");
    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html.match(/<li/g)).toHaveLength(4); // 3 items + 1 nested bullet
  });

  it("continues numbering when unindented bullets split the list", () => {
    const html = render("1. First\n- note\n2. Second");
    expect(html).toContain('<ol start="2"');
  });

  it("still ends a list at a paragraph", () => {
    const html = render("1. One\n\nThat's all.");
    expect(html).toMatch(/<\/ol><p[^>]*>That&#x27;s all\.<\/p>/);
  });
});
