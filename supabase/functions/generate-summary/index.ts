import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json();
  const document_id = body.document_id;

  const { data: document } = await supabaseAdmin
    .from("documents")
    .select("id, filename, extracted_text")
    .eq("id", document_id)
    .single();

  if (!document || !document.extracted_text) {
    return Response.json(
      { error: "No extracted text found for this document" },
      { status: 400, headers: corsHeaders },
    );
  }

  await supabaseAdmin
    .from("documents")
    .update({
      processing_status: "generating",
      processing_error: null,
    })
    .eq("id", document_id);

  const systemPrompt = `
Please create clear study summary sheets for students.
Break the document into logical sections, with key concepts shown under each heading.
Under each section, write concise bullet points.
For notes pertaining to STEM subjects, focus on showing important formulas and include an example question of how the formula can be applied.
This example question must be found inside the document. Do not include an example question for that concept if the document does not have one.
Do not include any facts that are not found in the document.
`;

  const userPrompt = `
Please create a section-based summary sheet from this document.
Use clear section headings and bullet points under each heading.

Document:
${document.extracted_text}
`;

  const summarySchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            heading: { type: "string" },
            bullet_points: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["heading", "bullet_points"],
        },
      },
    },
    required: ["title", "sections"],
  };

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
        name: "summary_sheet",
        strict: true,
        schema: summarySchema,
      },
    },
  };
  const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL");
  const openaiResponse = await fetch(`${openaiBaseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(aiRequestBody),
  });

  const openaiResponseText = await openaiResponse.text();

  console.log("OpenAI status:", openaiResponse.status);
  console.log("OpenAI response:", openaiResponseText.slice(0, 500));

  let openaiData;

  try {
    openaiData = JSON.parse(openaiResponseText);
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
  }

  const summaryText =
    openaiData.output_text ??
    openaiData.output
      ?.flatMap(function (item) {
        return item.content ?? [];
      })
      .find(function (contentItem) {
        return contentItem.type === "output_text";
      })?.text;

  if (!summaryText) {
  await supabaseAdmin
    .from("documents")
    .update({
      processing_status: "failed",
      processing_error: "OpenAI did not return summary text.",
    })
    .eq("id", document_id);

  return Response.json(
    {
      error: "OpenAI did not return summary text",
      openai_status: openaiResponse.status,
      openai_data: openaiData,
    },
    { status: 500, headers: corsHeaders },
  );
}

const summaryJson = JSON.parse(summaryText);

  await supabaseAdmin
    .from("documents")
    .update({
      summary_json: summaryJson,
      processing_status: "completed",
      processing_error: null,
      generated_at: new Date().toISOString(),
    })
    .eq("id", document_id);

  return Response.json(
    {
      ok: true,
      document_id,
      filename: document.filename,
      summary: summaryJson,
    },
    { headers: corsHeaders },
  );
});
