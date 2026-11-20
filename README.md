## Upstream refresh, published Nimi pre cohort & static Hosted Web candidate — 2026-11-21

Candidate **0.9.12-beta.1** merges upstream `presenton/presenton` `main` through commit `95964559dda6ffba5eab14e2b2db09b2c24a657a` (`150` upstream commits since `f9d3eba1a25712e25766b35a7af3b25f93ec1c01`, verified with `git merge-base --is-ancestor 95964559dda6ffba5eab14e2b2db09b2c24a657a HEAD`), upgrades all Nimi packages to the published npm `pre` cohort without local tarball overrides, and adds a static-hostable Web candidate for `https://presenton.nimi.xyz` (`public_slug: presenton`).

### Dependencies & lockfile

- Published npm packages: `@nimiplatform/app-tools` `^0.16.0-rc.10`, `@nimiplatform/sdk` `^0.24.0-rc.10`, `@nimiplatform/kit` `^0.24.0-rc.16` (with optional native `@nimiplatform/kit-protected-local-win32-x64` `0.24.0-rc.16`), `@nimiplatform/nimi-coding` `0.7.0`, `electron` `^45.4.1`, `vite` `^8.3.8`, `@vitejs/plugin-react` `^6.2.1`.
- Upstream runtime & security updates retained: Next.js `16.4.6`, `@tiptap/*` `3.30.5`, `sharp` `^0.35.5`, `@presenton/export-core` `v1.0.51`, `katex` `^0.18.2`, `follow-redirects` `^1.16.2`, `minimatch` `^11.0.3` (`11.0.8` resolved), `glob` `^14.0.3` (`14.0.6` resolved), `postcss-selector-parser` `6.1.5`, `systeminformation` `>=5.33.16`, plus relocated packaged font catalog `templates/assets/fonts.json` bundled into PyInstaller `nimi-worker.spec` and Windows resources.
- All `file:.nimi/local/...` overrides are removed from `pnpm-workspace.yaml`; `pnpm-lock.yaml` resolves exclusively against the public npm registry.

### Retained Nimi fork boundaries

- AI execution (`text.generate`, `image.generate`, `text.embed`) routes exclusively through the supervised Electron Host's SDK/Kit session (`electron/nimi/ai.ts` ↔ `servers/fastapi/services/nimi_channel.py`). Upstream local password/admin auth bootstrap, API/MCP key issuance, Presenton Cloud AI OAuth, ComfyUI/OpenAI/Gemini direct image SDKs, and browser-writable provider secrets remain disabled on user-facing paths (`POST /api/v1/ppt/images/test` is also blocked on remote Web alongside non-GET settings routes).
- Static Hosted Web (`vite.web.config.mjs`, `web/`, `build:web`, `build:web:release`, `.github/workflows/nimi-web-release.yml`) compiles the existing React presentation editor into an immutable `_releases/<version>/` asset layout with `nimi-web-bundle.json` and zero inline `<script>` tags (compatible with Nimi Hosted Web CSP `script-src 'self' 'wasm-unsafe-eval'`). `servers/nextjs/lib/web-workspace.ts` now provides an in-page workspace interceptor for business `fetch`, SSE `EventSource`, and `HTMLImageElement` `/app_data/*` + `/static/*` blob URLs over `io.github.nimiplatform.presenton.workspace.v1`, removing the root Service Worker requirement.
- **PC version compatibility**: Published Catalog `0.9.11-beta.10` declares only `app_access: ["runtime.consume"]` and predates `PresentonWebWorkspace` (`io.github.nimiplatform.presenton.workspace.v1`). Browser access requires updating PC Presenton to **`0.9.12-beta.1` or newer** on a Nimi Desktop/Runtime supporting Integration.

### Command & artifact verification

- `pnpm exec nimi-app sync` + `pnpm exec nimicoding sync --check` (`in_sync: 2`) + `pnpm exec nimi-app check --production`: passed.
- `pnpm test`: Host/Next TypeScript checks, **54 repository tests** (4 POSIX permission skips, including `hosted-web-bundle.test.mjs` standalone static server & CSP check), **1,436 Python tests** (7 skips), and **163 renderer tests** (2 symlink skips) passed.
- Windows production build & package (`pnpm exec nimi-app build --target windows-x86_64 --production` and `pnpm exec nimi-app pack --target windows-x86_64 --production`): produced `dist/nimi-app/io.github.nimiplatform.presenton-0.9.12-beta.1-windows-x86_64.nimiapp` (`1,875,318,713` bytes, SHA-256 `2384667dc47f84788f1b2a9ee6af2f9ac05d79224272e8704b86ab8b206c5f18`), with `_internal/templates/assets/fonts.json` verified inside `presenton-worker` and isolated standalone Next HTML probe passing.
- Static Hosted Web release archive (`NIMI_WEB_VERSION=0.9.12 NIMI_WEB_ARCHIVE=.nimi/local/nimi-web-0.9.12.zip pnpm run build:web:release`): produced `.nimi/local/nimi-web-0.9.12.zip` (`103,234,484` bytes, `503` entries, SHA-256 `a6b264201f9d320aaa603307c9db5f60c455b5bda07c973ecbcdf3b2ba7a678d`), passing `nimi-app-registry/scripts/hosted-release-verification.mjs` `verifyHostedBundle`.

