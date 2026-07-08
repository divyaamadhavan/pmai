import { complete } from '../orchestration/llmGateway.js';
import { prompts } from '../orchestration/promptEngine.js';

export type ReportFormat = 'PDF' | 'Markdown' | 'slides';

export interface InsightFormattingInput {
  narrative: string;
  format: ReportFormat;
}

export interface InsightFormattingOutput {
  formattedReport: string;
  format: ReportFormat;
}

export async function formatInsightReport(
  input: InsightFormattingInput
): Promise<InsightFormattingOutput> {
  const system = prompts['SK-11']({ format: input.format });

  const formatInstructions: Record<ReportFormat, string> = {
    Markdown:
      'Format this narrative as a well-structured Markdown document with a title, table of contents, section headings (##), bullet points where appropriate, and a summary table.',
    PDF:
      'Format this narrative as valid HTML with inline CSS for PDF conversion. Use a clean sans-serif font, a header with title and date, numbered sections, a data table for metrics, and a professional colour scheme (white background, dark text, blue accents).',
    slides:
      'Format this narrative as HTML slide sections. Each <section> should be a standalone slide with a slide title (h2), 3-5 bullet points maximum, and optionally a data callout in a highlighted box. Include 6-8 slides total covering: title, key findings, top opportunities (one per slide), metrics snapshot, and recommended actions.',
  };

  const userContent = [
    `Format the following insight narrative as ${input.format}:\n\n${input.narrative}`,
    `\nFormatting instructions: ${formatInstructions[input.format]}`,
  ].join('');

  const formattedReport = await complete({
    system,
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 8192,
  });

  return { formattedReport, format: input.format };
}
