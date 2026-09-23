import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/admin/password";

describe("hashPassword / verifyPassword", () => {
  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toContain("correct-horse-battery-staple");
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(await verifyPassword({ plainPassword: "my-secret-password", storedHash: hash })).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(await verifyPassword({ plainPassword: "wrong-password", storedHash: hash })).toBe(false);
  });

  it("rejects an empty password against a real hash", async () => {
    const hash = await hashPassword("my-secret-password");
    expect(await verifyPassword({ plainPassword: "", storedHash: hash })).toBe(false);
  });

  it("does not throw on a malformed stored hash", async () => {
    await expect(
      verifyPassword({ plainPassword: "anything", storedHash: "not-a-real-hash" }),
    ).resolves.toBe(false);
  });

  it("is case-sensitive", async () => {
    const hash = await hashPassword("PasswordCase");
    expect(await verifyPassword({ plainPassword: "passwordcase", storedHash: hash })).toBe(false);
  });
});
