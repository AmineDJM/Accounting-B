import { describe, it, expect, afterEach } from "vitest";
import { AttemptLimiter, bootstrapCode } from "@/lib/authz";

/**
 * The start-up code is the one secret a stranger could try to guess, so the two
 * things that protect it — a minimum length and a limit on attempts — are
 * tested rather than assumed.
 */
afterEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_CODE;
});

describe("start-up code", () => {
  it("is absent when the environment says nothing", () => {
    expect(bootstrapCode()).toBeNull();
  });

  it("refuses a code short enough to guess", () => {
    process.env.ADMIN_BOOTSTRAP_CODE = "court";
    expect(bootstrapCode()).toBeNull();
    process.env.ADMIN_BOOTSTRAP_CODE = "douzecaract";  // 11
    expect(bootstrapCode()).toBeNull();
    process.env.ADMIN_BOOTSTRAP_CODE = "douzecaracte"; // 12
    expect(bootstrapCode()).toBe("douzecaracte");
  });

  it("ignores the whitespace a copy-paste brings along", () => {
    process.env.ADMIN_BOOTSTRAP_CODE = "  un-code-assez-long  \n";
    expect(bootstrapCode()).toBe("un-code-assez-long");
  });
});

describe("attempt limiter", () => {
  it("allows up to the maximum, then stops", () => {
    const limiter = new AttemptLimiter(3, 1000);
    const t = 1_000_000;
    expect(limiter.allowed("a@b.c", t)).toBe(true);
    for (let i = 0; i < 3; i++) limiter.fail("a@b.c", t);
    expect(limiter.allowed("a@b.c", t)).toBe(false);
  });

  it("counts each address on its own", () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.fail("a@b.c", 0);
    expect(limiter.allowed("a@b.c", 0)).toBe(false);
    expect(limiter.allowed("other@b.c", 0)).toBe(true);
  });

  it("reopens once the window has passed", () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.fail("a@b.c", 0);
    expect(limiter.allowed("a@b.c", 500)).toBe(false);
    expect(limiter.allowed("a@b.c", 1500)).toBe(true);
  });

  it("forgets an address that succeeded", () => {
    const limiter = new AttemptLimiter(1, 10_000);
    limiter.fail("a@b.c", 0);
    limiter.clear("a@b.c");
    expect(limiter.allowed("a@b.c", 0)).toBe(true);
  });
});
