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
  console.log('🚀 Function started - analyze-image');
  
  if (req.method === 'OPTIONS') {
    console.log('⚡ CORS preflight request handled');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Parsing request body...');
    const { imageData } = await req.json();
    console.log('📊 Request parsed successfully, imageData length:', imageData?.length || 'undefined');
    
    if (!imageData) {
      console.error('❌ No image data provided in request');
      return new Response(JSON.stringify({ error: 'No image data provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const googleCloudApiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    console.log('🔑 Checking API keys...');
    console.log('🔧 GOOGLE_CLOUD_API_KEY present:', !!googleCloudApiKey);
    console.log('🔧 GOOGLE_CLOUD_API_KEY length:', googleCloudApiKey?.length || 0);
    console.log('🤖 OPENAI_API_KEY present:', !!openaiApiKey);
    console.log('🤖 OPENAI_API_KEY length:', openaiApiKey?.length || 0);
    
    if (!googleCloudApiKey) {
      console.error('❌ GOOGLE_CLOUD_API_KEY not found in environment variables');
      return new Response(JSON.stringify({ error: 'Google Cloud API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔍 Starting vision analysis...');
    
    let visionAnalysis;
    try {
      visionAnalysis = await getEnhancedVisionAnalysis(imageData, googleCloudApiKey);
      console.log('📊 Vision analysis complete:', {
        labelsCount: visionAnalysis.labels.length,
        objectsCount: visionAnalysis.objects.length,
        textsCount: visionAnalysis.texts.length
      });
    } catch (visionError) {
      console.error('💥 Vision analysis failed:', visionError);
      throw visionError;
    }
    
    let listing;
    
    // Try LLM generation first, fallback to deterministic
    if (openaiApiKey) {
      try {
        console.log('🤖 Attempting LLM generation...');
        listing = await generateListingWithLLM(visionAnalysis, openaiApiKey);
        console.log('✅ LLM generation successful');
      } catch (error) {
        console.error('❌ LLM generation failed, falling back to deterministic:', error);
        listing = generateListingDeterministic(visionAnalysis);
        console.log('🔄 Using deterministic generation');
      }
    } else {
      console.log('🔄 No OpenAI key, using deterministic generation');
      listing = generateListingDeterministic(visionAnalysis);
    }

    console.log('📝 Final listing generated:', {
      title: listing.title,
      category: listing.category,
      price: listing.price,
      descriptionLength: listing.description?.length || 0
    });

    const finalResponse = {
      ...listing,
      confidence: visionAnalysis.labels[0]?.score || 0.8,
      analysisMethod: openaiApiKey ? 'llm' : 'deterministic'
    };

    console.log('✅ Sending successful response');
    return new Response(JSON.stringify(finalResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Error in analyze-image function:', error);
    console.error('💥 Error name:', error.name);
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      errorType: error.name,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getEnhancedVisionAnalysis(imageData, apiKey) {
  console.log('📡 Starting Google Vision API call...');
  
  const base64Image = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
  console.log('🖼️ Image data prepared, base64 length:', base64Image.length);

  const requestBody = {
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
  };
  
  console.log('📤 Making Vision API request...');
  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  console.log('📥 Vision API response status:', response.status);
  console.log('📥 Vision API response ok:', response.ok);

  const data = await response.json();
  console.log('📄 Vision API response data keys:', Object.keys(data));
  
  if (!response.ok) {
    console.error('❌ Vision API error response:', data);
    console.error('❌ Vision API error status:', response.status);
    console.error('❌ Vision API error statusText:', response.statusText);
    throw new Error(`Vision API error (${response.status}): ${JSON.stringify(data)}`);
  }

  console.log('✅ Vision API response successful');
  console.log('📊 Response structure:', {
    responses: data.responses?.length || 0,
    firstResponse: data.responses?.[0] ? Object.keys(data.responses[0]) : 'none'
  });

  const result = data.responses[0];
  const analysis = {
    labels: result.labelAnnotations || [],
    objects: result.localizedObjectAnnotations || [],
    texts: result.textAnnotations || [],
    faces: result.faceAnnotations || [],
    landmarks: result.landmarkAnnotations || [],
    safeSearch: result.safeSearchAnnotation
  };

  console.log('📊 Final analysis counts:', {
    labels: analysis.labels.length,
    objects: analysis.objects.length,
    texts: analysis.texts.length,
    faces: analysis.faces.length,
    landmarks: analysis.landmarks.length
  });

  return analysis;
}

async function generateListingWithLLM(analysis, apiKey) {
  console.log('🤖 Starting LLM generation...');
  const prompt = createEnhancedPrompt(analysis);
  console.log('📝 Prompt created, length:', prompt.length);
  
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
          
          IMPORTANT: Respond with ONLY a valid JSON object. Do not include any markdown formatting, code blocks, or additional text.
          The JSON must contain exactly these fields: title, description, category, and estimatedPrice.`
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

  console.log('🤖 OpenAI response status:', response.status);
  const data = await response.json();
  console.log('🤖 OpenAI response received');
  
  if (!response.ok) {
    console.error('❌ OpenAI API error:', data);
    throw new Error(`OpenAI API error: ${JSON.stringify(data)}`);
  }

  try {
    const content = data.choices[0].message.content;
    console.log('📄 Raw OpenAI response:', content);
    
    const cleanedContent = cleanJsonResponse(content);
    console.log('🧹 Cleaned OpenAI response:', cleanedContent);
    
    const parsed = JSON.parse(cleanedContent);
    console.log('✅ Successfully parsed OpenAI response');
    
    // Validate required fields
    if (!parsed.title || !parsed.description || !parsed.category || !parsed.estimatedPrice) {
      console.error('❌ Missing required fields in OpenAI response:', {
        title: !!parsed.title,
        description: !!parsed.description,
        category: !!parsed.category,
        estimatedPrice: !!parsed.estimatedPrice
      });
      throw new Error('Missing required fields in OpenAI response');
    }
    
    return {
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      price: parsed.estimatedPrice,
      detectedItems: analysis.labels.slice(0, 5).map(l => l.description)
    };
  } catch (parseError) {
    console.error('💥 Parse error details:', parseError);
    console.error('📄 Content that failed to parse:', data.choices[0].message.content);
    throw new Error(`Failed to parse LLM response: ${parseError.message}`);
  }
}

function cleanJsonResponse(content) {
  // Remove markdown code block syntax
  return content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
}

function createEnhancedPrompt(analysis) {
  const labels = analysis.labels.slice(0, 10).map(l => 
    `${l.description} (confidence: ${(l.score * 100).toFixed(1)}%)`
  );
  
  const objects = analysis.objects.slice(0, 8).map(o => o.name);
  
  const detectedText = analysis.texts.length > 0 ? analysis.texts[0].description : '';
  
  const brands = extractBrands(detectedText);
  const colors = extractColorsImproved(analysis.labels);
  const materials = extractMaterials(analysis.labels);
  
  console.log('Color extraction debug:', {
    rawLabels: analysis.labels.slice(0, 10).map(l => l.description),
    extractedColors: colors,
    materials: materials
  });
  
  return `Create a marketplace listing for an item based on this AI vision analysis:

DETECTED LABELS: ${labels.join(', ')}

DETECTED OBJECTS: ${objects.join(', ')}

DETECTED TEXT: "${detectedText}"

DETECTED BRANDS: ${brands.length > 0 ? brands.join(', ') : 'None detected'}

COLORS: ${colors.length > 0 ? colors.join(', ') : 'Please infer likely colors from the item type'}

MATERIALS: ${materials.join(', ')}

ADDITIONAL CONTEXT:
- This is for a person-to-person marketplace (like Facebook Marketplace)
- Focus on condition, functionality, and appeal to buyers
- Include pickup/delivery information
- Be honest about condition while highlighting positives
- If no clear colors were detected, please infer likely colors based on the item type and common variants
- Suggest appropriate category from: Baby & Kids, Electronics, Home & Garden, Clothing, Sports, Books & Media, Vehicles, Tools, Collectibles

Create a compelling listing that would attract buyers while being truthful.`;
}

function extractBrands(text) {
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

function extractColorsImproved(labels) {
  // Define pure color words that we want to match
  const pureColors = [
    'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 
    'black', 'white', 'gray', 'grey', 'brown', 'beige', 'tan', 'navy',
    'turquoise', 'cyan', 'magenta', 'maroon', 'olive', 'lime', 'teal'
  ];
  
  // Materials/finishes that are often confused with colors
  const materialsToExclude = [
    'silver', 'gold', 'bronze', 'copper', 'metallic', 'chrome', 'steel',
    'aluminum', 'brass', 'platinum', 'iron'
  ];
  
  const detectedColors = [];
  
  for (const label of labels) {
    const description = label.description.toLowerCase();
    const confidence = label.score;
    
    // Only consider labels with decent confidence
    if (confidence < 0.6) continue;
    
    // Check for pure color matches
    for (const color of pureColors) {
      // Look for color as a standalone word or at the beginning of a compound word
      const colorRegex = new RegExp(`\\b${color}\\b|^${color}(?=[A-Z]|\\s)`, 'i');
      
      if (colorRegex.test(description)) {
        // Additional check: make sure it's not part of a material description
        const isPartOfMaterial = materialsToExclude.some(material => 
          description.includes(`${color} ${material}`) || 
          description.includes(`${material} ${color}`)
        );
        
        if (!isPartOfMaterial && !detectedColors.includes(color)) {
          detectedColors.push(color);
          console.log(`Found color "${color}" in label "${description}" with confidence ${confidence}`);
        }
      }
    }
  }
  
  return detectedColors.slice(0, 3);
}

function extractMaterials(labels) {
  const materials = ['wood', 'metal', 'plastic', 'glass', 'fabric', 'leather', 
                    'ceramic', 'paper', 'cardboard', 'stone', 'rubber'];
  
  return labels
    .map(l => l.description.toLowerCase())
    .filter(desc => materials.some(material => desc.includes(material)))
    .slice(0, 3);
}

// Fallback deterministic generation
function generateListingDeterministic(analysis) {
  console.log('⚙️ Using deterministic generation');
  const detectedItems = analysis.labels.slice(0, 5).map(l => l.description);
  const detectedText = analysis.texts.length > 0 ? analysis.texts[0].description : '';
  
  const listing = {
    title: generateTitle(detectedItems, detectedText),
    description: generateEnhancedDescription(analysis),
    category: determineCategory(detectedItems),
    price: estimatePrice(determineCategory(detectedItems), detectedItems),
    detectedItems
  };

  console.log('⚙️ Deterministic listing created:', {
    title: listing.title,
    category: listing.category,
    price: listing.price
  });

  return listing;
}

function generateEnhancedDescription(analysis) {
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

function generateTitle(items, text) {
  const mainItem = items[0] || 'Item';
  const brand = extractBrands(text)[0];
  const condition = 'Great Condition';
  
  if (brand) {
    return `${brand} ${mainItem} - ${condition}`;
  }
  return `${mainItem} - ${condition} - Must See!`;
}

function determineCategory(items) {
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

function estimatePrice(category, items) {
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
