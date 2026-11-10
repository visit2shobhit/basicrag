import fs from "node:fs/promises";
import { Inngest } from "inngest";
// Import the inner file: pdf-parse's index.js runs a debug routine on import
import pdf from "pdf-parse/lib/pdf-parse.js";
import { index, chunkText } from "./lib.js";

export const inngest = new Inngest({ id: "rag-system" });

// Background job: PDF -> text -> chunks -> Pinecone (which embeds chunk_text)
export const ingestPdf = inngest.createFunction(
  { id: "ingest-pdf", retries: 2 },
  { event: "pdf/uploaded" },
  async ({ event, step }) => {
    const { filePath, fileName, docId } = event.data;

    const chunks = await step.run("extract-and-chunk", async () => {
      const buffer = await fs.readFile(filePath);
      const data = await pdf(buffer);
      return chunkText(data.text);
    });

    // Document indexes with integrated embedding allow max 96 docs per upsert
    const BATCH = 96;
    for (let i = 0; i < chunks.length; i += BATCH) {
      await step.run(`upsert-${i}`, async () => {
        const batch = chunks.slice(i, i + BATCH);
        await index.documents.upsert({
          documents: batch.map((text, j) => ({
            _id: `${docId}-${i + j}`,
            chunk_text: text, // must match the field name in your pinecone index schema
            fileName,
            chunk: i + j,
          })),
        });
      });
    }

    await step.run("cleanup", () => fs.unlink(filePath).catch(() => {}));

    return { fileName, docId, chunks: chunks.length };
  }
);