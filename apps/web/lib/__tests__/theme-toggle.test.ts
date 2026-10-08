import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  THEME_TOGGLE_PENDING_LABEL,
  ThemeToggle,
  themeToggleLabel,
} from "../../components/shared/theme-toggle";

/** What `useTheme()` reports in the render under test (the server never knows the theme). */
let mockResolvedTheme: string | undefined;
jest.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme, setTheme: () => {} }),
}));
// The icons are theme-independent, and lucide-react's CJS build can't be require()d by this CJS
// Jest on Linux CI ("Must use import to load ES Module"): keep the test independent of it.
jest.mock("lucide-react", () => ({ Sun: () => null, Moon: () => null }));

/**
 * `renderToString` runs no effects, so it renders exactly what the server sends AND what the
 * client's hydration render produces before `useEffect` marks the component mounted.
 */
function renderWith(resolvedTheme: string | undefined): string {
  mockResolvedTheme = resolvedTheme;
  return renderToString(createElement(ThemeToggle));
}

describe("ThemeToggle (shared: login / reset-password pages)", () => {
  it("renders the same markup whatever the browser's theme, so hydration cannot mismatch", () => {
    const server = renderWith(undefined);
    expect(server).toContain(`aria-label="${THEME_TOGGLE_PENDING_LABEL}"`);
    // The first client render in a dark or a light browser must equal the server's markup.
    expect(renderWith("dark")).toBe(server);
    expect(renderWith("light")).toBe(server);
  });

  it("names the action once mounted", () => {
    expect(themeToggleLabel(true, "dark")).toBe("Switch to light mode");
    expect(themeToggleLabel(true, "light")).toBe("Switch to dark mode");
    expect(themeToggleLabel(true, undefined)).toBe("Switch to dark mode");
    expect(themeToggleLabel(false, "dark")).toBe(THEME_TOGGLE_PENDING_LABEL);
    expect(themeToggleLabel(false, "light")).toBe(THEME_TOGGLE_PENDING_LABEL);
  });
});
