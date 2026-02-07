import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadConfig } from '@/lib/config';
import { memoryService } from '@/lib/services/memory';
import { dbService } from '@/lib/db';

const config = loadConfig();

const client = new OpenAI({
  apiKey: config.models.advanced.api_key,
  baseURL: config.models.advanced.base_url,
});

export async function POST(req: NextRequest) {
  try {
    const { message, image, sessionId, reasoning } = await req.json();
    const extractionPromise = memoryService.extractAndStore(message, sessionId, image);
    const { hardRules, softFacts } = await memoryService.retrieveContext(message, sessionId);

    const systemPrompt = `你是 OmniMind，由 Moonshot AI 提供的人工智能助手。你具备长效记忆能力。
    硬性准则：${hardRules.join(' | ')}
    背景事实：${softFacts.join(' | ')}`;

    let currentMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...dbService.getHistory(sessionId),
      { 
        role: 'user', 
        content: image ? [
          { type: "image_url", image_url: { url: image } },
          { type: "text", text: message || "描述图片" }
        ] : message 
      }
    ];

    dbService.saveMessage(sessionId, 'user', image ? `[Image] ${message}` : message);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completionOptions: any = {
            model: config.models.advanced.name,
            messages: currentMessages,
            stream: true,
          };

          if (reasoning === false) {
            completionOptions.thinking = { type: "disabled" };
          }

          const response = await client.chat.completions.create(completionOptions);

          let fullContent = '';
          let fullThought = '';

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta as any;
            
            if (delta?.reasoning_content) {
              fullThought += delta.reasoning_content;
              controller.enqueue(encoder.encode(`t:${delta.reasoning_content}`));
            }
            if (delta?.content) {
              fullContent += delta.content;
              controller.enqueue(encoder.encode(`c:${delta.content}`));
            }
          }

          dbService.saveMessage(sessionId, 'assistant', fullContent, fullThought);
          await extractionPromise;
          controller.close();
        } catch (error: any) {
          console.error('Kimi API Error:', error);
          controller.enqueue(encoder.encode(`c:\n\n[API 错误: ${error.message}]\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
