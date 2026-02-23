import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getTextFromResponses(resp: any): string {
  // OpenAI Responses API: output_text 是最稳的
  const t = resp?.output_text;
  if (typeof t === "string") return t;
  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mode = body?.mode ?? "chat";

    // ============ MODE: insights_summary ============
    if (mode === "insights_summary") {
      const prompt = (body?.prompt ?? "").toString();
      const inputPayload = body?.input ?? {};

      const model = process.env.OPENAI_MODEL || "gpt-5.2";

      const resp = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a supportive menopause companion. Write concise, empathetic summaries. Output only the summary text.",
          },
          {
            role: "user",
            content:
              prompt +
              "\n\nHere is the user's data (JSON):\n" +
              JSON.stringify(inputPayload),
          },
        ],
      });

      const text = getTextFromResponses(resp).trim();
      return NextResponse.json({ text: text || "No summary generated." });
    }

    // ============ MODE: companion_chat (结构化) ============
    if (mode === "companion_chat") {
      // 你前端发的是：{ mode, sleepDay, messages }
      const sleepDay = (body?.sleepDay ?? "").toString();
      const messages = Array.isArray(body?.messages) ? body.messages : [];

      const model = process.env.OPENAI_MODEL || "gpt-5.2";

      // 让模型输出 JSON（结构化）
      const resp = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a supportive menopause companion. Return ONLY valid JSON with keys: assistant_text, tags, mood, intensity, diary_text, cards. No extra text.",
          },
          {
            role: "user",
            content:
              "Sleep-day: " +
              sleepDay +
              "\nChat messages JSON:\n" +
              JSON.stringify(messages) +
              "\n\nReturn the structured JSON now.",
          },
        ],
      });

      const raw = getTextFromResponses(resp).trim();

      // 尝试 parse；失败就兜底
      try {
        const data = JSON.parse(raw);
        return NextResponse.json(data);
      } catch {
        return NextResponse.json(
          {
            assistant_text: raw || "Sorry, I couldn't generate a response.",
            tags: [],
            mood: 3,
            intensity: 3,
            diary_text: "",
            cards: [],
          },
          { status: 200 }
        );
      }
    }

    // ============ DEFAULT: simple chat ============
    const model = process.env.OPENAI_MODEL || "gpt-5.2";
    const messages = body?.messages ?? "Hello";
    const resp = await client.responses.create({
      model,
      input: messages,
    });

    return NextResponse.json({ text: getTextFromResponses(resp).trim() });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown server error" },
      { status: 500 }
    );
  }
}