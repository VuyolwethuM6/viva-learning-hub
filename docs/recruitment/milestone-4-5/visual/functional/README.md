# Functional browser evidence

Run from the repository root:

```sh
python3 scripts/recruitment-lifecycle-ui-browser.py
```

Prerequisites are the repository's installed npm dependencies, Python Playwright and `/usr/bin/chromium`. The script starts a loopback Vite server on port 4180, opens Chromium at desktop size and then 375px, intercepts API requests with mutable synthetic fixtures and blocks non-loopback browser requests. It does not add or modify environment settings.

The successful journey exercises actual UI forms and client payloads for screening validation, human shortlisting, interview scheduling and candidate attendance response, evaluations, recommendations, owner decision confirmation, offer creation/approval/issue, candidate offer and agreement acceptance, approved policy assignment and acceptance, onboarding acknowledgements and separate staff verification, activation confirmation and offboarding through the minimal personnel view. It checks keyboard focus, no document-wide horizontal overflow, no browser exceptions, synthetic request ordering and absence of the synthetic staff password in sessionStorage.

`evidence.json` is the authoritative result of the latest run. Screenshots show synthetic records only. This evidence establishes UI behavior, not successful hosted authentication, legal approval, email delivery, malware scanning, RLS, production access provisioning or real database transitions. The password and TOTP are test fixture inputs; no real identity provider is used. Separate SQL/API/security tests cover authoritative backend behavior. Real service acceptance remains a release prerequisite.
