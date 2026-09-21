import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  isValidMobile,
  isNonEmptyName,
  isValidEmployeeId,
  normaliseMobile,
} from "@/lib/validation";

describe("isValidEmail", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmail("kavya.rao@prestigeconstructions.com")).toBe(true);
    expect(isValidEmail("  name@company.co.in  ")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(false); // tld < 2
  });
});

describe("isNonEmptyName", () => {
  it("requires non-whitespace content", () => {
    expect(isNonEmptyName("Kavya")).toBe(true);
    expect(isNonEmptyName("   ")).toBe(false);
    expect(isNonEmptyName(null)).toBe(false);
  });
});

describe("normaliseMobile", () => {
  it("strips +91 and spaces", () => {
    expect(normaliseMobile("+91 8296473767")).toBe("8296473767");
    expect(normaliseMobile("91 90365 39752")).toBe("9036539752");
  });
  it("strips punctuation", () => {
    expect(normaliseMobile("(984)-501-2345")).toBe("9845012345");
  });
  it("drops a leading trunk zero", () => {
    expect(normaliseMobile("09845012345")).toBe("9845012345");
  });
  it("leaves short numbers short (caught by needs_review)", () => {
    expect(normaliseMobile("99001")).toBe("99001");
  });
});

describe("isValidEmployeeId", () => {
  it("accepts exactly 6 digits", () => {
    expect(isValidEmployeeId("102314")).toBe(true);
  });
  it("rejects fewer or more than 6 digits and non-digits", () => {
    expect(isValidEmployeeId("700")).toBe(false);
    expect(isValidEmployeeId("1234567")).toBe(false);
    expect(isValidEmployeeId("12a456")).toBe(false);
    expect(isValidEmployeeId("")).toBe(false);
  });
});

describe("isValidMobile", () => {
  it("accepts exactly 10 digits after normalisation", () => {
    expect(isValidMobile("+91 8296473767")).toBe(true);
    expect(isValidMobile("9845012345")).toBe(true);
  });
  it("rejects wrong lengths", () => {
    expect(isValidMobile("99001")).toBe(false);
    expect(isValidMobile("98450123456")).toBe(false);
    expect(isValidMobile("")).toBe(false);
  });
});
