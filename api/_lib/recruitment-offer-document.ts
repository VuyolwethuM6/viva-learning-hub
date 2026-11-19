import { createHash } from "node:crypto";
import type { ServerResponse } from "node:http";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadTuitionAssets } from "./tuition-document.js";
import { id, intakeRpc, IntakeError } from "./recruitment-intake.js";
import type { ApiRequest } from "./http.js";
import type { EngagementSnapshot, EngagementOffer, EngagementTemplate } from "../../src/lib/recruitment-engagement.js";
type OfferEvidence = {
    caseReference: string;
    vacancyReference?: string;
    candidateName: string;
    offer: EngagementOffer;
    agreement: EngagementTemplate;
};
/** Render exact immutable approved terms. A PDF is a copy, not a signature or access grant. */
export async function buildRecruitmentOfferPDF(evidence: OfferEvidence) {
    const { offer, agreement } = evidence;
    const [logoBytes, regularBytes, boldBytes] = await loadTuitionAssets();
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(regularBytes, { subset: true }), bold = await pdf.embedFont(boldBytes, { subset: true }), logo = await pdf.embedPng(logoBytes);
    pdf.setTitle(`Viva Tutorials offer · version ${offer.version}`);
    pdf.setCreator("Viva Tutorials");
    pdf.setProducer("Viva Tutorials");
    const issued = new Date(offer.issued_at || offer.accepted_at || "");
    if (!Number.isFinite(issued.getTime()))
        throw new IntakeError("offer_unavailable", 404);
    pdf.setCreationDate(issued);
    pdf.setModificationDate(issued);
    let page: PDFPage, y = 0;
    const addPage = () => { page = pdf.addPage([595.28, 841.89]); y = 730; page.drawImage(logo, { x: 40, y: 764, width: 100, height: 100 * logo.height / logo.width }); page.drawText(`Recruitment offer · v${offer.version}`, { x: 270, y: 792, size: 13, font: bold, color: rgb(0.416, 0.227, 0.698) }); };
    const line = (text: string, strong = false) => {
        const font = strong ? bold : regular, size = strong ? 11 : 10;
        let current = "";
        const draw = () => { if (y < 55)
            addPage(); page.drawText(current, { x: 40, y, size, font, color: rgb(.1, .08, .15) }); y -= 15; current = ""; };
        for (const paragraph of Array.from(String(text)).filter(c => c === "\n" || c === "\t" || c.charCodeAt(0) >= 32).join("").split("\n")) {
            for (const word of paragraph.split(/\s+/)) {
                if (font.widthOfTextAtSize(current + (current ? " " : "") + word, size) <= 510) {
                    current += (current ? " " : "") + word;
                    continue;
                }
                if (current)
                    draw();
                for (const character of word) {
                    if (font.widthOfTextAtSize(current + character, size) > 510)
                        draw();
                    current += character;
                }
            }
            draw();
        }
    };
    addPage();
    line("PRIVATE · Verified applicant copy", true);
    line(`Candidate: ${evidence.candidateName || evidence.caseReference}`);
    line(`Application reference: ${evidence.caseReference}`);
    if (evidence.vacancyReference) line(`Vacancy reference: ${evidence.vacancyReference}`);
    line(`Offer reference: ${offer.id} · version ${offer.version}`);
    line(`Issued: ${offer.issued_at} · Status: ${offer.status}`);
    const labels: Record<string, string> = { positionTitle: "Position", engagementType: "Legal engagement type", startDate: "Start date", workArrangement: "Working arrangement", reportingArrangements: "Reporting arrangements", compensationTerms: "Compensation terms", sessionRateCents: "Tutor session rate (ZAR cents)", expiresAt: "Offer deadline", conditions: "Conditions" };
    for (const [key, label] of Object.entries(labels)) {
        y -= 7;
        line(label, true);
        line(String(offer.terms[key as keyof typeof offer.terms] ?? ""));
    }
    y -= 10;
    line(`Applicable agreement: ${agreement.title}`, true);
    line(`Version reference: ${agreement.id}`);
    line(agreement.body);
    y -= 10;
    line(`Agreement SHA-256: ${createHash("sha256").update(agreement.body).digest("hex")}`);
    line("Acceptance is recorded separately through your verified application workspace. This copy does not activate staff access.");
    const pages = pdf.getPages();
    pages.forEach((p, index) => p.drawText(`Viva Tutorials · Private offer · ${index + 1}/${pages.length}`, { x: 40, y: 28, size: 8, font: regular, color: rgb(.3, .3, .3) }));
    return pdf.save();
}
export async function sendApplicantOfferDocument(_req: ApiRequest, res: ServerResponse, hash: string, url: URL) {
    const offerId = id.parse(url.searchParams.get("offerId"));
    // This RPC independently validates current capability, case state, retention,
    // feature switches and issued visibility. Never accept client-supplied terms.
    const s = await intakeRpc<EngagementSnapshot>("recruitment_engagement_applicant", { p_hash: hash, p_action: "read", d: {} });
    const offer = s.offers.find(o => o.id === offerId && ["issued", "accepted", "declined", "expired", "withdrawn"].includes(o.status) && o.issued_at);
    const agreement = offer && s.templates.find(t => t.id === offer.terms.agreementTemplateId);
    if (!offer || !agreement)
        throw new IntakeError("offer_unavailable", 404);
    const c = await intakeRpc<{
        caseReference: string;
        answers?: {
            fields?: Record<string, unknown>;
        } | null;
    }>("recruitment_applicant_read", { p_hash: hash });
    const name = [c.answers?.fields?.firstName, c.answers?.fields?.lastName].filter(v => typeof v === "string").join(" ");
    const bytes = await buildRecruitmentOfferPDF({ caseReference: s.caseReference || c.caseReference || s.caseId, vacancyReference:s.vacancyReference, candidateName:s.candidateName || name, offer, agreement });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Viva-offer-v${offer.version}.pdf"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.statusCode = 200;
    return res.end(Buffer.from(bytes));
}
