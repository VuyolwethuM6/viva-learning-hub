/* eslint-disable @typescript-eslint/no-explicit-any -- Synthetic SQL/HTTP fixture validates heterogeneous JSON at runtime. */
// @vitest-environment node
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { fixture, owner, manager, officer } from "./helpers/recruitment-m3";
let f: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  f = await fixture();
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
describe("M3 integrated database", () => {
  it("keeps all five flags and production interlock disabled", async () => {
    const r = await f.db.query<any>(
      "select * from public.recruitment_settings",
    );
    for (const k of [
      "vacancy_intake_enabled",
      "talent_pool_intake_enabled",
      "document_uploads_enabled",
      "case_processing_enabled",
      "applicant_email_enabled",
    ])
      expect(r.rows[0][k]).toBe(false);
    await expect(
      f.db.exec(
        "update public.recruitment_settings set applicant_email_enabled=true",
      ),
    ).rejects.toThrow();
  });
  it("runs verified draft, immutable submission and privacy workflow", async () => {
    await f.enable();
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug);
    const read = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    expect(read.state).toBe("draft");
    const data = {
      requestId: randomUUID(),
      expectedRevision: read.revision,
      formId: read.formId,
      answersPatch: f.answers,
    };
    const a = {
      p_hash: s.hash,
      p_action: "save",
      p_data: data,
      p_digest: "f".repeat(64),
      p_key_version: 1,
    };
    await f.rpc("recruitment_applicant_mutate", a);
    expect((await f.rpc("recruitment_applicant_mutate", a)).replayed).toBe(
      true,
    );
    const saved = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    expect(saved.answers.fields.firstName).toBe("Synthetic");
    const sub = await f.rpc("recruitment_submit", {
      p_hash: s.hash,
      d: {
        requestId: randomUUID(),
        expectedRevision: saved.revision,
        formId: saved.formId,
        poolConsent: false,
        privacyAcknowledged: true,
      },
      p_digest: "1".repeat(64),
      p_key_version: 1,
    });
    expect(sub.receipt).toBeTruthy();
    expect(
      (await f.rpc("recruitment_cases_read", { p_actor: owner })).cases,
    ).toHaveLength(1);
  });
});

