import { VivaLoader } from "@/components/VivaLoader";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Mail, ShieldCheck, FileText, GraduationCap, Upload, X } from "lucide-react";
import programmes from "@/lib/tuition-programme.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TopBar, StickyHeader } from "@/components/Header";

type StudentDetails = {
  name: string;
  dob: string;
  gender: string;
  email: string;
  phone: string;
  school: string;
};

type GuardianDetails = {
  name: string;
  email: string;
  phone: string;
};

type SubjectMark = {
  current: string;
  target: string;
  difficulties: string[];
};

type ApplicationReceipt = {
  firstName: string;
  monthlyFee: number;
  applicationNumber: string;
  studentNumber: string;
  learnerName: string;
  guardianEmail: string;
  studentEmail: string;
  grade: string;
  subjects: string[];
  mode: string;
};

type PendingUpload = ApplicationReceipt & {
  applicationId: string;
  applicationNumber: string;
  studentNumber: string;
  uploadUrl: string;
  reportCardMimeType: string;
  file: File;
};

type Tier = {
  label: string;
  maxSubjects: number;
  prices: number[];
  subjects: string[];
};

const steps = ["Student", "Parent", "Tutoring", "Progress", "Review"];
const goals = [
  "Pass the subject",
  "Improve my marks",
  "Achieve a distinction",
  "Qualify for university",
  "Build confidence",
  "Prepare for exams",
  "Catch up on missed work",
  "Strengthen problem-solving",
];
const coreSubjects = ["Mathematics", "Mathematical Literacy", "Physical Sciences", "Life Sciences"];
const tiers: Record<"junior" | "senior" | "rewrite", Tier> = {
  junior: {
    label: "Grades 8–9",
    maxSubjects: 2,
    prices: [350, 600],
    subjects: ["Mathematics", "Natural Sciences", "Other academic support"],
  },
  senior: {
    label: "Grades 10–12",
    maxSubjects: 3,
    prices: [500, 800, 1100],
    subjects: coreSubjects,
  },
  rewrite: {
    label: "Matric Rewrite",
    maxSubjects: 3,
    prices: [550, 900, 1200],
    subjects: coreSubjects,
  },
};

const subjectTopics: Record<string, { junior?: string[]; senior?: string[]; topics?: string[] }> = {
  Mathematics: {
    junior: ["Algebra", "Equations", "Number patterns", "Fractions & decimals", "Geometry", "Area & volume", "Data handling"],
    senior: ["Algebra & equations", "Functions & graphs", "Trigonometry", "Calculus", "Analytical geometry", "Euclidean geometry", "Sequences & series", "Finance", "Probability", "Statistics"],
  },
  "Mathematical Literacy": { topics: ["Finance", "Measurement", "Maps & plans", "Data handling", "Probability"] },
  "Physical Sciences": { topics: ["Mechanics", "Waves, sound & light", "Electricity & magnetism", "Chemical change", "Stoichiometry", "Acids & bases", "Organic chemistry", "Electrochemistry"] },
  "Life Sciences": { topics: ["Cells & molecules", "DNA & genetics", "Evolution", "Human systems", "Environmental studies"] },
  "Natural Sciences": { topics: ["Matter & materials", "Energy", "Life & living", "Planet Earth & beyond"] },
  "Other academic support": { topics: ["Homework help", "Study skills", "Reading & comprehension", "Exam technique"] },
};

const emptyStudent: StudentDetails = { name: "", dob: "", gender: "", email: "", phone: "", school: "" };
const emptyGuardian: GuardianDetails = { name: "", email: "", phone: "" };
const inputClassName = "mt-2 h-11 rounded-[10px] border-slate-200 bg-white px-3.5 text-base focus-visible:ring-[#7949fe]";
const labelClassName = "mb-3 block text-sm font-semibold text-slate-700";
const stepErrorClassName = "mt-1 text-xs font-medium text-red-700";

function tierForGrade(grade: string): Tier | null {
  if (!grade) return null;
  if (grade === "Matric Rewrite") return tiers.rewrite;
  return grade === "Grade 8" || grade === "Grade 9" ? tiers.junior : tiers.senior;
}

function formatCurrency(amount: number) {
  return `R${amount.toLocaleString("en-ZA")}`;
}

