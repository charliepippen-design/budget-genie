import { useState } from 'react';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

// Setup the Google provider
const google = createGoogleGenerativeAI({
    apiKey: import.meta.env.VITE_GOOGLE_GENERATIVE_AI_API_KEY,
});

export default function TestAI() {
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleTest() {
        setLoading(true);
        setResponse('');
        try {
            const { text } = await generateText({
                // WE ARE USING THE MODEL FROM YOUR SCAN HERE:
                model: google('gemini-2.5-flash'),
                prompt: 'Tell me a short joke about a programmer.',
            });
            setResponse(text);
        } catch (error: any) {
            setResponse('Error: ' + error.message);
        }
        setLoading(false);
    }

    return (
        <div className="p-6 border rounded-lg shadow-md bg-white max-w-lg m-4">
            <h2 className="text-xl font-bold mb-4 text-blue-900">🤖 AI Connection Test</h2>

            <button
                onClick={handleTest}
                disabled={loading}
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50 font-bold"
            >
                {loading ? 'Thinking...' : 'Ask AI for a Joke'}
            </button>

            {response && (
                <div className="mt-4 p-4 bg-gray-100 border-l-4 border-green-500 text-gray-800 rounded">
                    <strong>AI says:</strong>
                    <p className="mt-2">{response}</p>
                </div>
            )}
        </div>
    );
}