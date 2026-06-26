# Shopify Editor App

This is a specialized React + Vite application designed to manage and edit Shopify products, prices, and metafields. It connects directly to your Shopify store via the Admin API and integrates AI features via Gemini/Groq.

## Features

- **Direct Shopify Integration:** Edit product prices, variants, and metadata directly.
- **Bulk Operations:** Handle multiple products efficiently.
- **AI Integration:** Powered by Gemini & Groq APIs for intelligent features.
- **Vercel Ready:** Pre-configured for easy deployment.

## Prerequisites

Before running this app, ensure you have:
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A Shopify Custom App with Admin API Access (specifically for Products, Metafields, etc.)
- API Keys for Gemini and/or Groq (if using the AI features)

## Installation & Setup

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/esponclothing/SHOPIFY-EDITOR-APP.git
   cd SHOPIFY-EDITOR-APP
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following keys. **Do not commit this file to version control.**

   ```env
   VITE_SHOPIFY_STORE_URL=https://your-store.myshopify.com
   VITE_SHOPIFY_ACCESS_TOKEN=shpat_your_access_token_here
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_GROQ_API_KEY=your_groq_api_key_here
   ```

## Running the App

To start the development server:
```bash
npm run dev
```
The app will typically be available at `http://localhost:5173`.

## Deployment

This app is configured to be deployed easily on Vercel. 
To deploy, simply push your code to GitHub and connect it to Vercel, ensuring you add the Environment Variables in your Vercel project settings.

Alternatively, use the Vercel CLI:
```bash
npm run deploy
```

## Troubleshooting

- **CORS Issues:** If you face CORS issues while the frontend talks directly to Shopify, ensure the backend API (in the `/api` directory) or Vercel serverless functions are configured to proxy the requests, or use a local proxy during development.
- **Missing Data:** Verify that your Shopify Custom App has all the required Admin API scopes (e.g., `read_products`, `write_products`, `read_inventory`).
