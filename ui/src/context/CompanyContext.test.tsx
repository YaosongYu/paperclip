import { describe, expect, it } from "vitest";
import { resolveBootstrapCompanySelection } from "./CompanyContext";

const activeCompany = { id: "company-1" };
const archivedCompany = { id: "archived-company" };

describe("resolveBootstrapCompanySelection", () => {
  it("does not expose a stale stored company id before companies load", () => {
    expect(resolveBootstrapCompanySelection({
      companies: [],
      sidebarCompanies: [],
      selectedCompanyId: null,
      storedCompanyId: "stale-company",
    })).toBeNull();
  });

  it("replaces a stale stored company id with the first loaded company", () => {
    expect(resolveBootstrapCompanySelection({
      companies: [activeCompany],
      sidebarCompanies: [activeCompany],
      selectedCompanyId: null,
      storedCompanyId: "stale-company",
    })).toBe("company-1");
  });

  it("keeps a valid selected company ahead of stored bootstrap state", () => {
    expect(resolveBootstrapCompanySelection({
      companies: [activeCompany],
      sidebarCompanies: [activeCompany],
      selectedCompanyId: "company-1",
      storedCompanyId: "stale-company",
    })).toBe("company-1");
  });

  it("uses selectable sidebar companies before archived companies", () => {
    expect(resolveBootstrapCompanySelection({
      companies: [archivedCompany, activeCompany],
      sidebarCompanies: [activeCompany],
      selectedCompanyId: null,
      storedCompanyId: "archived-company",
    })).toBe("company-1");
  });
});
