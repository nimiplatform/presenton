# 0.9.11-beta.8 — Windows candidate (unreleased)

Adds Windows build targets, native resource paths and the packaged Python executable suffix. Fixes the reproduced Python startup deadlock, Windows drive-path handling, download URL separators and npm launcher invocation. The Host supplies Next's private backend-state path explicitly; production tracing excludes development state and packaging rejects its presence. Optional JavaScript/CSS debugging source maps are omitted from resources to fit GitHub's per-asset limit. Uses public SDK 0.21.0, Kit/native 0.19.3 and App Tools 0.12.2. Packaged API startup and supervised manual Chinese slide editing, reload, PDF export and PPTX export passed. Full AI presentation generation has recorded output-validation failures and is not reported as passed. New public admission requires the publisher's safety declaration.

# Nimi release 0.9.11-beta.7 — Durable generated images

The supervised Host now keeps generated App asset references relative to its renderer proxy. AI-edited slide images no longer persist the ephemeral renderer port and remain loadable after a new App process starts. Public Kit/native 0.19.2 and protected Runtime identity checks remain unchanged.

# Nimi release 0.9.11-beta.6 — Source Runtime support for Catalog Apps

Updates the frozen public npm dependency to Kit/native 0.19.2. The installed App keeps its published native carrier and can connect to a source-development Runtime when launched through Home. Native peer identity checks and Runtime-owned installed-source, session and App Access admission remain mandatory. Production Runtime trust remains unchanged; invalid source Runtime observations fail closed without fallback. SDK 0.21.0, App Tools 0.12.0 and the existing App business workflows are retained.

# Nimi release 0.9.11-beta.5

Presenton now consumes the published Nimi SDK 0.21.0, Kit 0.19.0, App Tools 0.12.0 and Nimi Coding 0.6.5 with frozen public npm dependencies. Icon and document retrieval carry their actual document or query embedding purpose. Fresh build hosts bootstrap the required Python toolchain.

The macOS packager bounds signing discovery while retaining strict signature verification. The App retains its beta update channel and declares macOS arm64. Public admission records publisher claims and build provenance; it does not certify AI output or unexecuted workflows.

Structured slide generation and editing request strict Runtime JSON shape validation. The App validates the complete original template, including length budgets, before composition or persistence and gives the model bounded correction feedback. Model JSON becomes ordinary nested data before slide composition, preventing the attributed-container copy failure. Production builds restore Next.js generated development declarations after creating the standalone renderer.

The business proxy permits long structured-text and media operations within a finite ten-minute budget, replacing Next.js's thirty-second default. Desktop-supervised generation completed a saved two-slide deck with new generated images; final PDF and PowerPoint export were exercised on macOS.
