# 0.9.11-beta.9 — Complete Windows renderer dependencies

Uses a hoisted dependency layout with the unchanged frozen package versions.
The previous Windows package flattened Next's pnpm links and failed to resolve
`@swc/helpers/_/_interop_require_default` outside the checkout. Development now
resolves Next from its package, and production packaging starts a copy of the
actual standalone resources in an isolated temporary directory. This check
reproduced the beta.8 failure and passes on the corrected Windows package.

Type checking, 13 repository tests, 903 backend tests and 65 renderer tests pass.
The Windows production build and package complete successfully. Through the
existing Desktop-supervised development registration and its own CDP target,
the saved five-slide Chinese deck, generated image and selected notebook icon
reopened successfully. Earlier AI generation, editing and PDF/PowerPoint export
evidence below retains its stated scope and content-quality limitations.
On October 14, Home imported the complete Windows beta.9 package from bc15fb2b
and launched it against installed Nimi 0.2.4-rc.1. The isolated installed
workspace opened correctly; the original development workspace remains intact.
A new two-slide Chinese Q58 request completed outline and slide generation.
Renaming saved successfully. Native PDF and PowerPoint export produced
`.nimi/local/windows-installed-beta9.pdf` (235437 bytes, two 960-by-540 pages)
and `.pptx` (113515 bytes, two slides, valid ZIP CRC). Both PDF pages were
rendered and visually checked; Chinese glyphs and layout remain readable.
Poppler reported a Type 3 glyph bounding-box warning without an observed
rendering defect. PowerPoint desktop rendering was not tested. Normal close
and Home relaunch restored the renamed deck and both pages.

The generated first page used English despite the selected Chinese language;
its original output is retained as a content-quality limitation. The second
page preserved the supplied Chinese collection rules. This bounded installation
and export acceptance does not certify generated content. The annotated
v0.9.11-beta.9 tag points to the tested implementation. The [formal release](https://github.com/nimiplatform/presenton/releases/tag/v0.9.11-beta.9)
is immutable and published for both platforms. Exact published packages, source
licenses and build provenance passed Registry preparation; [candidate #101](https://github.com/nimiplatform/nimi-app-registry/pull/101)
replaces withdrawn #96. Human admission and Catalog installation remain pending.

# 0.9.11-beta.8 — Windows presentation workflows

Adds Windows build targets, native resource paths and the packaged Python executable suffix. Fixes the reproduced Python startup deadlock, Windows drive-path handling, download URL separators and npm launcher invocation. The Host supplies Next's private backend-state path explicitly; production tracing excludes development state and packaging rejects its presence. Optional JavaScript/CSS debugging source maps are omitted from resources to fit GitHub's per-asset limit. Uses public SDK 0.21.0, Kit/native 0.19.3 and App Tools 0.12.2. Packaged API startup and supervised five-slide Chinese AI generation, editing, reload, PDF/PPTX export and real generated-image replacement passed within the documented scope. The publisher's safety declaration is present.

Failed outlines now retain their error and complete generation settings. Reopening restores the selected language and slide count without rerunning a failed model request; a visible Try again action creates a separate attempt. Continue remains disabled until a valid outline is ready. Safe structured-output diagnostic categories from Nimi are preserved without copying model content or private provider details.

The fixed-count outline prompt now states the unchanged character limits that previously caused Chinese output rejection. Layout selection sees the actual template schema and prioritizes available facts over fixed decorative slots. Exhausted template validation no longer triggers whole-presentation stream retries. Image/icon pickers remain centered, and icon retrieval preserves its typed failure. Raw AI content still needs human review: the retained draft includes unsupported factual inferences and fixed-frame overflow; a separate manually edited copy demonstrates correction and export. With Nimi 0.2.3-rc.2's provider transport batching repair, real `text-embedding-v4` icon retrieval returned 40 results; selecting, saving, reopening and exporting the chosen notebook icon passed. The App's embedding inputs and provider-independent batching remain unchanged.

# Nimi release 0.9.11-beta.7 — Durable generated images

The supervised Host now keeps generated App asset references relative to its renderer proxy. AI-edited slide images no longer persist the ephemeral renderer port and remain loadable after a new App process starts. Public Kit/native 0.19.2 and protected Runtime identity checks remain unchanged.

# Nimi release 0.9.11-beta.6 — Source Runtime support for Catalog Apps

Updates the frozen public npm dependency to Kit/native 0.19.2. The installed App keeps its published native carrier and can connect to a source-development Runtime when launched through Home. Native peer identity checks and Runtime-owned installed-source, session and App Access admission remain mandatory. Production Runtime trust remains unchanged; invalid source Runtime observations fail closed without fallback. SDK 0.21.0, App Tools 0.12.0 and the existing App business workflows are retained.

# Nimi release 0.9.11-beta.5

Presenton now consumes the published Nimi SDK 0.21.0, Kit 0.19.0, App Tools 0.12.0 and Nimi Coding 0.6.5 with frozen public npm dependencies. Icon and document retrieval carry their actual document or query embedding purpose. Fresh build hosts bootstrap the required Python toolchain.

The macOS packager bounds signing discovery while retaining strict signature verification. The App retains its beta update channel and declares macOS arm64. Public admission records publisher claims and build provenance; it does not certify AI output or unexecuted workflows.

Structured slide generation and editing request strict Runtime JSON shape validation. The App validates the complete original template, including length budgets, before composition or persistence and gives the model bounded correction feedback. Model JSON becomes ordinary nested data before slide composition, preventing the attributed-container copy failure. Production builds restore Next.js generated development declarations after creating the standalone renderer.

The business proxy permits long structured-text and media operations within a finite ten-minute budget, replacing Next.js's thirty-second default. Desktop-supervised generation completed a saved two-slide deck with new generated images; final PDF and PowerPoint export were exercised on macOS.
