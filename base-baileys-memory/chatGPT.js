require('dotenv').config();
const axios = require('axios');

async function chat(prompt, userInput) {
    const apiKey = process.env.OPENAI_API_KEY;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: userInput }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message;
    } catch (error) {
        console.error("Error al conectar con OpenAI:", error);
        return "ERROR";
    }
}

module.exports = chat;

