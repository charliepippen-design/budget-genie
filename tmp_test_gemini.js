import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'fs';

// Read .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf8');
const keyLine = envContent.split('\n').find(line => line.startsWith('VITE_GOOGLE_GENERATIVE_AI_API_KEY='));
const apiKey = keyLine ? keyLine.split('=')[1].trim() : null;

if (!apiKey) {
    console.error("No API key found in .env.local");
    process.exit(1);
}

// Check with and without baseURL
async function testModel(modelId, useBaseURL) {
    try {
        const google = createGoogleGenerativeAI({
            apiKey,
            ...(useBaseURL ? { baseURL: 'https://generativelanguage.googleapis.com/v1beta' } : {})
        });
        
        console.log(`Testing ${modelId} (useBaseURL: ${useBaseURL})...`);
        const { text } = await generateText({
            model: google(modelId),
            prompt: "Say 'Hello'",
        });
        console.log(`✅ Success for ${modelId} (useBaseURL: ${useBaseURL}): ${text}`);
        return true;
    } catch (err) {
        console.error(`❌ Failed for ${modelId} (useBaseURL: ${useBaseURL}): ${err.message}`);
        return false;
    }
}

async function run() {
    const models = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-pro',
        'models/gemini-1.5-flash',
        'models/gemini-1.5-pro'
    ];

    for (const m of models) {
        await testModel(m, false);
        await testModel(m, true);
    }
}

run();