### Real Windows PC + Static Web acceptance (2026-11-21)

- Resumed the existing Desktop-supervised registration (`dev-project-IFrtvBWc2jw5OFZHXlIriPSR`) with retained 4-draft workspace and configured Nimi AI models (`Gemma 4 26B Q4 text-only v2`, `MiniMax-H3-Image`, `EmbeddingGemma 2 text retrieval`).
- Verified upstream built-in template cloning (`POST /api/v1/ppt/template/swift/clone` → `201` with 9 layouts, `DELETE` → `204`) and the new two-stage template-first `/outline` workflow.
- On fictional topic *Solstice Harbor 7: Fictional Floating Tidal Observatory 2094 Trial Report* (`82d47fb4-4ba1-474d-b8ff-0312687aaf2d`), `Auto slides` generated 8 outlines; an 8-slide `Swift` attempt hit `Gemma 4 26B Q4` structured-output exhaustion and cleanly surfaced the non-retryable terminal alert without looping. Trimming to **3 slides** on the **`Standard`** template completed real slide + chart + `MiniMax-H3-Image` generation (`left_chart_right_title_description_5880`, `left_image_right_details_2189`, `left_image_right_title_strategy_cards_6875`).
- Edited presentation title to **Solstice Harbor 7 — Verified Revision** and Slide 1 heading to **Solstice 7 Revised** on PC, reloaded to confirm persistence, and exported PC `.pptx` (`4,882,567` bytes, 3 slides) and `.pdf` (`4,472,110` bytes, 3 pages) in `.nimi/local/acceptance-20261121/`.
- Served the built static Web bundle (`dist-web/`) at `https://127.0.0.1:4486/` with Hosted Web CSP and bounded coordination only. Completed Nimi Web login (`@halliday`), connected to `My PC` via `io.github.nimiplatform.presenton.workspace.v1`, read back **Solstice Harbor 7 — Verified Revision** and all 3 slides (**Solstice 7 Revised**, **Reef Telemetry**, **Current Analysis**) with rendered chart and generated images, reloaded and reconnected without re-triggering AI generation (zero CSP/console errors), and exported Web `.pptx` (`4,882,566` bytes, 3 slides, `11` embedded media items) and `.pdf` (`4,472,110` bytes, 3 × `960×540` pages, rendered to PNG and visually inspected).
- **NOT-VERIFIED**: Production GitHub Release tags (`v0.9.12-beta.1`, `web-v0.9.12`) and repository admin token settings, Registry PR admission and live `https://presenton.nimi.xyz` CDN deployment, Catalog installation of the packaged `.nimiapp` on non-dev production Runtime, Smart HTML sandbox generation on this model cohort, and macOS `arm64` packaging on this Windows host.

---

Earlier development record (2026-11-14): SDK **0.24.0-rc.2**, Kit **0.24.0-rc.4** (Android coordination fix) / native **0.24.0-rc.1**, App Tools **0.16.0-rc.2**, Nimi Coding **0.7.0**, and Electron **45**.

## Web workspace development — 2026-11-14

The browser keeps the original Next.js presentation editor. Official Kit Web login and a directly admitted Runtime session consume the App's public Integration provider, `io.github.nimiplatform.presenton.workspace.v1`. The Desktop-supervised Presenton Host continues to own Python, its original workspace ID, documents, tasks, model selection, optional business credentials, and export processes. The browser receives neither Host credentials nor a generic Runtime/AI proxy.

The App-owned service worker transports existing business API requests, SSE, images and document bytes through bounded Integration operations. Uploads use 64 KiB chunks (128 MiB per request); responses use at most 128 KiB chunks. Objects bind to Runtime's `consumerRef`, not display names. A document captures one Runtime scope; a changed scope requires an explicit reload. Web generation streams never automatically resubmit after a connection failure. Exports await the complete file transfer before offering a Blob download. Models and service credential settings remain in the PC interface.

Start the existing Native registration, then run `pnpm dev:web -- --realm local`. The local declaration is `https://127.0.0.1:4486/`, with callback at `/` and client ID `io.github.nimiplatform.presenton.web.dev`. Set `NIMI_WEB_TLS_KEY` and `NIMI_WEB_TLS_CERT` in ignored `.env.web.local` to trusted certificate files. The custom Next HTTPS server uses App Tools' public source configuration and bounded, cookie-stripping Realm coordination paths. It has no PC backend state. Native and Web use separate Next build directories. Approve the source in Home, then grant its five workspace operations under Integrations. Do not create a replacement Native registration.

