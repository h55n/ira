# Ira ☎️

<p align="center">
  <a href="https://github.com/h55n/ira">GitHub</a> | <a href="https://lablab.ai/ai-hackathons/assemblyai-voice-agent-hackathon">AssemblyAI Voice Agent Hackathon</a>
</p>
<p align="center">
  <a href="https://github.com/h55n/ira"><img src="https://img.shields.io/badge/Built%20with-AssemblyAI%20Realtime-6C3DF4?style=for-the-badge" alt="Built with AssemblyAI Realtime"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Runtime-Node.js%2020-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 20"></a>
  <a href="https://github.com/h55n/ira"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License: MIT"></a>
  <a href="https://github.com/h55n/ira"><img src="https://img.shields.io/badge/Language-Hinglish%20%F0%9F%87%AE%F0%9F%87%B3-orange?style=for-the-badge" alt="Hinglish-first"></a>
</p>

**The receptionist that never misses a call.** Ira answers the phone for local businesses in Hindi, English, or code-mixed Hinglish - the way real customers actually talk. She checks a live slot book, offers alternatives when a time is taken, books, reschedules, and cancels, then confirms every appointment on WhatsApp. Built for the 600+ million Indians who run their business in two languages at once.

A salon owner in Pune misses 30% of calls while mid-haircut. Every missed call is a missed booking. Ira picks up on the first ring, speaks the caller's own mix of Hindi and English, and turns the call into a confirmed appointment before it would have gone to voicemail.

<table>
<tr><td><b>Speaks like the caller does</b></td><td>Code-mixed Hinglish in, code-mixed Hinglish out. "Kal shaam ko slot milega kya?" gets an answer in the same register - never stiff formal English, never a language menu.</td></tr>
<tr><td><b>A real booking brain</b></td><td>Duration-aware slot engine: a 60-minute facial blocks both half-hour cells. Availability checks, alternatives when a slot is taken, one active booking per phone number, reschedule and cancel by number. Everything persisted to disk.</td></tr>
<tr><td><b>WhatsApp confirmations</b></td><td>Every booking fires a Hinglish confirmation on the WhatsApp Cloud API. In demo mode the full message trail is logged, so the owner always sees what went out.</td></tr>
<tr><td><b>Grounded, never inventive</b></td><td>The agent only books slots the engine returned, only quotes prices from the catalog, and always confirms name + phone before writing. No hallucinated appointments.</td></tr>
<tr><td><b>Voice-native demo</b></td><td>Browser call UI with realtime streaming speech-to-text and spoken replies. Typed input works as a fallback for quiet rooms.</td></tr>
</table>

---

## How it works

```
Caller  →  Browser call UI (PCM 16kHz)  →  AssemblyAI Realtime STT
        →  Agent brain (tool-calling LLM loop)
        →  Booking engine  →  slot check / book / reschedule / cancel
        →  WhatsApp Cloud API confirmation  →  Owner trail logged
```

- **STT:** AssemblyAI Streaming (`universal-3-5-pro`), turn detection tuned for phone cadence
- **Brain:** OpenAI-compatible chat endpoint with function calling (default: Gemini flash-lite, swappable via env)
- **Engine:** in-process slot book with JSON persistence - swap for Google Calendar in the product version
- **Confirmations:** Meta WhatsApp Cloud API, with a demo-mode log when no creds are set

## Quick start

```bash
git clone https://github.com/h55n/ira.git
cd ira
cp .env.example .env    # fill in your keys
npm install
npm start               # serves on :3000, PORT env respected
```

Open `http://localhost:3000` and tap **Call**. Speak Hindi, English, dono chalega.

### Environment

| Variable | What |
|---|---|
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key (required for voice) |
| `LLM_BASE_URL` | OpenAI-compatible base URL |
| `LLM_API_KEY` | Key for the agent brain |
| `LLM_MODEL` | e.g. `gemini-3.5-flash-lite` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Optional - without these, confirmations log to `data/whatsapp-log.json` |

## Try the demo script

1. "Bhaiya kal shaam ko haircut ka slot milega kya?" - watch Ira check the live book
2. "6 baje" (if taken, she offers real alternatives)
3. Give a name and 10-digit number - booking lands, WhatsApp card appears in the feed
4. "Mera number 9876543210 hai, booking cancel karni hai" - she finds it and cancels

## Deploy

Ships with a `Dockerfile` (port 7860) for Hugging Face Spaces and a `render.yaml` blueprint for Render. Secrets are environment variables in both - nothing sensitive lives in this repo.

## License

MIT - see below. Built by <a href="https://github.com/h55n">h55n</a> for the AssemblyAI Voice Agent Hackathon.
