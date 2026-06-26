/**
 * Groq API client – uses the OpenAI-compatible endpoint.
 * Model: meta-llama/llama-4-scout-17b-16e-instruct (latest vision-capable)
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Simple in-memory cache: imageUrl → generated alt text
const altCache = new Map();

/**
 * Generate a SEO-rich alt tag for an image URL.
 * Falls back to `fallback` if the API key is missing or the call fails.
 *
 * @param {string} imageUrl  - Public URL of the image
 * @param {string} fallback  - Fallback string to use on failure
 * @returns {Promise<string>}
 */
export async function generateAltTag(imageUrl, fallback = '') {
  if (!imageUrl) return fallback;

  // Return cached result instantly
  if (altCache.has(imageUrl)) return altCache.get(imageUrl);

  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || apiKey.startsWith('.')) return fallback;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
              {
                type: 'text',
                text:
                  'Write a concise, SEO-rich alt tag for this product image. ' +
                  'Describe the clothing item, color, style, and any key visual details in 10–15 words. ' +
                  'Do NOT include phrases like "image of" or "photo of". ' +
                  'Output only the alt tag text, nothing else.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn('[groqClient] API error', response.status);
      return fallback;
    }

    const data = await response.json();
    const alt = data?.choices?.[0]?.message?.content?.trim() || fallback;
    altCache.set(imageUrl, alt);
    return alt;
  } catch (err) {
    console.warn('[groqClient] fetch failed', err);
    return fallback;
  }
}
