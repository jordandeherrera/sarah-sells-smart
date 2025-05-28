
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();
    
    if (!imageData) {
      return new Response(JSON.stringify({ error: 'No image data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google Cloud API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Remove data URL prefix if present
    const base64Image = imageData.replace(/^data:image\/[a-z]+;base64,/, '');

    // Call Google Vision API
    const visionResponse = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 5 }
            ]
          }
        ]
      })
    });

    const visionData = await visionResponse.json();
    
    if (!visionResponse.ok) {
      console.error('Vision API error:', visionData);
      return new Response(JSON.stringify({ error: 'Failed to analyze image' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = visionData.responses[0];
    const labels = result.labelAnnotations || [];
    const objects = result.localizedObjectAnnotations || [];
    const texts = result.textAnnotations || [];

    // Generate listing based on detected objects and labels
    const detectedItems = [...labels, ...objects].map(item => item.description || item.name).slice(0, 5);
    const detectedText = texts.length > 0 ? texts[0].description : '';

    // Create a smart listing based on detected content
    const title = generateTitle(detectedItems, detectedText);
    const description = generateDescription(detectedItems, detectedText);
    const category = determineCategory(detectedItems);
    const price = estimatePrice(category, detectedItems);

    return new Response(JSON.stringify({
      title,
      description,
      price,
      category,
      detectedItems,
      confidence: labels[0]?.score || 0.8
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-image function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateTitle(items: string[], text: string): string {
  const mainItem = items[0] || 'Item';
  const brand = extractBrand(text);
  const condition = 'Gently Used';
  
  if (brand) {
    return `${condition} ${brand} ${mainItem} - Great Condition!`;
  }
  return `${condition} ${mainItem} - Perfect for Your Home!`;
}

function generateDescription(items: string[], text: string): string {
  const mainItem = items[0] || 'item';
  const features = items.slice(1, 3).join(', ');
  
  let description = `This lovely ${mainItem.toLowerCase()} has been well-maintained and is ready for a new home! `;
  
  if (features) {
    description += `Features include ${features}. `;
  }
  
  if (text && text.length > 10) {
    description += `Additional details visible in the photos. `;
  }
  
  description += `Comes from a smoke-free home. Happy to answer any questions! Pick up available or can meet at a safe public location.`;
  
  return description;
}

function determineCategory(items: string[]): string {
  const categories = {
    'Baby & Kids': ['toy', 'baby', 'child', 'kid', 'infant', 'toddler', 'stroller', 'crib'],
    'Electronics': ['phone', 'computer', 'laptop', 'tablet', 'electronic', 'device', 'camera'],
    'Home & Garden': ['furniture', 'chair', 'table', 'lamp', 'vase', 'plant', 'kitchen', 'home'],
    'Clothing': ['shirt', 'pants', 'dress', 'shoe', 'clothing', 'apparel', 'fashion'],
    'Sports': ['ball', 'sport', 'equipment', 'fitness', 'exercise', 'bike', 'bicycle'],
    'Books & Media': ['book', 'magazine', 'cd', 'dvd', 'media', 'novel'],
    'Vehicles': ['car', 'truck', 'motorcycle', 'vehicle', 'auto']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (items.some(item => keywords.some(keyword => 
      item.toLowerCase().includes(keyword.toLowerCase())
    ))) {
      return category;
    }
  }
  
  return 'Home & Garden';
}

function estimatePrice(category: string, items: string[]): string {
  const priceRanges = {
    'Baby & Kids': ['$15', '$25', '$35', '$45'],
    'Electronics': ['$50', '$75', '$100', '$150'],
    'Home & Garden': ['$20', '$35', '$50', '$75'],
    'Clothing': ['$10', '$15', '$25', '$35'],
    'Sports': ['$25', '$40', '$60', '$80'],
    'Books & Media': ['$5', '$10', '$15', '$20'],
    'Vehicles': ['$500', '$1000', '$2000', '$5000']
  };

  const prices = priceRanges[category] || priceRanges['Home & Garden'];
  return prices[Math.floor(Math.random() * prices.length)];
}

function extractBrand(text: string): string | null {
  const commonBrands = ['Apple', 'Samsung', 'Nike', 'Adidas', 'IKEA', 'Fisher-Price', 'Sony', 'LG'];
  
  for (const brand of commonBrands) {
    if (text.toLowerCase().includes(brand.toLowerCase())) {
      return brand;
    }
  }
  
  return null;
}