describe("M3 authorization, documents and privacy regressions", () => {
  it("isolates case capabilities and rejects unauthenticated or unapproved document bytes", async () => {
    const v = await f.vacancy(),
      s = await f.email(v.slug, "documents@example.test");
    const read = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    expect(read.formId).toBe(v.formId);
    await expect(
      f.rpc("recruitment_applicant_read", { p_hash: "0".repeat(64) }),
    ).rejects.toThrow("verification_required");
    const d = {
      requestId: randomUUID(),
      requirementKey: "cv",
      name: "synthetic.pdf",
      size: 20,
      checksum: "0".repeat(64),
    };
    const doc = await f.rpc("recruitment_document_mutate", {
      p_hash: s.hash,
      p_action: "reserve",
      d,
      p_digest: "2".repeat(64),
      p_key_version: 1,
    });
    await expect(
      f.rpc("recruitment_document_access", {
        p_hash: s.hash,
        p_actor: null,
        p_document: doc.documentId,
      }),
    ).rejects.toThrow();
    const plan = await f.rpc("recruitment_document_mutate", {
      p_hash: s.hash,
      p_action: "chunk_plan",
      d: {
        documentId: doc.documentId,
        generation: doc.generation,
        index: 0,
        size: 20,
        checksum: "0".repeat(64),
      },
      p_digest: "0".repeat(64),
      p_key_version: 1,
    });
    expect(plan.path).toMatch(/\/0$/);
    await expect(
      f.rpc("recruitment_document_mutate", {
        p_hash: s.hash,
        p_action: "chunk_plan",
        d: {
          documentId: doc.documentId,
          generation: randomUUID(),
          index: 0,
          size: 20,
          checksum: "0".repeat(64),
        },
        p_digest: "0".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow();
    await f.rpc("recruitment_document_mutate", {
      p_hash: s.hash,
      p_action: "chunk_commit",
      d: {
        documentId: doc.documentId,
        generation: doc.generation,
        index: 0,
        size: 20,
        checksum: "0".repeat(64),
      },
      p_digest: "0".repeat(64),
      p_key_version: 1,
    });
    await f.rpc("recruitment_document_mutate", {
      p_hash: s.hash,
      p_action: "finalize",
      d: { documentId: doc.documentId, generation: doc.generation },
      p_digest: "0".repeat(64),
      p_key_version: 1,
    });
    const claim = randomUUID(),
      job = await f.rpc("recruitment_scan_claim", { p_claim: claim });
    expect(job.documentId).toBe(doc.documentId);
    await expect(
      f.rpc("recruitment_scan_complete", {
        p_job: job.jobId,
        p_claim: claim,
        d: {
          verdict: "clean",
          checksum: "1".repeat(64),
          size: 20,
          engine: "protocol-fixture",
          definitions: "synthetic",
          policy: "pdf-v1",
          cleanPath: job.cleanPath,
        },
      }),
    ).rejects.toThrow("scan_integrity_failure");
    await f.rpc("recruitment_scan_complete", {
      p_job: job.jobId,
      p_claim: claim,
      d: {
        verdict: "infected",
        checksum: "0".repeat(64),
        size: 20,
        engine: "protocol-fixture",
        definitions: "synthetic",
        policy: "pdf-v1",
        cleanPath: "",
      },
    });
    expect(
      (await f.rpc("recruitment_applicant_documents", { p_hash: s.hash }))[0]
        .state,
    ).toBe("rejected");
  });
  it("keeps PII out of immutable staff governance and rejects conflicting owner reads", async () => {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, "owner@example.test");
    let r = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_applicant_mutate", {
      p_hash: s.hash,
      p_action: "save",
      p_data: {
        requestId: randomUUID(),
        expectedRevision: r.revision,
        formId: r.formId,
        answersPatch: f.answers,
      },
      p_digest: "3".repeat(64),
      p_key_version: 1,
    });
    r = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_submit", {
      p_hash: s.hash,
      d: {
        requestId: randomUUID(),
        expectedRevision: r.revision,
        formId: r.formId,
        poolConsent: false,
        privacyAcknowledged: true,
      },
      p_digest: "4".repeat(64),
      p_key_version: 1,
    });
    await expect(
      f.rpc("recruitment_cases_read", { p_actor: owner, p_case: r.id }),
    ).rejects.toThrow("access_denied");
    const data = await f.db.query<any>(
      "select payload from public.recruitment_requests",
    );
    expect(JSON.stringify(data.rows)).not.toContain("Synthetic Applicant");
    expect(JSON.stringify(data.rows)).not.toContain("owner@example.test");
  });
  it("requires genuine policy approval and preserves the separate operational grant boundary", async () => {
    const rpcNames = [
      "recruitment_email_exchange(uuid,text,text,text)",
      "recruitment_submit(text,jsonb,text,integer)",
      "recruitment_scan_complete(uuid,uuid,jsonb)",
    ];
    for (const name of rpcNames) {
      const r = await f.db.query<any>(
        "select has_function_privilege('anon',$1,'EXECUTE') a,has_function_privilege('authenticated',$1,'EXECUTE') b,has_function_privilege('service_role',$1,'EXECUTE') c",
        ["public." + name],
      );
      expect(r.rows[0]).toEqual({ a: false, b: false, c: true });
    }
    const r = await f.db.query<any>(
      "select has_function_privilege('service_role','public.recruitment_intake_operate(text,text,text,text,integer,text)','EXECUTE') a",
    );
    expect(r.rows[0].a).toBe(false);
  });
});