Current engineering verification: App Tools check, Host build, TypeScript, **21 repository tests** and **65 renderer tests** pass. The earlier full **905 Python tests** passed; after aligning the sparse `update_slide_element` patch schema with its existing Pydantic/handler semantics, **96 relevant Python tests** passed, including actual exported-schema validation and rejected invalid updates. The App retains required target fields, bounds and unknown-field rejection. Only nullable partial-update properties became explicitly optional; Runtime validation was unchanged.

Real Windows development acceptance resumed the original Native registration and retained workspace through CDP 58483. Native PDF/PPTX exports completed (`.nimi/local/presenton-web-carrier-native.pdf`, 13,754 bytes; `.pptx`, 10,352 bytes). Web completed official Halliday login, Home source approval and all five `workspace.v1` permissions. The user-approved local public certificate is now trusted by Windows; service-worker registration and the actual business UI passed without a TLS bypass.

The original recovered Web draft `482368e2-ab6b-4135-bf8f-16ecbca63ed0` was renamed **Presenton Web acceptance — Saved**, edited and reopened. A real 2,440,121-byte image upload was inserted and persisted. Browser exports completed as `.nimi/local/presenton-web-edited.pdf` (1,729,804 bytes, one rendered page) and `.pptx` (830,680 bytes, one slide with the uploaded image). PPTX package contents were inspected; Office rendering was not performed. One original Gemma attempt and one explicitly selected existing cloud attempt failed `ai-tool-call-invalid`. After the sparse-patch schema alignment, the same short task with restored Gemma succeeded: **Rainy Library** replaced the heading and persisted with the image unchanged. These exports precede that final AI heading edit. A real disconnect/reconnect required explicit reload and reopened the saved heading and image; in-flight interruption is not claimed.

A concrete Electron Undici paused-EOF assertion had stalled the original PC business responses. The App HTTP boundary now uses bounded Node HTTP streams, cancellation and decompression, with closing/paused-response and gzip regressions. The original uncertain create request was inspected and recovered rather than replayed. Native permissions refresh also awaits session preparation before restarting the App worker. No shared Runtime or installed package was patched.

Phone review exposed account/header and sidebar overflow. The responsive header, mobile navigation and accessible editor actions are repaired. The actual Android library and editor fit their device screen; Chrome phone emulation has not yet been rechecked after this fix. **Smart sandbox visual output, in-flight interruption, packaged Native installation and public release remain NOT-VERIFIED** for this candidate. Earlier evidence below retains its exact version and scope.

## Android local development candidate

This is a Capacitor Android development carrier for the complete live Next editor at **https://127.0.0.1:4486**, backed by the original running PC App. It is **not an offline or independently distributable renderer**. The main frame uses `createMobileNimiAppSession`, the official Kit Android plugin, system-browser sign-in and a private-use callback. The HTTPS UI address is not its source identity: package `ai.nimi.apps.presenton.dev`, client `io.github.nimiplatform.presenton.android.dev`, origin `ai.nimi.apps.presenton.dev:/`, callback `ai.nimi.apps.presenton.dev:/oauth/callback`. Admission also checks the actual debug signing certificate. The source requests `runtime.consume`, `integration.consume` and the App's three existing capabilities; Home grants its five PC workspace operations separately.

The identity-owned outer page retains selected File objects and unsubmitted upload/chat drafts in memory while Runtime disconnects. Each Runtime scope gets a new business iframe and immutable App channel. Old callbacks cannot acquire a new client. After a system picker returns, **Use selected files** is explicit; if the editor was replaced, reopen the intended upload action first. Drafts clear on identity/PC change and do not survive a full App restart. Generation-on-mount routes return to the library after reconnect rather than replaying a task. PDF/PPTX transfer completes into an App-owned temporary file before Android's system Save picker opens. The outer page reports the actual save result even if opening the picker disconnects Runtime. The system plugin handles only export bytes and filenames; it receives no Runtime credentials.

Set `JAVA_HOME` to JDK 21 and `ANDROID_HOME` to the installed SDK, then run `pnpm build:android:local`. Each successful build creates a new timestamped archive under `.nimi/local/android-candidates/`, retaining older candidates. The local debug manifest trusts only the existing public development certificate for `127.0.0.1`, and allows HTTP only on the exact loopback hosts used by the declared local Realm API (`127.0.0.1:3002`) and official sign-in (`localhost:3000`). Kit's native transport separately pins the configured Realm origin and allowed coordination paths. The private TLS key is never bundled. The device must be able to reach the exact editor/Realm/official-login loopback services through the coordinated local test setup. The first installed candidate reached the official Kit sign-in control but failed `NIMI_MOBILE_NETWORK_UNAVAILABLE`: its debug network policy blocked the actual App Tools-resolved `http://127.0.0.1:3002` Realm. The debug-only loopback policy is corrected in the subsequent candidate. The corrected `20261114T090702Z` APK then completed real system-browser Android-source login, Home source approval and all five v1 operations. Its library showed the original three drafts; the original `482368e2-ab6b-4135-bf8f-16ecbca63ed0` document rendered **Rainy Library** and the same 1024×1024 uploaded image. No AI was submitted from Android.

