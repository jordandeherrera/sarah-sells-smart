import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0';

const CLERK_ISSUER = 'https://improved-oyster-84.clerk.accounts.dev';
const clerkJwks = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`));

const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? 'null',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_LOG_TEXT_LENGTH = 1_000;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

interface VisionLabel {
  description: string;
  score: number;
}

interface VisionObject {
  name: string;
  score?: number;
}

interface VisionText {
  description: string;
}

interface VisionAnalysis {
  labels: VisionLabel[];
  objects: VisionObject[];
  texts: VisionText[];
}

interface AnalyzeRequest {
  imageData: string;
  itemDescription?: string;
}

interface Listing {
  title: string;
  description: string;
  price: string;
  category: string;
  detectedItems: string[];
}

const listingResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'marketplace_listing',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        price: { type: 'string' },
        detectedItems: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'description', 'category', 'price', 'detectedItems'],
      additionalProperties: false,
    },
  },
};

const geminiListingSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    price: {
      type: 'string',
      description: 'A concrete suggested asking price in US dollars, formatted like $25. Never use Contact for price, negotiable, unknown, or a price range.',
    },
    detectedItems: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'description', 'category', 'price', 'detectedItems'],
};

const jsonResponse = (body: unknown, origin: string | null, status = 200) =>
  Response.json(body, {
    status,
    headers: corsHeaders(origin),
  });

const authenticateRequest = async (request: Request): Promise<string> => {
  const authorization = request.headers.get('authorization');
  const origin = request.headers.get('origin');

  if (!authorization?.startsWith('Bearer ') || !origin) {
    throw new Error('Missing authentication credentials');
  }

  const token = authorization.slice('Bearer '.length);
  const { payload } = await jwtVerify(token, clerkJwks, {
    issuer: CLERK_ISSUER,
    algorithms: ['RS256'],
  });

  if (!payload.sub || payload.azp !== origin) {
    throw new Error('Token is not authorized for this origin');
  }

  return payload.sub;
};

const parseRequest = async (request: Request): Promise<AnalyzeRequest> => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new Error('Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object');
  }

  const { imageData, itemDescription } = body as Record<string, unknown>;
  if (typeof imageData !== 'string') {
    throw new Error('imageData is required');
  }

  const imageMatch = imageData.match(IMAGE_DATA_URL);
  if (!imageMatch) {
    throw new Error('imageData must be a JPEG, PNG, or WebP data URL');
  }

  const padding = imageMatch[2].endsWith('==') ? 2 : imageMatch[2].endsWith('=') ? 1 : 0;
  const imageBytes = Math.floor((imageMatch[2].length * 3) / 4) - padding;
  if (imageBytes > MAX_IMAGE_BYTES) {
    throw new Error('Image must be smaller than 5 MB');
  }

  if (itemDescription !== undefined && typeof itemDescription !== 'string') {
    throw new Error('itemDescription must be a string');
  }

  const description = typeof itemDescription === 'string' ? itemDescription.trim() : undefined;
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`itemDescription must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
  }

  return { imageData, itemDescription: description || undefined };
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, origin, 405);
  }

  try {
    await authenticateRequest(request);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'authentication_failed',
      message: error instanceof Error ? error.message : 'Unknown authentication error',
    }));
    return jsonResponse({ error: 'Authentication required' }, origin, 401);
  }

  let input: AnalyzeRequest;
  try {
    input = await parseRequest(request);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Invalid request' },
      origin,
      400,
    );
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!geminiApiKey && !openaiApiKey) {
    console.error(JSON.stringify({
      event: 'configuration_error',
      missing: 'GEMINI_API_KEY or OPENAI_API_KEY',
    }));
    return jsonResponse({ error: 'Image analysis is not configured' }, origin, 500);
  }

  try {
    if (openaiApiKey) {
      try {
        const listing = await generateListingFromImage(
          input.imageData,
          openaiApiKey,
          input.itemDescription,
        );
        logListingResult('openai-vision', listing);
        return jsonResponse({
          ...listing,
          confidence: null,
          analysisMethod: 'openai-vision',
        }, origin);
      } catch (error) {
        console.error(JSON.stringify({
          event: 'vision_analysis_failed',
          provider: 'openai',
          message: error instanceof Error ? error.message : 'Unknown OpenAI error',
        }));
        if (!geminiApiKey) throw error;
      }
    }

    if (!geminiApiKey) throw new Error('Gemini fallback is not configured');

    const listing = await generateListingWithGemini(
      input.imageData,
      geminiApiKey,
      input.itemDescription,
    );
    logListingResult('gemini-vision', listing);
    return jsonResponse({
      ...listing,
      confidence: null,
      analysisMethod: 'gemini-vision',
    }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    console.error(JSON.stringify({
      event: 'analysis_failed',
      message,
    }));
    return jsonResponse(
      { error: 'Unable to analyze the image', details: message },
      origin,
      502,
    );
  }
});

