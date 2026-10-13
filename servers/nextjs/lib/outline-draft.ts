import type { PresentationConfig, LanguageType, ToneType, VerbosityType } from '../app/(presentation-generator)/upload/type';

/** The saved presentation owns its generation settings, including after reload. */
export function restoreOutlineDraft(presentation: {
  content: string; n_slides: number; language: string; tone?: string | null;
  verbosity?: string | null; instructions?: string | null;
  include_table_of_contents?: boolean; include_title_slide?: boolean;
  web_search?: boolean; file_paths?: string[] | null;
}) {
  const config: PresentationConfig = {
    prompt: presentation.content,
    slides: presentation.n_slides > 0 ? String(presentation.n_slides) : null,
    language: presentation.language as LanguageType,
    tone: (presentation.tone || 'default') as ToneType,
    verbosity: (presentation.verbosity || 'standard') as VerbosityType,
    instructions: presentation.instructions || '',
    includeTableOfContents: !!presentation.include_table_of_contents,
    includeTitleSlide: !!presentation.include_title_slide,
    webSearch: !!presentation.web_search,
  };
  return { config, files: (presentation.file_paths || []).map(file_path => ({ file_path })) };
}
