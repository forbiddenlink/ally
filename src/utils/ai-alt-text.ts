/**
 * AI-powered alt text generation for images
 *
 * Supports multiple providers:
 * - OpenAI Vision (GPT-4V)
 * - Local inference (planned)
 */

import { readFile } from 'fs/promises';
import { resolve, extname } from 'path';
import { existsSync } from 'fs';

export interface AltTextResult {
  success: boolean;
  altText?: string;
  error?: string;
  provider: 'openai' | 'local' | 'none';
  confidence?: number;
}

export interface AltTextOptions {
  /** Context about what the image is for (e.g., "product image", "hero banner") */
  context?: string;
  /** Maximum length for alt text */
  maxLength?: number;
  /** OpenAI API key (uses OPENAI_API_KEY env var if not provided) */
  apiKey?: string;
}

const DEFAULT_MAX_LENGTH = 125; // Recommended alt text length

/**
 * Check if OpenAI API is available
 */
export function isOpenAIAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Generate alt text for an image using AI
 */
export async function generateAltText(
  imagePath: string,
  options: AltTextOptions = {}
): Promise<AltTextResult> {
  const { context, maxLength = DEFAULT_MAX_LENGTH, apiKey } = options;
  const openaiKey = apiKey || process.env.OPENAI_API_KEY;

  // Check if we have any AI provider available
  if (!openaiKey) {
    return {
      success: false,
      error: 'No AI provider configured. Set OPENAI_API_KEY environment variable.',
      provider: 'none',
    };
  }

  // Validate image path
  const absolutePath = resolve(imagePath);
  if (!existsSync(absolutePath)) {
    return {
      success: false,
      error: `Image not found: ${imagePath}`,
      provider: 'none',
    };
  }

  // Check file extension
  const ext = extname(absolutePath).toLowerCase();
  const supportedFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (!supportedFormats.includes(ext)) {
    return {
      success: false,
      error: `Unsupported image format: ${ext}. Supported: ${supportedFormats.join(', ')}`,
      provider: 'none',
    };
  }

  try {
    return await generateWithOpenAI(absolutePath, openaiKey, context, maxLength);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      provider: 'openai',
    };
  }
}

/**
 * Generate alt text using OpenAI Vision API
 */
async function generateWithOpenAI(
  imagePath: string,
  apiKey: string,
  context?: string,
  maxLength: number = DEFAULT_MAX_LENGTH
): Promise<AltTextResult> {
  // Read and encode image as base64
  const imageBuffer = await readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = extname(imagePath).toLowerCase().slice(1);
  const mimeType = ext === 'jpg' ? 'jpeg' : ext;

  // Build prompt
  const contextClause = context ? ` This image is used as: ${context}.` : '';
  const prompt = `Generate concise, descriptive alt text for this image for accessibility purposes.${contextClause}

Guidelines:
- Be specific and descriptive but concise (under ${maxLength} characters)
- Describe the content, not the image format
- Don't start with "Image of" or "Picture of"
- Focus on what's important for understanding the page content
- If text is visible in the image, include key text
- For decorative images, return empty string

Return ONLY the alt text, nothing else.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // Use mini for cost efficiency, sufficient for alt text
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${mimeType};base64,${base64Image}`,
                detail: 'low', // Low detail is sufficient for alt text
              },
            },
          ],
        },
      ],
      max_tokens: 100,
      temperature: 0.3, // Low temperature for consistent results
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const altText = data.choices[0]?.message?.content?.trim() || '';

  // Truncate if too long
  const finalAltText = altText.length > maxLength
    ? altText.slice(0, maxLength - 3) + '...'
    : altText;

  return {
    success: true,
    altText: finalAltText,
    provider: 'openai',
    confidence: 0.85, // OpenAI Vision is generally reliable
  };
}

/**
 * Generate alt text from image URL
 */
export async function generateAltTextFromUrl(
  imageUrl: string,
  options: AltTextOptions = {}
): Promise<AltTextResult> {
  const { context, maxLength = DEFAULT_MAX_LENGTH, apiKey } = options;
  const openaiKey = apiKey || process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return {
      success: false,
      error: 'No AI provider configured. Set OPENAI_API_KEY environment variable.',
      provider: 'none',
    };
  }

  // Build prompt
  const contextClause = context ? ` This image is used as: ${context}.` : '';
  const prompt = `Generate concise, descriptive alt text for this image for accessibility purposes.${contextClause}

Guidelines:
- Be specific and descriptive but concise (under ${maxLength} characters)
- Describe the content, not the image format
- Don't start with "Image of" or "Picture of"
- Focus on what's important for understanding the page content
- If text is visible in the image, include key text
- For decorative images, return empty string

Return ONLY the alt text, nothing else.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const altText = data.choices[0]?.message?.content?.trim() || '';
    const finalAltText = altText.length > maxLength
      ? altText.slice(0, maxLength - 3) + '...'
      : altText;

    return {
      success: true,
      altText: finalAltText,
      provider: 'openai',
      confidence: 0.85,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      provider: 'openai',
    };
  }
}

/**
 * Infer image context from surrounding HTML/path
 */
export function inferImageContext(
  imagePath: string,
  surroundingHtml?: string
): string | undefined {
  // Extract context from path
  const pathLower = imagePath.toLowerCase();

  if (pathLower.includes('hero') || pathLower.includes('banner')) {
    return 'hero/banner image';
  }
  if (pathLower.includes('product')) {
    return 'product image';
  }
  if (pathLower.includes('team') || pathLower.includes('profile') || pathLower.includes('avatar')) {
    return 'person/profile photo';
  }
  if (pathLower.includes('logo')) {
    return 'company/brand logo';
  }
  if (pathLower.includes('icon')) {
    return 'icon';
  }
  if (pathLower.includes('screenshot')) {
    return 'screenshot';
  }
  if (pathLower.includes('chart') || pathLower.includes('graph')) {
    return 'data visualization';
  }

  // Extract context from surrounding HTML (if provided)
  if (surroundingHtml) {
    const htmlLower = surroundingHtml.toLowerCase();
    if (htmlLower.includes('class="hero"') || htmlLower.includes('id="hero"')) {
      return 'hero/banner image';
    }
    if (htmlLower.includes('class="product"') || htmlLower.includes('product-image')) {
      return 'product image';
    }
  }

  return undefined;
}
