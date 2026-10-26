import { describe, it, expect } from "vitest";
import { studyMaterials } from "@/lib/studyMaterials";

describe("study materials catalogue", () => {
  it("lists the available free and paid Grade 12 documents", () => {
    expect(studyMaterials).toHaveLength(6);
    expect(studyMaterials.filter((material) => material.isFree)).toHaveLength(4);
    expect(studyMaterials.filter((material) => !material.isFree).map((material) => material.amount)).toEqual(["299.00", "399.00"]);
    expect(studyMaterials.every((material) => material.grade === 12)).toBe(true);
  });

  it("keeps exam sitting explicit instead of guessing a month", () => {
    expect(studyMaterials.every((material) => material.examSession === "General revision")).toBe(true);
    expect(new Set(studyMaterials.map((material) => material.subject))).toEqual(new Set(["Mathematics"]));
  });
});
