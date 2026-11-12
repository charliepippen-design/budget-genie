// Approved AI data-use disclosure texts (EN + IT, AI-ARCHITECTURE-PROPOSAL section 11), shown below the AI inputs and in the privacy policy.
// Keep the privacy paragraph free of the Vercel AI Gateway sentence until the decision layer is live in production.
// "Free tier" is Google's API tier, not the customer's MediaPlanner Pro plan: the short texts say so,
// because paying customers read "(free plan)" as a statement about their own subscription.

export const AI_DISCLOSURE_SHORT =
  "AI replies are generated with Google Gemini, through the free tier of Google's API (this is not about your MediaPlanner Pro plan): Google may use messages to improve its services, and some may be reviewed by people. Don't enter personal or confidential information. All plan figures are calculated by our engine, not by the AI.";

export const AI_PRIVACY_PARAGRAPH =
  "The MediaPlanner Pro planning assistant uses Google Gemini through the free tier of the Gemini API. The messages you type in the chat and the plan summary sent to the assistant (industry, budget, markets, channels and notes) are sent to Google, which under its terms may use them to provide, improve and develop its products and machine-learning technologies; for quality purposes, human reviewers may read them in a form disconnected from our account. Please do not enter personal data, credentials or confidential information. The AI does not calculate plan figures: budgets, allocations and forecasts are always computed by MediaPlanner Pro's deterministic engine and are estimates, not guarantees. You can use the app without the AI assistant.";

export const AI_DISCLOSURE_SHORT_IT =
  "Le risposte dell'AI sono generate con Google Gemini, tramite il livello gratuito dell'API di Google (non riguarda il tuo piano MediaPlanner Pro): Google può usare i messaggi per migliorare i propri servizi e alcune persone possono rivederli. Non inserire dati personali o riservati. Tutti i numeri del piano vengono calcolati dal nostro motore, non dall'AI.";

export const AI_PRIVACY_PARAGRAPH_IT =
  "L'assistente di pianificazione di MediaPlanner Pro usa Google Gemini tramite il piano gratuito della Gemini API. I messaggi che scrivi in chat e il riepilogo del piano inviato all'assistente (settore, budget, mercati, canali e note) vengono trasmessi a Google, che secondo i propri termini può usarli per fornire, migliorare e sviluppare i propri prodotti e tecnologie di machine learning; per controllo qualità, alcuni revisori umani possono leggerli in forma scollegata dal nostro account. Per questo ti chiediamo di non inserire dati personali, credenziali o informazioni riservate. L'AI non calcola i numeri del piano: budget, ripartizioni e previsioni vengono sempre calcolati dal motore deterministico di MediaPlanner Pro e sono stime, non garanzie. Puoi usare l'app anche senza l'assistente AI.";

// Own key (bring your own key, src/lib/user-ai-key.ts): the request runs on the user's Google account,
// so we say whose terms apply and how the key travels, and promise nothing about Google's data use.
export const AI_DISCLOSURE_OWN_KEY =
  "AI replies use your own Google Gemini key; Google's terms for your account apply. Your messages and plan summary go to Google through our server, which forwards your key and does not store it. Don't enter personal or confidential information. All plan figures are calculated by our engine, not by the AI.";

export const AI_DISCLOSURE_OWN_KEY_IT =
  "Le risposte dell'AI usano la tua chiave Google Gemini; valgono i termini di Google per il tuo account. I tuoi messaggi e il riepilogo del piano arrivano a Google passando dal nostro server, che inoltra la tua chiave e non la conserva. Non inserire dati personali o riservati. Tutti i numeri del piano vengono calcolati dal nostro motore, non dall'AI.";

export const AI_PRIVACY_OWN_KEY_PARAGRAPH =
  "If you connect your own Google Gemini API key in Settings, AI requests from your browser use that key instead of ours. The key is stored only in your browser and is sent with each AI request to our server, which forwards it to Google and does not store it. Google then handles those requests under the terms that apply to your own Google account. You can remove the key in Settings at any time.";

export const AI_PRIVACY_OWN_KEY_PARAGRAPH_IT =
  "Se colleghi la tua chiave API Google Gemini nelle Impostazioni, le richieste AI dal tuo browser usano quella chiave al posto della nostra. La chiave resta salvata solo nel tuo browser e viene inviata con ogni richiesta AI al nostro server, che la inoltra a Google e non la conserva. Google tratta quelle richieste secondo i termini validi per il tuo account Google. Puoi rimuovere la chiave dalle Impostazioni in qualsiasi momento.";

/** Short disclosure for the current mode: the shared trial key, or the user's own key. */
export function aiDisclosureShort(ownKey: boolean, lang: 'en' | 'it' = 'en'): string {
  if (lang === 'it') return ownKey ? AI_DISCLOSURE_OWN_KEY_IT : AI_DISCLOSURE_SHORT_IT;
  return ownKey ? AI_DISCLOSURE_OWN_KEY : AI_DISCLOSURE_SHORT;
}