async function generateListingWithGemini(
  imageData: string,
  apiKey: string,
  itemDescription?: string,
): Promise<Listing> {
  const imageMatch = imageData.match(IMAGE_DATA_URL);
  if (!imageMatch) throw new Error('Invalid image data');

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              inline_data: {
                mime_type: `image/${imageMatch[1]}`,
                data: imageMatch[2],
              },
            },
            {
              text: `${itemDescription ? `Seller notes: ${itemDescription}\n\n` : ''}Identify the primary item being sold from the image and create an honest marketplace listing. Inspect the image directly. Do not invent a brand, model, material, included accessory, functionality, or condition that is not visible or stated by the seller. If the image only shows part of the item, describe only what can reasonably be identified. Use one category from: Baby & Kids, Electronics, Home & Garden, Clothing, Sports, Books & Media, Vehicles, Tools, Collectibles. Provide one concrete suggested asking price in US dollars formatted like $25; never return "Contact for price", "negotiable", "unknown", or a price range. Include exactly this sentence in the description: "Located in South Reno. Available for pickup or delivery for $20 delivery fee."`,
            },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1_024,
          responseMimeType: 'application/json',
          responseSchema: geminiListingSchema,
        },
      }),
    },
  );

  const data = await response.json() as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  if (!response.ok) {
    throw new Error(
      `Gemini request failed (${response.status}): ${data.error?.message ?? 'Unknown provider error'}`,
    );
  }

  const content = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!content) {
    throw new Error(
      `Gemini returned an empty response (${data.candidates?.[0]?.finishReason ?? 'unknown reason'})`,
    );
  }

  const listing = parseListing(content);
  if (!/^\$\d+(?:\.\d{2})?$/.test(listing.price)) {
    throw new Error(`Gemini returned an invalid asking price: ${listing.price}`);
  }

  return listing;
}

async function getVisionAnalysis(imageData: string, apiKey: string): Promise<VisionAnalysis> {
  const base64Image = imageData.slice(imageData.indexOf(',') + 1);
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'LABEL_DETECTION', maxResults: 15 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 15 },
          { type: 'TEXT_DETECTION', maxResults: 10 },
          { type: 'SAFE_SEARCH_DETECTION' },
        ],
      }],
    }),
  });

  const data = await response.json() as {
    error?: { message?: string };
    responses?: Array<{
      labelAnnotations?: VisionLabel[];
      localizedObjectAnnotations?: VisionObject[];
      textAnnotations?: VisionText[];
      error?: { message?: string };
    }>;
  };

  const result = data.responses?.[0];
  if (!response.ok || !result || result.error) {
    const message = data.error?.message ?? result?.error?.message ?? 'Unknown provider error';
    throw new Error(`Google Vision request failed (${response.status}): ${message}`);
  }

  console.info(JSON.stringify({
    event: 'vision_analysis_complete',
    provider: 'google-cloud-vision',
    labels: (result.labelAnnotations ?? []).slice(0, 15).map((label) => ({
      description: label.description,
      score: Number(label.score.toFixed(4)),
    })),
    objects: (result.localizedObjectAnnotations ?? []).slice(0, 15).map((object) => ({
      name: object.name,
      score: typeof object.score === 'number' ? Number(object.score.toFixed(4)) : null,
    })),
    detectedText: (result.textAnnotations?.[0]?.description ?? '').slice(0, MAX_LOG_TEXT_LENGTH),
  }));

  return {
    labels: result.labelAnnotations ?? [],
    objects: result.localizedObjectAnnotations ?? [],
    texts: result.textAnnotations ?? [],
  };
}

