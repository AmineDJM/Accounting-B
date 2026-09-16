import { describe, it, expect } from "vitest";
import { CostBasisLedger } from "@/lib/engine/costbasis";
import { D } from "@/lib/engine/money";

const at = new Date("2025-01-01T00:00:00Z");

describe("CostBasisLedger", () => {
  it("computes weighted average cost (CUMP) like the PCG example", () => {
    const l = new CostBasisLedger("CUMP");
    l.acquire("BTC", D(1), D(30000), at, "a");
    l.acquire("BTC", D(2), D(120000), at, "b"); // 60 000 each
    expect(l.averageCost("BTC").toString()).toBe("50000");
    const r = l.dispose("BTC", D(1), D(55000));
    expect(r.costBasisEur.toString()).toBe("50000");
    expect(r.gainEur.toString()).toBe("5000");
    expect(l.position("BTC").qty.toString()).toBe("2");
    expect(l.position("BTC").totalCost.toString()).toBe("100000");
  });

  it("computes FIFO lots", () => {
    const l = new CostBasisLedger("FIFO");
    l.acquire("ETH", D(1), D(1000), at, "a");
    l.acquire("ETH", D(1), D(2000), at, "b");
    const r = l.dispose("ETH", D("1.5"), D(4500));
    expect(r.costBasisEur.toString()).toBe("2000"); // 1 × 1000 + 0.5 × 2000
    expect(r.gainEur.toString()).toBe("2500");
    expect(l.position("ETH").qty.toString()).toBe("0.5");
    expect(l.position("ETH").totalCost.toString()).toBe("1000");
  });

  it("flags disposals beyond holdings instead of going negative", () => {
    const l = new CostBasisLedger("CUMP");
    l.acquire("SOL", D(1), D(100), at, "a");
    const r = l.dispose("SOL", D(3), D(600));
    expect(r.shortfallQty.toString()).toBe("2");
    expect(r.costBasisEur.toString()).toBe("100");
    expect(l.position("SOL").qty.toString()).toBe("0");
  });
});