Both real Android Save flows completed into the selected Downloads destination, then returned to the original document route through a new Runtime scope with the outer Saved message. Retained outputs in `.nimi/local/ui-audit/2026-11-14-android/` are **Presenton-Web-acceptance-Saved.pdf** (1,741,350 bytes; one 960×540 page, rendered and visually inspected) and **Presenton-Web-acceptance-Saved.pptx** (830,933 bytes; one slide, Rainy Library text and the original 820,090-byte image). PPTX Office rendering was not performed. The manually inserted heading's pre-existing overlap with the image was preserved, as the AI edit explicitly requested unchanged layout; this is not a polished-slide design acceptance. A separate Android test draft `379fc794-63df-49d7-83ce-99f26027aed8` was created once, preserving the original three drafts. Android Photo Picker → Browse → Downloads returned the same 2,440,121-byte PNG. Identity retained it while Runtime disconnected; Use selected files stayed disabled until the intended image Upload action was reopened, then an explicit confirmation uploaded the new `be478983…` asset. Its 1024×1024 image decoded, the library contained exactly the original three drafts plus this one, and reopening preserved both the new name and image. The mobile all-tools entry was misleadingly labeled AI Assistant; it is now Slide tools, with a double-tap image-editing hint. The renamed Slide tools entry and double-tap instruction were then observed on the real Android screen.

The later `20261114T092953Z` APK consumes Kit **0.24.0-rc.3** solely to diagnose a separately observed first-connect failure on other Android Apps. The full Kit package was built from Nimi source `601ceb8298d8db8b179a8891898d8bf4ff2afe09` plus the bounded diagnostic change. Archive comparison against frozen Kit rc.1 shows only Android Java, package version and CHANGELOG differ; compiled JS/types/styles and the three other full tarballs are unchanged. No cookie, redirect, retry or authorization behavior changes. Debug-only failure logs contain finite endpoint/method, phase, exception classes, new-connection/acquisition flags, cancellation and elapsed time, never URLs, headers, content or exception messages. Kit's three mobile lifecycle tests, package build, actual Android Java compile/assemble, App typecheck/check and the original Native four-draft library readback pass. The rc.3 device diagnosis reproduced the failure after more than 60 seconds of natural idle: the first explicit Disconnect → Connect failed with `endpoint=context method=GET phase=request-headers-sent exception=IOException cause=EOFException newConnectionAttempted=false connectionAcquired=true canceled=false elapsedMs=2`. A second explicit Connect recovered the original four drafts; no business request was replayed.

Kit **0.24.0-rc.4**, consumed by APK `20261114T094234Z`, fixes this specific native coordination failure with zero retained idle HTTP connections. Automatic retries remain disabled, as do cookies and redirects; the direct Runtime peer and App business transport are unchanged. Four real OkHttp loopback regressions reproduced the old reused-socket EOF, passed with the new policy, and covered single POST delivery on failure, cancellation and cookie/redirect isolation. The same four cases also passed through the consuming Android project's `:nimiplatform-kit:testDebugUnitTest`, with actual Java compilation and APK assembly passing. The original Native registration reopened all four drafts after the package switch. The final rc.4 APK then passed the real Android comparison: after official login and approximately two minutes of natural idle (09:49–09:51 UTC), the first explicit Disconnect → Connect restored My PC, the dashboard and all four drafts. No second connect, AI generation or export replay was needed; the PID-filtered safe failure log was empty. The earlier rc.3 same-path EOF at 09:34:19 UTC remains recorded as the before-fix evidence. This closes the observed idle-reconnect failure without claiming every possible network interruption.

Earlier SDK 0.22.2 / Kit 0.22.1 upgrade verification: public-registry installation, frozen-lockfile installation, App Tools checks and the applicable type/Host build checks passed. Desktop-supervised macOS development opened the retained presentation library and settings. New model-output journeys and packaged installation were not rerun; earlier evidence below retains its stated versions and scope.

[App introduction and usage](NIMI_APP.md)

## Windows candidate 0.9.11-beta.8 — 2026-10-13

Unreleased candidate with SDK 0.21.0, Kit/native 0.19.3, App Tools 0.12.2 and Nimi Coding 0.6.5. Type checks, 13 repository tests, 903 Python tests and 65 renderer tests pass. The frozen Windows API initialized a Unicode workspace. Portable resource/executable paths, UTF-8 worker startup, Windows export-path parsing and production tracing are repaired. Download URLs normalize Windows separators while retaining the file-download ownership guard. Development backend state is excluded from the package and rejected if present. Optional debugging source maps are omitted to keep the Windows archive below GitHub's 2 GiB limit.