describe("M3 human review and erasure lifecycle", () => {
  async function submitted(email: string) {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, email);
    let c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_applicant_mutate", {
      p_hash: s.hash,
      p_action: "save",
      p_data: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: c.formId,
        answersPatch: f.answers,
      },
      p_digest: "5".repeat(64),
      p_key_version: 1,
    });
    c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_submit", {
      p_hash: s.hash,
      d: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: c.formId,
        poolConsent: false,
        privacyAcknowledged: true,
      },
      p_digest: "6".repeat(64),
      p_key_version: 1,
    });
    return {
      ...s,
      c: await f.rpc("recruitment_applicant_read", { p_hash: s.hash }),
      v,
    };
  }
  async function staffCommand(
    operation: string,
    c: any,
    data: Record<string, unknown> = {},
    payload?: object,
  ) {
    const old = "7".repeat(64),
      fresh = "8".repeat(64),
      proof = randomUUID().replaceAll("-", "").repeat(2),
      digest = "9".repeat(64);
    let d = {
      requestId: randomUUID(),
      caseId: c.id,
      expectedRevision: c.revision,
      ...data,
    };
    if (payload) {
      const b = await f.rpc("recruitment_case_stage", {
        p_actor: owner,
        p_session: old,
        p_case: c.id,
        p_revision: c.revision,
        p_operation: operation,
        p_payload: payload,
        p_digest: digest,
      });
      d = { ...d, ...b };
    }
    const prepared = await f.rpc("recruitment_case_prepare", {
      p_actor: owner,
      p_old_session: old,
      p_new_session: fresh,
      p_operation: operation,
      d,
      p_secret: proof,
      p_digest: digest,
      p_aal: "aal1",
    });
    return f.rpc("recruitment_case_mutate", {
      p_actor: owner,
      p_session: fresh,
      p_operation: operation,
      d: prepared.data,
      p_proof: proof,
      p_digest: digest,
      p_key_version: 1,
      p_aal: "aal1",
    });
  }
  it("stages private notes, requires fresh exact confirmation and exposes only clarification messages", async () => {
    const s = await submitted("review@example.test");
    await staffCommand(
      "note",
      s.c,
      {},
      { text: "Private reviewer observation", recommendation: "" },
    );
    let c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    expect(c.state).toBe("under_review");
    expect(
      await f.rpc("recruitment_applicant_messages", { p_hash: s.hash }),
    ).toEqual([]);
    await staffCommand(
      "clarify",
      c,
      {},
      { text: "Please clarify availability.", recommendation: "" },
    );
    c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    const messages = await f.rpc("recruitment_applicant_messages", {
      p_hash: s.hash,
    });
    expect(messages).toHaveLength(1);
    await f.rpc("recruitment_applicant_reply", {
      p_hash: s.hash,
      d: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        replyTo: messages[0].id,
        text: "Available afternoons.",
      },
      p_digest: "a".repeat(64),
      p_key_version: 1,
    });
    expect(
      await f.rpc("recruitment_applicant_messages", { p_hash: s.hash }),
    ).toHaveLength(2);
    expect(
      JSON.stringify(
        (await f.db.query<any>("select * from public.recruitment_requests"))
          .rows,
      ),
    ).not.toContain("Private reviewer observation");
  });
  it("places holds, denies deletion under hold and uses an irreversible grace barrier before verified erasure", async () => {
    const s = await submitted("privacy@example.test");
    await staffCommand("hold", s.c, {
      holdId: null,
      release: false,
      evidenceRef: "SYNTHETIC-HOLD",
      reasonCode: "rights_request",
      reviewAt: new Date(Date.now() + 86400000).toISOString(),
    });
    let c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_privacy_command", {
      p_hash: s.hash,
      p_action: "request_deletion",
      d: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: null,
        noticeVersion: "",
        consent: false,
      },
      p_digest: "b".repeat(64),
      p_key_version: 1,
    });
    expect(
      await f.rpc("recruitment_deletion_claim", { p_claim: randomUUID() }),
    ).toBeNull();
    const holds = (
      await f.rpc("recruitment_privacy_read", {
        p_actor: owner,
        p_reference: s.c.caseReference,
      })
    ).holds;
    c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await staffCommand("hold", c, {
      holdId: holds[0].id,
      release: true,
      evidenceRef: "SYNTHETIC-RELEASE",
      reasonCode: "rights_request",
      reviewAt: holds[0].review_at,
    });
    expect(
      await f.rpc("recruitment_deletion_claim", { p_claim: randomUUID() }),
    ).toBeNull();
    c = (
      await f.db.query<any>(
        "select * from public.recruitment_cases where id=$1",
        [c.id],
      )
    ).rows[0];
    expect(c.deletion_barrier_at).toBeTruthy();
    await expect(
      f.db.query(
        "update public.recruitment_cases set deletion_barrier_at=null,revision=revision+1 where id=$1",
        [c.id],
      ),
    ).rejects.toThrow("deletion_barrier_immutable");
    // Advance only the trusted test clock basis; production barrier cannot be rewritten.
    await f.db.exec(
      "alter table public.recruitment_cases disable trigger recruitment_case_guard",
    );
    await f.db.query(
      "update public.recruitment_cases set deletion_barrier_at=clock_timestamp()-interval '7 minutes' where id=$1",
      [c.id],
    );
    await f.db.exec(
      "alter table public.recruitment_cases enable trigger recruitment_case_guard",
    );
    await f.db.query(
      "update public.recruitment_deletion_jobs set available_at=clock_timestamp() where case_id=$1",
      [c.id],
    );
    const claim = randomUUID(),
      job = await f.rpc("recruitment_deletion_claim", { p_claim: claim });
    expect(job.caseId).toBe(c.id);
    const done = await f.rpc("recruitment_deletion_complete", {
      p_job: job.jobId,
      p_claim: claim,
      p_objects_verified: true,
    });
    expect(done.complete).toBe(true);
    for (const table of [
      "recruitment_case_contacts",
      "recruitment_case_payloads",
      "recruitment_case_notes",
      "recruitment_case_requests",
      "recruitment_email_challenges",
      "recruitment_submissions",
    ])
      expect(
        (
          await f.db.query<any>(
            `select count(*)::int n from public.${table} where case_id=$1`,
            [c.id],
          )
        ).rows[0].n,
      ).toBe(0);
    expect(
      (await f.rpc("recruitment_applicant_read", { p_hash: s.hash })).answers,
    ).toBeNull();
  });
  it("requires affirmative talent-pool consent and independent email verification for renewal", async () => {
    const form = await f.change("intake_form_approve", {
      purpose: "talent_pool",
      vacancyId: null,
      versionId: null,
      noticeVersion: "synthetic-v1",
    });
    await f.change("intake_form_bind", {
      formId: form.formId,
      expectedRevision: -1,
      enabled: true,
    });
    const s = await f.email(null, "pool@example.test");
    let c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    const answers = {
      fields: {
        firstName: "Pool",
        lastName: "Applicant",
        location: "Cape Town",
        availability: "Flexible",
        adultConfirmed: true,
        privacyAcknowledged: true,
        categoryInterests: ["support_staff"],
        engagementInterests: ["employee"],
        experience: "Relevant experience",
        skills: "Relevant skills",
      },
      questions: {},
    };
    await f.rpc("recruitment_applicant_mutate", {
      p_hash: s.hash,
      p_action: "save",
      p_data: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: c.formId,
        answersPatch: answers,
      },
      p_digest: "c".repeat(64),
      p_key_version: 1,
    });
    c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    const data = {
      requestId: randomUUID(),
      expectedRevision: c.revision,
      formId: c.formId,
      privacyAcknowledged: true,
      poolConsent: false,
    };
    await expect(
      f.rpc("recruitment_submit", {
        p_hash: s.hash,
        d: data,
        p_digest: "d".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("consent_required");
    data.poolConsent = true;
    await f.rpc("recruitment_submit", {
      p_hash: s.hash,
      d: data,
      p_digest: "d".repeat(64),
      p_key_version: 1,
    });
    c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await f.rpc("recruitment_privacy_command", {
      p_hash: s.hash,
      p_action: "renew",
      d: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: c.formId,
        noticeVersion: c.noticeVersion,
        consent: true,
      },
      p_digest: "e".repeat(64),
      p_key_version: 1,
    });
    expect(
      (
        await f.db.query<any>(
          "select action from public.recruitment_consent_events where case_id=$1 order by recorded_at",
          [c.id],
        )
      ).rows.map((r) => r.action),
    ).toEqual(["affirm", "renew"]);
  });
});

