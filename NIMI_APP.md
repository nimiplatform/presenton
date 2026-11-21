# Presenton

Create presentations from a topic or your source documents, select a template, review the outline, edit slides visually, and export finished decks as PDF or PowerPoint (PPTX).

## Getting started

1. Open Presenton from Nimi Home on your PC (macOS Apple Silicon or Windows x64) and keep Nimi running.
2. Open **Settings → AI models** to configure **Writing and editing** (text generation). Configure **Generated images** for AI slide artwork and **Icon and document search** (embeddings) for icon lookup and document retrieval.
3. Click **Create new Presentation**, choose **Standard** (template-guided) or **Smart** mode, enter a topic brief or attach source documents, select a template, and review or edit the proposed outline before generating slides.
4. Refine text, charts, tables, icons, images, and slide layouts in the editor, then use **Export** to save as PDF or PPTX.

## Models and practical limits

- **Model capability requirements**: The selected text model must support structured JSON output, tool calling, and (for visual template import) image inputs. If a smaller on-device model fails complex multi-slide template constraints, reduce the slide count, pick a simpler template such as **Standard**, or switch to a stronger text model in **Settings → AI models**.
- **Human review required**: AI-generated drafts can contain factual inaccuracies or text that overflows a fixed layout box. Review both slide content and exported pages before sharing.
- **Export typography**: PDF preserves the exact exported appearance. PowerPoint (`.pptx`) text layout may shift slightly if your presentation viewer does not have the template's fonts installed.
- **Outline persistence**: Reopening a completed outline restores it without re-running AI generation; explicitly regenerating creates a new draft.

## Data handling and external services

- **Local PC workspace**: Saved presentations, custom templates, uploaded source files, generated images, and retrieval caches stay in your PC workspace (`~/Library/Application Support/Presenton Nimi/workspaces/` on macOS; `%APPDATA%/Presenton Nimi/workspaces/` on Windows). Exported PDF and PPTX files are written only to destinations you choose.
- **Nimi AI routing**: AI requests follow the Local or Cloud models you configure in Nimi. On-device models run locally on your PC; Cloud models send the relevant prompts or document excerpts to your chosen provider and may incur provider charges.
- **Optional business services**: Stock-image providers (Pexels/Pixabay), external web search, and Presenton Community are optional services with separate settings on your PC. Community sign-in does not replace your Nimi AI configuration.

## Remote PC workspace readiness

Presenton `0.9.12-beta.1` on PC includes the workspace integration provider (`io.github.nimiplatform.presenton.workspace.v1`). Hosted browser access (`https://presenton.nimi.xyz`) is not publicly published in this native release and is admitted separately.

Once a remote Web or development preview client is admitted, it connects to your running PC workspace rather than running offline:

1. Keep Nimi and Presenton (`0.9.12-beta.1` or newer) open on your PC.
2. Sign in through the official Nimi page, connect to your PC, and approve the client source in Nimi Home.
3. In **Nimi Home → Integrations**, allow all five Presenton workspace operations (`workspace.status`, `workspace.upload`, `workspace.request`, `workspace.response`, `workspace.close`). Models, credentials, files, and generation jobs remain owned by Presenton on your PC, and remote uploads are capped at 128 MiB per request.

## Attribution and help

Presenton for Nimi is an Apache-2.0 adaptation of the open-source [Presenton](https://github.com/presenton/presenton) project. For help, report the App version, workflow, error message, and export format at https://github.com/nimiplatform/presenton/issues (remove credentials and private source files before posting).