With the installed Nimi 0.2.3-rc.1 diagnostic Runtime, the earlier `ai-output-invalid` was identified as `text_json_schema_min_length`: the fixed-count outline contract requires 100–1200 characters per slide, while its prompt only specified an approximate word count. The prompt now explains the same existing limits, including for Chinese. The ordinary layout selector now receives each template's schema, as the Markdown path already did, and is instructed to fit the supplied facts rather than invent entries for fixed slots. No schema or Runtime output validation was weakened. Exhausted template-content validation is a terminal business error, so the SSE client does not automatically regenerate an entire presentation after its bounded correction attempts fail.

The supervised five-slide Standard workflow completed with `qwen3.8-max-0902`, persisted, reopened, and exported PDF and PPTX. The original draft `33586155-b783-42d2-a082-aad47cf79c18` and `.nimi/local/windows-ai-original.pdf` / `.pptx` are retained. Its content quality is **not accepted as fact-accurate**: it inferred responsibilities and future work, invented an adherence metric, and put an overlong Chinese title in a fixed-height card. These are visible model/template draft limitations, not silently corrected AI output.

Through the product's Duplicate and editor controls, a separate copy `680a2dd8-5c3d-4d61-bed4-bfeea12f7286` was renamed “蓝鸟743 — 人工排版验收副本” and three overlong headings were shortened. A real `qwen-image-3.0-pro` call generated a 2400×1792 bluebird image, which replaced the copy's image and survived a restart. The final `.nimi/local/windows-ai-edited.pdf` (5 pages, 3,014,706 bytes) and `.pptx` (5 slides, 3,292,675 bytes) contain the saved edits and the subsequently retrieved notebook icon; PDF rendering confirms the repaired title spacing and visible icon, and the PPTX contains the generated image. This verifies generation, user editing, persistence and export, not automatic factual correctness. The original fixed text-box sizes and template line heights were preserved.

Failed outlines retain their error and full prompt/settings; reopening does not replay paid AI. The real failed draft restored five slides and Simplified Chinese, and Try again created a separate request. Image and icon pickers now remain centered: a conflicting inline `translate: none` had overridden their Tailwind centering. The former image `ai-config-invalid` was resolved through public AI settings.

Icon search passed against installed Nimi **0.2.3-rc.2**, source `59d459c26`, including Runtime fix `4d629a353`. Runtime retains the public 16-input contract and splits the exact Dashscope v3/v4 transport into batches no larger than the provider's [documented limit of 10](https://help.aliyun.com/en/model-studio/embedding-interfaces-compatible-with-openai). The App retains its ordinary 16-input batches. The initial real index request timed out after 576 vectors were saved; one explicit recovery query reused that cache, returned HTTP 200 with 40 notebook-related icons, and the chosen `/static/icons/regular/notebook.svg` was applied, saved, restored after reload, and exported in both five-page outputs. The App reports typed failures rather than presenting a failed request as an empty successful search. Candidate installation and public release remain **NOT-VERIFIED**. The publisher declaration is present. Earlier macOS evidence remains scoped to beta.7.

## Catalog App support for source Runtime — 0.9.11-beta.7

This release resolves public npm Kit/native **0.19.2** in the frozen lockfile,
with SDK **0.21.0** and App Tools **0.12.0**. Launch the installed Catalog App
through Nimi Home in either the supported production environment or the macOS
source-development environment. The App always loads its own packaged native
carrier. Source Runtime peer identity and installed-App/session admission remain
verified; no workspace carrier replacement or trust-check bypass is used.