async function generateListingWithLLM(
  analysis: VisionAnalysis,
  apiKey: string,
  itemDescription?: string,
): Promise<Listing> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Create an honest, appealing person-to-person marketplace listing using the required response schema.',
        },
        { role: 'user', content: createPrompt(analysis, itemDescription) },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: listingResponseFormat,
    }),
  });

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return parseListing(
    content,
    analysis.labels.slice(0, 5).map((label) => label.description),
  );
}

async function generateListingFromImage(
  imageData: string,
  apiKey: string,
  itemDescription?: string,
): Promise<Listing> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Create an honest, appealing person-to-person marketplace listing using the required response schema.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${itemDescription ? `Seller notes: ${itemDescription}\n\n` : ''}Analyze this item and create a marketplace listing. Use one of these categories: Baby & Kids, Electronics, Home & Garden, Clothing, Sports, Books & Media, Vehicles, Tools, Collectibles. Always include: "Located in South Reno. Available for pickup or delivery for $20 delivery fee."`,
            },
            { type: 'image_url', image_url: { url: imageData, detail: 'low' } },
          ],
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
      response_format: listingResponseFormat,
    }),
  });

  const data = await response.json() as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(
      `OpenAI vision request failed (${response.status}): ${data.error?.message ?? 'Unknown provider error'}`,
    );
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI vision returned an empty response');

  return parseListing(content);
}

function parseListing(content: string, fallbackDetectedItems: string[] = []): Listing {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const price = parsed.price ?? parsed.estimatedPrice ?? parsed.estimated_price;
  const required = [parsed.title, parsed.description, parsed.category, price];
  if (required.some((field) => typeof field !== 'string' || !field)) {
    throw new Error('OpenAI response is missing required fields');
  }

  const detectedItems = Array.isArray(parsed.detectedItems)
    ? parsed.detectedItems.filter((item): item is string => typeof item === 'string').slice(0, 5)
    : fallbackDetectedItems;

  return {
    title: parsed.title as string,
    description: parsed.description as string,
    category: parsed.category as string,
    price: price as string,
    detectedItems,
  };
}

function logListingResult(
  pipeline: 'gemini-vision' | 'openai-vision' | 'openai-from-google-vision' | 'deterministic-from-google-vision',
  listing: Listing,
) {
  console.info(JSON.stringify({
    event: 'listing_generation_complete',
    pipeline,
    title: listing.title.slice(0, MAX_LOG_TEXT_LENGTH),
    description: listing.description.slice(0, MAX_LOG_TEXT_LENGTH),
    category: listing.category,
    price: listing.price,
    detectedItems: listing.detectedItems,
  }));
}

function createPrompt(analysis: VisionAnalysis, itemDescription?: string): string {
  const labels = analysis.labels
    .slice(0, 10)
    .map((label) => `${label.description} (${(label.score * 100).toFixed(1)}%)`);
  const objects = analysis.objects.slice(0, 8).map((object) => object.name);
  const detectedText = analysis.texts[0]?.description ?? '';

  return `${itemDescription ? `SELLER NOTES: ${itemDescription}\n\n` : ''}Create a marketplace listing from this image analysis.

Labels: ${labels.join(', ')}
Objects: ${objects.join(', ')}
Visible text: ${detectedText}

