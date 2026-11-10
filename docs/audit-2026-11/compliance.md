# Necon (CAA platform) — mapping against information security, privacy and quality standards

Date: 2026-11-03. Scope: `caa-backend-pr` (NestJS API + worker), `caa-web` (Next.js portal, `deploy/` for the DigitalOcean droplet), the team's Obsidian vault (`caa-documentacion-main`), `DEPLOYMENT.md` and the team context document. Read-only review of source, migrations, deploy files and documents. No `.env` file was opened. No running system was tested (no penetration test, no accessibility scan, no restore drill).

Paths below: `B/` = `<local path>`, `W/` = `<local path>`, `D/` = `<local path>`.

Statuses used in the tables: **met in code** (the control's technical part is implemented and visible in source), **partly** (implemented with a material gap), **not met** (absent), **organizational** (cannot be met by code; needs a policy, a contract, a person or a procedure). Standard texts are copyrighted; control numbers are cited and the intent is paraphrased.

---

## 0. The one thing to say first: software is not certified, organizations are

ISO/IEC 27001 and ISO/IEC 27701 certify a **management system operated by an organization** (the municipal center as data controller, and whoever operates the platform as processor). ISO/IEC 27002, 27010, 27017, 27018, 27799, 29100, 25010 and 40500 are **guidance or models**: nobody is "certified to 27002". The code can at most **provide evidence for a subset of controls**. A certification body would still ask the organization for (see section 13): a defined ISMS scope, a risk assessment and treatment plan, a Statement of Applicability, approved policies, assigned roles (including a data protection officer, which is mandatory for a municipal entity under LOPDP Art. 48(1)), supplier contracts, an incident procedure, training records, internal audit and management review, and several months of operating records.

The system is also in a legally delicate category: **health data of children** (LOPDP Art. 25 lists sensitive data, data of children and adolescents, health data and disability data as special categories) plus **biometric data** (the cloned voice of a trusted adult, LOPDP Art. 4 definition of biometric data; `B/prisma/schema.prisma:634-657`). Those two facts drive most of the organizational requirements below.

---

## 1. Which standards apply, which edition is current, and why

Editions were confirmed on 2026-11-03 with web search; ISO's own catalogue pages refused direct fetches (HTTP 403), so the ISO page is cited together with a second catalogue where the ISO page could not be read.

| Standard | Current edition (source) | Applies? | Why |
| --- | --- | --- | --- |
| ISO/IEC 27001 | **27001:2022** (Ed. 3, 2022-10) + **Amd 1:2024** (climate wording only). https://www.iso.org/standard/27001 , https://www.iso.org/standard/88435.html | **Yes** (to the organization) | The only certifiable information security standard here. The 2013 edition is withdrawn; any certificate must be against 2022. |
| ISO/IEC 27002 | **27002:2022** (Ed. 3, 2022-02, corrected 2022-03). https://www.iso.org/standard/75652.html | **Yes** (as the control catalogue) | 93 controls in 4 themes; it is the reference used by 27001 Annex A, 27017, 27018, 27799 and 27701. Table in section 3. |
| ISO/IEC 27010 | **27010:2015** (Ed. 2, confirmed 2021; written on top of 27001/27002:2013, not yet realigned to 2022). https://www.iso.org/standard/68427.html , https://webstore.iec.ch/publication/23728 | **Marginally** (see section 4) | It is about *inter-organizational and inter-sector sharing of security information* (sharing communities, trust, markings). Necon does share personal data between organizations (center ↔ platform operator, center ↔ families, platform ↔ cloud and voice services), so the ideas apply, but it is not certifiable and most of its controls are covered by 27002/27701 here. |
| ISO/IEC 27017 | **27017:2026** (Ed. 2, published 2026-07; replaces 27017:2015 and now follows the 27002:2022 structure). https://www.iso.org/standard/82878.html , https://webstore.iec.ch/en/publication/115400 | **Yes** (as cloud customer and as a cloud service provider) | The platform *consumes* cloud services (Neon PostgreSQL and S3-compatible bucket in AWS `us-east-2`, a DigitalOcean droplet in New York) and *is itself* a multi-tenant SaaS offered to several centers (spec 113). Table in section 5. |
| ISO/IEC 27018 | **27018:2025** (Ed. 3, 2025-08; aligned to 27002:2022, Annex B maps to 2019). https://www.iso.org/standard/88150.html , https://blog.ansi.org/ansi/iso-iec-27018-2025-practice-protecting-pii/ | **Yes, in two directions** | 27018 is for *PII processors in public clouds*. (a) The platform operator is a processor (LOPDP "encargado") for every center it hosts, so 27018 is the right yardstick for the platform. (b) Neon and DigitalOcean are sub-processors; the team should ask them for their 27018/27017 attestations. Table in section 6. |
| ISO/IEC 27701 | **27701:2025** (Ed. 2, 2025-10; now standalone and certifiable without a 27001 certificate; 2019 certificates transition by ~2028). https://www.iso.org/standard/27701 , https://www.kiwa.com/nl/en-nl/areas-of-expertise/cyber-security/news/isoiec-277012025-published-updated-privacy-standard-offers-organizations-more-guidance/ | **Yes** (to the organization) | Privacy information management for the controller (center) and the processor (platform). It is the natural frame for LOPDP accountability (Art. 10 k). Table in section 7. |
| ISO 27799 | **27799:2025** (Ed. 3, 2025-12; replaces 27799:2016, which is withdrawn; now a set of health-specific controls on top of 27002:2022). https://www.iso.org/standard/84647.html , https://genorma.com/en/standards/iso-27799-2025 , https://www.evs.ee/en/evs-en-iso-27799-2026 | **Yes** | Speech-therapy records, diagnoses, session events, notes, goals and treatment plans are personal health information. Health-specific points are folded into the 27002 table (section 3) and called out in section 8. |
| ISO/IEC 29100 | **29100:2024** (Ed. 2). https://www.iso.org/standard/85938.html , https://scc-ccn.ca/standardsdb/standards/2053757 | **Yes** (as vocabulary and principles) | Defines the actors (PII principal = child/guardian; controller = center; processor = platform; third party) and 11 privacy principles. Not certifiable. Table in section 9. |
| ISO/IEC 25010 | **25010:2023** (Ed. 2, 2023-11; product quality model; replaces 2011). https://www.iso.org/standard/78176.html | **Yes** (as an evaluation model) | The team already names it as a requirement. It is a model of quality characteristics, not a conformance standard; it can be used to structure the acceptance tests of the thesis. Table in section 10. |
| ISO/IEC 40500 (WCAG) | **40500:2025** = WCAG 2.2 as published by W3C on 2023-10-05 (ISO approval 2025-09). W3C's 2024-12-12 errata edition is in ISO enquiry as DIS 40500, expected as 40500:2026. https://www.iso.org/standard/91029.html , https://www.w3.org/WAI/news/2025-10-21/wcag22-iso , https://www.w3.org/press-releases/2025/ | **Yes** (to the web portal; the tablet app is native Android and WCAG applies by analogy only) | The team's target is WCAG 2.2 AA. 40500:2012 (WCAG 2.0) is superseded. Section 11. |
| IEC 62304 | **62304:2006 + AMD1:2015** (consolidated, stability date 2028). Edition 2 ("health software", rigor levels I/II) is still a draft; IEC's dashboard plans publication in 2027. https://webstore.iec.ch/en/publication/22794 , https://iec.ch/dyn/www/f?p=103%3A38%3A17428361565612%3A%3A%3A%3AFSP_ORG_ID%2CFSP_APEX_PAGE%2CFSP_PROJECT_ID%3A1359%2C23%2C122433 | **No** (voluntary at most) | See section 12. The platform records, schedules and communicates; it does not diagnose, dose, monitor vital signs or make treatment decisions. It is assistive technology plus a clinical record, which regulators generally do not treat as a medical device. |
| ISO 14971 | **14971:2019** (Ed. 3, confirmed 2025). https://www.iso.org/standard/72704.html | **No** (same reason; a lightweight hazard analysis is still recommended for the "patient locked mode" and the PIN logic) | Section 12. |
| Ecuador LOPDP | Ley Orgánica de Protección de Datos Personales, Registro Oficial Suplemento 459, 2021-05-26 (77 articles), in force; **Reglamento General** by Decreto Ejecutivo 904, Registro Oficial 435 (Tercer Suplemento), 2023-11-13. https://www.gob.ec/regulaciones/ley-organica-proteccion-datos-personales-0 , https://www.gob.ec/regulaciones/reglamento-general-ley-organica-proteccion-datos-personales-0 , https://nmslaw.com.ec/?p=13184 | **Yes, fully and with the strictest regime** | Data subjects are children, the data is health data, part of it is biometric, and the controller is a municipal entity (public sector obligations: Art. 38 security scheme, Art. 48(1) mandatory DPO). Table in section 2. A reform bill was presented in July 2026 (stricter adequacy rules for transfers); not in force. |

Additional frames the team already uses and that fit well: OWASP ASVS (the tenancy tests cite ASVS 8.3.1/8.4.1, `B/test/tenancy.e2e-spec.ts:164,276`) and the Ecuadorian public-sector EGSI (Esquema Gubernamental de Seguridad de la Información, MINTEL), which a municipal center must follow under LOPDP Art. 38 regardless of ISO.

---

## 2. LOPDP (Ecuador) — the binding requirement

Article numbers below were read from the published text of the law (Registro Oficial 459). The Reglamento adds procedure (consent collection, registry, transfers) and should be mapped by the center's legal adviser.

| Article / topic | Status | Evidence | Action |
| --- | --- | --- | --- |
| Art. 7, 8 — lawful basis and valid consent (free, specific, informed, unequivocal; revocable at any time) | **partly** | A patient cannot be created without a photographed signed consent: `B/src/patients/application/create-patient.use-case.ts:27-36`; `B/prisma/schema.prisma:224-225` (`consentDate`, `consentFilePath`). The "request an account" form records the notice version and acceptance time: `B/prisma/schema.prisma:776-777`, `B/src/institutions/application/request-institution.use-case.ts:24`, `W/src/modules/institutions/presentation/screens/request-account-screen.tsx:154-168`. | For the **patient** consent, store what was consented to: notice/form version, purposes (therapy record, tablet use, family mode, voice cloning, statistics), the signer's role, and a **revocation** path that is not the same as a deletion request (Art. 8 says revocation must be as easy as giving consent). Record whether the adolescent (15+) consented personally (Art. 21, Art. 24). |
| Art. 21, 24, 25, 26 — children's and sensitive data: express authorization of the holder or legal representative; under-15s act through the representative; 15–17 may consent themselves | **partly** | `birthDate` exists (`schema.prisma:222`), guardian name/phone are captured (`:226-227`), guardian accounts are a `PARENT` role linked per child (`schema.prisma:164-176`, `B/src/users/infrastructure/http/users.dto.ts:44-47`). | Add the legal-representative relationship and identity check to the consent record (Art. 18(1) rejects requests from non-accredited representatives). Let the system know when the child turns 15 so the notice and consent are re-addressed to the adolescent. |
| Art. 4, 26 — biometric data (cloned voice of a trusted adult) | **partly** | `Voice.ownerName/relationship/consentDate` (`schema.prisma:641-643`); sample and clips stored in the bucket in clear (`B/src/voices/application/voice-job.runner.ts:37,62`); synthesis runs on a local service (`B/.env.example:66-67`, `B/compose.yaml:34`). Team flag: "dato biométrico: validar con el asesor legal" (`D/03 -Especificaciones/Acuerdos.md:92`). | The voice owner is a **separate data subject** (an adult) whose explicit consent must be collected and stored like the patient's (a document, not only a date). Encrypt the sample at rest with the consent-vault pattern. Do not send the sample outside the droplet without a transfer basis. |
| Art. 10 (e) minimization, (f) proportionality | **met in code** (good) | No national ID is stored (decision `D/03 -Especificaciones/Acuerdos.md:21`); the tablet only sees avatar + code (`schema.prisma:251-253`); audit and data requests use the patient **code**, never the name (`schema.prisma:583-603`, `B/src/audit/README.md:8`); admins cannot read diagnosis (`B/src/patients/infrastructure/http/patients.controller.ts:56-57` is THERAPIST-only); notifications carry institution names only (`schema.prisma:803-816`). | Remove unused personal-financial structures from the production schema (`Subscription`, `SubscriptionPayment`, `schema.prisma:893-940`; `B/src/subscriptions/infrastructure/http/subscriptions.controller.ts`; `W/src/app/platform/payments/page.tsx`), since the paid plan was archived. Define a JSON schema for `Event.payload` (`schema.prisma:464-476`) so free-form tablet data cannot grow into identifiers. |
| Art. 10 (i) conservation; Art. 51(9) retention time in the National Register | **not met** | Retention exists only for generated files (24 h, `B/src/jobs/domain/entities/job.entity.ts:38,41`; purge in `B/src/jobs/application/jobs.worker.ts:124-129`) and rejected institution requests (180 days, `B/src/institutions/application/platform.use-cases.ts:44`, disclosed at `W/.../request-account-screen.tsx:157-158`). Nothing purges `RefreshToken`, `PasswordReset`, `LoginAttempt` (`schema.prisma:116-148`), discharged patients (`dischargedAt`, `schema.prisma:234`), sessions/events, or audit rows (`AuditLog` is insert-only and kept forever by decision, `D/03 -Especificaciones/Acuerdos.md:60`). | Write a retention schedule (per table, per purpose, legal basis for clinical records under Ecuadorian health-record rules) and implement it: a scheduled purge job per center, a `CenterSettings` retention field, and an audit retention that is long but finite. |
| Art. 12 — right to information (purposes, legal basis, retention, transfers, recipients, DPO contact, how to exercise rights); for minors, given to the representative | **partly** | Only the account-request form shows a notice (`request-account-screen.tsx:154-159`). No notice for patients/guardians exists in the code or docs; the portal has no privacy page. | Publish a privacy notice (portal page and printed form) covering items 1–17 of Art. 12, including the **international transfer to the USA** and the sub-processors (Neon, DigitalOcean, SMTP provider). Reference its version in the patient consent record. |
| Art. 13, 14, 15 — access, rectification, deletion within 15 days; Art. 62 direct requests answered in 10 days | **partly** (good foundation) | Module `data-requests`: 15-day due date and deadline flags (`B/src/data-requests/README.md:23-29`), access export as ZIP with PDF + CSV (`B/src/data-requests/application/export-patient-data.use-case.ts:7-44`), rectification closed with reason, deletion with double confirmation and transactional erase plus bucket cleanup (`B/src/data-requests/application/execute-deletion.use-case.ts:23-50`, `B/src/data-requests/infrastructure/prisma/patient-eraser.prisma.ts:16-97`), tablets purge the profile via `RetiredPatientCode` (`schema.prisma:624-633`); everything audited (`README.md:41-43`). | Requests can only be **registered by the therapist** (`B/src/data-requests/infrastructure/http/data-requests.controller.ts:28-39`); the guardian role has no endpoint to file one (`B/src/family/infrastructure/http/family.controller.ts:20-77` is read-only). Add a guardian-facing channel (portal or app) and a 10-day acknowledgement (Art. 62). Add request types for **opposition** and **suspension** (Art. 16, 19) and **portability** (Art. 17: the ZIP's CSVs already satisfy the format). |
| Art. 15 — deletion must leave data unrecoverable; anonymization option | **partly** | Sessions are either deleted or moved to a technical `ANONIMO` patient with therapist and guardian cleared (`patient-eraser.prisma.ts:51-81`). Gaps: `deviceId` and timestamps stay on anonymized sessions (`:73-78`) and in a small center that can re-identify; audit summaries keep clinical text of the deleted child (`NOTE_UPDATE.previous`, `B/src/notes/application/notes.use-cases.ts:73-75`; acknowledged in `B/src/data-requests/README.md:67`). | Clear `deviceId` on anonymization; on deletion, redact or hash the `summary` of audit rows carrying that `patientCode` (the trigger forbids UPDATE, so do it by design: store clinical text in audit as a hash, or write a `redactedAt` companion table). **Legal check:** Art. 31(3) requires prior authorization from the Authority for processing *anonymized health data*; the `statisticalUseAllowed` option (`schema.prisma:615`) may therefore need an authorization before it is offered. |
| Art. 30, 31 — health data: confidentiality and professional secrecy, consent, pseudonymization where possible | **partly** | Patient code acts as a pseudonym across audit, requests, exports and the tablet; access to clinical data is therapist-only and assignment-scoped (`patients.controller.ts:56-64`, `tenancy.e2e-spec.ts:164-290`); reads of the consent and of sessions are audited (`B/src/patients/application/get-consent.use-case.ts:22-31`, `B/src/audit/README.md:24`). | Organizational: confidentiality agreements with every staff member and the platform operator (Art. 47(10)); a "break-glass" procedure for super-admin access to clinical data (today super-admin has no institution and the RLS hides clinical rows, which is good: `B/src/prisma/prisma.service.ts:28-31`). |
| Art. 33, 34 — transfers to third parties; processor (encargado) contract | **organizational** | No contract or DPA is referenced anywhere in the repos or vault. The platform operator (thesis team today) is a processor for each center; Neon/DigitalOcean/SMTP are sub-processors. | Sign a processor contract center ↔ platform operator (instructions, confidentiality, sub-processors, return/destruction at end, breach notice within 2 days per Art. 43 last paragraph). Collect Neon's and DigitalOcean's DPAs. |
| Art. 37, 40, 41 — security measures proportional to risk; risk analysis; continuous evaluation | **partly** | The technical measures in section 3 are substantial (argon2id, RLS, insert-only audit, AES-256-GCM consent vault, rate limits, TLS 1.2/1.3, HSTS, CSP, hardened containers). | No written risk analysis exists. Produce one (threat model per data flow: tablet, portal, family mode, voice service, cloud) and keep it current; it is also the input a certification body expects. |
| Art. 38 — public-sector security scheme (EGSI) | **organizational** | The controller is a municipal center. | Align the ISMS with the EGSI issued by MINTEL (confirm current version) and the municipality's own information security unit. |
| Art. 39 — privacy by design and by default | **partly** | Evidence of design-time privacy: pseudonymous code, minimal tablet payload, encrypted consent, RLS as a second lock, retention of rejected requests disclosed. | Document the design decisions as a privacy-by-design record (the vault's "Acuerdos" is a good seed) and add the missing defaults (retention, consent versioning, guardian channel). |
| Art. 42 — impact assessment (mandatory for large-scale processing of special categories) | **not met (organizational)** | None found. | Perform a DPIA before production. Children's health and biometric data of several centers is the textbook case. |
| Art. 43, 46 — breach notification: Authority and ARCOTEL within 5 days; data subjects within 3 days when risk is high; processor to controller within 2 days | **not met (organizational, with code support possible)** | No incident procedure in code or docs. The audit log and nginx logs exist for forensics (`B/src/audit/*`, `W/deploy/nginx.conf:31-34`) but logs rotate at 50 MB per container (`W/deploy/compose.yaml:9-11`) and are not shipped anywhere. | Write the incident procedure with the legal deadlines, contacts and templates; ship logs off the droplet with a retention of at least 12 months; add alerting on `LOGIN_FAILED` bursts, refresh-token reuse (`B/src/auth/application/refresh-session.use-case.ts:26-29`) and audit-write failures (`B/src/auth/infrastructure/prisma/auth-audit.prisma.ts:29-32`). |
| Art. 47 — controller obligations (policies, risk methodology, periodic evaluation, confidentiality contracts, registry, DPO, audits) | **organizational** | — | See section 13. |
| Art. 48 — data protection officer: mandatory for public-sector controllers and for large-scale special categories | **not met (organizational)** | — | Designate the DPO of the center (the municipality may already have one) and name a privacy contact for the platform operator. |
| Art. 51 — National Register of Personal Data Protection (database, purposes, recipients, security measures, retention) | **not met (organizational)** | — | Register the processing with the Superintendencia de Protección de Datos Personales; include the international transfer (Art. 59 second paragraph). |
| Art. 55–61 — international transfer | **not met** | Database and bucket are in AWS `us-east-2` (Ohio, USA) through Neon (`B/.env.example:53-58`, `W/deploy/README.md:20`); the droplet is in New York (`W/deploy/README.md:20`); nightly dumps are on the droplet (`W/deploy/README.md:181-182`). The USA has no adequacy decision from the Ecuadorian Authority known to this review. The privacy notice does not mention the transfer. | Choose a basis and document it: adequate guarantees through a binding instrument with Neon and DigitalOcean (Art. 57) or an authorization from the Authority (Art. 59), plus registration and disclosure (Art. 12(10)). Explicit consent of the representative (Art. 60(2)) is a weak basis for children's health data. Technical mitigation that helps either way: application-level encryption of direct identifiers (`firstNames`, `lastNames`, `guardianName`, `guardianPhone`) with keys that stay in Ecuador, or hosting the database in a region covered by a guarantee. |
| Art. 67–72 — infractions and fines (0.1–1 % of turnover for private entities; 1–20 basic salaries for public servants) | — | — | Not a control; cited so the team knows the exposure: missing DPIA, missing DPO, missing registry and undocumented transfers are each listed as infractions in Art. 67–68. |

---

## 3. ISO/IEC 27001:2022 Annex A / ISO/IEC 27002:2022 controls, with ISO 27799:2025 health notes

27001 clauses 4–10 (context, leadership, planning, support, operation, evaluation, improvement) are entirely organizational and are not met by code; section 13 lists them. The table covers the Annex A controls that a reviewer would test against this product. Control numbers follow 27002:2022.

### 3.1 Organizational controls (5.x)

| Control | Status | Evidence | Action |
| --- | --- | --- | --- |
| 5.1 Policies for information security | organizational | No policy set; the vault has agreements and specs (`D/03 -Especificaciones/Acuerdos.md`). | Approve an information security policy and topic policies (access, crypto, backup, logging, supplier, secure development, acceptable use). |
| 5.2 Roles and responsibilities | organizational | Roles exist only in code (`SUPER_ADMIN`, `ADMIN`, `THERAPIST`, `PARENT`: `B/src/auth/domain/entities/user.entity.ts:4-9`). | Name an ISMS owner, a DPO, a system administrator and a security contact. |
| 5.7 Threat intelligence | not met | No process; no dependency advisories feed. | Subscribe to advisories for NestJS, Next.js, Prisma, PostgreSQL and run `pnpm audit` in CI. |
| 5.8 Information security in project management | partly | Spec-driven development with security requirements per spec (`D/02 -Backend/Módulo Auth.md`, specs 101–113), ASVS references in tests. | Add a security review checklist per spec and record it. |
| 5.9 Inventory of information and other associated assets | partly | Prisma schema is a data inventory (`B/prisma/schema.prisma`); deployment inventory in `W/deploy/README.md:3-16`. | Maintain an asset list with owners and classification (tablets, droplet, Neon project, bucket, SMTP, voice host, repos, secrets). |
| 5.10 Acceptable use; 5.11 Return of assets | organizational | Tablets are center-owned and revocable (`schema.prisma:178-198`, `B/src/devices/application/revoke-device.use-case.ts`). | Acceptable-use rules for staff and guardians; tablet hand-back procedure. |
| 5.12 Classification; 5.13 Labelling (27799: classify personal health information as the highest class) | partly | De facto classification: consent photo encrypted and never served by URL (`B/src/common/storage/file-storage.ts:7`), clinical fields therapist-only, codes instead of names. | Write the classification scheme (public / internal / personal / health-biometric) and label exports (PDF/ZIP/CSV) with it. |
| 5.14 Information transfer | partly | TLS on every public hop (`W/deploy/nginx.conf:44-49,135,168`); exports are downloaded through signed URLs valid 1 h (`B/src/common/storage/s3-file-storage.ts:37-46`); audit CSV guards formula injection (`B/src/audit/README.md:33`). SMTP uses STARTTLS only opportunistically (`B/src/auth/infrastructure/mail/auth.mailer.ts:26-35`). | Set `requireTLS: true` and a minimum TLS version for SMTP; define rules for sending exports to families. |
| 5.15 Access control; 5.16 Identity management; 5.18 Access rights | met in code | Default-deny guard (`B/src/auth/infrastructure/http/guards/user-role.guard.ts:22`), role per route, assignment-scoped access to patients, per-institution RLS, users deactivated not deleted (`user.entity.ts:111-114`), guardian ↔ child links (`schema.prisma:164-176`). | Add a periodic access review report (who has which patients, which devices are active) for the center admin. |
| 5.17 Authentication information | partly | argon2id hashes (`B/src/auth/infrastructure/security/argon2-password.hasher.ts:8-17`), 10+ chars with letters and digits (`user.entity.ts:12`), forced change of temporary passwords (`user-role.guard.ts:26-27`), one-time 30-min reset links (`B/src/auth/domain/entities/password-reset.entity.ts:9-22`), PIN policy and lockout (`user.entity.ts:18-25,139-148`). Gaps: temporary passwords are **sent in clear by e-mail and returned by the API** (`auth.mailer.ts:41-47`, `B/src/institutions/application/create-institution-admin.use-case.ts:46-50`); no breached-password check; no MFA. | Replace the mailed temporary password with a one-time "set your password" link; add a breached-password list check; see 8.5 for MFA. |
| 5.19–5.22 Supplier relationships, agreements, ICT supply chain, monitoring | organizational | Suppliers in use: Neon (DB + bucket), DigitalOcean, Let's Encrypt, institutional SMTP, ARASAAC (pictograms, no PII: `B/src/common/http/http-client.ts:3`), local voice-cloning service (`B/.env.example:66-67`). No agreements referenced. | Supplier register with DPA/terms, certifications held (ask Neon/DO for ISO 27001/27017/27018 or SOC 2 reports), exit plan (how to export the DB and bucket), and a yearly review. |
| 5.23 Cloud services | partly | Cloud choices are documented with reasons (`W/deploy/README.md`, `DEPLOYMENT.md`); region and data location are explicit. | Formal cloud-use policy: allowed regions, shared-responsibility matrix, who can log into the Neon and DO consoles, MFA on those consoles. (Section 5.) |
| 5.24–5.28 Incident management planning, assessment, response, learning, evidence | not met (organizational) | No procedure. Technical support exists: audit trail, IP capture (`B/src/app.setup.ts:10-11`), 503 fallback (`B/src/common/filters/global-exception.filter.ts:37-50`). | Incident procedure with LOPDP deadlines; evidence preservation (export audit, copy logs) steps; post-incident review template. |
| 5.29 Security during disruption; 5.30 ICT readiness for business continuity | partly | Health checks and restart policies (`W/deploy/compose.yaml:14,78-84,96-102`), zero-downtime rollout and rollback (`W/deploy/README.md:127-172`), tablets work offline and resync (`D/03 -Especificaciones/Acuerdos.md:41,86`). | Define RTO/RPO, test a restore into a Neon branch at least yearly (README suggests "once"), document what the center does during an outage. |
| 5.31 Legal, statutory, regulatory and contractual requirements | partly | LOPDP is referenced in code (`data-requests`, notice version). | Legal register: LOPDP + Reglamento, health-records rules, EGSI, ARCSA position on the product, municipal transparency law. |
| 5.33 Protection of records; 5.34 Privacy and protection of PII | partly | Insert-only audit (`B/prisma/migrations/20261024010000_audit_insert_only/migration.sql:3-11`; API role cannot UPDATE/DELETE: `B/prisma/migrations/20261027000000_institutions/migration.sql:279`); data-subject rights module. | Retention schedule and the section 2 privacy actions. |
| 5.35 Independent review; 5.36 Compliance with policies | organizational | This review is a first, non-independent one. | Plan an independent review (internal audit) before any certification attempt. |
| 5.37 Documented operating procedures | partly | Deployment runbook is thorough (`W/deploy/README.md`), migration guidance (`B/WEB-HANDOFF.md`). | Add procedures for onboarding/offboarding staff, device revocation, key rotation, restore, incident. |

### 3.2 People controls (6.x)

| Control | Status | Evidence | Action |
| --- | --- | --- | --- |
| 6.1 Screening; 6.2 Terms of employment; 6.6 Confidentiality agreements (27799 stresses professional secrecy) | organizational | — | Confidentiality clauses for therapists, admins, platform operators and the thesis team; LOPDP Art. 47(10). |
| 6.3 Awareness and training | organizational | Guidance exists for AI agents (`D/06 -Conocimiento/Guía para agentes de IA.md`) but not for staff. | Short training for center staff: PIN hygiene, tablet lock mode, phishing, how to log a rights request. |
| 6.4 Disciplinary process; 6.5 Responsibilities after termination | organizational | Accounts can be deactivated and sessions revoked (`B/src/auth/application/refresh-session.use-case.ts:34-37`). | Offboarding checklist: deactivate user, clear PIN, revoke devices, rotate shared secrets if the person had them. |
| 6.7 Remote working | partly | Portal is reachable from anywhere; 15-min idle sign-out (`W/src/modules/auth/application/session-context.tsx:56-66`). | Policy on using the portal outside the center (no shared PCs, no printing exports at home). |
| 6.8 Information security event reporting | not met | No channel. | A mailbox/phone for staff and families to report incidents; mention it in the privacy notice. |

### 3.3 Physical controls (7.x)

| Control | Status | Evidence | Action |
| --- | --- | --- | --- |
| 7.1–7.4 Perimeters, entry, offices, monitoring | organizational (cloud + center) | Droplet and database are in supplier data centers; tablets live in therapy rooms. | Rely on supplier attestations for the data centers; define tablet storage (locked cabinet), charging and inventory. |
| 7.9 Security of assets off-premises; 7.10 Storage media | partly | Tablets: device token bound to an Android Keystore key (`schema.prisma:187`, `B/src/devices/infrastructure/http/device-auth.ts:30-48`), center PIN and lock-task mode (`D/03 -Especificaciones/Acuerdos.md:51`), revocation. | Document tablet loss procedure (revoke device, check last sync, consider notification under Art. 43/46), enforce device encryption and no personal Google account on tablets. |
| 7.14 Secure disposal or re-use | organizational | — | Wipe procedure for tablets and for the droplet at decommissioning. |

### 3.4 Technological controls (8.x)

| Control | Status | Evidence | Action |
| --- | --- | --- | --- |
| 8.1 User endpoint devices | partly | Tablet app constraints documented; no MDM. | Consider Android Enterprise / MDM for center tablets; at minimum a configuration checklist. |
| 8.2 Privileged access rights | partly | `SUPER_ADMIN` has no institution and RLS hides clinical rows (`B/src/tenancy/tenancy.ts:9,31`, `B/src/prisma/prisma.service.ts:28-31`); platform actions are audited (`B/src/institutions/application/platform.use-cases.ts:52-136`). | MFA for `SUPER_ADMIN` and `ADMIN`; named (not shared) super-admin accounts; document console access to Neon/DO. |
| 8.3 Information access restriction | met in code | Per-route roles, per-assignment checks (`B/test/tenancy.e2e-spec.ts:217-290`), guardian-only family API (`B/src/family/infrastructure/http/family.controller.ts:20-77`). | — |
| 8.4 Access to source code | organizational | Repos are public on GitHub (the team context document), which is fine as long as secrets never enter them (`.env` ignored: `B/.gitignore:33-37`). | Enable secret scanning and branch protection on `caa-cuenca` repos; keep `.env` out of forks and zips. |
| 8.5 Secure authentication | partly | Lockout after 5 failures in 15 min (`B/src/auth/domain/entities/login-attempt.entity.ts:8,33-36`), timing-safe comparisons (`argon2-password.hasher.ts:14-17`, `B/src/auth/infrastructure/http/auth.controller.ts:69-72`), uniform 401 (`B/test/auth.e2e-spec.ts:21`), login rate limits (`auth.controller.ts:85`), short-lived HS256 access tokens (`B/src/auth/auth.module.ts:33`; algorithm pinned in `B/src/auth/infrastructure/http/jwt.strategy.ts:18`), refresh rotation with reuse detection and a 30 s grace (`B/src/auth/domain/entities/refresh-token.entity.ts:10-39`, `refresh-session.use-case.ts:23-30`), httpOnly/Secure/SameSite=Strict cookie scoped to `/auth` (`auth.controller.ts:22-29`), access token kept in memory only (`W/src/shared/infrastructure/http/api-client.ts:5-10`). **No MFA at all.** Device auth: ECDSA P-256 signature over method, path and timestamp (`device-auth.ts:30-48`) but a signature can be replayed within its validity window; the team knows (`D/03 -Especificaciones/Estado de especificaciones.md:73`). | Add TOTP or WebAuthn MFA, mandatory for `SUPER_ADMIN`/`ADMIN`, optional for therapists; add a nonce (stored in Redis for the window) to the device signature; consider rotating `JWT_SECRET` via a key id (`jwt.strategy.ts:15-19` loads a single symmetric secret). |
| 8.6 Capacity management | met in code | Pool sizing and keep-alive tuned from k6 runs (`B/src/prisma/prisma.service.ts:65-67`, `B/src/main.ts:25-29`), memory limits per container (`W/deploy/compose.yaml:64,85,103,114,127`), `PERFORMANCE.md`. | Keep the k6 results with each release. |
| 8.7 Protection against malware | partly | Uploads are type-sniffed and size-limited (`create-patient.use-case.ts:28-29`; logo PNG/JPG by bytes, SVG rejected: `B/WEB-HANDOFF.md` endpoint table), nginx body limits (`nginx.conf:71,151,175`). | Antivirus scan of uploaded images and audio in the worker (ClamAV container) if guardians will upload from phones. |
| 8.8 Management of technical vulnerabilities | not met | No CI in either repo (no `.github/`), no `pnpm audit`, no SAST, no image scanning; base images are tag-pinned not digest-pinned (`B/Dockerfile:3,45`, `W/deploy/compose.yaml:41,119`). Positive: lockfile frozen (`B/Dockerfile:20`), build scripts allow-listed (`B/pnpm-workspace.yaml`), axios pinned to a clean version by decision (`D/03 -Especificaciones/Acuerdos.md:111`). | Add CI with lint, typecheck, e2e, `pnpm audit --prod`, Trivy on images; patch SLA (critical ≤ 7 days). |
| 8.9 Configuration management | partly | All config via env with a documented template (`B/.env.example`), prod/dev separation (`B/src/main.ts:15-23` disables Swagger in prod), nginx template with hardened headers (`nginx.conf:7,128-143`), containers run as `node`, read-only FS for web, `cap_drop ALL`, `no-new-privileges` (`W/deploy/compose.yaml:16,26,73-75`). | Keep a signed baseline (hash of `nginx.conf`, compose) and review drift on each deploy. |
| 8.10 Information deletion | partly | Deletion use case removes DB rows and bucket objects (`execute-deletion.use-case.ts:34-37`); generated files expire in 24 h (`job.entity.ts:38`). | Retention purge (section 2); verify that Neon point-in-time history and old dumps do not resurrect deleted children beyond the documented retention; redact audit summaries. |
| 8.11 Data masking; 8.12 Data leakage prevention | partly | Pseudonymous codes in audit/exports; error responses never leak stacks in production (`global-exception.filter.ts:98-103`); nginx access log drops query strings because the staff WebSocket carries `?token=` (`nginx.conf:31-34`). | Move the WebSocket token out of the URL (`B/src/sync/infrastructure/ws/live.gateway.ts:59-62`) into a first message or a short-lived ticket; mask guardian phone in list views. |
| 8.13 Information backup (27799: backups of health information must be protected like the originals) | partly | Nightly `pg_dump` cron with 14-day local retention and off-droplet copy recommended, restore test "once" (`W/deploy/README.md:174-192`, `compose.yaml:146-166`); Neon PITR depends on plan; bucket backup is a manual suggestion. Dumps sit **unencrypted** on the droplet in the USA. | Encrypt dumps (age/gpg) before writing, automate the off-site copy and a monthly restore test, script the bucket sync, record RPO/RTO. |
| 8.15 Logging; 8.16 Monitoring (27799: log every access to health records) | partly | Application audit trail covers auth, reads of clinical records, consent reads, exports, deletions, device and platform actions (`B/src/audit/README.md:19-24`; writers across modules). Server logs: only errors/warnings and method+URL (`global-exception.filter.ts:69,88,97`), Prisma errors only (`prisma.service.ts:77`). Gaps: no request logging, 50 MB rotation per container with no shipping (`compose.yaml:9-11`), audit write failures are logged and ignored (`auth-audit.prisma.ts:29-32`), no alerting; dev-only mailer logs addresses (`auth.mailer.ts:67,82`). | Ship container logs to a log store with ≥ 12-month retention; alert on security events; make audit writes fail-closed for security-relevant actions (or queue and retry); add an admin "who viewed this child" report. |
| 8.17 Clock synchronization | organizational | Droplet uses the OS clock; device signatures depend on `X-Device-Timestamp` (`device-auth.ts:42`). | Ensure NTP on the droplet and reject tablets with large clock skew (already implied by the window). |
| 8.18 Privileged utility programs; 8.19 Software installation | partly | Production image contains only `dist` + prod deps, no shell tools (`B/Dockerfile:44-59`); migrations run from a separate profile (`compose.yaml:130-138`). | Document who may run `migrate`, `db seed`, and the `prisma` CLI against production. |
| 8.20 Network security; 8.21 Security of network services; 8.22 Segregation of networks | met in code | Only nginx publishes ports (`compose.yaml:44`), API is `expose` only (`:93`), Redis and worker on a backend network unreachable from nginx/web (`:168-170`), DO firewall + ufw + SSH key-only and no root login (`W/deploy/README.md:24-35`), DB connection must be the direct Neon host (`prisma.service.ts:70-71`). | Enforce TLS to Neon with certificate verification in `DATABASE_URL` (`sslmode=verify-full`), restrict Neon IP allow-list to the droplet. |
| 8.23 Web filtering | n/a | — | — |
| 8.24 Use of cryptography | partly | Consent photos AES-256-GCM with random IV and auth tag (`B/src/patients/infrastructure/security/encrypted-consent.vault.ts:8-38`); opaque tokens from 32 random bytes, stored as SHA-256 (`B/src/auth/infrastructure/security/jwt-token.service.ts:27-33`); TLS 1.2/1.3 with modern ciphers, no session tickets (`nginx.conf:44-49`); center PIN as PBKDF2-SHA256 (`schema.prisma:680`). Gaps: single consent key without version or rotation path (`encrypted-consent.vault.ts:19-20`, format `iv|tag|data` at `:8`); voice samples/clips and therapist recordings stored unencrypted in the bucket (`voice-job.runner.ts:37,62`); DB encryption at rest delegated to Neon; `JWT_SECRET` is one HS256 secret with no rotation. | Key management procedure (owner, storage, rotation, escrow — `README.md:67-68` already warns the key is unrecoverable); add a key id byte to the vault format; encrypt biometric audio with the same vault; consider asymmetric JWT (RS256/EdDSA) with key ids. |
| 8.25 Secure development life cycle; 8.26 Application security requirements; 8.27 Secure architecture; 8.29 Security testing | partly | Hexagonal modules, one use case per file, specs with FRs (`D/02 -Backend/Estilo de código.md`), 28 e2e suites including a cross-tenant suite that walks every route (`B/test/tenancy.e2e-spec.ts:164-290`) and an RLS structural test (`:380-383`), auth suite (`B/test/auth.e2e-spec.ts`), DTO validation with whitelist (`B/src/app.setup.ts:18`), UUID pipes, helmet (`:12`), explicit CORS (`:21-27`), `trust proxy` hops (`:11`). | CI gate (8.8); a threat model per spec; dependency and container scanning; a yearly external penetration test; unit tests for domain entities (today only e2e). |
| 8.28 Secure coding | partly | Parameterized queries via Prisma; the only raw SQL is `SET ROLE`/`set_config` with a validated UUID (`prisma.service.ts:15-19`); HTML escaping in mail (`auth.mailer.ts:6`); CSV/XLSX injection guard. | Add ESLint security rules (`eslint-plugin-security`) and a CSP without `'unsafe-inline'` (see 8.34). |
| 8.30 Outsourced development | organizational | Two teams share the backend (the team context document). | Contribution agreement and review rules between the teams. |
| 8.31 Separation of environments | met in code | `NODE_ENV`, separate test DB (`B/.env.example:49-51`), dev vs prod Docker targets (`B/Dockerfile`). | Never point e2e at Neon production (the template already warns). |
| 8.32 Change management | partly | Migrations are forward-only with backward-compatibility guidance; rollback runbook (`W/deploy/README.md:155-172`). | Record each production change (tag, who, when, migration applied); require review before merge. |
| 8.33 Test information | met in code | Seeds use generated avatars and ARASAAC vocabulary, no real children; e2e truncates its own DB. | Keep it that way; never copy production dumps to developer machines. |
| 8.34 Protection of information systems during audit testing | organizational | — | Run security tests on a Neon branch, not on production. |
| Web hardening (helmet, CSP, headers) | partly | Portal CSP has `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` (`nginx.conf:136-139`), which weakens XSS protection on a page that handles children's data; other headers are strong (`:140-143`, `W/next.config.ts:19-31`). | Add a nonce-based CSP via Next.js middleware; keep `frame-ancestors 'none'`. |

### 3.5 Health-specific notes (ISO 27799:2025)

27799:2025 was published in December 2025 and this review had no access to its full text; the points below are the health-sector themes it is known to carry over from the 2016 edition and from 27002:2022, applied to Necon:

- Every access to a child's clinical record should be attributable to a named professional: met for the portal (JWT per user) and for tablets with the therapist's personal PIN (`schema.prisma:446-448` `therapistId`, `therapistVerified`); sessions started offline with the center PIN are marked unverified, which is honest and should be reported to the admin.
- Health information must stay available to clinicians during incidents: offline tablet mode and 503 fallback exist; a documented downtime procedure does not.
- Clinical records usually have **legal minimum retention** (Ecuadorian health-record rules for the center) that may be longer than the LOPDP "as short as necessary" default; the retention schedule must reconcile both, and the deletion use case must respect legal holds (today it deletes unconditionally after the admin confirms: `execute-deletion.use-case.ts:23-32`).
- Anonymized research use of health data needs Authority authorization (LOPDP Art. 31(3), 32); the `statisticalUseAllowed` flag is ahead of the legal basis.

---

## 4. ISO/IEC 27010:2015 — what "information sharing between organizations" means here

27010 was written for *information sharing communities* (sector CERTs, ISACs) that exchange security information such as incidents, vulnerabilities and threat warnings between organizations that do not control each other. It is a guideline (not certifiable) and it still sits on the 2013 editions of 27001/27002, so its control numbers do not match 27002:2022.

Where it applies to Necon, translated into this product's flows:

| Sharing relationship | Data shared | 27010 idea (paraphrased, 2015 numbering) | Status | Evidence | Action |
| --- | --- | --- | --- | --- | --- |
| Center → platform operator (and its sub-processors) | All clinical and audit data of the center's children | Community agreement: who is in the community, what may be shared, under which marking, and how members are vetted (5.1.x, 6.1.x); trust between members (7.x) | organizational | Multi-tenant model with RLS and a per-institution super-admin review (`B/prisma/migrations/20261027000000_institutions/migration.sql:262-302`; `B/src/institutions/application/request-institution.use-case.ts`). | A platform participation agreement for every center (= the LOPDP Art. 34 processor contract) stating purposes, sub-processors, region, incident sharing and exit. |
| Center ↔ families (PARENT role) | Child's board, sessions, shared notes, homework | Classification and marking before release (8.2.x), dissemination limits for recipients, retention by recipients | partly | Therapist chooses which notes are shared (`B/src/family/application/family.use-cases.ts:63-66` `sharedNotes`); guardian reads are audited (`:49-54`); family can only see linked children (`:32-34`). | Mark shared notes with a "family" label in the UI, tell guardians what they may do with exports, and let them revoke their own account's access. |
| Center ↔ center (same platform) | Nothing | Need-to-know between members | met in code | Cross-tenant e2e walks every route from A to B (`B/test/tenancy.e2e-spec.ts:164-290`). | Keep the suite as a release gate. |
| Platform ↔ voice-cloning service | Biometric audio of a trusted adult | Trusted channel, anonymization before sharing where possible (8.2, 13.2) | partly | Service runs locally on the droplet host (`B/compose.yaml:34`, `B/.env.example:66-67`) over plain HTTP inside the host. | Keep it local, never a SaaS without a transfer basis; send the sample without the person's name (today `ownerName` is passed: `voice-job.runner.ts:40`). |
| Platform ↔ ARASAAC | Search terms, pictogram files | No personal data | met in code | `B/src/common/http/http-client.ts:3`. | — |
| Platform ↔ Neon / DigitalOcean / SMTP | Everything (DB, bucket, droplet), e-mails with names and temporary passwords | Agreements and incident notification duties of sub-processors (13.2, 16.1) | organizational | No agreements found. | DPAs, their incident-notification SLAs (LOPDP gives the processor 2 days), and their certifications. |
| Security-information sharing itself (the literal 27010 case) | Incident and vulnerability information between the two teams, the municipality and suppliers | Incident sharing, warning/advisory handling, anonymization of incident reports | not met | No channel. | Agree with the municipality's security unit (EGSI) and the other team how incidents and vulnerabilities are reported and marked (a TLP-like marking is enough). |

Honest summary: 27010 does not add certifiable requirements and would not be audited on its own; what the team should take from it is the written **sharing agreements** (center ↔ platform, center ↔ family) and an **incident-sharing** channel.

---

## 5. ISO/IEC 27017:2026 — cloud security (customer side and provider side)

The 2026 edition follows the 27002:2022 structure; its exact cloud-specific control numbers could not be verified without the text (third-party summaries mention additions in 5.x and 8.x). The 2015 identifiers (`CLD.*`) are given for orientation.

| Topic (2015 ref.) | Status | Evidence | Action |
| --- | --- | --- | --- |
| Shared roles and responsibilities between cloud customer and provider (CLD.6.3.1) | organizational | Responsibilities are implicit in `DEPLOYMENT.md` and `W/deploy/README.md`. | Write a responsibility matrix: Neon (DB engine, storage encryption, PITR), DigitalOcean (host, network), platform operator (OS, containers, app, keys, backups), center (users, tablets, consent). |
| Removal and return of customer assets at contract end (CLD.8.1.5) | partly | DB dump and bucket sync procedures exist (`W/deploy/README.md:174-190`). | Exit plan per supplier and per center (how a center gets its data back and how the platform deletes it: the deletion use case works per patient, not per institution). Add an "offboard institution" job. |
| Segregation in virtual environments (CLD.9.5.1) | met in code | Tenant isolation by RLS with a `NOBYPASSRLS` role, tested (`migration.sql:268`, `tenancy.e2e-spec.ts:380-383`). | — |
| Virtual machine hardening (CLD.9.5.2) | partly | SSH hardening, firewall, swap, Docker from vendor repo (`W/deploy/README.md:28-51`). | Automatic security updates on the droplet, CIS benchmark pass, fail2ban or equivalent on SSH. |
| Administrator's operational security (CLD.12.1.5) | organizational | Single `necon` user with sudo and Docker group (`README.md:32,50`). | Named admin accounts, MFA on DO and Neon consoles, logged `sudo`, no shared SSH keys. |
| Monitoring of cloud services (CLD.12.4.5) | not met | `docker compose logs` only. | Uptime and security monitoring (DO monitoring + log shipping + alerting). |
| Alignment of security management for virtual and physical networks (CLD.13.1.4) | met in code | Two Docker networks, IPv4 only with a documented reason (`compose.yaml:42-44,168-170`). | — |
| Customer data location and legal jurisdiction (27018/27017 disclosure topics) | partly | Documented (`README.md:20`) but not disclosed to data subjects. | Section 2, Art. 55–61. |
| Cloud service as provided *by* the platform (multi-tenant SaaS to centers) | partly | Per-center limits and suspension (`schema.prisma:741-762`), audit of platform actions, institution offboarding missing. | Service description for centers: what the platform guarantees (availability, backups, incident notice, data location). |

---

## 6. ISO/IEC 27018:2025 — PII processor in a public cloud (the platform as processor; Neon/DO as sub-processors)

| Topic (27018 Annex A themes; 2019 numbering for reference) | Status | Evidence | Action |
| --- | --- | --- | --- |
| Process PII only on the controller's instructions; no use for marketing/advertising (A.2.1, A.3.1) | organizational | No marketing features; subscriptions module is dormant. | Put it in the processor contract; remove the dormant billing tables. |
| Enable the controller to honour data-subject rights (A.1.1) | met in code | `data-requests` module and export ZIP (section 2). | Guardian channel. |
| Disclose sub-contracted processing and location (A.7.1, A.11.x) | partly | Known internally. | Disclose Neon, DigitalOcean, SMTP and the voice service to centers and in the notice. |
| Notify the controller of breaches and of law-enforcement requests (A.9.1, A.5.1) | not met (organizational) | — | Processor contract with a 2-day notice (LOPDP Art. 43). |
| Secure erasure of temporary files and PII at end of service (A.9.3, A.10.x) | partly | 24 h TTL for generated files (`job.entity.ts:38`), deletion per patient. | Institution-level offboarding and a documented purge of backups after the retention period. |
| PII in logs: restrict and protect (A.10.x) | partly | Audit uses codes; nginx drops query strings. The mailer logs e-mail addresses only when SMTP is absent (dev). | Keep server logs free of names; ship and protect logs. |
| Encryption of PII in transit and at rest (A.10.x) | partly | TLS everywhere public; consent photos encrypted; rest of DB and bucket rely on supplier encryption. | Application-level encryption for direct identifiers and biometric audio. |
| Unique IDs and access records for staff of the processor (A.10.x) | partly | `SUPER_ADMIN` accounts are named; droplet access is one shared user. | Named SSH users and console accounts. |
| Return, transfer and disposal of PII (A.10.x) | partly | Dumps and bucket sync documented. | Formalize in the contract and test it. |
| Geographical location of PII disclosed (A.11.x) | partly | Documented for the team only. | Disclose to centers and data subjects. |

What to ask Neon and DigitalOcean for: ISO/IEC 27001 certificate with 27017/27018 in scope or SOC 2 Type II, their DPA with sub-processor list, breach-notification SLA, and the data-residency commitment for `us-east-2`/NYC.

---

## 7. ISO/IEC 27701:2025 — privacy information management (controller = center, processor = platform)

27701:2025 restructured the 2019 text; the themes below are stable across both editions (2019 Annex A controller / Annex B processor identifiers given for orientation).

| Theme | Status | Evidence | Action |
| --- | --- | --- | --- |
| Determine the organization's role (controller/processor/joint) and the privacy context | organizational | Roles are implicit. | Record: center = controller; platform operator = processor; Neon/DO = sub-processors; families = data subjects/representatives. |
| Privacy risk assessment and DPIA (A.7.2.5 / B.8.2.4) | not met | — | DPIA (LOPDP Art. 42). |
| Privacy policy and notices (A.7.3.2–7.3.3) | partly | Notice only on the account-request form. | Full notice; version it like `privacyNoticeVersion` (`B/src/institutions/domain/entities/institution-request.entity.ts:64`, `W/src/shared/config/app-config.ts:3`). |
| Consent: obtain, record, allow withdrawal (A.7.2.3–7.2.4, A.7.3.4) | partly | Consent photo required and encrypted; no purposes/version/withdrawal record. | Section 2, Art. 8/21 actions. |
| Records of processing (A.7.2.8) | not met | — | Register of processing activities = LOPDP Art. 51 content. |
| Data-subject rights handling and deadlines (A.7.3.5–7.3.9) | partly (good) | `data-requests` with 15-day deadline, audit of every step. | Guardian channel; opposition/suspension/portability types. |
| Purpose limitation and minimization (A.7.4.1–7.4.2) | met in code | Section 2, Art. 10 evidence. | Drop dormant billing tables. |
| Accuracy (A.7.4.3) | met in code | Rectification flow and `PATIENT_UPDATE` audit; notes keep previous version for 24 h edits (`notes.use-cases.ts:73-75`). | — |
| Retention and disposal (A.7.4.6–7.4.8) | not met | Only files and rejected requests have TTLs. | Retention schedule + purge job. |
| Temporary files and de-identification (A.7.4.5, 7.4.9) | partly | Pseudonymous codes; anonymization option on deletion. | Clear `deviceId` on anonymized sessions; Authority authorization for anonymized health data. |
| Transfer and disclosure, including international (A.7.5.1–7.5.4) | not met | US hosting without a documented basis. | Section 2, Art. 55–61. |
| Processor obligations: customer agreement, sub-processor changes, assistance with rights and breaches, return/deletion (B.8.2.x, B.8.5.x) | organizational | — | Processor contract and sub-processor list. |
| PII sharing records (A.7.5.3–7.5.4) | partly | Exports and family reads are audited (`DATA_EXPORT`, `FAMILY_READ`). | Report of disclosures per child available to the admin and on access requests. |

---

## 8. ISO/IEC 29100:2024 — privacy principles

| Principle | Status | Evidence | Action |
| --- | --- | --- | --- |
| 1 Consent and choice | partly | Consent required to create a patient; no granular choices (tablet, family mode, voice, statistics). | Granular consent record. |
| 2 Purpose legitimacy and specification | partly | Purposes implicit in specs. | State them in the notice and consent. |
| 3 Collection limitation | met in code | Minimal patient record, no national ID. | — |
| 4 Data minimization | met in code | Codes instead of names across audit/exports/tablet; admin cannot see diagnosis. | JSON schema for `Event.payload`. |
| 5 Use, retention and disclosure limitation | partly | Disclosure limited by roles; retention undefined. | Retention schedule. |
| 6 Accuracy and quality | met in code | Rectification flow, catalogs for diagnoses/conditions (`schema.prisma:269-300`). | — |
| 7 Openness, transparency and notice | not met | No patient/guardian notice. | Notice. |
| 8 Individual participation and access | partly | Access/rectification/deletion via therapist; guardian read-only portal. | Guardian channel. |
| 9 Accountability | partly | Audit trail, versioned notice for centers. | DPO, records, DPIA, contracts. |
| 10 Information security | partly | Section 3. | MFA, CSP, retention, backups encryption. |
| 11 Privacy compliance | not met | No compliance monitoring. | Yearly privacy review; internal audit. |

---

## 9. ISO/IEC 25010:2023 — product quality model (evaluation frame, not conformance)

| Characteristic (sub-characteristic) | Status | Evidence | Action |
| --- | --- | --- | --- |
| Functional suitability | partly | Specs with FRs and e2e per feature; spec 110/111 partly pending (`D/03 -Especificaciones/Estado de especificaciones.md:12,30`). | Traceability matrix spec → test. |
| Performance efficiency | met in code (measured) | k6 runs and tuning notes (`B/src/prisma/prisma.service.ts:65-67`, `B/src/main.ts:25-29`, `W/PERFORMANCE.md`). | Re-run per release. |
| Compatibility (interoperability) | partly | CSV/PDF/ZIP exports; no standard clinical format. | Consider FHIR or at least a documented export schema for portability. |
| Interaction capability (incl. accessibility, user assistance) | not verified | Design docs claim WCAG 2.2 AA targets (the team context document); `lang="es-EC"` (`W/src/app/layout.tsx:20`). | Section 11. |
| Reliability (availability, fault tolerance, recoverability) | partly | Health checks, restarts, 503 fallback, offline tablets, rollout/rollback; backups not tested regularly. | RTO/RPO and restore drills. |
| Security (confidentiality, integrity, non-repudiation, accountability, authenticity, resistance) | partly | Section 3. Insert-only audit gives non-repudiation; device signatures give authenticity; MFA missing. | MFA, nonce, CSP, log shipping. |
| Maintainability (modularity, reusability, analysability, modifiability, testability) | met in code | Hexagonal modules, one use case per file, README per module, Prettier/ESLint, 28 e2e suites. | Unit tests for domain rules; CI. |
| Flexibility (adaptability, scalability, installability, replaceability) | met in code | Docker Compose, env-driven config, multi-tenant by RLS, `FileStorage` port for swapping the bucket (`B/src/common/storage/file-storage.ts`). | — |
| Safety (new in 2023: operational constraint, risk identification, fail safe, hazard warning, safe integration) | partly | Patient locked mode and PIN lockouts on tablets (`D/03 -Especificaciones/Acuerdos.md:40,51`); 503 degrades to offline. | A short hazard analysis (child locked in app, wrong profile loaded on a tablet, lost tablet). |

---

## 10. ISO/IEC 40500:2025 (WCAG 2.2) — web portal

Not tested in this review (no accessibility scan was run). The code shows intent and some structural conformance; a WCAG-EM audit of the portal and a separate review of the Android app are needed before claiming AA.

| Success criterion (WCAG 2.2) | Status | Evidence | Action |
| --- | --- | --- | --- |
| 3.1.1 Language of page | met in code | `W/src/app/layout.tsx:20`. | — |
| 1.4.3 / 1.4.11 Contrast | claimed, not verified | Design tokens documented at ≥ 7:1 text and 4.2:1 focus ring (the team context document). | Verify with a scan on every screen. |
| 2.3.3 Animation from interactions (AAA, but relevant to children/families) | met in code (claimed) | `prefers-reduced-motion` leaves opacity only (the team context document). | — |
| 2.4.11 Focus not obscured; 2.4.7 Focus visible | not verified | Focus ring token exists. | Keyboard walkthrough. |
| 2.5.8 Target size (minimum) | not verified | — | Check 24×24 px on table actions and chips. |
| 3.3.1 Error identification; 3.3.3 Suggestion | partly | `Field` component with `error` prop and explicit messages (`W/.../request-account-screen.tsx:146-175`). | Ensure errors are announced (aria-live). |
| 3.3.7 Redundant entry; 3.3.8 Accessible authentication | met in code (likely) | `autoComplete` on login/request fields; no CAPTCHA; password managers work. | Keep it that way. |
| 4.1.2 Name, role, value | partly | `aria-label` on icon buttons (`W/src/modules/appointments/presentation/components/therapy-reminders.tsx:34,77`). | Full screen-reader pass. |
| Tooling | partly | `eslint-config-next` includes jsx-a11y rules (`W/eslint.config.mjs`). | Add an automated a11y check (AccessLint/axe) to CI. |

---

## 11. IEC 62304 and ISO 14971 — does the software count as a medical device?

Assessment: **no, as currently scoped.** Necon stores therapy records, schedules appointments, runs AAC boards and simple activities, generates reports, and lets families practise at home. It does not diagnose, prescribe, dose, monitor physiological signals, or compute anything a clinician relies on to make a treatment decision. Communication aids and record-keeping/scheduling software are generally treated as assistive technology and administrative software, not medical devices (for example, the EU MDCG 2019-11 guidance excludes software that only stores, communicates or performs simple searches). Ecuador's ARCSA regulates medical devices; the team should obtain a written position from ARCSA or a regulatory adviser and keep it in the legal register.

Two triggers would change this answer and should be watched: (1) spec 111 "evaluaciones PRE/POST" with instrument scores, if the scores drive diagnosis or discharge decisions; (2) any feature that interprets session data to recommend treatment. If either ships, IEC 62304 (software life-cycle, risk-based classification) and ISO 14971 (risk management) become relevant, and the upcoming IEC 62304 Edition 2 ("health software") plus IEC 82304-1 would be the better fit.

Independently of classification, a one-page hazard analysis in the spirit of ISO 14971 is cheap and worthwhile for: child locked in patient mode without an adult, wrong profile synced to a tablet, deleted child still present on an offline tablet (`RetiredPatientCode` handles the online case: `schema.prisma:624-633`), and a lost tablet with cached boards.

---

## 12. Evidence summary by the topics the team asked for

| Topic | Verdict | Key evidence | First action |
| --- | --- | --- | --- |
| Access control | strong, MFA missing | default-deny guard, RLS with `NOBYPASSRLS`, cross-tenant e2e, assignment checks | MFA for admins |
| Cryptography | good where applied, incomplete coverage | argon2id, AES-256-GCM consent vault, TLS 1.2/1.3, SHA-256 token hashes | key versioning, encrypt biometric audio, SMTP TLS |
| Logging and audit retention | audit strong, server logs weak | insert-only `AuditLog`, codes not names, 50 MB rotation, no shipping, fail-open audit writes | log shipping + alerting, fail-closed audit |
| Secure development | good practice, no pipeline | hexagonal, specs, 28 e2e suites, validation, no CI/SCA/SAST | CI with audit and scanning |
| Backups | documented, not hardened | nightly dump, 14-day local, off-site manual, restore "once", unencrypted | encrypt + automate + drill |
| Supplier and cloud use | undocumented | Neon us-east-2, DO NYC, SMTP, voice service local, ARASAAC | DPAs, attestations, responsibility matrix |
| Incident handling | absent | no procedure, no alerting | procedure with LOPDP deadlines |
| Data subject rights | best module in the codebase | 15-day deadlines, ZIP export, transactional deletion, audit survival | guardian channel, more request types |
| Consent of guardians | required but thin | photo mandatory and encrypted; no version/purposes/revocation; voice owner's consent not stored | consent record v2 |
| Retention and deletion | deletion good, retention absent | per-patient erase; no purge of tokens, attempts, discharged patients, audit | retention schedule + purge job |
| Minimization | good | no national ID, codes, admin cannot see diagnosis | drop billing tables, schema for events |
| Transfer outside Ecuador | unresolved | all data in the USA, no basis, not disclosed | legal basis + disclosure + field-level encryption |

---

## 13. What a certification body would still require (none of this is code)

For ISO/IEC 27001:2022 (and 27701:2025 on top): a defined scope and boundaries (which organization, which sites, the platform and the center's tablets); leadership commitment and an information security policy; a risk assessment method, a risk register and a treatment plan; a Statement of Applicability justifying each Annex A control (the tables above are raw material, not an SoA); competence and awareness records; documented procedures (access, change, backup, incident, supplier, key management); operational records over time (access reviews, backup tests, vulnerability handling, incident drills); supplier agreements; internal audit and management review minutes; corrective actions; then a stage 1 (documentation) and stage 2 (implementation) audit with yearly surveillance. Certification would be issued to the operating organization, never to "Necon".

For LOPDP, independently of ISO: a designated DPO (Art. 48(1), mandatory for a municipal controller), the register with the Superintendencia (Art. 51), a DPIA (Art. 42), a processor contract (Art. 34), a documented basis for the international transfer and its registration (Art. 57/59), privacy notices and consent forms for representatives and adolescents (Art. 12, 21, 24), a breach procedure with 5/3/2-day deadlines (Art. 43, 46), a retention schedule (Art. 10 i), confidentiality agreements (Art. 47(10)) and alignment with the public-sector EGSI (Art. 38).

---

## 14. Ten code-level gaps worth fixing first

1. **No MFA for `SUPER_ADMIN`/`ADMIN`.** `B/src/auth/infrastructure/http/auth.controller.ts:84-91`, `B/src/auth/application/login.use-case.ts:20-65`. Add TOTP/WebAuthn, enforce for admin roles. (27002 8.5, 8.2; LOPDP Art. 37.)
2. **Temporary passwords mailed in clear and returned by the API.** `B/src/auth/infrastructure/mail/auth.mailer.ts:41-47`, `B/src/institutions/application/create-institution-admin.use-case.ts:46-50`. Replace with a one-time set-password link (reuse `PasswordReset`). (5.17.)
3. **Portal CSP allows inline scripts.** `W/deploy/nginx.conf:136-139`. Nonce-based CSP through Next.js middleware. (8.28.)
4. **SMTP TLS not enforced.** `B/src/auth/infrastructure/mail/auth.mailer.ts:26-35`. `requireTLS: true`, minimum TLS 1.2. (5.14.)
5. **Device signature replayable within its window.** `B/src/devices/infrastructure/http/device-auth.ts:40-46`; known at `D/03 -Especificaciones/Estado de especificaciones.md:73`. Add a nonce stored in Redis. (8.5.)
6. **Crypto coverage and key management.** Consent vault has no key id/rotation (`B/src/patients/infrastructure/security/encrypted-consent.vault.ts:8-30`); biometric voice samples and clips stored in clear (`B/src/voices/application/voice-job.runner.ts:37,62`); single `JWT_SECRET` (`B/src/auth/infrastructure/http/jwt.strategy.ts:15-19`). Version the vault format, encrypt audio, rotate keys. (8.24; LOPDP Art. 26, 37.)
7. **No retention purge.** `B/prisma/schema.prisma:116-148` (tokens, resets, attempts), `:214-249` (`dischargedAt`), `:583-603` (audit); only `B/src/jobs/application/jobs.worker.ts:124-129` and `B/src/institutions/application/platform.use-cases.ts:44` purge anything. Scheduled purge + per-center retention settings. (8.10, 5.33; LOPDP Art. 10 i.)
8. **Audit keeps clinical text after deletion and fails open.** `B/src/notes/application/notes.use-cases.ts:73-75` with `B/src/data-requests/README.md:67`; `B/src/auth/infrastructure/prisma/auth-audit.prisma.ts:29-32`. Hash or redact summaries by `patientCode`; fail closed on security-relevant actions. (8.15, 5.33; LOPDP Art. 15.)
9. **Backups unencrypted on a US droplet, off-site copy and restore test manual.** `W/deploy/README.md:174-192`, `W/deploy/compose.yaml:146-166`. Encrypt dumps, automate off-site copy and a monthly restore. (8.13.)
10. **Guardians cannot exercise rights or revoke consent themselves; consent record is a date + photo.** `B/src/family/infrastructure/http/family.controller.ts:20-77`, `B/src/data-requests/infrastructure/http/data-requests.controller.ts:28-39`, `B/prisma/schema.prisma:224-227`. Add a PARENT request endpoint, consent version/purposes/revocation, adolescent (15+) consent. (27701 consent/rights; LOPDP Art. 8, 13–15, 21, 62.)

Also worth doing soon, lower on the list: CI with `pnpm audit`, Trivy and the e2e suite (no `.github/` in either repo); `sslmode=verify-full` and an IP allow-list for Neon; moving the staff WebSocket token out of the query string (`B/src/sync/infrastructure/ws/live.gateway.ts:59`); clearing `deviceId` on anonymized sessions (`B/src/data-requests/infrastructure/prisma/patient-eraser.prisma.ts:73-78`); removing the dormant subscription/payment tables (`B/prisma/schema.prisma:893-940`).

## 15. Organizational gaps (one list)

- Designate the DPO (mandatory, LOPDP Art. 48(1)) and a security owner for the platform.
- Perform and record a DPIA (Art. 42) and a risk assessment with a treatment plan (27001 6.1).
- Register the processing and the international transfer with the Superintendencia (Art. 51, 59).
- Decide and document the legal basis for hosting children's health data in the USA (Art. 56/57/59), or relocate; disclose it in the notice.
- Sign the processor contract center ↔ platform operator (Art. 34) and collect DPAs and attestations from Neon, DigitalOcean and the SMTP provider; write the shared-responsibility matrix (27017).
- Publish privacy notices for centers, guardians and adolescents (Art. 12); produce consent forms including the voice owner's biometric consent (Art. 26).
- Write the retention schedule reconciling LOPDP conservation with health-record minimums (Art. 10 i; 27799).
- Write and rehearse the incident and breach-notification procedure with the 5/3/2-day deadlines (Art. 43, 46).
- Approve the policy set (security, access, crypto/key management, backup, logging, supplier, secure development, acceptable use, remote work) and the operating procedures (onboarding/offboarding, tablet loss, restore, key rotation).
- Confidentiality agreements for staff and both development teams (Art. 47(10)); awareness training.
- Align with the municipal EGSI (Art. 38) and obtain a written ARCSA/regulatory position that the product is not a medical device.
- Plan an independent review, a penetration test and a WCAG-EM accessibility audit before production; then internal audit and management review if certification is pursued.
