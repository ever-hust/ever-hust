import { classifyEmail } from "./email-classify";

describe("classifyEmail", () => {
  it("returns other for empty input", () => {
    expect(classifyEmail(null, null)).toBe("other");
    expect(classifyEmail("  ", "")).toBe("other");
  });

  it("detects a real offer", () => {
    expect(classifyEmail("Offer of employment", "We're pleased to offer you the role.")).toBe("offer");
    expect(classifyEmail("Your job offer letter", "Please sign and return.")).toBe("offer");
  });

  it("does not treat 'unable to offer' rejections as offers", () => {
    expect(
      classifyEmail(
        "Your application",
        "Unfortunately, we are unable to offer you the position at this time.",
      ),
    ).toBe("rejection");
  });

  it("does not treat 'decided not to extend an offer' as an offer", () => {
    expect(
      classifyEmail("Update", "We have decided not to extend an offer to you."),
    ).toBe("rejection");
  });

  it("handles contractions and 'not be able to offer'", () => {
    expect(classifyEmail("Update", "We regret to inform you that we can't offer you a role.")).toBe(
      "rejection",
    );
    expect(
      classifyEmail("Update", "Unfortunately we will not be able to offer you a position."),
    ).toBe("rejection");
  });

  it("classifies a plain denial (no other rejection keyword) as a rejection", () => {
    expect(classifyEmail("Your application", "We are unable to offer you the position.")).toBe(
      "rejection",
    );
    expect(classifyEmail("Update", "We cannot extend an offer at this time.")).toBe("rejection");
  });

  it("handles other phrasings of a denied offer", () => {
    expect(classifyEmail("Update", "We are not in a position to offer you the role.")).toBe(
      "rejection",
    );
    expect(classifyEmail("Update", "We will not be making you an offer.")).toBe("rejection");
    expect(classifyEmail("Update", "Sorry, we aren't able to offer you a position.")).toBe(
      "rejection",
    );
  });

  it("does not turn an unrelated negated offer aside into a rejection", () => {
    expect(classifyEmail("Role details", "Remote role. We are not offering relocation.")).toBe(
      "other",
    );
  });

  it("still detects an offer when a negated offer phrase appears alongside a real one", () => {
    expect(
      classifyEmail("Offer letter attached", "Please review. We are not offering relocation."),
    ).toBe("offer");
  });

  it("keeps classifying the other categories", () => {
    expect(classifyEmail("Phone screen next week", "")).toBe("interview");
    expect(classifyEmail("Pick a time", "Book a time on my calendly")).toBe("scheduling");
    expect(classifyEmail("Thank you for applying", "")).toBe("application");
  });
});
