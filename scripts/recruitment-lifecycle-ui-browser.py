"""Functional M4/M5 UI journeys using mutable synthetic browser-intercepted fixtures.
No hosted API, database, Auth, mail, scanning or environment configuration is used.
This complements real PostgreSQL/API integration tests; it does not replace them.
Run with Python Playwright and /usr/bin/chromium: python3 scripts/recruitment-lifecycle-ui-browser.py
"""
import copy
import json
import pathlib
import subprocess
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/recruitment/milestone-4-5/visual/functional"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:4180"
OWNER = "11111111-1111-4111-8111-111111111111"
CASE = "22222222-2222-4222-8222-222222222222"
VACANCY = "33333333-3333-4333-8333-333333333333"
TEMPLATE = "44444444-4444-4444-8444-444444444444"
INTERVIEW = "55555555-5555-4555-8555-555555555555"
OFFER = "66666666-6666-4666-8666-666666666666"
EVALUATION = "77777777-7777-4777-8777-777777777777"
RECOMMENDATION = "88888888-8888-4888-8888-888888888888"
TASK = "99999999-9999-4999-8999-999999999999"
DOCUMENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
POLICY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
STAMP = "2026-11-15T12:00:00Z"


class Fixture:
    def __init__(self):
        self.calls = []
        self.errors = []
        self.snap = {"user": {"id": OWNER, "email": "owner@example.test", "role": "owner", "revision": 1,
                              "aal": "aal2", "mfaFactors": [{"id": TEMPLATE, "friendlyName": "Synthetic authenticator"}]},
                     "settings": {"revision": 1, "staff_console_enabled": True, "access_guards_enabled": True,
                                  "public_vacancies_enabled": False, "privacy_policy_version": "", "draft_days": 14,
                                  "unsuccessful_months": 6, "talent_pool_months": 12},
                     "features": {"applications": False, "activation": False}, "staff": [], "scopes": [], "grants": [], "events": []}
        self.selection = {"enabled": True, "selection": {"case_id": CASE, "revision": 0, "stage": "screening", "decision": None},
                          "screening": [], "interviews": [], "evaluations": [], "recommendations": [], "decisions": [], "history": [],
                          "assessments": [], "eligibleInterviewers": [{"id": OWNER, "email": "owner@example.test", "role": "owner"}]}
        self.engagement = {"caseId": CASE, "revision": 0, "category": "tutor", "offers": [], "tasks": [],
                           "acceptedTemplateIds": [], "activation": None, "events": [],
                           "templates": [{"id": TEMPLATE, "agreement_type": "employment", "engagement_type": "employee",
                                          "title": "SYNTHETIC TEST AGREEMENT", "body": "Synthetic fixture wording for UI testing only. This is not approved legal wording.",
                                          "legal_approval_reference": "SYNTHETIC-LEGAL-001"},
                                         {"id": POLICY, "agreement_type": "code_of_conduct", "engagement_type": "employee",
                                          "title": "SYNTHETIC CONDUCT POLICY", "body": "Synthetic conduct policy text for browser testing, with no legal approval claim.",
                                          "legal_approval_reference": "SYNTHETIC-POLICY-001"}]}

    def candidate(self):
        return {"id": CASE, "reference": "SYNTHETIC-CASE-001", "vacancy_id": VACANCY, "submitted_at": STAMP,
                "stage": self.selection["selection"]["stage"], "revision": self.selection["selection"]["revision"],
                "document_ready": True, "name": "Synthetic Candidate"}

    def request(self, staff, operation, query, body):
        if staff and operation == "snapshot":
            return self.snap
        if staff and operation == "vacancies":
            return {"vacancies": [], "versions": [], "events": [], "assignments": [], "publicVacanciesEnabled": False,
                    "settingsRevision": 1, "total": 0, "nextOffset": None, "historyBefore": None, "versionsHasMore": False}
        if staff and operation == "applications":
            return {"enabled": True, "case": {"id": CASE, "reference": "SYNTHETIC-CASE-001", "kind": "vacancy", "state": "under_review", "revision": 0, "submitted_at": STAMP},
                    "email": "candidate@example.test", "answers": {"fields": {"firstName": "Synthetic", "lastName": "Candidate", "subjects": ["Life Sciences"], "grades": ["12"]}, "questions": {}},
                    "documents": [{"id": DOCUMENT, "key": "qualification", "name": "synthetic-qualification.pdf", "size": 100, "state": "clean"}],
                    "eligibleStaff": [], "assignments": [{"user_id": OWNER, "enabled": True}], "notes": [], "holds": [], "audit": []}
        if not staff and operation == "applicant":
            return {"id": CASE, "slug": "synthetic-vacancy", "caseReference": "SYNTHETIC-CASE-001", "state": "under_review", "purpose": "vacancy", "revision": 0,
                    "expiresAt": "2030-12-31T00:00:00Z", "formId": TEMPLATE, "definition": None, "noticeVersion": "synthetic-v1", "notice": None,
                    "answers": {"fields": {}, "questions": {}}, "request": None, "documents": [], "receipt": {"receipt": "SYNTHETIC-RECEIPT", "submittedAt": STAMP}, "messages": []}
        if operation == "selection":
            if body and body.get("operation"):
                return self.selection_change(body["operation"], body["data"], body)
            if body and not staff:
                interview = next(i for i in self.selection["interviews"] if i["id"] == body["interviewId"])
                interview["candidate_response"] = body["response"]
                self.calls.append({"actor": "candidate", "operation": "interview_response", "data": body})
                return {"recorded": True}
            if staff and "caseId" in query:
                return self.selection
            if staff:
                return {"enabled": True, "items": [self.candidate()], "hasMore": False}
            return {"enabled": True, "stage": self.selection["selection"]["stage"], "interviews": [
                {"id": i["id"], "round": i["round"], "type": i["type"], "startsAt": i["starts_at"], "endsAt": i["ends_at"], "location": i["location"], "status": i["status"], "response": i["candidate_response"]}
                for i in self.selection["interviews"]]}
        if operation == "engagement":
            if staff and query.get("view") == ["personnel"]:
                activation = self.engagement["activation"]
                if "caseId" not in query:
                    return [] if activation is None else [{**activation, "category": "tutor", "revision": self.engagement["revision"]}]
                return {**self.engagement, "offers": [], "tasks": [], "templates": [], "events": [], "acceptedTemplateIds": []}
            if body:
                return self.engagement_change(body["operation"], body["data"], staff, body)
            return self.engagement
        raise AssertionError("Unexpected local synthetic operation: " + operation)

    def selection_change(self, operation, data, envelope):
        assert envelope["password"] == "synthetic-password" and envelope["code"] == "000000"
        assert data["caseId"] == CASE and data["expectedRevision"] == self.selection["selection"]["revision"]
        self.calls.append({"actor": "staff", "operation": operation, "data": copy.deepcopy(data)})
        previous = self.selection["selection"]["stage"]
        if operation == "screen":
            assert len(data["checks"]) == 5 and all(c["complete"] for c in data["checks"])
            self.selection["screening"].insert(0, {"id": TEMPLATE, "checks": data["checks"], "notes": data["notes"], "created_at": STAMP})
        elif operation == "shortlist":
            self.selection["selection"]["stage"] = data["outcome"]
        elif operation == "interview_schedule":
            ends = datetime.fromisoformat(data["startsAt"].replace("Z", "+00:00")) + timedelta(minutes=data["durationMinutes"])
            self.selection["interviews"] = [{"id": INTERVIEW, "case_id": CASE, "round": data["round"], "type": data["type"], "starts_at": data["startsAt"], "ends_at": ends.isoformat(),
                                               "location": data["location"], "interviewer_ids": data["interviewerIds"], "status": "scheduled", "candidate_response": None}]
            self.selection["selection"]["stage"] = "interview"
        elif operation == "interview_update":
            self.selection["interviews"][0]["status"] = data["status"]
        elif operation == "evaluate":
            assert len(data["criteria"]) >= 1 and all(c["feedback"] for c in data["criteria"])
            self.selection["evaluations"].append({"id": EVALUATION, "interview_id": data["interviewId"], "evaluator_id": OWNER,
                                                  "template_name": data["templateName"], "criteria": data["criteria"], "comments": data["comments"], "total_score": 80, "replaces_id": None, "created_at": STAMP})
            self.selection["selection"]["stage"] = "evaluation"
        elif operation == "recommend":
            self.selection["recommendations"].append({"id": RECOMMENDATION, "outcome": data["outcome"], "reason": data["reason"], "evaluation_ids": data["evaluationIds"], "created_at": STAMP})
            self.selection["selection"]["stage"] = "recommended"
        elif operation == "decide":
            assert data["recommendationId"] == RECOMMENDATION
            self.selection["decisions"].append({"id": TEMPLATE, "outcome": data["outcome"], "reason": data["reason"], "created_at": STAMP})
            self.selection["selection"].update({"stage": data["outcome"], "decision": data["outcome"]})
        else:
            raise AssertionError("Unexpected selection mutation " + operation)
        self.selection["selection"]["revision"] += 1
        self.selection["history"].append({"id": data["requestId"], "action": operation, "actor_id": OWNER, "previous_stage": previous, "new_stage": self.selection["selection"]["stage"], "created_at": STAMP})
        return {"recorded": True}

    def engagement_change(self, operation, data, staff, envelope):
        assert data["expectedRevision"] == self.engagement["revision"]
        if staff:
            assert envelope["password"] == "synthetic-password" and envelope["code"] == "000000"
            assert data["caseId"] == CASE
        self.calls.append({"actor": "staff" if staff else "candidate", "operation": operation, "data": copy.deepcopy(data)})
        if operation == "offer_create":
            assert self.selection["selection"]["stage"] == "approved_for_offer"
            self.engagement["offers"] = [{"id": OFFER, "version": 1, "terms": data["terms"], "status": "draft", "approved_by": None, "issued_at": None, "accepted_at": None}]
        elif operation in ["offer_approve", "offer_issue", "offer_accept", "offer_decline"]:
            offer = self.engagement["offers"][0]
            offer["status"] = {"offer_approve": "approved", "offer_issue": "issued", "offer_accept": "accepted", "offer_decline": "declined"}[operation]
            if operation == "offer_approve": offer["approved_by"] = OWNER
            if operation == "offer_issue": offer["issued_at"] = STAMP
            if operation == "offer_accept": offer["accepted_at"] = STAMP
            assert self.engagement["activation"] is None
        elif operation == "agreement_accept":
            self.engagement["acceptedTemplateIds"].append(data["templateId"])
        elif operation == "onboarding_start":
            self.engagement["tasks"] = [{"id": TASK, "key": "code_of_conduct", "label": "Synthetic conduct acknowledgement", "kind": "declaration", "required": True, "status": "pending"}]
        elif operation == "policy_require":
            assert data["templateId"] == POLICY
            self.engagement["tasks"].append({"id": POLICY, "key": "policy:" + POLICY, "label": "SYNTHETIC CONDUCT POLICY", "kind": "agreement", "required": True, "status": "pending", "template_id": POLICY})
        elif operation == "task_complete":
            next(t for t in self.engagement["tasks"] if t["id"] == data["taskId"])["status"] = "submitted"
        elif operation == "task_verify":
            assert data["evidenceReference"] == "SYNTHETIC-CHECK-001"
            next(t for t in self.engagement["tasks"] if t["id"] == data["taskId"])["status"] = "verified"
        elif operation == "activation_approve":
            assert self.engagement["offers"][0]["status"] == "accepted" and TEMPLATE in self.engagement["acceptedTemplateIds"] and POLICY in self.engagement["acceptedTemplateIds"]
            assert all(t["status"] == "verified" for t in self.engagement["tasks"])
            self.engagement["activation"] = {"case_id": CASE, "status": "active", "user_id": data["userId"], "tutor_id": TEMPLATE,
                                              "subjects": data["subjects"], "grades": data["grades"], "permissions": data["permissions"], "activated_at": STAMP, "ended_at": None}
        elif operation == "offboard":
            self.engagement["activation"]["status"] = "ended"
            self.engagement["activation"]["ended_at"] = STAMP
        else:
            raise AssertionError("Unexpected engagement mutation " + operation)
        self.engagement["revision"] += 1
        self.engagement["events"].append({"action": operation, "created_at": STAMP, "actor_id": OWNER if staff else None})
        return {"recorded": True}

    def intercept(self, route):
        parsed = urlparse(route.request.url)
        if parsed.hostname != "127.0.0.1" or parsed.port != 4180:
            route.abort()
            return
        if not parsed.path.startswith("/api/"):
            route.continue_()
            return
        try:
            query = parse_qs(parsed.query)
            operation = query.get("route", [""])[0]
            body = route.request.post_data_json if route.request.post_data else None
            data = self.request(parsed.path == "/api/admin/recruitment", operation, query, body)
            route.fulfill(status=200, content_type="application/json", body=json.dumps(data), headers={"Cache-Control": "no-store"})
        except Exception as error:
            self.errors.append(str(error) or repr(error))
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": "Synthetic fixture rejected operation"}))


