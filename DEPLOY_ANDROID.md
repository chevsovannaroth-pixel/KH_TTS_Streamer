# Deploy ពី Android

វិធីងាយបំផុតសម្រាប់អ្នកដែលគ្មាន Computer:
1. Upload project ទៅ GitHub (អាចធ្វើតាម browser/app)
2. Connect repository ទៅ Cloudflare Workers
3. បង្កើត D1 database ពី Cloudflare Dashboard
4. កែ `wrangler.jsonc` ដោយដាក់ Database ID
5. Run migration/deploy តាម Cloudflare online development/terminal ឬ Git integration
6. Add secrets `SESSION_SECRET`, `DONATION_WEBHOOK_SECRET`, និង `TTS_API_KEY` ប្រសិនបើមាន TTS provider
7. Test `/`, `/api/health`, និង `/obs.html?streamer=ID`

Cloudflare Workers ជាជម្រើសសមស្របសម្រាប់ Full-Stack ព្រោះអាច serve static frontend + API ក្នុង Worker ហើយ Durable Objects អាចប្រើ WebSocket real-time សម្រាប់ OBS។