describe("M3 revision, publication, scope and policy boundaries", () => {
  it.each(["administrator", "support_staff"])(
    "uses the approved %s template without tutor fields",
    async (category) => {
      const v = await f.vacancy(category, false),
        r = await f.rpc("recruitment_form_read", {
          p_purpose: "vacancy",
          p_slug: v.slug,
        });
      expect(r.definition.fields.some((x: any) => x.key === "subjects")).toBe(
        false,
      );
      expect(r.definition.category).toBe(category);
    },
  );
  it("serializes competing draft revisions and preserves idempotency across key versions", async () => {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, "concurrent@example.test"),
      c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash }),
      d = {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: c.formId,
        answersPatch: f.answers,
      };
    const first = {
      p_hash: s.hash,
      p_action: "save",
      p_data: d,
      p_digest: "f".repeat(64),
      p_key_version: 1,
    };
    const results = await Promise.allSettled([
      f.rpc("recruitment_applicant_mutate", first),
      f.rpc("recruitment_applicant_mutate", {
        ...first,
        p_data: { ...d, requestId: randomUUID() },
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      f.rpc("recruitment_applicant_mutate", { ...first, p_key_version: 2 }),
    ).rejects.toThrow("request_conflict");
    expect((await f.rpc("recruitment_applicant_mutate", first)).replayed).toBe(
      true,
    );
  });
  it("tombstones uncertain request IDs so late consequential requests cannot execute", async () => {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, "cancel@example.test"),
      c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash }),
      pending = randomUUID();
    await f.rpc("recruitment_applicant_mutate", {
      p_hash: s.hash,
      p_action: "cancel_pending",
      p_data: {
        requestId: randomUUID(),
        pendingRequestId: pending,
        operation: "submit",
      },
      p_digest: "1".repeat(64),
      p_key_version: 1,
    });
    await expect(
      f.rpc("recruitment_submit", {
        p_hash: s.hash,
        d: {
          requestId: pending,
          expectedRevision: c.revision,
          formId: c.formId,
          privacyAcknowledged: true,
          poolConsent: false,
        },
        p_digest: "2".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("request_conflict");
  });
  it("requires explicit rebase for a new approved form and preserves sealed form definitions", async () => {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, "rebase@example.test"),
      c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    const next = await f.change("intake_form_approve", {
      purpose: "vacancy",
      vacancyId: v.id,
      versionId: v.published_version_id,
      noticeVersion: "synthetic-v1",
    });
    await f.change("intake_form_bind", {
      formId: next.formId,
      expectedRevision: -1,
      enabled: true,
    });
    await expect(
      f.rpc("recruitment_applicant_mutate", {
        p_hash: s.hash,
        p_action: "save",
        p_data: {
          requestId: randomUUID(),
          expectedRevision: c.revision,
          formId: c.formId,
          answersPatch: f.answers,
        },
        p_digest: "3".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("requirements_changed");
    await f.rpc("recruitment_applicant_mutate", {
      p_hash: s.hash,
      p_action: "rebase",
      p_data: {
        requestId: randomUUID(),
        expectedRevision: c.revision,
        formId: next.formId,
        noticeVersion: "synthetic-v1",
        privacyAcknowledged: true,
      },
      p_digest: "4".repeat(64),
      p_key_version: 1,
    });
    expect(
      (await f.rpc("recruitment_applicant_read", { p_hash: s.hash })).formId,
    ).toBe(next.formId);
    await expect(
      f.db.query(
        "update public.recruitment_intake_forms set definition=definition where id=$1",
        [next.formId],
      ),
    ).rejects.toThrow();
  });
  it("rechecks authoritative publication state on draft save and never exposes drafts to the staff queue", async () => {
    const v = await f.vacancy("tutor", false),
      s = await f.email(v.slug, "paused@example.test"),
      c = await f.rpc("recruitment_applicant_read", { p_hash: s.hash });
    await expect(
      f.rpc("recruitment_cases_read", { p_actor: owner, p_case: c.id }),
    ).rejects.toThrow("access_denied");
    const current = (
      await f.db.query<any>(
        "select revision from public.recruitment_vacancies where id=$1",
        [v.id],
      )
    ).rows[0];
    await f.change("vacancy_pause", {
      vacancyId: v.id,
      expectedRevision: current.revision,
      reason: "Synthetic pause",
    });
    await expect(
      f.rpc("recruitment_applicant_mutate", {
        p_hash: s.hash,
        p_action: "save",
        p_data: {
          requestId: randomUUID(),
          expectedRevision: c.revision,
          formId: c.formId,
          answersPatch: f.answers,
        },
        p_digest: "5".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("intake_disabled");
    expect(
      (await f.rpc("recruitment_public_intake", { p_ids: [v.id] })).vacancies[
        v.id
      ],
    ).toBe(false);
  });
  it("fails closed when storage configuration is public or scanner attestation is missing", async () => {
    const v = await f.vacancy(),
      s = await f.email(v.slug, "unsafe-storage@example.test");
    await f.db.exec(
      "update storage.buckets set public=true where id='recruitment-quarantine'",
    );
    await expect(
      f.rpc("recruitment_document_mutate", {
        p_hash: s.hash,
        p_action: "readiness",
        d: {},
        p_digest: "0".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("storage_unavailable");
    await f.db.exec(
      "update storage.buckets set public=false where id='recruitment-quarantine';update public.recruitment_settings set scanner_attested_at=null",
    );
    await expect(
      f.rpc("recruitment_document_mutate", {
        p_hash: s.hash,
        p_action: "readiness",
        d: {},
        p_digest: "0".repeat(64),
        p_key_version: 1,
      }),
    ).rejects.toThrow("scanner_unavailable");
    await f.db.exec(
      "update public.recruitment_settings set scanner_attested_at=clock_timestamp()",
    );
  });
});

it("requires case assignment plus current scope and applies declared conflicts to owners", async () => {
  const c = (
    await f.db.query<any>(
      "select c.* from public.recruitment_cases c join public.recruitment_case_contacts x on x.case_id=c.id where x.normalized_email='review@example.test'",
    )
  ).rows[0];
  for (const [id, role] of [
    [manager, "manager"],
    [officer, "officer"],
  ]) {
    await f.change("staff_grant", {
      userId: id,
      role,
      enabled: true,
      expectedRevision: -1,
    });
    await f.change("scope_grant", {
      userId: id,
      scopeId: c.scope_id,
      enabled: true,
      expectedRevision: -1,
    });
  }
  await expect(
    f.rpc("recruitment_cases_read", { p_actor: manager, p_case: c.id }),
  ).rejects.toThrow("access_denied");
  await f.db.query(
    "insert into public.recruitment_case_assignments(case_id,user_id,enabled,granted_by) values($1,$2,true,$3)",
    [c.id, manager, owner],
  );
  expect(
    (await f.rpc("recruitment_cases_read", { p_actor: manager, p_case: c.id }))
      .case.id,
  ).toBe(c.id);
  await f.db.query(
    "update public.recruitment_staff_scopes set enabled=false,revision=revision+1 where user_id=$1 and scope_id=$2",
    [manager, c.scope_id],
  );
  await expect(
    f.rpc("recruitment_cases_read", { p_actor: manager, p_case: c.id }),
  ).rejects.toThrow("access_denied");
  const d = {
      requestId: randomUUID(),
      caseId: c.id,
      expectedRevision: c.revision,
    },
    proof = "a".repeat(64),
    digest = "b".repeat(64);
  await f.rpc("recruitment_case_prepare", {
    p_actor: owner,
    p_old_session: "c".repeat(64),
    p_new_session: "d".repeat(64),
    p_operation: "declare_conflict",
    d,
    p_secret: proof,
    p_digest: digest,
    p_aal: "aal1",
  });
  await f.rpc("recruitment_case_mutate", {
    p_actor: owner,
    p_session: "d".repeat(64),
    p_operation: "declare_conflict",
    d,
    p_proof: proof,
    p_digest: digest,
    p_key_version: 1,
    p_aal: "aal1",
  });
  await expect(
    f.rpc("recruitment_cases_read", { p_actor: owner, p_case: c.id }),
  ).rejects.toThrow("access_denied");
  expect(
    (
      await f.rpc("recruitment_case_recover", {
        p_actor: owner,
        p_request: d.requestId,
      })
    ).state,
  ).toBe("committed");
});

it("enforces restrictive Storage isolation even beside a permissive legacy policy", async () => {
  await f.db.exec(
    "grant usage on schema storage to anon;grant select on storage.objects to anon;create policy synthetic_permissive on storage.objects for select to anon using(true);insert into storage.objects(bucket_id,name) values('recruitment-documents','synthetic'),('legacy-bucket','synthetic');set role anon",
  );
  try {
    const rows = await f.db.query<{ bucket_id: string }>(
      "select bucket_id from storage.objects",
    );
    expect(rows.rows.map((r) => r.bucket_id)).toEqual(["legacy-bucket"]);
  } finally {
    await f.db.exec("reset role");
  }
});
it("matches canonical migration artifacts and keeps operational exports unavailable to browser and service roles", async () => {
  const { readFileSync } = await import("node:fs");
  for (const n of [
    "20261111030000_recruitment_applicants",
    "20261111040000_recruitment_documents_submissions",
    "20261111050000_recruitment_case_operations",
    "20261111060000_recruitment_runtime_guards",
  ]) {
    const m = readFileSync("supabase/migrations/" + n + ".sql", "utf8");
    expect(readFileSync("supabase/schema.sql", "utf8")).toContain(m);
    expect(
      readFileSync("docs/recruitment/milestone-3/migration.sql", "utf8"),
    ).toContain(m);
  }
  for (const role of ["anon", "authenticated", "service_role"])
    for (const signature of [
      "recruitment_erasure_export(text,text)",
      "recruitment_erasure_restore(jsonb,text,text)",
    ])
      expect(
        (
          await f.db.query<any>(
            "select has_function_privilege($1,$2,'execute') allowed",
            [role, "public." + signature],
          )
        ).rows[0].allowed,
      ).toBe(false);
});

it("bounds message pages without exposing internal reviewer notes to the applicant", async () => {
  const c = (
    await f.db.query<any>(
      "select c.* from public.recruitment_cases c join public.recruitment_case_contacts x on x.case_id=c.id where x.normalized_email='applicant@example.test'",
    )
  ).rows[0];
  const hash = (
    await f.db.query<any>(
      "select token_hash from public.recruitment_applicant_sessions where case_id=$1 and revoked_at is null",
      [c.id],
    )
  ).rows[0].token_hash;
  for (let i = 0; i < 52; i++)
    await f.db.query(
      "insert into public.recruitment_case_notes(case_id,actor_id,kind,content) values($1,$2,'note','Synthetic internal note')",
      [c.id, owner],
    );
  const staff = await f.rpc("recruitment_messages_page", {
    p_hash: "",
    p_actor: owner,
    p_case: c.id,
  });
  expect(staff.items).toHaveLength(50);
  expect(staff.hasMore).toBe(true);
  const last = staff.items.at(-1);
  expect(
    (
      await f.rpc("recruitment_messages_page", {
        p_hash: "",
        p_actor: owner,
        p_case: c.id,
        p_before: last.created_at,
        p_before_id: last.id,
      })
    ).items,
  ).toHaveLength(2);
  expect(
    (
      await f.rpc("recruitment_messages_page", {
        p_hash: hash,
        p_actor: null,
        p_case: null,
      })
    ).items,
  ).toEqual([]);
});
