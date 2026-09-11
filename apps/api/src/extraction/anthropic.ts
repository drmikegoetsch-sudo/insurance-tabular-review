// Model-backed provider using the Anthropic SDK. One streamed request per
// row; each completed line is parsed into a cell and yielded immediately so
// the grid fills while the model is still writing.

import Anthropic from "@anthropic-ai/sdk";
import { parseCellLine, type CellResult } from "@insurance-tabular-review/templates";
import type { ChatInput, ExtractionProvider, ExtractRowInput } from "./types.js";

const DEFAULT_MODEL = "claude-opus-5";

export class AnthropicProvider implements ExtractionProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(options: { apiKey?: string; defaultModel?: string } = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.defaultModel = options.defaultModel ?? DEFAULT_MODEL;
  }

  private model(requested: string) {
    return requested && requested !== "default" ? requested : this.defaultModel;
  }

  async *extractRow(input: ExtractRowInput): AsyncIterable<CellResult> {
    const stream = this.client.messages.stream(
      {
        model: this.model(input.model),
        max_tokens: 32000,
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: input.user }],
      },
      { signal: input.signal },
    );

    let buffer = "";
    for await (const event of stream) {
      if (event.type !== "content_block_delta" || event.delta.type !== "text_delta") continue;
      buffer += event.delta.text;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const cell = parseCellLine(line);
        if (cell) yield cell;
        newline = buffer.indexOf("\n");
      }
    }
    const tail = parseCellLine(buffer);
    if (tail) yield tail;

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      throw new Error("Model declined the request");
    }
    if (final.stop_reason === "max_tokens") {
      throw new Error("Model output was cut off; reduce the number of columns per run");
    }
  }

  async chat(input: ChatInput): Promise<string> {
    const system = [
      `You are an insurance document assistant helping with the tabular review titled "${input.review_title}".`,
      "Answer from the table below. Cite cells inline as [row N, col M] using the ROW and COL numbers shown. Do not invent values that are not in the table. When asked for a comparison, contrast the rows and say which is broader or narrower for the insured. Be concise.",
      "",
      "TABLE:",
      input.tableText,
    ].join("\n");
    const response = await this.client.messages.create({
      model: this.model(input.model),
      max_tokens: 4000,
      system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    if (response.stop_reason === "refusal") return "The model declined to answer this question.";
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
