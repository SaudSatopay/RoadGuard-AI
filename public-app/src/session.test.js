import { beforeEach, describe, expect, it } from "vitest";
import { hasVoted, rememberVote, setCitizen } from "./session.js";

describe("citizen session", () => {
  beforeEach(() => window.localStorage.clear());

  it("remembers votes so a report can't be upvoted twice from one phone", () => {
    expect(hasVoted("RPT-1")).toBe(false);
    rememberVote("RPT-1");
    rememberVote("RPT-1");
    expect(hasVoted("RPT-1")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("roadguard_votes"))).toEqual(["RPT-1"]);
  });

  it("stores and clears the signed-in citizen", () => {
    setCitizen({ name: "Asha", role: "citizen" });
    expect(JSON.parse(window.localStorage.getItem("roadguard_citizen")).name).toBe("Asha");
    setCitizen(null);
    expect(window.localStorage.getItem("roadguard_citizen")).toBeNull();
  });
});
