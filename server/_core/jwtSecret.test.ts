import { afterEach, describe, expect, it } from "vitest";
import { getJwtSecret } from "./jwtSecret";

const originalSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

describe("getJwtSecret", () => {
  it("falha quando JWT_SECRET não está configurado", () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow(/not configured/i);
  });

  it("rejeita segredo curto", () => {
    process.env.JWT_SECRET = "curto";
    expect(() => getJwtSecret()).toThrow(/at least 32/i);
  });

  it("aceita segredo forte configurado no ambiente", () => {
    process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
    const value = getJwtSecret();
    expect(value).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(value)).toBe(process.env.JWT_SECRET);
  });
});
