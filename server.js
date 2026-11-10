import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import multer from "multer";
import { serve } from "inngest/express";
import { inngest, ingestPdf } from "./inngest-client.js";
import { openai, index, CHAT_MODEL } from "./lib.js";

fs.mkdirSync("uploads", { recursive: true });
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 },
});

const app = express();
app.use(express.json({ limit: "50mb" }));

// Inngest endpoint (the Inngest dev server calls this)
app.use("/api/inngest", serve({ client: inngest, functions: [ingestPdf] }));

// 1) Upload a PDF -> triggers background ingestion
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Attach a PDF as 'file'" });
  if (req.file.mimetype !== "application/pdf") {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Only PDF files are supported" });
  }

  const docId = crypto.randomUUID();
  await inngest.send({
    name: "pdf/uploaded",
    data: { filePath: req.file.path, fileName: req.file.originalname, docId },
  });

  res.status(202).json({ message: "Ingestion started", docId });
});

// 2) Ask a question
app.post("/query", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: "question is required" });

    // Pinecone embeds the query text itself
    const response = await index.documents.search({
      topK: 5,
      scoreBy: [{ type: "embed", fields: ["chunk_text"], query: question }],
      includeFields: ["chunk_text", "fileName", "chunk"],
    });

    if (process.env.DEBUG_SEARCH) console.log(JSON.stringify(response, null, 2));

    // Defensive: tolerate small differences in the response shape
    const hits = response.documents ?? response.matches ?? response.results ?? [];
    const get = (h, k) => h[k] ?? h.fields?.[k] ?? h.metadata?.[k];

    if (!hits.length) {
      return res.json({ answer: "No relevant content found.", sources: [] });
    }

    const context = hits.map((h, i) => `[${i + 1}] ${get(h, "chunk_text")}`).join("\n\n");

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Answer the question using ONLY the provided context. " +
            "If the answer is not in the context, say you don't know.",
        },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
    });

    res.json({
      answer: completion.choices[0].message.content,
      sources: hits.map((h) => ({
        fileName: get(h, "fileName"),
        chunk: get(h, "chunk"),
        score: h._score ?? h.score,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));