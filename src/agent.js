// The booking brain: Hinglish-first receptionist for a local business.
// Turn loop: user transcript -> LLM with tools -> reply text (+ tool side effects).
import { Booking } from './booking.js';
import { notifyWhatsApp } from './whatsapp.js';

const todayLine = () => { const d = new Date(); return `Today is ${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.toLocaleDateString('en-CA')}. When the caller says aaj/kal/parso or a weekday, convert it to a YYYY-MM-DD date from this.`; };

const SYSTEM = `You are Ira, the phone receptionist for {BUSINESS_NAME}, a local service business in Pune, India.
Callers speak Hindi, English, or code-mixed Hinglish. Always reply in the caller's own mix - if they say
"kal shaam ko slot milega kya", you answer in the same register, never in stiff formal English.
Job: greet, figure out what service they want and when, offer real open slots, book, reschedule, or cancel.
Keep every reply under 2 short spoken sentences - this is a phone call, not an essay.
Never invent prices or services; use the catalog tool data. Confirm name + phone before booking.
After a successful booking say exactly what was booked, when, and that a WhatsApp confirmation is coming.`;

export class Agent {
  constructor(emit) {
    this.emit = emit;
    this.booking = new Booking();
    this.history = [];
  }

  greet() {
    const g = 'Namaste! Style Studio mein aapka swagat hai. Main Ira bol rahi hoon - appointment book karna hai, badalna hai, ya cancel karna hai?';
    this.history.push({ role: 'assistant', content: g });
    this.emit({ kind: 'reply', text: g });
  }

  async handleUserTurn(text) {
    this.history.push({ role: 'user', content: text });
    this.emit({ kind: 'thinking' });
    try {
      const reply = await this.think();
      this.history.push({ role: 'assistant', content: reply });
      this.emit({ kind: 'reply', text: reply });
    } catch (e) {
      console.error('AGENT_ERR', e.message, e.stack?.split('\n')[1]);
      this.emit({ kind: 'reply', text: 'Ek second, thodi technical dikkat aa rahi hai - could you say that again?' });
    }
  }

  async think() {
    // Tool-capable LLM call. The LLM decides: answer directly or call a tool
    // (get_slots / book / reschedule / cancel / catalog). Tools run against Booking.
    // Wired to the provider in llm.js; kept provider-agnostic for the hackathon demo.
    const { complete } = await import('./llm.js');
    return complete({ system: SYSTEM + '\n' + todayLine(), history: this.history, tools: this.booking.tools(), onTool: async (name, args) => {
      const result = await this.booking.call(name, args);
      console.error("TOOL", name, JSON.stringify(args), JSON.stringify(result).slice(0,150));
      if (name === 'book' && result.ok) {
        notifyWhatsApp(result.booking).then(r => {
          if (r?.text) this.emit({ kind: 'whatsapp', to: result.booking.phone, text: r.text, demo: !!r.demo });
        }); // fire-and-forget customer confirmation + owner log
      }
      return result;
    }});
  }
}