Use one of these categories: Baby & Kids, Electronics, Home & Garden, Clothing, Sports, Books & Media, Vehicles, Tools, Collectibles.
Always include: "Located in South Reno. Available for pickup or delivery for $20 delivery fee."`;
}

function extractBrands(text: string): string[] {
  const brands = [
    'Apple', 'Samsung', 'Nike', 'Adidas', 'IKEA', 'Fisher-Price', 'Sony', 'LG',
    'Microsoft', 'Dell', 'HP', 'Canon', 'Nikon', 'Toyota', 'Honda', 'Ford',
    'Lego', 'Barbie', 'Disney', 'Nintendo', 'PlayStation', 'Xbox', 'Target',
    'Walmart', 'Amazon', 'Google', 'Facebook', 'Instagram', 'TikTok',
  ];
  return brands.filter((brand) => text.toLowerCase().includes(brand.toLowerCase()));
}

function generateListingDeterministic(analysis: VisionAnalysis): Listing {
  const detectedItems = analysis.labels.slice(0, 5).map((label) => label.description);
  const detectedText = analysis.texts[0]?.description ?? '';
  const category = determineCategory(detectedItems);

  return {
    title: generateTitle(detectedItems, detectedText),
    description: generateDescription(analysis),
    category,
    price: estimatePrice(category),
    detectedItems,
  };
}

function generateDescription(analysis: VisionAnalysis): string {
  const mainItem = analysis.labels[0]?.description || 'item';
  const features = analysis.labels.slice(1, 4).map((label) => label.description).join(', ');
  const detectedText = analysis.texts[0]?.description ?? '';
  let description = `This ${mainItem.toLowerCase()} is in great condition and ready for its next home! `;

  if (features) description += `Notable features include ${features}. `;
  const brand = extractBrands(detectedText)[0];
  if (brand) description += `Brand: ${brand}. `;

  description += 'From a clean, smoke-free home. Located in South Reno. Available for pickup or delivery for $20 delivery fee. Happy to answer questions or provide additional photos.';
  return description;
}

function generateTitle(items: string[], text: string): string {
  const mainItem = items[0] || 'Item';
  const brand = extractBrands(text)[0];
  return brand
    ? `${brand} ${mainItem} - Great Condition`
    : `${mainItem} - Great Condition - Must See!`;
}

function determineCategory(items: string[]): string {
  const categories: Record<string, string[]> = {
    'Baby & Kids': ['toy', 'baby', 'child', 'kid', 'infant', 'toddler', 'stroller', 'crib', 'doll', 'game'],
    Electronics: ['phone', 'computer', 'laptop', 'tablet', 'electronic', 'device', 'camera', 'headphone', 'speaker'],
    'Home & Garden': ['furniture', 'chair', 'table', 'lamp', 'vase', 'plant', 'kitchen', 'home', 'decor', 'appliance'],
    Clothing: ['shirt', 'pants', 'dress', 'shoe', 'clothing', 'apparel', 'fashion', 'jacket', 'hat'],
    Sports: ['ball', 'sport', 'equipment', 'fitness', 'exercise', 'bike', 'bicycle', 'golf', 'tennis'],
    'Books & Media': ['book', 'magazine', 'cd', 'dvd', 'media', 'novel', 'textbook'],
    Vehicles: ['car', 'truck', 'motorcycle', 'vehicle', 'auto', 'boat'],
    Tools: ['tool', 'hammer', 'drill', 'saw', 'wrench', 'equipment'],
    Collectibles: ['collectible', 'vintage', 'antique', 'rare', 'signed'],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (items.some((item) => keywords.some((keyword) => item.toLowerCase().includes(keyword)))) {
      return category;
    }
  }
  return 'Home & Garden';
}

function estimatePrice(category: string): string {
  const prices: Record<string, string[]> = {
    'Baby & Kids': ['$10', '$20', '$35', '$50'],
    Electronics: ['$25', '$75', '$150', '$300'],
    'Home & Garden': ['$15', '$35', '$65', '$100'],
    Clothing: ['$8', '$15', '$25', '$40'],
    Sports: ['$20', '$45', '$75', '$120'],
    'Books & Media': ['$3', '$8', '$15', '$25'],
    Vehicles: ['$500', '$1500', '$3500', '$8000'],
    Tools: ['$15', '$35', '$75', '$150'],
    Collectibles: ['$20', '$50', '$100', '$250'],
  };
  const range = prices[category] ?? prices['Home & Garden'];
  return range[Math.floor(Math.random() * range.length)];
}
