# Wardrobe Studio AI setup

This folder contains the secure image-analysis endpoint for the Wardrobe Studio photo-assist feature.

## What it does

- Accepts a compressed clothing photo from the Wardrobe Studio website.
- Sends the photo to OpenAI's vision-capable Responses API using the secret stored on the Worker.
- Returns suggested item name, brand (only when recognisable), type, colours, contexts, seasons and a Google Images search phrase.
- Does not save anything to the wardrobe. The user reviews the suggestions and presses Save.
- The app opens Google Images using the suggested text query. This is a product-discovery shortcut, not a reverse-image match or proof of an exact product.

## Deploy the Worker

1. Sign in to Cloudflare and open Workers & Pages.
2. Choose Create application, then Create Worker. Name it wardrobe-studio-ai.
3. Open the Worker editor and replace its starter code with the contents of worker/index.js from this repository. Deploy it.
4. In the Worker, open Settings, then Variables and Secrets, then Add.
5. Add a variable of type Secret, named OPENAI_API_KEY, and paste your OpenAI API key. Save and deploy.
6. Copy the Worker URL. It should look like https://wardrobe-studio-ai.your-account.workers.dev.
7. In Wardrobe Studio, open Add clothing, upload a photo, choose AI settings, and paste that Worker URL. The URL is stored only in that browser on that device.

Do not put the OpenAI API key into Wardrobe Studio, GitHub, or this repository. It belongs only in the Cloudflare Worker Secret.

## API key and costs

Create an API key in the OpenAI developer platform and enable API billing. ChatGPT subscriptions do not include API usage. Image analysis is billed separately by OpenAI; the model is gpt-6-luna and the image is sent at low detail to keep usage economical. Check current pricing before use.

## Notes

- The Worker accepts requests only from https://earpluguk-cmyk.github.io.
- It rejects oversized/non-JPEG payloads and includes a basic per-IP request throttle.
- The throttle is best-effort; this is a personal-use endpoint, not a public production service.
- Clothing photos are sent to OpenAI for analysis only when Analyse photo with AI is pressed. They are not sent merely by uploading or saving an item.
- Existing wardrobe records and photos remain in the browser's IndexedDB. This feature does not migrate, clear or replace that storage.
