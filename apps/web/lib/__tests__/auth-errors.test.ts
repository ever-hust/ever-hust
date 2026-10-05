import { authErrorMessage } from "../auth-errors";

describe("authErrorMessage", () => {
  it("is null when there is no error", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("explains a failed account creation and offers email sign-up", () => {
    expect(authErrorMessage("unable_to_create_user")).toMatch(/couldn't create your account.*email/);
  });

  it("explains a cancelled provider consent", () => {
    expect(authErrorMessage("access_denied")).toBe("Sign-in was cancelled.");
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(authErrorMessage("something_new")).toBe("Sign-in failed. Please try again.");
  });
});