function formatFileSize(size: number) {
  return size > 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getTopics(subject: string, grade: string) {
  const topics = subjectTopics[subject];
  if (!topics) return ["Not sure yet"];
  if (topics.topics) return [...topics.topics, "Not sure yet"];
  return [...(grade === "Grade 8" || grade === "Grade 9" ? topics.junior ?? [] : topics.senior ?? []), "Not sure yet"];
}

function ReviewCard({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: number;
  onEdit: (step: number) => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 rounded-2xl border border-violet-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#7949fe]">{title}</h3>
        <button type="button" aria-label={`Edit ${title} details`} onClick={() => onEdit(step)} className="rounded-md px-2 py-1 text-sm font-bold text-[#7949fe] hover:bg-violet-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7949fe]">
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="block break-words text-sm font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}

function TagList({ values }: { values: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.length ? values.map((value) => (
        <span key={value} className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-[#7949fe]">{value}</span>
      )) : <span className="text-sm text-slate-500">None selected</span>}
    </div>
  );
}

async function enrollmentFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // Consume the body inside the timeout, including stalled JSON responses.
    const body = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return {};
    });
    return { response, body: body && typeof body === 'object' && !Array.isArray(body) ? body : {} };
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function Enrollment() {
  const [student, setStudent] = useState<StudentDetails>(emptyStudent);
  const [guardian, setGuardian] = useState<GuardianDetails>(emptyGuardian);
  const [grade, setGrade] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [mode, setMode] = useState("");
  const [marks, setMarks] = useState<Record<string, SubjectMark>>({});
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [reportCard, setReportCard] = useState<File | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [completion, setCompletion] = useState<ApplicationReceipt | null>(null);
  const [submissionStage, setSubmissionStage] = useState('Saving your application');
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const submittingRef = useRef(false);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSubmitting) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const background = backgroundRef.current;
    background?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    statusRef.current?.focus();
    return () => {
      background?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isSubmitting]);

  useEffect(() => {
    if (!isSubmitting && completion) receiptHeadingRef.current?.focus();
    else if (!isSubmitting && submitError) errorRef.current?.focus();
  }, [isSubmitting, completion, submitError]);

  useEffect(() => {
    if (!isSubmitting && !pendingUpload && !submissionUncertain) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isSubmitting, pendingUpload, submissionUncertain]);

  const reportInput = useRef<HTMLInputElement>(null);
  const tier = tierForGrade(grade);
  const packageName = tier && selectedSubjects.length
    ? `${tier.label} · ${["", "One subject", "Two subjects", "Three subjects"][selectedSubjects.length]}`
    : "";
  const monthlyFee = tier && selectedSubjects.length ? tier.prices[selectedSubjects.length - 1] : 0;

  const clearError = (field: string) => {
    setErrors((current) => current.filter((error) => error !== field));
  };

  const updateStudent = (field: keyof StudentDetails, value: string) => {
    setStudent((current) => ({ ...current, [field]: value }));
    clearError(field);
  };

  const updateGuardian = (field: keyof GuardianDetails, value: string) => {
    setGuardian((current) => ({ ...current, [field]: value }));
    clearError(field);
  };

  const setMark = (subject: string, field: "current" | "target", value: string) => {
    setMarks((current) => ({
      ...current,
      [subject]: { current: "", target: "", difficulties: [], ...current[subject], [field]: value },
    }));
    clearError(`${subject}-${field}`);
  };

  const toggleDifficulty = (subject: string, difficulty: string) => {
    setMarks((current) => {
      const mark = current[subject] ?? { current: "", target: "", difficulties: [] };
      const difficulties = mark.difficulties.includes(difficulty)
        ? mark.difficulties.filter((value) => value !== difficulty)
        : [...mark.difficulties, difficulty];
      return { ...current, [subject]: { ...mark, difficulties } };
    });
  };

  const setReportFile = (file?: File) => {
    clearError("report");
    if (!file) {
      setReportCard(null);
      return;
    }
    const extensionAllowed = /\.(pdf|jpe?g|png)$/i.test(file.name);
    const mimeAllowed = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
    if (!extensionAllowed || !mimeAllowed) {
      setReportCard(null);
      setErrors((current) => [...current.filter((error) => error !== "report"), "report-type"]);
      if (reportInput.current) reportInput.current.value = "";
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setReportCard(null);
      setErrors((current) => [...current.filter((error) => error !== "report"), "report-size"]);
      if (reportInput.current) reportInput.current.value = "";
      return;
    }
    setErrors((current) => current.filter((error) => error !== "report-type" && error !== "report-size"));
    setReportCard(file);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReportFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setReportFile(event.dataTransfer.files[0]);
  };

  const validateStep = (step: number) => {
    const invalid: string[] = [];
    if (step === 0) {
      if (!student.name.trim()) invalid.push("name");
      if (!student.dob || student.dob >= new Date().toISOString().slice(0, 10)) invalid.push("dob");
      if (!student.gender) invalid.push("gender");
      if (!/^\S+@\S+\.\S+$/.test(student.email.trim())) invalid.push("email");
      if (student.phone.replace(/\D/g, "").length < 9) invalid.push("phone");
      if (!student.school.trim()) invalid.push("school");
    }
    if (step === 1) {
      if (!guardian.name.trim()) invalid.push("guardian-name");
      if (!/^\S+@\S+\.\S+$/.test(guardian.email.trim())) invalid.push("guardian-email");
      if (guardian.phone.replace(/\D/g, "").length < 9) invalid.push("guardian-phone");
    }
    if (step === 2) {
      if (!grade) invalid.push("grade");
      if (!selectedSubjects.length) invalid.push("subjects");
      if (!mode) invalid.push("mode");
    }
    if (step === 3) {
      if (!reportCard) invalid.push("report");
      selectedSubjects.forEach((subject) => {
        const mark = marks[subject];
        if (!mark?.current || Number(mark.current) < 0 || Number(mark.current) > 100) invalid.push(`${subject}-current`);
        if (!mark?.target || Number(mark.target) < 0 || Number(mark.target) > 100) invalid.push(`${subject}-target`);
      });
      if (!selectedGoals.length) invalid.push("goals");
    }
    if (step === 4 && !termsAccepted) invalid.push("terms");
    setErrors(invalid);
    return invalid.length === 0;
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
    setErrors([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finishEnrollment = async (upload: PendingUpload, retry: boolean) => {
    const finalize = async () => {
      setSubmissionStage('Verifying your report card');
      const { response, body } = await enrollmentFetch('/api/enrollment-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: upload.applicationId }),
      });
      const result = body as {
        error?: string;
        success?: boolean;
        applicationNumber?: string;
        studentNumber?: string;
        status?: string;
      };
      return { response, result };
    };

    let finalized: Awaited<ReturnType<typeof finalize>> | undefined;
    if (retry) {
      const existingUpload = await finalize();
      if (existingUpload.response.ok) {
        finalized = existingUpload;
      } else if (existingUpload.response.status !== 409) {
        throw new Error(existingUpload.result.error || 'Unable to verify the uploaded report card.');
      }
    }

    if (!finalized) {
      let uploadUrl = upload.uploadUrl;
      if (retry) {
        setSubmissionStage('Preparing your secure upload');
        const { response: urlResponse, body: urlBody } = await enrollmentFetch('/api/enrollment-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId: upload.applicationId }),
        });
        const urlResult = urlBody as { error?: string; uploadUrl?: string };
        if (!urlResponse.ok || !urlResult.uploadUrl) {
          throw new Error(urlResult.error || 'Unable to prepare a secure upload retry.');
        }
        uploadUrl = urlResult.uploadUrl;
      }

      setSubmissionStage('Uploading your report card');
      const uploadController = new AbortController();
      const uploadTimeout = window.setTimeout(() => uploadController.abort(), 90_000);
      let uploadResponse: Response;
      try {
        uploadResponse = await fetch(uploadUrl, {
          signal: uploadController.signal,
          method: 'PUT',
          headers: {
            'Content-Type': upload.reportCardMimeType,
            'x-upsert': 'false',
          },
          body: upload.file,
        });
      } finally {
        window.clearTimeout(uploadTimeout);
      }
      if (!uploadResponse.ok && uploadResponse.status !== 409) {
        throw new Error('The report card could not be uploaded securely. Retry the upload without resubmitting the application.');
      }

      finalized = await finalize();
    }
    if (!finalized.response.ok || !finalized.result.success ||
      finalized.result.status !== 'pending_review' ||
      finalized.result.applicationNumber !== upload.applicationNumber ||
      finalized.result.studentNumber !== upload.studentNumber) {
      throw new Error(finalized.result.error || 'The file uploaded, but the application could not be finalized. Retry the secure upload step.');
    }

    setCompletion({
      firstName: upload.firstName,
      learnerName: upload.learnerName,
      guardianEmail: upload.guardianEmail,
      studentEmail: upload.studentEmail,
      grade: upload.grade,
      subjects: upload.subjects,
      mode: upload.mode,
      monthlyFee: upload.monthlyFee,
      applicationNumber: finalized.result.applicationNumber,
      studentNumber: finalized.result.studentNumber,
    });
    setPendingUpload(null);
    setStudent(emptyStudent);
    setGuardian(emptyGuardian);
    setGrade("");
    setSelectedSubjects([]);
    setMode("");
    setMarks({});
    setSelectedGoals([]);
    setReportCard(null);
    setTermsAccepted(false);
    setPhotoConsent(false);
    if (reportInput.current) reportInput.current.value = "";
    setErrors([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || submissionUncertain) return;
    if (!pendingUpload && !validateStep(currentStep)) return;
    if (!pendingUpload && currentStep < steps.length - 1) {
      goToStep(currentStep + 1);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionStage(pendingUpload ? 'Checking your saved application' : 'Saving your application');
    setSubmitError(null);

    try {
      if (pendingUpload) {
        await finishEnrollment(pendingUpload, true);
        return;
      }
      if (!reportCard) {
        throw new Error('Select a report card before submitting.');
      }

      let submission: Awaited<ReturnType<typeof enrollmentFetch>>;
      try {
        submission = await enrollmentFetch('/api/enrollment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student,
            guardian,
            grade,
            selectedSubjects,
            mode,
            goals: selectedGoals,
            marks,
            monthlyFee,
            reportCardName: reportCard?.name ?? '',
            reportCardSize: reportCard?.size ?? 0,
            reportCardMimeType: reportCard?.type ?? '',
            termsAccepted,
            photoConsent,
          }),
        });

      } catch {
        setSubmissionUncertain(true);
        throw new Error('We could not confirm whether your application was saved. Please contact us before submitting again to avoid a duplicate application.');
      }
      const { response, body } = submission;
      const result = body as {
        error?: string;
        success?: boolean;
        applicationNumber?: string;
        applicationId?: string;
        studentNumber?: string;
        uploadUrl?: string;
        reportCardMimeType?: string;
        monthlyFee?: number;
      };
      if (!response.ok) {
        if (response.status >= 500) {
          setSubmissionUncertain(true);
          throw new Error('We could not confirm whether your application was saved. Please contact us before submitting again.');
        }
        throw new Error(result.error || 'Unable to submit enrollment.');
      }
      if (!result.success || !result.applicationNumber || !result.applicationId ||
        !result.studentNumber || !result.uploadUrl || !result.reportCardMimeType ||
        typeof result.monthlyFee !== 'number' || !Number.isFinite(result.monthlyFee) || result.monthlyFee <= 0) {
        setSubmissionUncertain(true);
        throw new Error('The enrollment response could not be confirmed. Please contact support before retrying.');
      }

      const pending: PendingUpload = {
        firstName: student.name.trim().split(/\s+/)[0],
        learnerName: student.name.trim(),
        guardianEmail: guardian.email.trim(),
        studentEmail: student.email.trim(),
        grade,
        subjects: [...selectedSubjects],
        mode,
        monthlyFee: result.monthlyFee,
        applicationNumber: result.applicationNumber,
        applicationId: result.applicationId,
        studentNumber: result.studentNumber,
        uploadUrl: result.uploadUrl,
        reportCardMimeType: result.reportCardMimeType,
        file: reportCard,
      };
      setPendingUpload(pending);
      await finishEnrollment(pending, false);
    } catch (error) {
      setSubmitError(error instanceof Error && error.name !== 'AbortError' ? error.message : 'The connection timed out. Your application reference is reserved; retry the secure upload below.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const toggleSubject = (subject: string) => {
    const next = selectedSubjects.includes(subject)
      ? selectedSubjects.filter((value) => value !== subject)
      : selectedSubjects.length < (tier?.maxSubjects ?? 0) ? [...selectedSubjects, subject] : selectedSubjects;
    setSelectedSubjects(next);
    if (!next.includes(subject)) {
      setMarks((currentMarks) => {
        const { [subject]: removed, ...remaining } = currentMarks;
        return remaining;
      });
    }
    if (next.length) clearError("subjects");
  };

  const toggleGoal = (goal: string) => {
    const next = selectedGoals.includes(goal)
      ? selectedGoals.filter((value) => value !== goal)
      : [...selectedGoals, goal];
    setSelectedGoals(next);
    if (next.length) clearError("goals");
  };

  const editFromReview = (step: number) => goToStep(step);

  return (
    <>
    <div ref={backgroundRef} className={`min-h-screen bg-slate-50 transition-[filter] motion-reduce:transition-none ${isSubmitting ? "blur-sm" : ""}`}>
       <div className="print:hidden"><TopBar />
       <StickyHeader /></div>
      <main id="main-content" className="px-3 pb-12 pt-32 sm:px-5 sm:pt-36 print:p-0">
        <div className="mx-auto max-w-[680px]">
          <section className="overflow-hidden rounded-3xl print:border-0 print:shadow-none border-2 border-violet-300/70 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6">
              <a href="/" aria-label="Viva Tutorials home" className="flex items-center gap-2">
                {/* <img src="/viva-tutorials-logo.png" alt="Viva Tutorials" className="h-10 w-auto" /> */}
                <h1 id="student-form-title" className="text-2xl font-bold leading-tight text-slate-900">Enrollment Form</h1>    
              </a>
              <span className="whitespace-nowrap text-xs font-semibold text-slate-500" aria-live="polite">
                {completion ? "Received" : `Step ${currentStep + 1} of ${steps.length}`}
              </span>
 
            </header>
            <p className="px-4 pb-3 text-xs leading-relaxed text-gray-600 font-semibold sm:px-6">{completion ? "Your application is saved and awaiting review." : "Apply for tutoring. We’ll review your details before confirming your place."}</p>
            <div className="h-1 bg-slate-200" aria-label="Form progress">
              <div
                className="h-full bg-gradient-to-r from-[#7949fe] to-[#ff7849] transition-[width] duration-300"
                style={{ width: completion ? "100%" : `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            {!completion ? (
              <>
                <nav aria-label="Enrollment steps" className="flex gap-1 px-3 pt-4 sm:px-5 sm:pt-5">
                  {steps.map((step, index) => (
                    <div
                      key={step}
                      aria-current={index === currentStep ? "step" : undefined}
                      className={`min-w-0 flex-1 text-center text-[0px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px] ${index === currentStep ? "sm:text-[#7949fe]" : ""}`}
                    >
                      <span className={`mx-auto mb-1 grid h-[30px] w-[30px] place-items-center rounded-full text-xs ${index < currentStep ? "bg-emerald-600 text-white" : index === currentStep ? "bg-[#7949fe] text-white" : "bg-violet-100 text-[#7949fe]"}`}>
                        {index < currentStep ? <Check className="h-4 w-4" /> : index + 1}
                      </span>
                      <span className={index === currentStep ? "text-[10px] sm:text-[11px]" : "hidden sm:block"}>{step}</span>
                    </div>
                  ))}
                </nav>

                <form onSubmit={handleContinue} aria-busy={isSubmitting} noValidate className="px-4 pb-6 pt-5 sm:px-6 sm:pb-7">
                  <fieldset disabled={isSubmitting || Boolean(pendingUpload) || submissionUncertain} className="min-w-0">
                  {currentStep === 0 && (
                    <section aria-labelledby="student-step-title">
                      <h1 id="student-step-title" className="text-2xl font-bold leading-tight text-slate-900">Student details</h1>
                      <p className="mb-5 mt-1 text-[15px] text-gray-600">Tell us about the learner.</p>
                      <label className={labelClassName} htmlFor="student-name">
                        Full name
                        <Input id="student-name" autoComplete="name" className={inputClassName} value={student.name} onChange={(event) => updateStudent("name", event.target.value)} placeholder="e.g. Victor Mableka" aria-invalid={errors.includes("name")} />
                        {errors.includes("name") && <span className={stepErrorClassName}>Please enter the student's full name.</span>}
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={labelClassName} htmlFor="student-dob">
                          Date of birth
                          <Input id="student-dob" type="date" className={inputClassName} value={student.dob} onChange={(event) => updateStudent("dob", event.target.value)} aria-invalid={errors.includes("dob")} />
                          {errors.includes("dob") && <span className={stepErrorClassName}>Enter a valid date of birth in the past.</span>}
                        </label>
                        <label className={labelClassName} htmlFor="student-gender">
                          Gender
                          <select id="student-gender" className={`mt-2 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7949fe] ${errors.includes("gender") ? "border-red-600" : ""}`} value={student.gender} onChange={(event) => updateStudent("gender", event.target.value)} aria-invalid={errors.includes("gender")}>
                            <option value="">Select…</option>
                            <option>Female</option>
                            <option>Male</option>
                            <option>Prefer not to say</option>
                          </select>
                          {errors.includes("gender") && <span className={stepErrorClassName}>Please select an option.</span>}
                        </label>
                      </div>
                      <label className={labelClassName} htmlFor="student-email">
                        Student email
                        <Input id="student-email" type="email" autoComplete="email" className={inputClassName} value={student.email} onChange={(event) => updateStudent("email", event.target.value)} placeholder="student@gmail.com" aria-invalid={errors.includes("email")} />
                        {errors.includes("email") && <span className={stepErrorClassName}>Enter a valid email address.</span>}
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={labelClassName} htmlFor="student-phone">
                          WhatsApp number
                          <Input id="student-phone" type="tel" autoComplete="tel" className={inputClassName} value={student.phone} onChange={(event) => updateStudent("phone", event.target.value)} placeholder="081 234 5678" aria-invalid={errors.includes("phone")} />
                          {errors.includes("phone") && <span className={stepErrorClassName}>Enter a valid phone number.</span>}
                        </label>
                        <label className={labelClassName} htmlFor="student-school">
                          School name
                          <Input id="student-school" className={inputClassName} value={student.school} onChange={(event) => updateStudent("school", event.target.value)} aria-invalid={errors.includes("school")} />
                          {errors.includes("school") && <span className={stepErrorClassName}>Please enter the school name.</span>}
                        </label>
                      </div>
                    </section>
                  )}

                  {currentStep === 1 && (
                    <section aria-labelledby="guardian-step-title">
                      <h1 id="guardian-step-title" className="text-2xl font-bold leading-tight text-slate-900">Parent / guardian</h1>
                      <p className="mb-5 mt-1 text-[15px] text-gray-600">We send invoices and progress reports here.</p>
                      <label className={labelClassName} htmlFor="guardian-name">
                        Full name
                        <Input id="guardian-name" autoComplete="name" className={inputClassName} value={guardian.name} onChange={(event) => updateGuardian("name", event.target.value)} aria-invalid={errors.includes("guardian-name")} />
                        {errors.includes("guardian-name") && <span className={stepErrorClassName}>Please enter the parent or guardian's name.</span>}
                      </label>
                      <label className={labelClassName} htmlFor="guardian-email">
                        Email
                        <Input id="guardian-email" type="email" autoComplete="email" className={inputClassName} value={guardian.email} onChange={(event) => updateGuardian("email", event.target.value)} placeholder="parent@gmail.com" aria-invalid={errors.includes("guardian-email")} />
                        {errors.includes("guardian-email") && <span className={stepErrorClassName}>Enter a valid email address.</span>}
                      </label>
                      <label className={labelClassName} htmlFor="guardian-phone">
                        Phone number
                        <Input id="guardian-phone" type="tel" autoComplete="tel" className={inputClassName} value={guardian.phone} onChange={(event) => updateGuardian("phone", event.target.value)} placeholder="+27 …" aria-invalid={errors.includes("guardian-phone")} />
                        {errors.includes("guardian-phone") && <span className={stepErrorClassName}>Enter a valid phone number.</span>}
                      </label>
                    </section>
                  )}

                  {currentStep === 2 && (
                    <section aria-labelledby="tutoring-step-title">
                      <h1 id="tutoring-step-title" className="text-2xl font-bold leading-tight text-slate-900">Tutoring</h1>
                      <p className="mb-5 mt-1 text-[15px] text-gray-600">Pick a grade and subjects. Your package is worked out for you.</p>
                      <label className={labelClassName} htmlFor="student-grade">
                        Grade level
                        <select
                          id="student-grade"
                          className={`mt-2 h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7949fe] ${errors.includes("grade") ? "border-red-600" : ""}`}
                          value={grade}
                          onChange={(event) => {
                            setGrade(event.target.value);
                            setSelectedSubjects([]);
                            setMarks({});
                            clearError("grade");
                            clearError("subjects");
                          }}
                          aria-invalid={errors.includes("grade")}
                        >
                          <option value="">Select…</option>
                          <option>Grade 8</option>
                          <option>Grade 9</option>
                          <option>Grade 10</option>
                          <option>Grade 11</option>
                          <option>Grade 12</option>
                          <option>Matric Rewrite</option>
                        </select>
                        {errors.includes("grade") && <span className={stepErrorClassName}>Please select a grade.</span>}
                      </label>

                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-slate-700">Subjects</h2>
                        {tier && <span className="text-xs font-semibold text-[#7949fe]">Max {tier.maxSubjects}</span>}
                      </div>
                      <div className="mb-2 flex flex-wrap gap-2">
                        {(tier?.subjects ?? []).map((subject) => {
                          const checked = selectedSubjects.includes(subject);
                          const disabled = !checked && selectedSubjects.length >= (tier?.maxSubjects ?? 0);
                          return (
                            <label key={subject} className="relative cursor-pointer">
                              <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={() => toggleSubject(subject)} />
                              <span className={`block min-h-[42px] rounded-full border px-4 py-2 text-sm font-semibold transition ${checked ? "border-[#7949fe] bg-[#7949fe] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#7949fe]"} ${disabled ? "cursor-not-allowed opacity-40" : ""} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#7949fe]`}>
                                {subject}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="mb-3 text-[13px] text-gray-600">
                        {tier ? `${tier.label}: choose up to ${tier.maxSubjects} subjects.` : "Select a grade to see available subjects."}
                      </p>
                      {errors.includes("subjects") && <p className={`${stepErrorClassName} mb-3`}>Pick at least one subject.</p>}

                      <div className={`my-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4 ${packageName ? "border-[#7949fe] bg-violet-50" : "border-slate-200"}`}>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#7949fe]">Your package</span>
                          <h2 className="mt-0.5 text-base font-bold text-slate-900">{packageName || "Select subjects to see your package"}</h2>
                        </div>
                        {monthlyFee > 0 && (
                          <div className="text-2xl font-extrabold leading-tight text-[#7949fe]">
                            {formatCurrency(monthlyFee)}
                            <span className="block text-xs font-semibold text-gray-600">per month</span>
                          </div>
                        )}
                      </div>

                      {tier && (
                        <div className="mb-4 rounded-lg border-l-4 border-[#ff7849] bg-orange-50 p-3">
                          <h3 className="mb-1.5 text-sm font-bold text-slate-900">Weekly programme</h3>
                          {(programmes[grade as keyof typeof programmes]?.schedule || []).map(([day, time]) => (
                            <div key={day} className="grid grid-cols-[96px_1fr] gap-2.5 border-t border-black/10 py-1.5 text-[13px] first:border-0">
                              <strong>{day}</strong>
                              <span>{time}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <h2 className="mb-2 text-sm font-semibold text-slate-700">How would you like to learn?</h2>
                      <div className="grid gap-2.5">
                        {[
                          ["In-person (Mfuleni)", "In-person group tutoring", "Mfuleni venue · small groups of up to six learners per subject"],
                          ["Online (Google Meet)", "Online tutoring", "Google Meet · same fees as in-person"],
                        ].map(([value, title, description]) => (
                          <label key={value} className="cursor-pointer">
                            <input type="radio" name="tutoring-mode" value={value} className="peer sr-only" checked={mode === value} onChange={(event) => { setMode(event.target.value); clearError("mode"); }} />
                            <span className={`block rounded-[14px] border-2 p-3 text-sm font-semibold text-slate-700 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#7949fe] ${mode === value ? "border-[#7949fe] bg-violet-50 text-[#5a4ecf]" : "border-slate-200 bg-white hover:border-[#7949fe]"}`}>
                              {title}
                              <small className="mt-0.5 block text-xs font-normal text-gray-600">{description}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                      {errors.includes("mode") && <p className={stepErrorClassName}>Choose how you’d like to learn.</p>}
                    </section>
                  )}

                  {currentStep === 3 && (
                    <section aria-labelledby="progress-step-title">
                      <h1 id="progress-step-title" className="text-2xl font-bold leading-tight text-slate-900">Progress &amp; goals</h1>
                      <p className="mb-5 mt-1 text-[15px] text-gray-600">This helps us set targets and track improvement from day one.</p>

                      <div className="mb-4">
                        <div className="mb-2 text-sm font-semibold text-slate-700">Most recent report card</div>
                        {reportCard ? (
                          <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                            <FileText className="h-5 w-5 shrink-0 text-[#7949fe]" />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">{reportCard.name}</span>
                              <span className="text-xs text-slate-500">{formatFileSize(reportCard.size)} · uploaded to private learner storage on submission</span>
                            </div>
                            <button
                              type="button"
                              aria-label="Remove report card"
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-700 hover:border-[#7949fe] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7949fe]"
                              onClick={() => { setReportFile(); if (reportInput.current) reportInput.current.value = ""; }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor="report-card"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={handleDrop}
                            className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 px-4 py-6 text-center text-sm text-gray-600 transition hover:border-[#7949fe] hover:bg-violet-50"
                          >
                            <Upload className="mb-1 h-7 w-7 text-[#7949fe]" />
                            <span><strong className="text-[#7949fe]">Click to upload</strong> or drag and drop</span>
                            <span className="text-xs text-slate-500">PDF, JPG or PNG · max 10 MB</span>
                            <input ref={reportInput} id="report-card" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={handleFileChange} aria-describedby="report-card-note" />
                          </label>
                        )}
                        <p id="report-card-note" className="mt-2 text-xs leading-5 text-slate-500">
                          The report card is uploaded to private learner storage when you submit. Accepted formats: PDF, JPG, PNG; maximum 10 MB.
                        </p>
                        {errors.includes("report") && <p className={stepErrorClassName}>Please select a report card before submitting.</p>}
                        {errors.includes("report-type") && <p className={stepErrorClassName}>Choose a PDF, JPG, or PNG file.</p>}
                        {errors.includes("report-size") && <p className={stepErrorClassName}>Choose a non-empty file of 10 MB or smaller.</p>}
                      </div>

                      <h2 className="mb-2 text-sm font-semibold text-slate-700">Your subjects</h2>
                      <div className="space-y-3">
                        {selectedSubjects.map((subject) => {
                          const mark = marks[subject] ?? { current: "", target: "", difficulties: [] };
                          return (
                            <section key={subject} className="rounded-2xl border border-violet-200 p-3.5">
                              <h3 className="mb-2.5 text-base font-bold text-[#7949fe]">{subject}</h3>
                              <div className="grid grid-cols-2 gap-2.5">
                                <label className="text-sm font-semibold text-slate-700">
                                  Current mark
                                  <Input type="number" min="0" max="100" step="1" className={inputClassName} value={mark.current} onChange={(event) => setMark(subject, "current", event.target.value)} placeholder="%" aria-invalid={errors.includes(`${subject}-current`)} />
                                  {errors.includes(`${subject}-current`) && <span className={stepErrorClassName}>Enter a mark from 0 to 100.</span>}
                                </label>
                                <label className="text-sm font-semibold text-slate-700">
                                  Target mark
                                  <Input type="number" min="0" max="100" step="1" className={inputClassName} value={mark.target} onChange={(event) => setMark(subject, "target", event.target.value)} placeholder="%" aria-invalid={errors.includes(`${subject}-target`)} />
                                  {errors.includes(`${subject}-target`) && <span className={stepErrorClassName}>Enter a mark from 0 to 100.</span>}
                                </label>
                              </div>
                              <h4 className="mb-2 mt-3 text-sm font-semibold text-slate-700">Where do you struggle? (pick any)</h4>
                              <div className="flex flex-wrap gap-2">
                                {getTopics(subject, grade).map((topic) => {
                                  const checked = mark.difficulties.includes(topic);
                                  return (
                                    <label key={topic} className="cursor-pointer">
                                      <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggleDifficulty(subject, topic)} />
                                      <span className={`block rounded-full border px-3 py-2 text-xs font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#7949fe] ${checked ? "border-[#7949fe] bg-[#7949fe] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#7949fe]"}`}>{topic}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>

                      <h2 className="mb-2 mt-4 flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
                        What are your learning goals?
                        <span className="text-xs font-semibold text-[#7949fe]">Pick any</span>
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {goals.map((goal) => {
                          const checked = selectedGoals.includes(goal);
                          return (
                            <label key={goal} className="cursor-pointer">
                              <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggleGoal(goal)} />
                              <span className={`block rounded-full border px-3 py-2 text-xs font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#7949fe] ${checked ? "border-[#7949fe] bg-[#7949fe] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#7949fe]"}`}>{goal}</span>
                            </label>
                          );
                        })}
                      </div>
                      {errors.includes("goals") && <p className={`${stepErrorClassName} mt-2`}>Pick at least one goal.</p>}
                    </section>
                  )}

                  {currentStep === 4 && (
                    <section aria-labelledby="review-step-title">
                      <h1 id="review-step-title" className="text-2xl font-bold leading-tight text-slate-900">Review &amp; confirm</h1>
                      <p className="mb-5 mt-1 text-[15px] text-gray-600">Check everything before submitting.</p>

                      <div className="relative mb-3 flex flex-wrap items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#7A4AF1] to-[#2A0E8F] p-4 text-white">
                        <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-8 h-32 w-32 rounded-full bg-[#F27435]/20" />
                        <div className="relative z-10 grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-white/35 bg-white/20 text-lg font-extrabold">
                          {student.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="relative z-10 min-w-0 flex-1">
                          <h2 className="break-words text-lg font-bold">{student.name}</h2>
                          <p className="text-sm text-white/80">{grade} · {mode}</p>
                        </div>
                        <div className="relative z-10 text-left sm:text-right">
                          <strong className="block text-2xl">{formatCurrency(monthlyFee)}</strong>
                          <span className="text-xs text-white/80">{packageName} · per month</span>
                        </div>
                      </div>

                      <ReviewCard title="Student" step={0} onEdit={editFromReview}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                          <ReviewValue label="Date of birth" value={student.dob} />
                          <ReviewValue label="Gender" value={student.gender} />
                          <ReviewValue label="Email" value={student.email} />
                          <ReviewValue label="WhatsApp" value={student.phone} />
                          <ReviewValue label="School" value={student.school} />
                        </div>
                      </ReviewCard>
                      <ReviewCard title="Parent / guardian" step={1} onEdit={editFromReview}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                          <ReviewValue label="Name" value={guardian.name} />
                          <ReviewValue label="Email" value={guardian.email} />
                          <ReviewValue label="Phone" value={guardian.phone} />
                        </div>
                      </ReviewCard>
                      <ReviewCard title="Tutoring" step={2} onEdit={editFromReview}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                          <ReviewValue label="Package" value={packageName} />
                          <ReviewValue label="Mode" value={mode} />
                          <div className="col-span-2">
                            <span className="mb-1 block text-xs font-semibold text-slate-500">Subjects</span>
                            <TagList values={selectedSubjects} />
                          </div>
                        </div>
                      </ReviewCard>
                      <ReviewCard title="Progress & targets" step={3} onEdit={editFromReview}>
                        <ReviewValue label="Report card (private upload)" value={reportCard?.name ?? ""} />
                        {selectedSubjects.map((subject) => {
                          const mark = marks[subject];
                          return (
                            <div key={subject} className="mt-3 border-t border-slate-200 pt-3">
                              <div className="mb-2 flex justify-between gap-3 text-sm font-bold">
                                <span>{subject}</span>
                                <span className="whitespace-nowrap text-gray-600">{mark?.current}% → {mark?.target}%</span>
                              </div>
                              <div className="relative h-2 rounded bg-violet-100">
                                <div className="absolute inset-y-0 left-0 rounded bg-[#7949fe]" style={{ width: `${Math.min(100, Number(mark?.current) || 0)}%` }} />
                                <span className="absolute -top-[3px] h-3.5 w-[3px] rounded bg-[#ff7849]" style={{ left: `calc(${Math.min(100, Number(mark?.target) || 0)}% - 1px)` }} />
                              </div>
                              <div className="mt-2"><TagList values={mark?.difficulties ?? []} /></div>
                            </div>
                          );
                        })}
                      </ReviewCard>
                      <ReviewCard title="Learning goals" step={3} onEdit={editFromReview}>
                        <TagList values={selectedGoals} />
                      </ReviewCard>

                      <p className="mb-3 text-[13px] text-gray-600">Fees are shown as a monthly estimate. Maximum of three subjects per learner.</p>
                      <label className="mb-2 flex items-start gap-2.5 text-sm text-gray-600">
                        <input type="checkbox" checked={termsAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); clearError("terms"); }} className="mt-1 h-[18px] w-[18px] shrink-0 accent-[#7949fe]" />
                        <span>I accept the Viva Tutorials <a href="/terms-of-service" target="_blank" rel="noreferrer" className="font-semibold text-[#7949fe] underline">terms and conditions</a>.</span>
                      </label>
                      {errors.includes("terms") && <p className={`${stepErrorClassName} mb-2`}>Please accept the terms to continue.</p>}
                      <label className="mb-2 flex items-start gap-2.5 text-sm text-gray-600">
                        <input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} className="mt-1 h-[18px] w-[18px] shrink-0 accent-[#7949fe]" />
                        <span>Optional: I allow photos/videos (faces blurred) for promotional use.</span>
                      </label>
                    </section>
                  )}

                  </fieldset>
                  <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row">
                    {currentStep > 0 && !pendingUpload && !submissionUncertain && (
                      <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => goToStep(currentStep - 1)} className="min-h-12 rounded-xl bg-violet-100 px-5 font-bold text-[#7949fe] hover:bg-violet-200">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    )}
                    <Button type="submit" disabled={isSubmitting || submissionUncertain} className="min-h-12 flex-1 rounded-xl bg-[#ff7849] px-5 font-bold text-white hover:bg-[#f2693b] disabled:cursor-not-allowed disabled:opacity-70">
                      {isSubmitting ? (pendingUpload ? 'Retrying secure upload…' : 'Submitting…') : pendingUpload ? 'Retry secure upload' : currentStep === steps.length - 1 ? 'Submit application' : 'Continue'}
                      {!isSubmitting && !pendingUpload && currentStep < steps.length - 1 && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </div>
                  {pendingUpload && (
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Application {pendingUpload.applicationNumber} and learner number {pendingUpload.studentNumber} are reserved. Completion is not yet confirmed here. Keep this page open and retry below rather than submitting a second application.
                    </p>
                  )}
                  {submitError && (
                    <div ref={errorRef} tabIndex={-1} role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{submitError}<a href="/contact" className="mt-2 block underline">Contact us for help</a></div>
                  )}
                </form>

                <div className="border-t border-violet-100 bg-violet-50/60 px-4 py-3 text-center text-xs leading-5 text-slate-600 sm:px-6">
                  <strong className="text-[#5a4ecf]">Your privacy matters:</strong> Your report card is uploaded to private storage for application review.
                </div>
              </>
            ) : (
              <section className="px-5 py-8 sm:px-8 sm:py-10" aria-labelledby="application-received-title">
                <div className="text-center">
                  <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-9 w-9" aria-hidden="true" /></div>
                  <h2 ref={receiptHeadingRef} tabIndex={-1} id="application-received-title" className="text-3xl font-extrabold tracking-tight text-slate-900 focus:outline-none">Application received!</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-600">Thank you, <strong>{completion.firstName}</strong>. Your application and report card have been saved.</p>
                  <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending review</span>
                </div>
                <div className="my-6 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Your student number</p>
                  <p className="mt-2 break-all text-2xl font-extrabold tracking-wide text-[#5a4ecf]">{completion.studentNumber}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-600">Keep this number safe. Quote it whenever you contact us about this application.</p>
                </div>
                <h3 className="mb-3 text-lg font-bold text-slate-900">Application summary</h3>
                <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 px-4">
                  {[
                    ['Application reference', completion.applicationNumber],
                    ['Learner', completion.learnerName],
                    ['Grade', completion.grade],
                    ['Subjects', completion.subjects.join(', ')],
                    ['Tutoring format', completion.mode],
                    ['Monthly tuition fee', formatCurrency(completion.monthlyFee)],
                  ].map(([label, value]) => <div key={label} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between sm:gap-5"><dt className="text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-900 sm:max-w-[65%] sm:text-right">{value}</dd></div>)}
                </dl>
                <div className="mt-5 flex gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" /><p>Your report card has been verified and stored privately. This confirms receipt of your application; your place and session schedule are still subject to review.</p></div>
                <h3 className="mb-3 mt-6 text-lg font-bold text-slate-900">What happens next?</h3>
                <ol className="space-y-3 text-sm leading-6 text-slate-600">
                  <li><strong className="text-slate-900">1. Application review.</strong> Our team will review your details, subjects and report card and contact you about the next steps.</li>
                  <li><strong className="text-slate-900">2. Watch your inbox.</strong> Check the learner and parent/guardian inboxes for your application receipt, including spam or junk. If it doesn’t arrive, contact us and quote your student number.</li>
                  <li><strong className="text-slate-900">3. Tuition arrangements.</strong> Tuition payments are not available on this page. Contact our team to confirm payment instructions and enrollment arrangements; no payment has been taken by this form.</li>
                </ol>
                <div className="mt-4 flex gap-3 rounded-xl border border-slate-200 p-4 text-sm"><Mail className="mt-1 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" /><div className="min-w-0"><p className="font-semibold text-slate-900">Email addresses supplied</p>{Array.from(new Set([completion.guardianEmail, completion.studentEmail].map(email => email.toLowerCase()))).map(email => <p key={email} className="mt-1 break-all text-slate-600">{email}</p>)}</div></div>
                <p className="mt-5 text-xs leading-5 text-slate-500">Save or print this confirmation for your records. It contains personal information, so keep it private. This page is not a learner portal and is not saved after you leave or refresh.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row print:hidden">
                  <Button type="button" onClick={() => window.print()} variant="secondary" className="min-h-12 rounded-xl">Print confirmation</Button>
                  <a href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#7949fe] px-5 text-sm font-bold text-white hover:bg-[#5a4ecf]">Contact Viva Tutorials</a>
                  <a href="/" className="inline-flex min-h-12 items-center justify-center px-3 text-sm font-semibold text-violet-700 underline">Back to home</a>
                </div>
              </section>
            )}
          </section>
          <p className="mt-3 flex items-center justify-center gap-1 text-center text-xs text-slate-500">
            <GraduationCap className="h-4 w-4" /> Viva Tutorials enrollment
          </p>
        </div>
      </main>
       
    </div>
    {isSubmitting && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 px-5 backdrop-blur-sm" onKeyDown={event => { if (event.key === 'Tab') event.preventDefault(); }}>
        <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-8 text-center shadow-2xl outline-none">
          <VivaLoader decorative />
          <p className="mt-5 text-lg font-bold text-slate-900">{submissionStage}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Please keep this page open. We’ll confirm receipt once your application and report card are saved.</p>
        </div>
      </div>
    )}
    </>
  );
}
