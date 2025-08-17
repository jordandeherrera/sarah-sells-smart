import { useState } from 'react';
import { Camera, Upload, Sparkles, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const Index = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [itemDescription, setItemDescription] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [listingData, setListingData] = useState<{
    title: string;
    description: string;
    price: string;
    category: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!selectedImage) return;
    
    setIsAnalyzing(true);
    
    try {
      console.log('Calling AI analysis...');
      
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: { 
          imageData: selectedImage,
          itemDescription: itemDescription.trim() || undefined
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        throw new Error(error.message || 'Failed to analyze image');
      }

      console.log('AI analysis result:', data);

      setListingData({
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category
      });

      toast({
        title: "✨ Listing ready!",
        description: "Your item has been analyzed and a listing has been generated.",
      });

    } catch (error) {
      console.error('Error analyzing image:', error);
      toast({
        title: "Analysis failed",
        description: "Sorry, there was an issue analyzing your image. Please try again.",
        variant: "destructive"
      });
      
      // Fallback to demo data if AI fails
      const fallbackData = {
        title: "Beautiful Item - Great Condition!",
        description: "This lovely item has been well-maintained and is ready for a new home! Comes from a smoke-free home. Happy to answer any questions!",
        price: "$25",
        category: "Home & Garden"
      };
      setListingData(fallbackData);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = async () => {
    if (!listingData) return;
    
    const fullListing = `${listingData.title}

${listingData.description}

Price: ${listingData.price}`;

    try {
      await navigator.clipboard.writeText(fullListing);
      setCopied(true);
      toast({
        title: "Copied to clipboard! 📋",
        description: "Your listing is ready to paste on Facebook Marketplace.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Oops!",
        description: "Couldn't copy to clipboard. Please select and copy manually.",
        variant: "destructive"
      });
    }
  };

  const resetForm = () => {
    setSelectedImage(null);
    setItemDescription('');
    setListingData(null);
    setCopied(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="container mx-auto px-4 py-8 max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-orange-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            AI Listing Assistant 🚀
          </h1>
          <p className="text-gray-600">
            Turn your items into perfect marketplace listings in seconds!
          </p>
        </div>

        {/* Image Upload */}
        {!selectedImage && (
          <Card className="mb-6 border-2 border-dashed border-blue-200 bg-blue-50/50">
            <CardContent className="p-8 text-center">
              <label htmlFor="image-upload" className="cursor-pointer block">
                <Camera className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Snap a photo of your item
                </h3>
                <p className="text-gray-500 mb-4">
                  Just take a quick pic and I'll do the rest!
                </p>
                <div className="bg-blue-500 text-white px-6 py-3 rounded-full inline-flex items-center gap-2 font-medium hover:bg-blue-600 transition-colors">
                  <Upload className="w-5 h-5" />
                  Choose Photo
                </div>
              </label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageUpload}
                className="hidden"
              />
            </CardContent>
          </Card>
        )}

        {/* Optional Description Field - Always Visible */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <Label htmlFor="item-description" className="text-sm font-medium text-gray-700 mb-2 block">
              Item Description (Optional)
            </Label>
            <Textarea
              id="item-description"
              placeholder="Tell us about your item... (e.g., 'This is a vintage coffee table from the 1970s', 'Barely used, only worn twice', 'Great condition, comes with original box')"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              This helps our AI create a better listing by providing additional context about your item.
            </p>
          </CardContent>
        </Card>

        {/* Selected Image */}
        {selectedImage && !listingData && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <img
                src={selectedImage}
                alt="Selected item"
                className="w-full h-64 object-cover rounded-lg mb-4"
              />
              
              <div className="space-y-3">
                <Button
                  onClick={analyzeImage}
                  disabled={isAnalyzing}
                  className="w-full bg-gradient-to-r from-blue-500 to-orange-400 hover:from-blue-600 hover:to-orange-500 text-white py-6 text-lg font-medium"
                >
                  {isAnalyzing ? (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                      AI is analyzing your item...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Analyze with AI ✨
                    </>
                  )}
                </Button>
                <Button
                  onClick={resetForm}
                  variant="outline"
                  className="w-full"
                >
                  Choose Different Photo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated Listing */}
        {listingData && (
          <Card className="mb-6 border-green-200 bg-green-50/50">
            <CardHeader>
              <CardTitle className="text-green-700 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Your listing is ready! 🎉
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedImage && (
                <img
                  src={selectedImage}
                  alt="Listed item"
                  className="w-full h-48 object-cover rounded-lg"
                />
              )}
              
              <div className="bg-white p-4 rounded-lg border">
                <div className="text-sm text-gray-500 mb-1">Title</div>
                <h3 className="font-semibold text-gray-800 mb-3">
                  {listingData.title}
                </h3>
                
                <div className="text-sm text-gray-500 mb-1">Description</div>
                <p className="text-gray-700 mb-3 leading-relaxed">
                  {listingData.description}
                </p>
                
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-gray-500">Suggested Price</div>
                    <div className="text-2xl font-bold text-green-600">
                      {listingData.price}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Category</div>
                    <div className="font-medium text-gray-700">
                      {listingData.category}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={copyToClipboard}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-6 text-lg font-medium"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Copied! Ready to paste 📋
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5 mr-2" />
                      Copy listing to clipboard
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={resetForm}
                  variant="outline"
                  className="w-full"
                >
                  List another item
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mt-8">
          <p>Made with ❤️ to help make selling easier</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
