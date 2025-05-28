
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VisionAnalysis {
  labels: any[];
  objects: any[];
  texts: any[];
  faces?: any[];
  landmarks?: any[];
  safeSearch?: any;
}

serve(async (req) => {
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

    const googleApiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!googleApiKey) {
      return new Response(JSON.stringify({ error: 'Google Cloud API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get comprehensive vision analysis
    const visionAnalysis = await getEnhancedVisionAnalysis(imageData, googleApiKey);
    
    let listing;
    
    // Try LLM generation first, fallback to deterministic
    if (openaiApiKey) {
      try {
        listing = await generateListingWithLLM(visionAnalysis, openaiApiKey);
      } catch (error) {
        console.error('LLM generation failed, falling back to deterministic:', error);
        listing = generateListingDeterministic(visionAnalysis);
      }
    } else {
      listing = generateListingDeterministic(visionAnalysis);
    }

    return new Response(JSON.stringify({
      ...listing,
      confidence: visionAnalysis.labels[0]?.score || 0.8,
      analysisMethod: openaiApiKey ? 'llm' : 'deterministic'
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

async function getEnhancedVisionAnalysis(imageData: string, apiKey: string): Promise<VisionAnalysis> {
  const base64Image = imageData.replace(/^data:image\/[a-z]+;base64,/, '');

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
          { type: 'FACE_DETECTION', maxResults: 5 },
          { type: 'LANDMARK_DETECTION', maxResults: 5 },
          { type: 'SAFE_SEARCH_DETECTION' }
        ]
      }]
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Vision API error: ${JSON.stringify(data)}`);
  }

  const result = data.responses[0];
  return {
    labels: result.labelAnnotations || [],
    objects: result.localizedObjectAnnotations || [],
    texts: result.textAnnotations || [],
    faces: result.faceAnnotations || [],
    landmarks: result.landmarkAnnotations || [],
    safeSearch: result.safeSearchAnnotation
  };
}

async function generateListingWithLLM(analysis: VisionAnalysis, apiKey: string) {
  const prompt = createEnhancedPrompt(analysis);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert at creating compelling marketplace listings (like Facebook Marketplace, Craigslist, etc.). 
          Create listings that are honest, appealing, and likely to sell quickly. 
          Always maintain a friendly, trustworthy tone. Focus on benefits and condition.
          Respond with a JSON object containing: title, description, category, and estimatedPrice.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 800
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
  }

  try {
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    return {
      title: parsed.title || 'Quality Item for Sale',
      description: parsed.description || 'Great item in good condition!',
      category: parsed.category || 'Home & Garden',
      price: parsed.estimatedPrice || '$25',
      detectedItems: analysis.labels.slice(0, 5).map(l => l.description)
    };
  } catch (parseError) {
    throw new Error(`Failed to parse LLM response: ${parseError.message}`);
  }
}

function createEnhancedPrompt(analysis: VisionAnalysis): string {
  const labels = analysis.labels.slice(0, 10).map(l => 
    `${l.description} (confidence: ${(l.score * 100).toFixed(1)}%)`
  );
  
  const objects = analysis.objects.slice(0, 8).map(o => o.name);
  
  const detectedText = analysis.texts.length > 0 ? analysis.texts[0].description : '';
  
  const brands = extractBrands(detectedText);
  const colors = extractColors(analysis.labels);
  const materials = extractMaterials(analysis.labels);
  
  return `Create a marketplace listing for an item based on this AI vision analysis:

DETECTED LABELS: ${labels.join(', ')}

DETECTED OBJECTS: ${objects.join(', ')}

DETECTED TEXT: "${detectedText}"

DETECTED BRANDS: ${brands.length > 0 ? brands.join(', ') : 'None detected'}

COLORS: ${colors.join(', ')}

MATERIALS: ${materials.join(', ')}

ADDITIONAL CONTEXT:
- This is for a person-to-person marketplace (like Facebook Marketplace)
- Focus on condition, functionality, and appeal to buyers
- Include pickup/delivery information
- Be honest about condition while highlighting positives
- Suggest appropriate category from: Baby & Kids, Electronics, Home & Garden, Clothing, Sports, Books & Media, Vehicles, Tools, Collectibles

Create a compelling listing that would attract buyers while being truthful.`;
}

function extractBrands(text: string): string[] {
  const brands = [
    'Apple', 'Samsung', 'Nike', 'Adidas', 'IKEA', 'Fisher-Price', 'Sony', 'LG',
    'Microsoft', 'Dell', 'HP', 'Canon', 'Nikon', 'Toyota', 'Honda', 'Ford',
    'Lego', 'Barbie', 'Disney', 'Nintendo', 'PlayStation', 'Xbox', 'Target',
    'Walmart', 'Amazon', 'Google', 'Facebook', 'Instagram', 'TikTok'
  ];
  
  return brands.filter(brand => 
    text.toLowerCase().includes(brand.toLowerCase())
  );
}

function extractColors(labels: any[]): string[] {
  const colors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 
                 'black', 'white', 'gray', 'brown', 'silver', 'gold'];
  
  return labels
    .map(l => l.description.toLowerCase())
    .filter(desc => colors.some(color => desc.includes(color)))
    .slice(0, 3);
}

function extractMaterials(labels: any[]): string[] {
  const materials = ['wood', 'metal', 'plastic', 'glass', 'fabric', 'leather', 
                    'ceramic', 'paper', 'cardboard', 'stone', 'rubber'];
  
  return labels
    .map(l => l.description.toLowerCase())
    .filter(desc => materials.some(material => desc.includes(material)))
    .slice(0, 3);
}

// Fallback deterministic generation
function generateListingDeterministic(analysis: VisionAnalysis) {
  const detectedItems = analysis.labels.slice(0, 5).map(l => l.description);
  const detectedText = analysis.texts.length > 0 ? analysis.texts[0].description : '';
  
  return {
    title: generateTitle(detectedItems, detectedText),
    description: generateEnhancedDescription(analysis),
    category: determineCategory(detectedItems),
    price: estimatePrice(determineCategory(detectedItems), detectedItems),
    detectedItems
  };
}

function generateEnhancedDescription(analysis: VisionAnalysis): string {
  const mainItem = analysis.labels[0]?.description || 'item';
  const features = analysis.labels.slice(1, 4).map(l => l.description).join(', ');
  const detectedText = analysis.texts.length > 0 ? analysis.texts[0].description : '';
  
  let description = `This ${mainItem.toLowerCase()} is in great condition and ready for its next home! `;
  
  if (features) {
    description += `Notable features include ${features}. `;
  }
  
  if (detectedText && detectedText.length > 10) {
    const brands = extractBrands(detectedText);
    if (brands.length > 0) {
      description += `Brand: ${brands[0]}. `;
    }
  }
  
  // Add condition indicators based on analysis confidence
  const avgConfidence = analysis.labels.slice(0, 3).reduce((acc, l) => acc + l.score, 0) / Math.min(3, analysis.labels.length);
  
  if (avgConfidence > 0.9) {
    description += `Excellent condition with clear details visible. `;
  } else if (avgConfidence > 0.7) {
    description += `Good condition with normal signs of use. `;
  }
  
  description += `From a clean, smoke-free home. Happy to answer questions or provide additional photos. Available for pickup or can meet at a safe public location.`;
  
  return description;
}

function generateTitle(items: string[], text: string): string {
  const mainItem = items[0] || 'Item';
  const brand = extractBrands(text)[0];
  const condition = 'Great Condition';
  
  if (brand) {
    return `${brand} ${mainItem} - ${condition}`;
  }
  return `${mainItem} - ${condition} - Must See!`;
}

function determineCategory(items: string[]): string {
  const categories = {
    'Baby & Kids': ['toy', 'baby', 'child', 'kid', 'infant', 'toddler', 'stroller', 'crib', 'doll', 'game'],
    'Electronics': ['phone', 'computer', 'laptop', 'tablet', 'electronic', 'device', 'camera', 'headphone', 'speaker'],
    'Home & Garden': ['furniture', 'chair', 'table', 'lamp', 'vase', 'plant', 'kitchen', 'home', 'decor', 'appliance'],
    'Clothing': ['shirt', 'pants', 'dress', 'shoe', 'clothing', 'apparel', 'fashion', 'jacket', 'hat'],
    'Sports': ['ball', 'sport', 'equipment', 'fitness', 'exercise', 'bike', 'bicycle', 'golf', 'tennis'],
    'Books & Media': ['book', 'magazine', 'cd', 'dvd', 'media', 'novel', 'textbook'],
    'Vehicles': ['car', 'truck', 'motorcycle', 'vehicle', 'auto', 'boat'],
    'Tools': ['tool', 'hammer', 'drill', 'saw', 'wrench', 'equipment'],
    'Collectibles': ['collectible', 'vintage', 'antique', 'rare', 'signed']
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
    'Baby & Kids': ['$10', '$20', '$35', '$50'],
    'Electronics': ['$25', '$75', '$150', '$300'],
    'Home & Garden': ['$15', '$35', '$65', '$100'],
    'Clothing': ['$8', '$15', '$25', '$40'],
    'Sports': ['$20', '$45', '$75', '$120'],
    'Books & Media': ['$3', '$8', '$15', '$25'],
    'Vehicles': ['$500', '$1500', '$3500', '$8000'],
    'Tools': ['$15', '$35', '$75', '$150'],
    'Collectibles': ['$20', '$50', '$100', '$250']
  };

  const prices = priceRanges[category] || priceRanges['Home & Garden'];
  return prices[Math.floor(Math.random() * prices.length)];
}
