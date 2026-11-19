// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../api/_lib/http";
import type { EngagementOffer, EngagementTemplate } from "../lib/recruitment-engagement";
import { buildRecruitmentOfferPDF, sendApplicantOfferDocument } from "../../api/_lib/recruitment-offer-document";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/recruitment-intake", async (original) => ({ ...await original<object>(), intakeRpc: rpc }));
const offerId = "11111111-1111-4111-8111-111111111111", templateId = "22222222-2222-4222-8222-222222222222";
const offer: EngagementOffer = { id: offerId, version: 2, status: "issued", approved_by: null, issued_at: "2026-11-15T12:00:00Z", accepted_at: null, terms: { positionTitle: "Life Sciences Tutor", engagementType: "independent_contractor", startDate: "2026-12-01", workArrangement: "Online", reportingArrangements: "Teaching lead", compensationTerms: "R150 per completed approved session", sessionRateCents: 15000, expiresAt: "2026-11-30T12:00:00Z", conditions: "Subject to completed onboarding", agreementTemplateId: templateId } };
const agreement: EngagementTemplate = { id: templateId, agreement_type: "independent_contractor", engagement_type: "independent_contractor", title: "Synthetic legally reviewed agreement", body: "Synthetic text for tests only, not legal terms.\n".repeat(220) };
beforeEach(() => rpc.mockReset());
it("generates a branded paginated private offer from exact versioned terms", async () => {
    const bytes = await buildRecruitmentOfferPDF({ caseReference: "SYNTHETIC-CASE", candidateName: "Synthetic Applicant", offer, agreement });
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toContain("version 2");
    expect(pdf.getCreator()).toBe("Viva Tutorials");
    expect(pdf.getCreationDate().toISOString()).toBe(offer.issued_at!.replace("Z", ".000Z"));
});
it("does not generate a private offer from an arbitrary or unpublished identifier", async () => {
    rpc.mockResolvedValue({ caseId: offerId, offers: [{ ...offer, status: "draft" }], templates: [agreement] });
    const end = vi.fn(), res = { setHeader: vi.fn(), end, statusCode: 200 } as unknown as ServerResponse;
    await expect(sendApplicantOfferDocument({} as ApiRequest, res, "own-case-proof", new URL(`http://localhost/?offerId=${offerId}`))).rejects.toThrow("offer_unavailable");
    expect(end).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("recruitment_engagement_applicant", { p_hash: "own-case-proof", p_action: "read", d: {} });
});
it("revalidates the capability and returns an attachment without accepting client terms", async () => {
    rpc.mockResolvedValueOnce({ caseId: offerId, offers: [offer], templates: [agreement] }).mockResolvedValueOnce({ caseReference: "SYNTHETIC-CASE", answers: { fields: { firstName: "Synthetic", lastName: "Applicant" } } });
    const headers: Record<string, unknown> = {}, end = vi.fn(), res = { setHeader: (k: string, v: unknown) => { headers[k] = v; }, end, statusCode: 200 } as unknown as ServerResponse;
    await sendApplicantOfferDocument({} as ApiRequest, res, "own-case-proof", new URL(`http://localhost/?offerId=${offerId}&compensation=attacker`));
    expect(end).toHaveBeenCalledOnce();
    expect(headers["Content-Type"]).toBe("application/pdf");
    expect(headers["Content-Disposition"]).toContain("Viva-offer-v2.pdf");
});
