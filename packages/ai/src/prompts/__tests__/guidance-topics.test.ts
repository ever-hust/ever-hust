import { describe, it, expect } from "@jest/globals";
import {
  GUIDANCE_TOPICS,
  findRelevantTopics,
  type GuidanceTopic,
} from "../guidance-topics";

describe("GUIDANCE_TOPICS", () => {
  it("should have exactly 8 topics", () => {
    expect(GUIDANCE_TOPICS).toHaveLength(8);
  });

  it("each topic should have all required fields", () => {
    for (const topic of GUIDANCE_TOPICS) {
      expect(topic).toHaveProperty("id");
      expect(topic).toHaveProperty("title");
      expect(topic).toHaveProperty("triggers");
      expect(topic).toHaveProperty("response_guidance");

      expect(typeof topic.id).toBe("string");
      expect(typeof topic.title).toBe("string");
      expect(Array.isArray(topic.triggers)).toBe(true);
      expect(typeof topic.response_guidance).toBe("string");

      // Each topic should have at least one trigger
      expect(topic.triggers.length).toBeGreaterThan(0);

      // All triggers should be non-empty strings
      for (const trigger of topic.triggers) {
        expect(typeof trigger).toBe("string");
        expect(trigger.length).toBeGreaterThan(0);
      }

      // IDs, titles, and guidance should be non-empty
      expect(topic.id.length).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.response_guidance.length).toBeGreaterThan(0);
    }
  });

  it("all topic IDs should be unique", () => {
    const ids = GUIDANCE_TOPICS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should contain the expected topic IDs", () => {
    const ids = GUIDANCE_TOPICS.map((t) => t.id);
    expect(ids).toContain("salary_negotiation");
    expect(ids).toContain("resume_optimization");
    expect(ids).toContain("career_transition");
    expect(ids).toContain("interview_tips");
    expect(ids).toContain("remote_work");
    expect(ids).toContain("networking");
    expect(ids).toContain("skill_gap");
    expect(ids).toContain("job_market_trends");
  });
});

describe("findRelevantTopics", () => {
  it('should return salary_negotiation for "What salary should I expect?"', () => {
    const results = findRelevantTopics("What salary should I expect?");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("salary_negotiation");
  });

  it('should return resume_optimization for "Help me update my CV"', () => {
    const results = findRelevantTopics("Help me update my CV");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("resume_optimization");
  });

  it('should return career_transition for "I want to switch careers"', () => {
    const results = findRelevantTopics("I want to switch careers");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("career_transition");
  });

  it('should return interview_tips for "How do I prepare for an interview?"', () => {
    const results = findRelevantTopics("How do I prepare for an interview?");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("interview_tips");
  });

  it('should return remote_work for "I prefer WFH jobs"', () => {
    const results = findRelevantTopics("I prefer WFH jobs");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("remote_work");
  });

  it('should return networking for "Should I reach out on LinkedIn?"', () => {
    const results = findRelevantTopics("Should I reach out on LinkedIn?");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("networking");
  });

  it('should return skill_gap for "What certifications should I get?"', () => {
    const results = findRelevantTopics("What certifications should I get?");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("skill_gap");
  });

  it('should return job_market_trends for "What jobs are in-demand?"', () => {
    const results = findRelevantTopics("What jobs are in-demand?");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("job_market_trends");
  });

  it("should be case-insensitive: SALARY matches salary_negotiation", () => {
    const results = findRelevantTopics("SALARY");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("salary_negotiation");
  });

  it('should return multiple matches for "remote interview tips"', () => {
    const results = findRelevantTopics("remote interview tips");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("remote_work");
    expect(ids).toContain("interview_tips");
  });

  it('should return empty array for unrelated input: "tell me a joke"', () => {
    const results = findRelevantTopics("tell me a joke");
    expect(results).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    const results = findRelevantTopics("");
    expect(results).toEqual([]);
  });

  it('should match multi-word triggers: "career change" matches career_transition', () => {
    const results = findRelevantTopics("I want a career change");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("career_transition");
  });

  it('should match partial word in trigger: "networking" contains "network"', () => {
    const results = findRelevantTopics("networking");
    const ids = results.map((t) => t.id);
    expect(ids).toContain("networking");
  });

  it("should return GuidanceTopic objects with full structure", () => {
    const results = findRelevantTopics("salary");
    expect(results.length).toBeGreaterThan(0);

    const topic = results[0]!;
    expect(topic).toHaveProperty("id");
    expect(topic).toHaveProperty("title");
    expect(topic).toHaveProperty("triggers");
    expect(topic).toHaveProperty("response_guidance");
  });
});
