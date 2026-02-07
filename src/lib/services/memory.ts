import OpenAI from 'openai';
import { loadConfig } from '../config';
import { dbService } from '../db';
import { nanoid } from 'nanoid';

const config = loadConfig();

const fastModel = new OpenAI({
  apiKey: config.models.fast.api_key,
  baseURL: config.models.fast.base_url,
});

const advancedModel = new OpenAI({
  apiKey: config.models.advanced.api_key,
  baseURL: config.models.advanced.base_url,
});

export const memoryService = {
  async extractAndStore(text: string, sessionId: string, image?: string) {
    const prompt = `
      You are an AI memory extraction module. Your task is to extract two types of information from the user's message (and image if provided):
      
      1. Hard Rules: Explicit constraints or instructions that must be followed in ALL future conversations (e.g., "Always reply in Chinese", "Use Vue3 instead of React").
      2. Soft Facts: Contextual information, preferences, or background facts (e.g., "I'm working on a Python project", "I like dark mode").
      
      If an image is provided, describe its key technical or personal content as "Soft Facts" (OCR/Captioning).
      
      Output your findings in JSON format:
      {
        "hard_rules": ["rule 1", "rule 2"],
        "soft_facts": ["fact 1", "fact 2"]
      }
      If none found, return empty arrays.
    `;

    const userContent: any[] = [];
    if (image) {
      userContent.push({
        type: "image_url",
        image_url: { url: image }
      });
    }
    userContent.push({
      type: "text",
      text: text || "Extract information from this image."
    });

    try {
      // Use advanced model for multi-modal extraction if image is present
      const modelToUse = image ? advancedModel : fastModel;
      const response = await modelToUse.chat.completions.create({
        model: image ? config.models.advanced.name : config.models.fast.name,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: userContent as any }
        ],
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Store Hard Rules in SQLite
      if (result.hard_rules && result.hard_rules.length > 0) {
        for (const rule of result.hard_rules) {
          dbService.addHardRule(nanoid(), rule);
        }
      }

      // Store Soft Facts in Mem0 (using fetch as a simple alternative to their SDK)
      if (result.soft_facts && result.soft_facts.length > 0) {
        await this.storeSoftFacts(result.soft_facts, sessionId);
      }

      return result;
    } catch (error) {
      console.error('Memory extraction failed:', error);
      return { hard_rules: [], soft_facts: [] };
    }
  },

  async storeSoftFacts(facts: string[], sessionId: string) {
    if (!config.memory.mem0.api_key) return;

    try {
      await fetch('https://api.mem0.ai/v1/memories/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${config.memory.mem0.api_key}`
        },
        body: JSON.stringify({
          messages: facts.map(f => ({ role: 'user', content: f })),
          user_id: sessionId,
          metadata: { session_id: sessionId }
        })
      });
    } catch (error) {
      console.error('Mem0 storage failed:', error);
    }
  },

  async retrieveContext(query: string, sessionId: string) {
    // 1. Get Hard Rules from SQLite
    const hardRules = dbService.getHardRules().map(r => r.content);

    // 2. Get Soft Facts from Mem0
    let softFacts: string[] = [];
    if (config.memory.mem0.api_key) {
      try {
        const response = await fetch(`https://api.mem0.ai/v1/memories/search/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${config.memory.mem0.api_key}`
          },
          body: JSON.stringify({
            query,
            user_id: sessionId
          })
        });
        const data = await response.json();
        softFacts = data.map((m: any) => m.memory);
      } catch (error) {
        console.error('Mem0 retrieval failed:', error);
      }
    }

    return {
      hardRules,
      softFacts
    };
  }
};