def confirm(page):
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    dialog.get_by_label("Staff password", exact=True).fill("synthetic-password")
    dialog.get_by_label("Authenticator code", exact=True).fill("000000")
    dialog.get_by_role("button", name="Confirm action", exact=True).click()
    expect(dialog).not_to_be_visible()


def tab(page, name):
    page.get_by_role("tab", name=name, exact=True).click()


def acknowledge_all(page):
    expect(page.get_by_role("checkbox").first).to_be_visible()
    for checkbox in page.get_by_role("checkbox").all():
        if checkbox.is_visible() and checkbox.is_enabled():
            checkbox.check()


log = pathlib.Path("/tmp/viva-lifecycle-ui-review.log").open("w")
server = subprocess.Popen(["node", "--input-type=module", "-e", "import {createServer} from 'vite'; const s=await createServer({server:{host:'127.0.0.1',port:4180,strictPort:true,hmr:false,watch:{ignored:['**/*']}}}); await s.listen();"], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
fixture = Fixture()
class Steps(list):
    def append(self, value):
        super().append(value)
        print(value, flush=True)
steps = Steps()
exceptions = []
completed = False
page = None
try:
    for attempt in range(100):
        try:
            urllib.request.urlopen(BASE, timeout=1).close()
            break
        except Exception:
            if server.poll() is not None: raise RuntimeError("Vite exited: inspect /tmp/viva-lifecycle-ui-review.log")
            time.sleep(0.1)
    else:
        raise RuntimeError("Loopback Vite did not start")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, timezone_id="Africa/Johannesburg", reduced_motion="reduce")
        context.set_default_timeout(8000)
        context.route("**/*", fixture.intercept)
        page = context.new_page()
        page.on("pageerror", lambda e: exceptions.append(str(e)))
        page.goto(BASE + "/admin/recruitment/selection", wait_until="domcontentloaded")
        page.get_by_role("button", name="Open candidate", exact=True).click()
        profile = page.get_by_role("tab", name="Profile", exact=True)
        profile.focus()
        profile.press("ArrowRight")
        expect(page.get_by_role("tab", name="Screening", exact=True)).to_be_focused()
        screen_form = page.locator("form").filter(has=page.get_by_role("button", name="Review screening record", exact=True))
        screen_form.get_by_role("button", name="Review screening record", exact=True).click()
        assert page.get_by_role("dialog").count() == 0
        assert len(fixture.calls) == 0
        for checkbox in screen_form.get_by_role("checkbox").all(): checkbox.check()
        screen_form.get_by_label("Review notes and evidence", exact=True).fill("Synthetic completeness evidence checked manually.")
        screen_form.get_by_role("button", name="Review screening record", exact=True).click()
        confirm(page)
        assert fixture.selection["screening"]
        steps.append("screening validation and human completeness record")
        tab(page, "Screening")
        shortlist = page.locator("form").filter(has=page.get_by_role("button", name="Review shortlist decision", exact=True))
        shortlist.get_by_label("Reason or supporting evidence", exact=True).fill("Synthetic human suitability review supports shortlist.")
        shortlist.get_by_role("button", name="Review shortlist decision", exact=True).click()
        confirm(page)
        tab(page, "Interviews")
        page.get_by_label("Start date and time", exact=True).fill("2030-11-20T14:00")
        page.get_by_label("Location or private meeting link", exact=True).fill("Synthetic private meeting room")
        page.get_by_label("owner@example.test", exact=True).check()
        page.get_by_label("Reason or supporting evidence", exact=True).fill("Synthetic interview invitation approved by reviewer.")
        page.get_by_role("button", name="Review interview schedule", exact=True).click()
        confirm(page)
        steps.append("shortlist and interview scheduling")
        candidate = context.new_page()
        candidate.set_viewport_size({"width": 375, "height": 812})
        candidate.on("pageerror", lambda e: exceptions.append(str(e)))
        candidate.goto(BASE + "/recruitment/application", wait_until="domcontentloaded")
        candidate.get_by_role("button", name="Confirm attendance", exact=True).click()
        expect(candidate.get_by_text("Your response has been recorded.", exact=True)).to_be_visible()
        assert fixture.selection["interviews"][0]["candidate_response"] == "confirmed"
        assert "Invalid Date" not in candidate.locator("main").inner_text()
        assert not candidate.evaluate("document.documentElement.scrollWidth > innerWidth")
        candidate.screenshot(path=OUT / "candidate-interview-response.png", full_page=True)
        steps.append("accountless candidate interview response and authoritative camelCase dates")
        tab(page, "Interviews")
        page.get_by_label("Reason or supporting evidence", exact=True).fill("Synthetic interview completed with recorded attendance.")
        page.get_by_role("button", name="Completed", exact=True).click()
        confirm(page)
        tab(page, "Evaluations")
        page.get_by_label("Completed interview", exact=False).select_option(INTERVIEW)
        for field in page.get_by_label("Score", exact=True).all(): field.fill("4")
        for field in page.get_by_label("Evidence and feedback", exact=False).all(): field.fill("Synthetic human evaluation evidence.")
        page.get_by_label("Evaluator comments", exact=True).fill("Synthetic independent reviewer assessment completed.")
        page.get_by_role("button", name="Review evaluation submission", exact=True).click()
        confirm(page)
        assert fixture.selection["selection"]["stage"] == "evaluation"
        steps.append("independent evaluation with no automatic hiring decision")
        tab(page, "Decisions")
        recommendation = page.locator("form").filter(has=page.get_by_role("button", name="Review recommendation", exact=True))
        recommendation.get_by_role("checkbox").check()
        recommendation.get_by_label("Reason or supporting evidence", exact=True).fill("Synthetic human recommendation based on recorded evidence.")
        recommendation.get_by_role("button", name="Review recommendation", exact=True).click()
        confirm(page)
        tab(page, "Decisions")
        decision = page.locator("form").filter(has=page.get_by_role("button", name="Review owner decision", exact=True))
        decision.get_by_label("Supporting recommendation", exact=False).select_option(RECOMMENDATION)
        decision.get_by_label("Reason or supporting evidence", exact=True).fill("Synthetic explicit owner final hiring approval.")
        decision.get_by_role("button", name="Review owner decision", exact=True).click()
        confirm(page)
        assert fixture.selection["selection"]["stage"] == "approved_for_offer"
        page.screenshot(path=OUT / "owner-selection-complete.png", full_page=True)
        steps.append("human recommendation and owner confirmation UI with synthetic credentials")
        page.get_by_role("link", name="Offers and onboarding", exact=True).click()
        expect(page.get_by_role("heading", name="Candidate engagement", exact=True)).to_be_visible()
        expect(page.get_by_label("Candidate", exact=False)).to_have_value(CASE)
        page.get_by_role("button", name="Review new offer", exact=True).click()
        assert page.get_by_role("dialog").count() == 0
        page.get_by_label("Position title", exact=True).fill("Synthetic Life Sciences Tutor")
        page.get_by_label("Start date", exact=True).fill("2030-12-01")
        page.get_by_label("Offer expires", exact=True).fill("2030-11-30T17:00")
        page.get_by_label("Working arrangement", exact=True).fill("Synthetic Cape Town classroom")
        page.get_by_label("Reporting arrangements", exact=True).fill("Synthetic teaching lead")
        page.get_by_label("Compensation terms", exact=True).fill("Synthetic test terms only")
        page.get_by_label("Tutor session rate (cents, 0 when not applicable)", exact=True).fill("20000")
        page.get_by_label("Approved agreement", exact=False).select_option(TEMPLATE)
        page.get_by_role("button", name="Review new offer", exact=True).click()
        confirm(page)
        page.get_by_role("button", name="Approve offer", exact=True).click()
        confirm(page)
        page.get_by_role("button", name="Issue approved offer", exact=True).click()
        confirm(page)
        assert fixture.engagement["offers"][0]["status"] == "issued"
        page.screenshot(path=OUT / "owner-offer-issued.png", full_page=True)
        steps.append("candidate context preserved through offer creation approval and issue")
        candidate.reload(wait_until="domcontentloaded")
        expect(candidate.get_by_role("button", name="Accept offer", exact=True)).to_be_disabled()
        acknowledge_all(candidate)
        candidate.get_by_role("button", name="Accept offer", exact=True).click()
        expect(candidate.get_by_text("Your response has been recorded.", exact=True)).to_be_visible()
        assert fixture.engagement["offers"][0]["status"] == "accepted" and fixture.engagement["activation"] is None
        acknowledge_all(candidate)
        candidate.get_by_role("button", name="Accept SYNTHETIC TEST AGREEMENT", exact=True).click()
        expect(candidate.get_by_text("Agreement acceptance recorded.", exact=True)).to_be_visible()
        assert TEMPLATE in fixture.engagement["acceptedTemplateIds"]
        steps.append("candidate offer and agreement acceptance without staff activation")
        page.get_by_role("button", name="Open engagement", exact=True).click()
        page.get_by_role("button", name="onboarding", exact=True).click()
        page.get_by_role("button", name="Start role-specific onboarding", exact=True).click()
        confirm(page)
        page.get_by_label("Approved policy", exact=False).select_option(POLICY)
        page.get_by_role("button", name="Review policy requirement", exact=True).click()
        confirm(page)
        candidate.reload(wait_until="domcontentloaded")
        expect(candidate.get_by_role("button", name="Accept SYNTHETIC CONDUCT POLICY", exact=True)).to_be_visible()
        acknowledge_all(candidate)
        candidate.get_by_role("button", name="Accept SYNTHETIC CONDUCT POLICY", exact=True).click()
        expect(candidate.get_by_text("Your response has been recorded.", exact=True)).to_be_visible()
        acknowledge_all(candidate)
        candidate.get_by_role("button", name="Confirm Synthetic conduct acknowledgement", exact=True).click()
        expect(candidate.get_by_text("Your response has been recorded.", exact=True)).to_be_visible()
        assert fixture.engagement["tasks"][0]["status"] == "submitted"
        assert not candidate.evaluate("document.documentElement.scrollWidth > innerWidth")
        candidate.screenshot(path=OUT / "candidate-onboarding.png", full_page=True)
        page.get_by_role("button", name="Open engagement", exact=True).click()
        page.get_by_label("Verification or approval evidence reference", exact=True).fill("SYNTHETIC-CHECK-001")
        page.get_by_role("button", name="Verify Synthetic conduct acknowledgement", exact=True).click()
        confirm(page)
        assert fixture.engagement["tasks"][0]["status"] == "verified"
        page.get_by_role("button", name="Verify SYNTHETIC CONDUCT POLICY", exact=True).click()
        confirm(page)
        steps.append("onboarding acknowledgement and distinct staff verification")
        page.get_by_role("button", name="activation", exact=True).click()
        page.get_by_label("Staff display name", exact=True).fill("Synthetic Candidate")
        page.get_by_label("Verified platform identity ID", exact=True).fill("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
        page.get_by_label("Approved subjects (comma separated)", exact=True).fill("Life Sciences")
        page.get_by_label("Approved grades (comma separated)", exact=True).fill("12")
        page.get_by_label("Lawful employment-record retention review date", exact=True).fill("2031-11-30T17:00")
        page.get_by_role("button", name="Review owner activation", exact=True).click()
        confirm(page)
        assert fixture.engagement["activation"]["status"] == "active"
        steps.append("explicit owner activation after independent prerequisites")
        page.set_viewport_size({"width": 375, "height": 812})
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        page.get_by_label("Recruitment section", exact=False).focus()
        expect(page.get_by_label("Recruitment section", exact=False)).to_be_focused()
        page.get_by_role("button", name="Staff management", exact=True).click()
        page.get_by_role("button", name="Manage staff access", exact=True).click()
        expect(page.get_by_role("heading", name="Candidate engagement", exact=True)).not_to_be_visible()
        assert page.get_by_text("SYNTHETIC TEST AGREEMENT", exact=True).count() == 0
        page.get_by_role("button", name="offboarding", exact=True).click()
        page.get_by_label("Verification or approval evidence reference", exact=True).fill("SYNTHETIC-CHECK-001")
        page.get_by_label("Reason for controlled changes", exact=True).fill("Synthetic engagement concluded with history preserved.")
        page.get_by_label("Engagement end date", exact=True).fill(datetime.now(timezone.utc).date().isoformat())
        page.get_by_role("button", name="Review owner offboarding", exact=True).click()
        confirm(page)
        assert fixture.engagement["activation"]["status"] == "ended"
        expect(page.get_by_role("region", name="Staff engagement table; scroll horizontally for all columns", exact=True).get_by_role("cell", name="ended", exact=True)).to_be_visible()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        page.screenshot(path=OUT / "owner-offboarding-mobile.png", full_page=True)
        steps.append("mobile focus no overflow and owner offboarding through private personnel view")
        assert not fixture.errors, fixture.errors
        assert not exceptions, exceptions
        assert not page.evaluate("JSON.stringify(sessionStorage).includes('synthetic-password')")
        assert len(fixture.calls) >= 16
        browser.close()
    completed = True
except Exception:
    if page:
        try:
            page.screenshot(path=OUT / "failure.png", full_page=True)
            (OUT / "failure-page.txt").write_text(page.locator("body").inner_text())
        except Exception:
            pass
    raise
finally:
    server.terminate()
    server.wait(timeout=10)
    log.close()
    evidence = {"kind": "functional-ui-only-mutable-synthetic-fixture", "passed": completed, "observedAtUTC": datetime.now(timezone.utc).isoformat(), "hostedServicesVerified": False,
                "environmentSettingsChanged": False, "outboundBrowserRequestsBlocked": True, "steps": steps,
                "operations": [{"actor": c["actor"], "operation": c["operation"]} for c in fixture.calls],
                "fixtureErrors": fixture.errors, "browserExceptions": exceptions,
                "limits": "Browser UI and client payload integration only; no real backend, SQL, RLS, email, scanner, legal approval, hosted identity or production access provisioning is exercised."}
    (OUT / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(f"Passed {len(steps)} functional UI journey steps and {len(fixture.calls)} synthetic operations.")
