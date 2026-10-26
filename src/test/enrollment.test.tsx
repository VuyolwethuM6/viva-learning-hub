import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Enrollment from "@/pages/Enrollment";

const draft = {
  success: true, applicationId: 'application-id', applicationNumber: 'VT-TEST-1234',
  studentNumber: 'VT-2026-000001', uploadUrl: 'https://project.supabase.co/storage/upload/test',
  reportCardMimeType: 'application/pdf', monthlyFee: 800,
};
const complete = { success: true, applicationNumber: draft.applicationNumber, studentNumber: draft.studentNumber, status: 'pending_review' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function prepareApplication() {
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
  return report;
}

describe('enrollment submission', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('blocks duplicate submission and shows progress until a verified receipt is returned', async () => {
    const saving = deferred<Response>();
    const uploading = deferred<Response>();
    const verifying = deferred<Response>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockReturnValueOnce(saving.promise).mockReturnValueOnce(uploading.promise).mockReturnValueOnce(verifying.promise);
    const report = prepareApplication();
    const submit = screen.getByRole('button', { name: 'Submit application' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Saving your application');
    expect(screen.getByRole('status')).toHaveFocus();
    expect(document.querySelector('[inert]')).not.toBeNull();
    expect(submit).toBeDisabled();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => saving.resolve(json(draft, 201)));
    expect(screen.getByRole('status')).toHaveTextContent('Uploading your report card');
    expect(screen.queryByRole('heading', { name: 'Application received!' })).not.toBeInTheDocument();
    await act(async () => uploading.resolve(new Response(null, { status: 200 })));
    expect(screen.getByRole('status')).toHaveTextContent('Verifying your report card');
    await act(async () => verifying.resolve(json(complete)));
    expect(screen.getByRole('heading', { name: 'Application received!' })).toHaveFocus();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
    for (const value of [draft.studentNumber, draft.applicationNumber, 'R800', 'Alex Learner', 'Grade 10', 'jordan@example.com', 'alex@example.com', 'Pending review']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText(/no payment has been taken/i)).toBeInTheDocument();
    expect(screen.queryByText(/we.ve emailed/i)).not.toBeInTheDocument();
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Print confirmation' }));
    expect(print).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(request.selectedSubjects).toEqual(['Mathematics', 'Physical Sciences']);
    expect(request.reportCardName).toBe('report.pdf');
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: report, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' } });
  });

  it('recovers a failed upload without creating another application', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(draft, 201))
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValueOnce(json({ error: 'Not yet uploaded' }, 409))
      .mockResolvedValueOnce(json({ uploadUrl: draft.uploadUrl }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json(complete));
    prepareApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByRole('alert')).toHaveFocus();
    expect(screen.getByText(/are reserved/)).toHaveTextContent(draft.applicationNumber);
    expect(screen.getByRole('button', { name: 'Edit Student details' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry secure upload' }));
    expect(await screen.findByRole('heading', { name: 'Application received!' })).toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([url]) => url === '/api/enrollment')).toHaveLength(1);
    expect(fetchSpy.mock.calls[3][0]).toBe('/api/enrollment-upload-url');
  });

  it('does not accept mismatched references when retrying completion', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(draft, 201))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ error: 'Temporarily unavailable' }, 502))
      .mockResolvedValueOnce(json({ ...complete, studentNumber: 'another-student' }))
      .mockResolvedValueOnce(json(complete));
    prepareApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry secure upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be finalized');
    expect(screen.queryByRole('heading', { name: 'Application received!' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry secure upload' }));
    expect(await screen.findByRole('heading', { name: 'Application received!' })).toBeInTheDocument();
    expect(fetchSpy.mock.calls.filter(([url]) => url === '/api/enrollment')).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('blocks blind resubmission when initial creation has an unknown outcome', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Connection lost'));
    prepareApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('contact us before submitting again');
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Application received!' })).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('preserves editable details after a definite validation rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Please check your details' }, 400));
    prepareApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check your details');
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });
  it('releases the loading overlay on timeout and avoids an automatic second draft', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    }));
    prepareApplication();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('contact us before submitting again');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it.each([null, { ...draft, monthlyFee: '800' }, { ...draft, studentNumber: '' }])('rejects an unconfirmed successful draft response: %j', async body => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(body, 201));
    prepareApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed');
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
  });

});
