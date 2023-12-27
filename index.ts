import "dotenv/config";

import assert from "assert/strict";
import axios from "axios";
import Redis from "ioredis";
import * as natural from "natural";

const redis = new Redis();

if (!process.env.OPENAI_API_KEY) {
  console.log("OPENAI_API_KEY Not defined in the environment");
}

assert(process.env.OPENAI_API_KEY !== undefined);
const openaiApiKey: string = process.env.OPENAI_API_KEY;

const calculateJaccardIndex = (
  set1: Set<string>,
  set2: Set<string>
): number => {
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  if (union.size === 0) return 0;

  return intersection.size / union.size;
};

const getSimilarityScore = (prompt1: string, prompt2: string): number => {
  const tokenizer = new natural.WordTokenizer();
  const tokens1 = new Set(tokenizer.tokenize(prompt1));
  const tokens2 = new Set(tokenizer.tokenize(prompt2));

  return calculateJaccardIndex(tokens1, tokens2);
};

async function getCachedResponse(prompt: string): Promise<string | null> {
  const keys = await redis.keys("*");

  if (keys.length) {
    for (const key of keys) {
      const similarityScore = getSimilarityScore(prompt, key);

      if (similarityScore > 0.25) {
        console.log(`Cache hit for prompt: (${key}):`);
        return redis.get(key);
      }
    }
  }

  return null;
}

async function getOpenAIResponse(prompt: string): Promise<string> {
  const cachedResponse = await getCachedResponse(prompt);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const response = await axios.post(
      apiUrl,
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant. Give concise answers.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 200,
        top_p: 1,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
      }
    );

    const apiResponse = response.data.choices[0].message.content;

    await redis.set(prompt, apiResponse);
    return apiResponse;
  } catch (error: any) {
    console.error("Error fetching OpenAI API response:", error.message);
    throw error;
  }
}

const main = async () => {
  const prompt1: string =
    "What are the benefits of regular exercise for cardiovascular health?";
  const prompt2: string =
    "How does regular exercise contribute to maintaining cardiovascular health?";

  console.log("Prompt 1", prompt1);
  console.log("Prompt 2", prompt2);
  console.log("\n");

  const similarityScore: number = getSimilarityScore(prompt1, prompt2);
  console.log("Semantic Similarity Score:", similarityScore);
  console.log("\n\n");

  const prompt1Res = await getOpenAIResponse(prompt1);
  console.log("RESPONSE FOR PROMPT 1\n", prompt1Res);

  console.log("\n");

  const prompt2Res = await getOpenAIResponse(prompt2);
  console.log("RESPONSE FOR PROMPT 2\n", prompt2Res);

  redis.disconnect();
};

main();
