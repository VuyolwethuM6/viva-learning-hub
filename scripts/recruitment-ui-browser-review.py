"""Local UI-only fixture review; no hosted service or environment settings are used.
Run: python3 scripts/recruitment-ui-browser-review.py
Requires installed Python Playwright and /usr/bin/chromium. Starts loopback Vite.
These screenshots verify layout, navigation and browser rendering, not API/RLS behavior.
"""
import json
import pathlib
import subprocess
import time
import urllib.request
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/recruitment/milestone-4-5/visual"
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:4179"
ACTOR = "11111111-1111-4111-8111-111111111111"
SNAPSHOT = {
    "user": {"id": ACTOR, "email": "owner@example.test", "role": "owner", "revision": 1},
    "settings": {"revision": 1, "staff_console_enabled": True, "access_guards_enabled": True,
                 "public_vacancies_enabled": False, "privacy_policy_version": "", "draft_days": 14,
                 "unsuccessful_months": 6, "talent_pool_months": 12},
    "features": {"applications": False, "uploads": False, "activation": False},
    "staff": [], "scopes": [], "grants": [], "events": []}
ADMIN = {name: [] for name in ["applications", "invoices", "payments", "audit", "messages", "closures", "programmes"]}
ADMIN.update({"today": "2026-11-15", "truncated": False})
VACANCIES = {"vacancies": [], "versions": [], "events": [], "assignments": [], "publicVacanciesEnabled": False,
             "settingsRevision": 1, "total": 0, "nextOffset": None, "historyBefore": None, "versionsHasMore": False}
SETTINGS = {"ready": False, "noticeVersion": None, "evidenceDays": None, "operationsApproved": False,
            "vacancyIntake": False, "talentPool": False, "uploads": False, "caseProcessing": False, "email": False}


def intercept(route):
    parsed = urlparse(route.request.url)
    if parsed.hostname != "127.0.0.1" or parsed.port != 4179:
        route.abort()
        return
    if not parsed.path.startswith("/api/"):
        route.continue_()
        return
    query = parse_qs(parsed.query)
    operation = query.get("route", [""])[0]
    data = {"error": "No synthetic fixture for this operation"}
    status = 200
    if parsed.path == "/api/admin/session":
        data = {"user": {"id": ACTOR, "email": "owner@example.test"}}
    elif parsed.path == "/api/admin/records":
        data = ADMIN
    elif operation == "snapshot":
        data = SNAPSHOT
    elif operation == "vacancies":
        data = VACANCIES
    elif operation == "applications":
        data = {"enabled": False, "cases": [], "hasMore": False}
    elif operation == "forms":
        data = {"forms": [], "notices": [], "settings": SETTINGS}
    elif operation == "selection":
        data = ({"byStage": [], "byVacancy": [], "interviews": [], "processing": {"averageDays": None, "count": 0}, "offersIssued": 0, "offersAccepted": 0, "offersDeclined": 0, "onboarding": 0, "activations": 0} if query.get("report") == ["summary"] else {"enabled": False, "items": [], "hasMore": False})
    elif operation == "selection-reports":
        data = {"enabled": False, "counts": {}, "stages": [], "vacancies": [], "totals": {}}
    elif operation == "engagement":
        data = {"enabled": False, "items": []}
    else:
        status = 503
    route.fulfill(status=status, content_type="application/json", body=json.dumps(data), headers={"Cache-Control": "no-store"})


server_log = pathlib.Path("/tmp/viva-recruitment-ui-review.log").open("w")
server = subprocess.Popen(["node", "--input-type=module", "-e", "import {createServer} from 'vite'; const server=await createServer({server:{host:'127.0.0.1',port:4179,strictPort:true,hmr:false,watch:{ignored:['**/*']}}}); await server.listen();"], cwd=ROOT, stdout=server_log, stderr=subprocess.STDOUT)
results = []
errors = []
completed = False
try:
    for attempt in range(100):
        try:
            urllib.request.urlopen(BASE, timeout=1).close()
            break
        except Exception:
            if server.poll() is not None:
                raise RuntimeError("Vite exited before review; inspect /tmp/viva-recruitment-ui-review.log")
            time.sleep(0.1)
    else:
        raise RuntimeError("Loopback Vite did not start")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
        for width, height in [(1440, 1000), (768, 1024), (375, 812), (320, 740)]:
            context = browser.new_context(viewport={"width": width, "height": height}, reduced_motion="reduce")
            context.route("**/*", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            baseline = None
            for section, path in [("admin", "/admin"), ("overview", "/admin/recruitment/overview"), ("vacancies", "/admin/recruitment/vacancies"), ("cases", "/admin/recruitment/cases"), ("security", "/admin/recruitment/security"), ("forms", "/admin/recruitment/forms"), ("selection", "/admin/recruitment/selection"), ("engagement", "/admin/recruitment/engagement"), ("reports", "/admin/recruitment/reports")]:
                page.goto(BASE + path, wait_until="domcontentloaded")
                page.locator(".admin-shell .admin-topbar").wait_for()
                page.wait_for_timeout(250)
                assert page.locator(".admin-shell .admin-topbar").count() == 1
                assert page.locator(".admin-shell .admin-sidebar").count() == 1
                assert page.locator('img[src="/viva-tutorials-logo.png"]').count() >= 1
                assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), f"Horizontal overflow: {section}/{width}"
                metrics = page.locator(".admin-topbar").evaluate("element => { const s=getComputedStyle(element); return {height:s.height,background:s.backgroundColor,font:s.fontFamily,padding:s.paddingLeft}; }")
                if baseline is None:
                    baseline = metrics
                else:
                    assert metrics == baseline, f"Admin topbar mismatch: {section}/{width}: {metrics} != {baseline}"
                if section != "admin":
                    assert page.locator(".recruitment-mobile-navigation").is_visible() == (width < 960)
                    assert not page.evaluate("Boolean(window.gtag)"), "Analytics must not load in recruitment"
                filename = f"{section}-{width}.png"
                page.screenshot(path=OUTPUT / filename, full_page=True)
                results.append({"section": section, "viewport": {"width": width, "height": height}, "path": path, "screenshot": filename, "horizontalOverflow": False, "topbarMatchesAdmin": True})
            if width < 960:
                page.get_by_label("Recruitment section", exact=True).select_option("overview")
                page.get_by_role("heading", name="Recruitment overview", exact=True).wait_for()
                page.get_by_label("Recruitment section", exact=True).focus()
                assert page.get_by_label("Recruitment section", exact=True).evaluate("element => document.activeElement === element")
            context.close()
        browser.close()
    assert not errors, f"Browser exceptions: {errors}"
    completed = True
finally:
    server.terminate()
    server.wait(timeout=10)
    server_log.close()
    evidence = {"kind": "local-ui-only-synthetic-fixture", "passed": completed, "hostedServicesVerified": False,
                "outboundRequestsBlocked": True, "environmentSettingsChanged": False,
                "checks": results, "browserExceptions": errors,
                "scope": "Admin/recruitment shell, sidebar/topbar parity, official logo, responsive navigation, no horizontal overflow, fixture rendering. Does not verify backend state transitions, RLS, email, scanner or production readiness."}
    (OUTPUT / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(f"Passed {len(results)} local UI route/viewport checks; no browser exceptions.")
