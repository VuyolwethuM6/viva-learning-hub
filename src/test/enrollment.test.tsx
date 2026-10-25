import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Enrollment from "@/pages/Enrollment";

describe("enrollment submission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("submits the application and shows the server-issued reference", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          applicationId: "application-id",
          applicationNumber: "VT-TEST-1234",
          studentNumber: "VT-2026-000001",
          uploadUrl: "https://project.supabase.co/storage/upload/test",
          reportCardMimeType: "application/pdf",
          monthlyFee: 800,
        }),
      } as Response)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
        success: true,
        applicationNumber: "VT-TEST-1234",
        studentNumber: "VT-2026-000001",
        status: "pending_review",
        }),
      } as Response);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Enrollment />);

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Alex Learner" } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2009-05-12" } });
    fireEvent.change(screen.getByLabelText("Gender"), { target: { value: "Prefer not to say" } });
    fireEvent.change(screen.getByLabelText("Student email"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "+27 82 123 4567" } });
    fireEvent.change(screen.getByLabelText("School name"), { target: { value: "Example High School" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jordan Guardian" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+27 82 987 6543" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.change(screen.getByLabelText("Grade level"), { target: { value: "Grade 10" } });
    fireEvent.click(screen.getByLabelText("Mathematics"));
    fireEvent.click(screen.getByLabelText("Physical Sciences"));
    fireEvent.click(screen.getByLabelText(/Online tutoring/));
    expect(screen.getByText("R800")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const report = new File(["demo report"], "report.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/Click to upload/), { target: { files: [report] } });
    fireEvent.change(screen.getAllByLabelText("Current mark")[0], { target: { value: "65" } });
    fireEvent.change(screen.getAllByLabelText("Target mark")[0], { target: { value: "85" } });
    fireEvent.change(screen.getAllByLabelText("Current mark")[1], { target: { value: "70" } });
    fireEvent.change(screen.getAllByLabelText("Target mark")[1], { target: { value: "90" } });
    fireEvent.click(screen.getByLabelText("Improve my marks"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { name: "Review & confirm" })).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/I accept the Viva Tutorials/));
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    expect(await screen.findByRole("heading", { name: "Enrollment submitted" })).toBeInTheDocument();
    expect(screen.getByText("VT-2026-000001")).toBeInTheDocument();
    expect(screen.getByText("VT-TEST-1234")).toBeInTheDocument();
    expect(screen.getByText("R800")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request.selectedSubjects).toEqual(["Mathematics", "Physical Sciences"]);
    expect(request.reportCardName).toBe("report.pdf");
    expect(request.reportCardMimeType).toBe("application/pdf");
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
      body: report,
    });
    expect(String(fetchSpy.mock.calls[2][0])).toBe("/api/enrollment-complete");
  }, 30000);
});
