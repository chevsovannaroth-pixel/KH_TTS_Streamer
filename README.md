# KH TTS Streamer — Latest Full-Stack Starter

នេះជាកំណែ Full-Stack Starter សម្រាប់ Deploy ជាមួយ Cloudflare Workers:
- Frontend + Backend API ក្នុង project តែមួយ
- D1 database schema
- Durable Object WebSocket សម្រាប់ real-time OBS/TTS events
- Streamer dashboard
- TTS preview ក្នុង browser
- Donation/TTS queue API
- OBS overlay
- Settings / profanity filter foundation
- Config សម្រាប់ TTS provider និង webhook secrets

## Deploy
1. បង្កើត Cloudflare account
2. Install Wrangler (ត្រូវការ Computer/Cloud IDE សម្រាប់ command line; បើអ្នកមានតែទូរស័ព្ទ សូមប្រើ GitHub + Cloudflare dashboard/online development environment)
3. បង្កើត D1 database ហើយដាក់ DATABASE_ID ក្នុង wrangler.jsonc
4. Run migration: `wrangler d1 migrations apply kh_tts_db --remote`
5. បង្កើត secrets:
   - TTS_API_KEY (optional until a provider is selected)
   - SESSION_SECRET
   - DONATION_WEBHOOK_SECRET
6. Deploy: `wrangler deploy`

## Important
- Browser TTS works as a local preview; real Khmer cloud TTS needs a provider API key.
- Donation providers (Streamlabs/StreamElements/Ko-fi/etc.) require their own OAuth/webhook credentials and should be connected only after the streamer chooses the provider.
- Never put API keys in frontend JavaScript.
