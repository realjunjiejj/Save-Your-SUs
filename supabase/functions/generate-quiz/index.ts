import "jsr:@supabase/functions-js/edge-runtime.d.ts"; //let deno and TS run edge fns
import { createClient } from "jsr:@supabase/supabase-js@2"; 

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}; //gives the frontend permission to call fn, blocks cors error

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  } //browser sends OPTION request

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  ); //allows fn to read and update supabase table

  const body = await req.json();
  const document_id = body.document_id;

  const { data: document } = await supabaseAdmin
    .from("documents")
    .select("id, filename, extracted_text")
    .eq("id", document_id)
    .single(); //searches documents table for matching row 
 
  if (!document || !document.extracted_text) {
    return Response.json(
      { error: "No extracted text found for this document" },
      { status: 400, headers: corsHeaders },
    );
  }

  await supabaseAdmin
    .from("documents")
    .update({
      processing_status: "generating", //updates Supabase to show doc is generating
      processing_error: null,
    })
    .eq("id", document_id);

  const systemPrompt = `
Create a 5 question multiple choice quiz for students to practice. 
Only use facts found in the document itself.
Each question must have exactly 4 options.
Return only the option text with no labels. 
Include a short explanation for the correct answer.
`;

  const userPrompt = `
Create a 5 question MCQ quiz from this document.

Document:
${document.extracted_text}
`;

  const quizSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      quiz_title: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            question: { type: "string" },
            options:{
              type: "array",
              items: {type:"string"},
            },

            answer: {
              type: "string",
              enum: ["A","B","C","D"],
            },
            explanation:{ type: "string"},
          },
       
          required: ["question", "options","answer","explanation"],
        },
      },
    },
    required: ["quiz_title", "questions"],
  }; //format of quiz

  const aiRequestBody = { 
    model: Deno.env.get("OPENAI_MODEL"),
    input: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "quiz_sheet",
        strict: true,
        schema: quizSchema,
      },
    },
  }; //prepares the request sent to openAI
  const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL");
  const openaiResponse = await fetch(`${openaiBaseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(aiRequestBody),
  });

  const openaiResponseText = await openaiResponse.text(); //reads AI response as raw text first

  console.log("OpenAI status:", openaiResponse.status);
  console.log("OpenAI response:", openaiResponseText.slice(0, 500));

  let openaiData;

  try {
    openaiData = JSON.parse(openaiResponseText); //converts AI response to JS object
  } catch {
    return Response.json(
      {
        error: "OpenAI returned a non-JSON response",
        openai_status: openaiResponse.status,
        preview: openaiResponseText.slice(0, 500),
      },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!openaiResponse.ok) {
    const errorMessage = openaiData.error?.message ?? "OpenAI request failed."; 

    await supabaseAdmin
      .from("documents")
      .update({
        processing_status: "failed",
        processing_error: errorMessage,
      })
      .eq("id", document_id);

    return Response.json(
      {
        error: errorMessage,
        openai_status: openaiResponse.status,
      },
      { status: 500, headers: corsHeaders },
    );
  } //saves error into Supabase

  const quizText =
    openaiData.output_text ??
    openaiData.output
      ?.flatMap(function (item) {
        return item.content ?? [];
      })
      .find(function (contentItem) {
        return contentItem.type === "output_text";
      })?.text; //finding the generated quiz text

  if (!quizText) {
  await supabaseAdmin
    .from("documents")
    .update({
      processing_status: "failed",
      processing_error: "OpenAI did not return quiz text.",
    })
    .eq("id", document_id);

  return Response.json(
    {
      error: "OpenAI did not return quiz text",
      openai_status: openaiResponse.status,
      openai_data: openaiData,
    },
    { status: 500, headers: corsHeaders },
  );
}

const quizJson = JSON.parse(quizText); //converts JSON string into JS object

  await supabaseAdmin
    .from("documents")
    .update({
      quiz_json: quizJson,
      processing_status: "quiz_completed",
      processing_error: null,
      generated_at: new Date().toISOString(),
    })
    .eq("id", document_id); //saves quiz into documents table and marks completed

  return Response.json(
    {
      ok: true,
      document_id,
      filename: document.filename,
      quiz: quizJson,
    },
    { headers: corsHeaders },
  ); //sends quiz back to frontend
});
