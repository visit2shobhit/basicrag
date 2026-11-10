This is the basic RAG Project where user can upload PDF file and query data.

Technology Used
    
    Express
    
    Pinecone
    
    OpenAI
    
    Inngest

Flow will be

Upload File -> save file into upload folder

-> send event pdf/upload to inngest 

-> read file 

-> extract content 

-> chunk data 

-> Save data in to pinecone (llama-text-embed-v2 used for embedding)


Flow for query

-> Ask Question

-> Pinecone Embed the question and compare with stored vectors

-> return top 5 chunks

-> llm call to generate response

-> Send Response

Upload 
API - http://localhost:3000/upload
Method - POST
Key - file


Query 
API - http://localhost:3000/query
Method - GET
Input - {
    "question":"What is the complete name"
}
