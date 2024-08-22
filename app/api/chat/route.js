import { NextRequest } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const systemPrompt = `
You are an advanced AI assistant specializing in helping students find the best professors for their courses. You utilize a Retrieval-Augmented Generation (RAG) system to provide accurate and helpful recommendations based on a vast database of professor reviews and ratings
Your primary functions are:

1. Interpret student queries about professors or courses.
2. Use the RAG system to retrieve the most relevant professor information based on the query.
3. Analyze and summarize the retrieved information to present the top 3 most suitable professors.
4. Provide concise yet informative explanations for why these professors are recommended.

For each user query, you will:

1. Acknowledge the  question and briefly explain how you will assist them.
2. Present the top 3 professors based on the RAG system's retrieval, including:
   - Professor's name
   - Subject they teach
   - Star rating (out of 5)
   - A brief summary of their strengths or notable characteristics
3. Offer a concise explanation of why these professors were selected based on the query.
4. Ask if the student needs any additional information or has follow-up questions.

Remember to:
Be impartial and base your recommendations solely on the data provided by the RAG system.
Maintain a friendly and helpful tone, as if you are a knowledgeable academic advisor.
If the query is too vague or does not match any professors in the database, ask for clarification or more specific information.
Respect privacy by not sharing any personal information about professors beyond what is provided in the reviews.

Your goal is to help students make informed decisions about their course selections by providing them with reliable, data-driven professor recommendations.`


//All this needs to change if we are using another model
export async function Post(req) {
    const data = await req.json()
    const pc = new Pinecone({
        apiKey: process.env.Pinecone_API_KEY,

    })
    const index = pc.index('rag').namespace('ns1')
    const openai = new OpenAI()

    const text = data[data.length - 1].content
    const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float',
    })
    const results = await index.query({
        //topk= how many results you want
        topK: 3,
        includeMetadata: true,
        vector: embedding.data[0].embedding,
    })
    let resultString = ''
    results.matches.forEach((match) => {
        // \n= new line
        resultString += ` \n
        Returned Results:
        Professor: ${match.id}
        Review: ${match.metadata.stars}
        Subject: ${match.metadata.subject}
        Stars: ${match.metadata.stars}
        \n\n`

    })
    const lastMessage = data[data.length - 1]
    const lastMessageContent = lastMessage.content + resultString
    const lastDataWithoutLastMessage = data.slice(0, data.length - 1)
    const completion = await openai.chat.completions.create({
        messages: [
            { role: 'system', content: systemPrompt },
            ...lastDataWithoutLastMessage,
            { role: 'user', content: lastMessageContent },
        ],
        model: 'gpt-4o-min',
        stream: true,
    })


    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder()
            try {
                for await (const chunk of completion) {
                    const content = chunk.choices[0]?.delta?.content
                    if (content) {
                        const text = encoder.encode(content)
                        controller.enqueue(text)
                    }
                }
            } catch (err) {
                controller.error(err)
            } finally {
                controller.close()
            }
        },
    })
    return new NextResponse(stream)










}