import { getEnabledSocialProviders, getProviderCredentials } from "./providers";

describe("getEnabledSocialProviders", () => {
  it("lists only providers with both client id and secret", () => {
    expect(
      getEnabledSocialProviders({
        LINKEDIN_CLIENT_ID: "li-id",
        LINKEDIN_CLIENT_SECRET: "li-secret",
        GOOGLE_CLIENT_ID: "g-id", // secret missing
        GITHUB_CLIENT_SECRET: "gh-secret", // id missing
      }),
    ).toEqual(["linkedin"]);
  });

  it("treats blank values as missing", () => {
    expect(
      getEnabledSocialProviders({ GITHUB_CLIENT_ID: " ", GITHUB_CLIENT_SECRET: "x" }),
    ).toEqual([]);
  });

  it("keeps login-page order", () => {
    const env = Object.fromEntries(
      ["TWITTER", "GITHUB", "LINKEDIN"].flatMap((p) => [
        [`${p}_CLIENT_ID`, "id"],
        [`${p}_CLIENT_SECRET`, "secret"],
      ]),
    );
    expect(getEnabledSocialProviders(env)).toEqual(["linkedin", "github", "twitter"]);
  });
});

describe("getProviderCredentials", () => {
  it("returns trimmed credentials", () => {
    expect(
      getProviderCredentials("google", { GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "s" }),
    ).toEqual({ clientId: "id", clientSecret: "s" });
  });
});
