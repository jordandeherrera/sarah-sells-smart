# Sarah Sells Smart

Sarah Sells Smart turns a photo and optional seller notes into a marketplace listing with a title, description, suggested price, and category.

The React application is hosted as static assets on Cloudflare Workers. Clerk handles user authentication, and a Supabase Edge Function uses OpenAI vision with a Gemini multimodal fallback.

## Architecture

- React, TypeScript, Vite, Tailwind CSS, and shadcn/ui
- Clerk React SDK for sign-in and session management
- Direct Clerk JWKS verification inside the Supabase Edge Function
- Supabase Edge Function for Gemini and OpenAI vision requests
- Cloudflare Workers Static Assets for production hosting
- Cloudflare Workers Builds for deployments from `main`

## Local development

Requirements:

- Node.js 20.19 or newer (or Node.js 22.12 or newer)
- npm
- A Clerk application
- Supabase CLI access when developing or deploying the Edge Function

Install dependencies and create local configuration:

```sh
npm ci
cp .env.example .env.local
```

Set these public browser variables in `.env.local`:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
VITE_SUPABASE_URL=https://ybdfjsofgzzmwlyxdmba.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=replace_with_your_supabase_publishable_key
```

Start Vite:

```sh
npm run dev
```

The development server listens on `http://localhost:8080`.

## Clerk and Supabase authentication

The application verifies Clerk session tokens against the Clerk instance's
public JWKS. It does not use a Clerk secret key, custom JWT verification key,
Supabase service-role key, or shared JWT template.

Configure the allowed sign-in and sign-up methods in Clerk. Supabase
Third-Party Auth is only required if the frontend later accesses Supabase
Database, Storage, or Realtime directly.

The frontend passes `session.getToken()` to the Supabase client's `accessToken`
callback. The `analyze-image` function validates that token against Clerk's
public JWKS before processing the request.

For local Supabase services, uncomment the Clerk section in `supabase/config.toml` and provide the Clerk instance domain.

## Supabase Edge Function

The function expects these existing Supabase project secrets:

- `OPENAI_API_KEY` — primary OpenAI vision credential
- `GEMINI_API_KEY` — Gemini vision fallback

Check the configured secrets without printing their values:

```sh
npx supabase secrets list --project-ref ybdfjsofgzzmwlyxdmba
```

Function deployments are intentionally manual:

```sh
npx supabase functions deploy analyze-image --project-ref ybdfjsofgzzmwlyxdmba --no-verify-jwt
```

Supabase gateway JWT verification is disabled for this function. The function
itself rejects requests unless the Clerk signature, issuer, expiry, and
authorized-party origin are valid.

## Quality checks

```sh
npm run typecheck
npm run lint
npm run build
npm run deploy:dry-run
```

Preview the Cloudflare build locally:

```sh
npm run build
npm run preview
```

## Cloudflare deployment

The repository contains `wrangler.jsonc` for the `sarah-sells-smart` Worker. It serves `dist` with single-page-application fallback routing.

In the Cloudflare dashboard:

1. Open **Workers & Pages → Create application → Import a repository**.
2. Select this GitHub repository.
3. Set the production branch to `main` and disable non-production branch builds.
4. Set the build command to `npm ci && npm run build`.
5. Set the deploy command to `npx wrangler deploy`.
6. Add these build variables:
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
7. Save and deploy.

Every push to `main` will build and deploy the frontend. Supabase function changes still require the manual command above.

The Worker name in Cloudflare must remain `sarah-sells-smart` to match `wrangler.jsonc`.

## Request limits

- Signed-in Clerk session required
- JPEG, PNG, and WebP images only
- Maximum source image size: 5 MB
- Maximum optional description length: 1,000 characters

## License

MIT
