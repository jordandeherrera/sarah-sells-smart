# Sarah Sells Smart 🚀

An AI-powered marketplace listing assistant that helps you create compelling listings for items you want to sell. Simply take a photo of your item, and our AI will generate a professional title, description, suggested price, and category for platforms like Facebook Marketplace, Craigslist, and more.

## ✨ Features

- **AI-Powered Analysis**: Uses Google Cloud Vision API and OpenAI to analyze item photos
- **Smart Listing Generation**: Creates compelling titles and descriptions automatically
- **Price Estimation**: Suggests competitive prices based on item analysis
- **Category Detection**: Automatically categorizes items for better marketplace visibility
- **One-Click Copy**: Copy generated listings directly to your clipboard
- **Mobile-First Design**: Optimized for taking photos on mobile devices
- **Fallback System**: Works even when AI services are unavailable

## 🏗️ Project Structure

```
sarah-sells-smart/
├── src/
│   ├── components/ui/          # shadcn/ui components
│   ├── hooks/                  # Custom React hooks
│   ├── integrations/
│   │   └── supabase/          # Supabase client configuration
│   ├── lib/                   # Utility functions
│   ├── pages/                 # Application pages
│   │   ├── Index.tsx          # Main listing generation page
│   │   └── NotFound.tsx       # 404 page
│   └── App.tsx                # Main application component
├── supabase/
│   ├── config.toml            # Supabase configuration
│   └── functions/
│       └── analyze-image/     # Edge function for AI analysis
├── public/                    # Static assets
└── package.json               # Dependencies and scripts
```

## 🛠️ Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI Components**: shadcn/ui, Radix UI, Tailwind CSS
- **Backend**: Supabase Edge Functions
- **AI Services**: Google Cloud Vision API, OpenAI GPT-4
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router DOM
- **Styling**: Tailwind CSS with custom animations

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- Google Cloud Vision API key (optional but recommended)
- OpenAI API key (optional but recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <YOUR_GIT_URL>
   cd sarah-sells-smart
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Configure Supabase**
   - Set up a new Supabase project
   - Deploy the edge function:
     ```bash
     supabase functions deploy analyze-image
     ```
   - Set environment variables in Supabase dashboard:
     - `GOOGLE_CLOUD_API_KEY` (optional)
     - `OPENAI_API_KEY` (optional)

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to `http://localhost:5173`

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build for development
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Code Structure

#### Frontend Architecture
- **Component-based**: Uses shadcn/ui components for consistent design
- **Type-safe**: Full TypeScript implementation
- **Responsive**: Mobile-first design with Tailwind CSS
- **State Management**: React Query for server state, React hooks for local state

#### AI Analysis Flow
1. User uploads/takes photo
2. Image sent to Supabase Edge Function
3. Google Cloud Vision API analyzes image
4. OpenAI generates listing (if available)
5. Fallback to deterministic generation if AI fails
6. Results returned to frontend

#### Key Components
- `Index.tsx`: Main application interface
- `analyze-image/index.ts`: Supabase Edge Function for AI analysis
- `client.ts`: Supabase client configuration

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and linting: `npm run lint`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Contribution Guidelines

- **Code Style**: Follow the existing TypeScript and React patterns
- **Testing**: Add tests for new features
- **Documentation**: Update README and add comments for complex logic
- **Commits**: Use conventional commit messages
- **PRs**: Provide clear descriptions of changes

### Areas for Contribution

- **UI/UX Improvements**: Better mobile experience, accessibility
- **AI Enhancements**: More sophisticated listing generation
- **Platform Integration**: Support for more marketplaces
- **Performance**: Optimize image processing and API calls
- **Testing**: Add comprehensive test coverage
- **Documentation**: Improve guides and examples

## 🔒 Environment Variables

### Required
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key

### Optional (for enhanced AI features)
- `GOOGLE_CLOUD_API_KEY`: Google Cloud Vision API key
- `OPENAI_API_KEY`: OpenAI API key for GPT-4 integration

## 🚀 Deployment

### Using Lovable
1. Open [Lovable](https://lovable.dev/projects/fffb7e1a-df81-49a3-8a14-6c180ad4bcd0)
2. Click Share → Publish

### Manual Deployment
1. Build the project: `npm run build`
2. Deploy to your preferred hosting platform (Vercel, Netlify, etc.)
3. Set environment variables in your hosting platform

### Custom Domain
- Navigate to Project > Settings > Domains in Lovable
- Click Connect Domain
- Follow the DNS configuration instructions

## 📱 Usage

1. **Take a Photo**: Use your camera or upload an image of the item you want to sell
2. **AI Analysis**: Click "Analyze with AI" to process your image
3. **Review Results**: Check the generated title, description, price, and category
4. **Copy Listing**: Click "Copy listing to clipboard" to get the formatted text
5. **Paste & Sell**: Paste the listing into your preferred marketplace

## 🐛 Troubleshooting

### Common Issues

**AI Analysis Fails**
- Check that your API keys are properly configured
- Verify your Supabase Edge Function is deployed
- Check browser console for error messages

**Image Upload Issues**
- Ensure you're using a supported image format (JPEG, PNG, WebP)
- Check that the image file size isn't too large
- Try refreshing the page and uploading again

**Copy to Clipboard Fails**
- Ensure you're using HTTPS (required for clipboard API)
- Try manually selecting and copying the text
- Check browser permissions for clipboard access

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [shadcn/ui](https://ui.shadcn.com/) components
- Powered by [Supabase](https://supabase.com/) and [OpenAI](https://openai.com/)
- Icons from [Lucide React](https://lucide.dev/)

## 📞 Support

- **Issues**: Create an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the [Lovable docs](https://docs.lovable.dev/)

---

Made with ❤️ to help make selling easier
