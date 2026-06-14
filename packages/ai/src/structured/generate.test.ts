import { z } from "zod";
import { runValidatedGeneration } from "./generate";

const schema = z.object({ n: z.number().int().min(0) });

describe("runValidatedGeneration", () => {
  it("returns the parsed object on first success", async () => {
    const gen = jest.fn().mockResolvedValue({ n: 5 });
    const result = await runValidatedGeneration(gen, schema, 2);
    expect(result).toEqual({ n: 5 });
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("retries on a validation failure then succeeds", async () => {
    const gen = jest
      .fn()
      .mockResolvedValueOnce({ n: -1 }) // invalid → retry
      .mockResolvedValueOnce({ n: 2 }); // valid
    const result = await runValidatedGeneration(gen, schema, 2);
    expect(result).toEqual({ n: 2 });
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it("retries when the generator throws then succeeds", async () => {
    const gen = jest
      .fn()
      .mockRejectedValueOnce(new Error("model exploded"))
      .mockResolvedValueOnce({ n: 3 });
    const result = await runValidatedGeneration(gen, schema, 2);
    expect(result).toEqual({ n: 3 });
    expect(gen).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting attempts", async () => {
    const gen = jest.fn().mockResolvedValue({ n: -99 }); // always invalid
    await expect(runValidatedGeneration(gen, schema, 3)).rejects.toThrow();
    expect(gen).toHaveBeenCalledTimes(3);
  });

  it("passes the attempt number to the generator", async () => {
    const seen: number[] = [];
    const gen = jest.fn(async (attempt: number) => {
      seen.push(attempt);
      if (attempt < 2) throw new Error("retry");
      return { n: 1 };
    });
    await runValidatedGeneration(gen, schema, 3);
    expect(seen).toEqual([1, 2]);
  });

  it("treats attempts < 1 as a single attempt", async () => {
    const gen = jest.fn().mockResolvedValue({ n: 0 });
    await runValidatedGeneration(gen, schema, 0);
    expect(gen).toHaveBeenCalledTimes(1);
  });
});
