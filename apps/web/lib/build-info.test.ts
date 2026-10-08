import { buildCommit } from "./build-info";

describe("buildCommit", () => {
  const sha = "f993e79c0ffee0123456789abcdef0123456789a";

  it("returns the image's GIT_SHA", () => {
    expect(buildCommit({ GIT_SHA: sha })).toBe(sha);
    expect(buildCommit({ GIT_SHA: ` ${sha}\n` })).toBe(sha);
    expect(buildCommit({ GIT_SHA: "f993e79" })).toBe("f993e79"); // a short sha is still a commit id
  });

  it("is null when the build did not pass one (unset, or the Docker ARG's empty default)", () => {
    expect(buildCommit({})).toBeNull();
    expect(buildCommit({ GIT_SHA: "" })).toBeNull();
    expect(buildCommit({ GIT_SHA: "   " })).toBeNull();
  });

  it("never reports a value that is not a commit id", () => {
    expect(buildCommit({ GIT_SHA: "undefined" })).toBeNull();
    expect(buildCommit({ GIT_SHA: "${{ github.sha }}" })).toBeNull();
    expect(buildCommit({ GIT_SHA: "abc" })).toBeNull();
    expect(buildCommit({ GIT_SHA: "<script>" })).toBeNull();
  });

  it("does not read the Vercel variable (that one stays on `version`)", () => {
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: sha })).toBeNull();
  });
});
