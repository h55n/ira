# Ira - the receptionist that never misses a call

Ira answers phone calls for local businesses in Hindi, English, or code-mixed Hinglish,
books real appointments, and confirms on WhatsApp. Built for the AssemblyAI Voice Agent Hackathon.

- Realtime STT: AssemblyAI Streaming (universal-3-5-pro)
- Agent brain: tool-calling LLM loop (OpenAI-compatible endpoint)
- Booking: duration-aware slot engine, persisted to disk
- Confirmations: WhatsApp Cloud API (demo mode logs the full trail)

## Run

```
cp .env.example .env   # fill ASSEMBLYAI_API_KEY, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm install
npm start              # serves on :3000 (PORT env respected)
```

Open http://localhost:3000 and tap Call. Typed input works as a fallback.
