import "dotenv/config";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

// OpenAI is only used to generate the final answer.
// Embedding is done by Pinecone (llama-text-embed-v2 on the chunk_text field).

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const CHAT_MODEL = "gpt-4o-mini";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// Namespace is created automatically on first upsert
export const index = pc.index({
  name: process.env.PINECONE_INDEX_NAME,
  namespace: process.env.PINECONE_NAMESPACE || "pdf-docs",
});

// Simple character-based chunking with overlap (~250 tokens per chunk)
export function chunkText(text, size = 1000, overlap = 200) {
  const clean = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    const piece = clean.slice(i, i + size).trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}