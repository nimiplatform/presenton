# Presenton

Create presentations from a topic or your source material, review the outline, edit slides and export your work as PDF or PowerPoint.

## Create your first presentation

1. Open Presenton from Nimi Home and keep Nimi running. Browser access also requires Presenton (`0.9.12-beta.1` or newer) to stay open on that PC.
2. In **Settings → AI models**, configure text generation. Generated artwork needs an image model; icon and document search also use embeddings.
3. Choose the presentation workflow, provide your topic or material, select a template and review the proposed outline before generating slides.
4. Edit text, charts, images and layout, then export the finished presentation as PDF or PPTX.

AI drafts can contain inaccurate facts and text that does not fit the layout. Check both content and exported pages before sharing. A model must support the requested structured output, tools or image inputs; if a smaller on-device model fails complex multi-slide template constraints, reduce the slide count, choose a simpler template such as Standard, or select a stronger text model in Settings.

## Data and services

Saved drafts, custom templates and assets belong to your PC App workspace. AI requests follow your selected Nimi Local or Cloud configuration; cloud requests send the relevant source content to the selected service.

Stock-image services, external search and Presenton Community are optional business services with separate settings on your PC. Community sign-in does not replace your Nimi AI configuration. Reopening a completed outline restores it; explicitly regenerating creates a new draft.

## Browser access to your PC workspace

Browser access (`https://presenton.nimi.xyz` once published) connects to the presentation workspace running in **Presenton `0.9.12-beta.1` or newer** on your PC. Earlier Catalog builds (`0.9.11-beta.10` and older) do not include the PC workspace integration provider and must be updated before connecting from the browser.

1. Keep Nimi and Presenton (`0.9.12-beta.1` or newer) open on your PC.
2. Open Presenton in your browser, sign in through the official Nimi page, connect to your PC, and approve the Web source in Nimi Home.
3. In **Nimi Home → Integrations**, allow that Web source to use all five Presenton workspace operations (`workspace.status`, `workspace.upload`, `workspace.request`, `workspace.response`, `workspace.close`). This access can read and change your PC presentation library, upload source material, run presentation workflows, and download PDF/PPTX exports.

Models, service credentials, projects, files and generation tasks remain owned by Presenton on your PC. Change model and business service settings in **Presenton on your PC → Settings**. Cloud model use follows that PC configuration and may incur the selected service's charges. Browser uploads are limited to 128 MiB per request.

Keep the browser page open while transferring files. If the connection ends, inspect the original draft on your PC before retrying; the browser does not automatically restart generation. Reconnecting after a session change requires reloading the page, so save edits before signing out.

## Android development preview

The Android test App uses the same PC workspace (`0.9.12-beta.1` or newer) and requires the local editor service to stay running. Sign in in the system browser, return to Presenton, then connect and approve its Android source and workspace permissions in Nimi Home. This candidate is not an offline App. Use **Slide tools** for text, images, tables or AI editing; double-tap an image on the slide to replace it or upload a file.

When a system file picker interrupts the PC connection, selected files and unsubmitted upload/chat drafts stay in memory. Reconnect and reopen the intended upload action, then choose **Use selected files**. PDF and PowerPoint exports use Android's system Save picker. Keep the App open until it reports the result; a full App restart clears unsubmitted device drafts and selected files. Saved presentations remain on the PC.

## Help

For help, report the App version, workflow, error message and export format at https://github.com/nimiplatform/presenton/issues. Remove credentials and private source material from reports.
