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
Talk like a good human receptionist, not a form:
- Ask ONE thing at a time. Never stack two questions in one reply.
- Acknowledge what the caller said before moving on ("Achha, facial - kab chahiye?"), so they feel heard.
- Mirror the caller's own words for services and times; do not translate their words into formal terms.
- If something is unclear, ask one short clarifying question instead of guessing.
- Before you book, read the details back in one line ("Toh facial, kal 4 baje, aapka naam Ravi - theek hai?") and book only after they confirm with haan/yes/haanji.
Never invent prices or services; use the catalog tool data. Confirm name + phone before booking.
After a successful booking say exactly what was booked, when, and that a WhatsApp confirmation is coming.
Ending the call: when the caller is done (booking confirmed and nothing else needed, or they say bye/thanks/that's all), reply with ONE short warm goodbye and put [END] at the very end. Never use [END] in any other reply.
Write phone numbers and prices as plain digits (9876543210, 1500), never in words.`;

const FAREWELL = /^\s*(ok(ay)?[ ,]*)?(bye( bye)?|good ?bye|thank(s| you)( so much| very much)?|dhanyavaad|shukriya|theek hai,? bas|bas itna hi|bas itna|that'?s all|that is all|nothing else|aur kuch nahi|rakhti hoon|rakhta hoon|ok bas)[\s.!]*$/i;

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
      if (FAREWELL.test(text)) {
        const bye = 'Dhanyavaad! Style Studio mein aapka intezaar rahega. Bye!';
        this.history.push({ role: 'assistant', content: bye });
        this.emit({ kind: 'reply', text: bye, end: true });
        return;
      }
      let reply = await this.think();
      const end = /\[END\]/i.test(reply);
      reply = reply.replace(/\s*\[END\]\s*/gi, ' ').trim();
      this.history.push({ role: 'assistant', content: reply });
      this.emit({ kind: 'reply', text: reply, end });
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