Catalog AI acceptance passed on macOS arm64 using the official [0.9.11-beta.7 Release](https://github.com/nimiplatform/presenton/releases/tag/v0.9.11-beta.7), [admitted by Registry PR #79](https://github.com/nimiplatform/nimi-app-registry/pull/79), downloaded and updated through source Nimi Home. The two-slide AI-generated document and its outline edits survived the Catalog update. In beta.7, a new Nimi AI image edit generated and saved a teal-bird background. After quitting and relaunching from Home, the renderer port changed from 59878 to 60174 and the image still loaded. Saved asset references are relative to the App proxy. PDF and PPTX exports from the restarted App both contain two slides; the PDF was rendered and visually checked, and the PPTX contains the exact generated image bytes.

Local screenshots and final exports are in `.nimi/local/released-dependencies-20261012/catalog-presenton-0.9.11-beta.7*`; the accepted document is `b3878a21-ba83-4a2e-a763-88e072b7399d`. This fixes beta.6's ephemeral-port image references for new image edits; older broken references can be replaced through the editor. Windows interactive acceptance and other unrun AI paths remain **NOT-VERIFIED**. These results supersede the earlier Catalog limitation; historical results below retain their stated versions.

# Presenton on Nimi

Presenton keeps its Next.js slide editor, Python presentation workflows, templates,
document import, and PDF/PPTX export. Nimi supplies App authorization, AI model
configuration, text and image generation, and embeddings through its public
App Tools, SDK and Kit packages.

This adaptation starts from Presenton **0.9.11-beta**, commit
`f9d3eba1a25712e25766b35a7af3b25f93ec1c01`, from
[presenton/presenton](https://github.com/presenton/presenton). The original
[Apache-2.0 license](LICENSE) and [NOTICE](NOTICE) remain in place. The adaptation
repository is [nimiplatform/presenton](https://github.com/nimiplatform/presenton).

## Development

Use Node 24+, pnpm 10.34.5, Python 3.11 via uv and a matching running Nimi.
Version 0.9.11-beta.5 selects the published npm SDK **0.21.0**, Kit/native
**0.19.0**, App Tools **0.12.0** and Nimi Coding **0.6.5**. The frozen root
workspace lock records registry integrity, with no Nimi local package override.
The App retains its Beta version stage.

```sh
pnpm install --frozen-lockfile
pnpm setup:backend
pnpm setup:export
pnpm exec nimi-app check
pnpm dev
```

`setup:export` installs the pinned Presenton export engine and its matching
Chromium. `dev` asks Nimi Desktop to supervise the Electron Host and uses the
real Next.js renderer at `http://127.0.0.1:6016`. Python belongs to that Host's
lifetime. Renderer debugging attaches to the exact loopback CDP endpoint printed
by this launch.

Continue the same development data after a restart:

```sh
pnpm exec nimi-app dev --list-registrations
pnpm dev -- --resume <current-selector>
```

Refresh the list after Desktop restarts. Selectors are temporary; do not save one
in project configuration. A plain fresh `dev` registration creates a separate
data audience. Next.js changes use its normal development reload; after Python
changes, stop and resume the same development registration. Routine acceptance
uses `pnpm dev` and its CDP target. Full build/pack is a separate final workflow
check, not a prerequisite for every iteration.

```sh
pnpm test
# Final artifact workflow on its matching macOS arm64 host:
pnpm exec nimi-app build --target macos-aarch64
pnpm exec nimi-app pack --target macos-aarch64 --production
```

The current declared build target is macOS arm64. Normal system-Runtime
installation, public release/Registry admission and Windows execution remain
separate acceptance stages.

`pnpm test` and `nimi-app test` share the same checks: Host and renderer types,
repository tools, the full Python suite, and renderer unit tests. Python tests
use the Nimi worker's business contract; retired direct-provider image/config
tests are replaced by Nimi request, cancellation and configuration coverage.
The workspace uses `pnpm-lock.yaml`; the old root and renderer npm lockfiles are
removed. See [.github/workflows/README.md](.github/workflows/README.md) for CI
commands and the current local-package prerequisites.

## Using AI

Open **Settings → AI models** and select the required capabilities through Kit's
shared model configuration surface:

- **Writing and editing:** a text model that supports the request's JSON Schema,
  function tools and, for visual template work, image inputs.
- **Generated images:** the image model used for presentation artwork.
- **Icon and document search:** embeddings for the App's icon index and saved
  presentation notes.

Provider credentials and authorization are managed in Nimi. A catalog entry is
not a guarantee that every optional text behavior is supported. Unsupported
requests fail explicitly. If a Nimi connection is removed or recreated, select
its current reference in AI models; the App does not infer a replacement by
provider name. Internal legacy provider defaults are retired; default generation
controls come from Nimi AIConfig, while explicit request controls remain subject
to that model's supported contract.

The existing Standard and Smart workflows, editing tools and native presentation
formats remain App-owned. Completed outlines are restored when reopening a draft;
explicit regeneration creates and navigates to a new draft ID. Unvalidated partial
AI output is not a completed outline.

## Optional business services

Pexels/Pixabay stock images, external web search and Presenton Community remain
optional App services. Their settings are separate from Nimi AI configuration.
Presenton Cloud sign-in is retained for community features; it is not the App's
local login or an alternative AI route. This phase does not expose Presenton
operations to other Apps through Nimi Integration.

Usage analytics are disabled by this adaptation. The old standalone provider-key,
password-login and cloud-AI-proxy routes are absent from the active App. The
supported entry point is the supervised root `pnpm dev` workflow.

## Ownership and data

The verified Electron Host owns the SDK/Kit service objects. Python requests only
three fixed model operations over its private UTF-8 process channel; tools,
retries for presentation schema validation, templates and project state stay in
Presenton. No Nimi credential or generic protected forwarding endpoint is exposed
to the worker. Session invalidation cancels outstanding AI work, stops the worker
and its child processes, and destroys the old renderer before a new scope opens.

A workspace identifier in Nimi's managed, protected App storage selects the App's
own durable directory:

`~/Library/Application Support/Presenton Nimi/workspaces/<workspace-id>/`

That directory contains SQLite presentations, uploads, images, exports and
retrieval caches. It is separate from Nimi's Electron technical profile and is
retained when the App is uninstalled. Presentation notes are App working data,
not canonical Nimi Agent Memory. Source notes remain durable independently of
vectors, and indexes are isolated by Runtime-issued embedding space. Business
helper HTTP access uses an ephemeral Host key that is retired with its scope.

## Current verification

Verified on macOS arm64 with source Nimi Runtime/Desktop on 2026-09-27. Routine
acceptance used `pnpm dev` and the exact Desktop-supervised App CDP target.
The matching generated reference also passed real session access, Kit model
configuration and text consumption with this package cohort.

The following Presenton journeys produced actual persisted results:

- Kit AI configuration and session recovery across Host/Runtime restarts.
- English and Chinese structured outlines, followed by a three-slide Standard
  presentation with generated artwork, speaker notes, and a table.
- AI tool editing of a slide title, preserving the other content and layout.
  Presentation-note retrieval used Nimi embeddings and a Runtime-scoped index.
- Chat cancellation propagated to Runtime; the next chat request completed.
- A two-slide Smart presentation, rendered in the original editor.
- PDF and PPTX export and download. The three-page PDF and rendered PPTX were
  inspected for text, images, and tables. PPTX font substitution still depends
  on the viewer's installed fonts. After fixing the export browser's display
  refresh dependency, these exports completed in roughly eight seconds locally.
- Reimporting the exported PPTX, three-page previews, and visual AI conversion
  into the editable **Nimi Office Energy Visual** template.
- Optional public Community browsing, separate from Nimi authorization and AI.

The template conversion path now propagates Nimi failures instead of reporting
a copied source layout as AI success. App template schemas preserve their JSON
Schema validation constraints without redundant OpenAPI discriminator metadata.
Internal fixed generation limits and model-name guesses no longer override Nimi.

App Tools checks, Host/renderer type checks, focused Python regressions, App tests
and the macOS arm64 build stages passed. Final `pack --production` also passed
after fixing standalone dependency tracing and native resource packaging. The
package contains the standalone Next server, frozen Python worker, export engine
and pinned Chromium. Full artifact building is the final workflow check; it is
not repeated for routine development.

Shared Nimi improvements remain in their actual owners: the Codex text adapter
preserves non-strict schemas and supports tools plus structured output with
terminal validation; the native carriers preserve `AI_CONNECTOR_NOT_FOUND` as a
recoverable configuration failure. Runtime module tests, native error tests,
Kit's suite (1,418 passing tests, one skipped) and package/boundary checks passed.
The App Tools generator now fails the build on native signing errors instead of
accepting the packager's silent best-effort default. Its suites passed 142 tests
with 12 platform-specific skips; Presenton's App-owned packaging script includes
the same correction. This generator correction is in Nimi source; the existing
local App Tools archive listed below remains the selected consumer package.

The first local archive, `0.9.11-beta`, was imported and installed through
Desktop. Native trust is `production-unsigned` with an ad-hoc seal and
`current-user` launch; Developer ID and notarization are absent.

Its first preview exposed excessive per-file durability flushes in Runtime's
disposable native-bundle probe. Runtime now omits those transient flushes while
retaining durable installation staging and all archive, signature and integrity
checks. Package and installation tests pass, including whole-bundle tampering
and probe cleanup; the same App's native preview then completed within 82 seconds.

The first installed launch exposed two App packaging defects: dereferencing
Next.js standalone pnpm aliases broke dependency resolution, and frozen Python
looked for Alembic scripts beside its executable rather than in the Host-provided
business resource directory. Version `0.9.11-beta.1` preserves the standalone
module graph and uses the existing resource-path helper. Startup failures also
report their cause instead of silently closing the App.

The repaired local archive is
`dist/nimi-app/io.github.nimiplatform.presenton-0.9.11-beta.2-macos-aarch64.nimiapp`
(1,821,816,981 bytes), SHA-256
`53b8dce90c5f78c7831740805b2b66d5502589cfa61227b4d4e19d0f31f35b15`.

Version `0.9.11-beta.1` updated successfully through Desktop's Imported
source and launched with **Nimi Access ready**. After selecting and saving the
current Codex connection, the installed App generated a real two-slide Standard
deck, including Nimi-generated imagery, and saved its title as
“Ten Minutes of Reading — Nimi” (presentation
`ddf94ae4-99da-49ee-9a72-f88c2be40053`). The first outline attempt produced no
persisted outline and is not counted as a successful result.

Installed PDF export exposed an additional App packaging issue: Next standalone
changes cwd, causing the export lookup to select its incomplete traced copy of
the export package. The full App-owned export package loads correctly. Version
`0.9.11-beta.2` supplies its explicit path from the Host, just as the Python helper
already does. The real `0.9.11-beta.1` → `0.9.11-beta.2` update passed;
Desktop launched the new installed package with Nimi Access ready. The same
presentation, title, two slides and four generated images survived and reopened.
Both PDF and PPTX then exported successfully through the installed App and its
native Save dialogs. The two-page PDF was rendered and visually checked; the
PPTX contains two slides, its archive integrity check passed, and both rendered
pages were visually checked using the App's bundled fonts. Without the template
font installed in the viewer, PPTX font substitution can change spacing; PDF
preserves the exported appearance.

Installed export samples are `.nimi/local/presenton-beta2-reading.pdf` and
`.nimi/local/presenton-beta2-reading.pptx`. These are actual App exports, not
fixtures. Installed acceptance used native UI only; no production CDP was added.

**NOT-VERIFIED:** ordinary system-Runtime/Catalog installation, public release,
Community account linking/publication, and optional external search/stock-photo
credentials. No cross-App Integration operations are exposed in this phase.

The local development package inputs used for acceptance are:

| Archive | SHA-256 |
| --- | --- |
| App Tools 0.11.4 | `60132e42fa608a6ef4eecbe5234e1bcbb10d72e47629916b7c21aba4d2953636` |
| SDK 0.19.0 | `87142639077f3ce4949d3fa2ac53f478c1b5ec67c2d7264ed9871373a7f90e97` |
| Kit 0.16.0 | `017e9ed0d467355e20d10fef17bea424a63f1718ba751e76b9d9f316d0eab00a` |
| Native Darwin arm64 0.16.0 | `a7bcf6c63652570e3b09114b33461da2876dce3f26ee0bab743649888a7ec103` |

The native package includes the source-development support needed for this local
cohort. These results and archives do not imply public npm availability or
Registry admission. The omitted safety declaration remains explicitly undeclared
for local development and import; public admission is a separate publisher step.

## Source fixes after installed acceptance

The source now forwards cancellation of an image request to the Host and releases
its worker request without interrupting other images. Icon search indexes one
record per base icon, then applies the selected weight when building the URL.
The bundled 1,512 icons need 95 embedding batches plus one query on a cold index,
down from 567 batches plus one query. Catalog insertion is atomic, so a failed
initialization can retry without keeping a partial catalog.

The shared `pnpm test` / App Tools test entry passes Host/renderer type checks,
12 repository tests, all 892 Python tests and 61 renderer tests. The Python suite
has no collection exclusions for retired providers: their obsolete adapter tests
have been replaced by tests of the Nimi request and configuration boundaries.
CI and `test-local.sh` also retain ESLint and Cypress component checks: lint
reports zero errors (79 existing warnings), and all three component cases pass.
The dialog case checks its final position after the entrance animation, using
Tailwind 4's current positioning behavior.

These are source and regression results. The installed `0.9.11-beta.2` artifact
described above predates these fixes. Real model cancellation and cold icon
indexing for the fixed source remain **NOT-VERIFIED** because the official
launcher reported that Nimi was not running. Hosted App CI also remains
**NOT-VERIFIED** with the current local development package inputs.

## Support

For model authorization failures, reauthorize the selected connection in Nimi
Cloud Services. If a connection was recreated, select its current reference in
Presenton Settings → AI models. Reopen Presenton from Nimi for a retired session.
For App issues, include the App version and failed action in the repository's
issue tracker; exclude credentials and private presentation content.

## Published Nimi dependency update — 2026-10-12

[Presenton 0.9.11-beta.5](https://github.com/nimiplatform/presenton/releases/tag/v0.9.11-beta.5)
is published as an immutable macOS arm64 Release and admitted through
[Registry PR #71](https://github.com/nimiplatform/nimi-app-registry/pull/71).
The Registry update channel remains `beta`. This update uses public npm SDK
`0.21.0`, Kit/native `0.19.0`, App Tools `0.12.0`, and nimi-coding `0.6.5`;
the release lockfile has no local Nimi tarball or source-workspace overrides.
These results supersede the public-release and admission limitations of the
earlier local-package acceptance described above.

Host and renderer type checks, 12 repository tests, 894 Python tests and
61 renderer tests passed. The production build, package validation, managed
release workflow and Registry candidate/finalization checks passed. The
Registry verified the published artifact hashes and provenance.

Real macOS acceptance used Desktop-supervised Electron with the public npm
dependencies. Presenton generated and saved a two-slide Standard deck with
two generated images, restored it after reload, and exported PDF and PPTX
through its Export menu. The two-page PDF was rendered and visually checked;
the PPTX archive passed integrity checks and contains two slides with editable
text. The accepted presentation is `dba0d897-cd34-4143-8cf6-2cea089436d6`;
local exports and screenshots are under
`.nimi/local/released-dependencies-20261012/`.

**NOT-VERIFIED:** AI use in the released Presenton package installed through
Home Catalog. In this source-development environment, a released Vane package
downloaded, installed and launched through Catalog, but its published native
carrier rejected the development Runtime with `runtime-service-untrusted`.
The existing Host/Kit carrier selection and Runtime trust profile need a
platform-level correction for this test scenario; that logic was not changed
by this App update. The user explicitly approved completing publication and
admission with this limitation recorded. This release declares only macOS
arm64; no Windows acceptance is claimed.
