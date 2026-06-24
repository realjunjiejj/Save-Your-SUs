//this edge fn produces Mermaid source
//then the browser later turns that source into SVG, dk how else we can do it.


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};


function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}


//ai response here, we use the api get mermaid source code
//json output

function getOutputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return null;

  for (const outputItem of data.output) {
    if (!outputItem || typeof outputItem !== "object") continue;
    const content = (outputItem as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const contentItem of content) {
      if (
        contentItem &&
        typeof contentItem === "object" &&
        (contentItem as { type?: unknown }).type === "output_text" &&
        typeof (contentItem as { text?: unknown }).text === "string"
      ) {
        return (contentItem as { text: string }).text;
      }
    }
  }

  return null;
}

//clean up the mermaid source code
// remove accidental wrapper coz our api might include markdown wrappers'''
function cleanMermaidSource(source: string) {
  return source
    .replace(/^```(?:mermaid)?\s*/i, "") //see here 
    .replace(/\s*```$/, "")
    .trim();
}

// needa check if actual mindmap
function isSafeMindmap(source: string) {
  const lowered = source.toLowerCase();
  const blockedTokens = ["%%{", "click ", "javascript:", "<script", "<iframe"];

  return (
    source.startsWith("mindmap") &&
    source.length <= 12_000 &&
    !blockedTokens.some((token) => lowered.includes(token))
  );
}
//coz i wrote rls for our table, so here we need to autheticate 
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase environment is incomplete" }, 500);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }

  let documentId = ""; //this part is the part that receives from our txt extract fn
  try {
    const body = await req.json();
    documentId = typeof body.document_id === "string" ? body.document_id : "";
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400);
  }

  if (!documentId) {
    return jsonResponse({ error: "document_id is required" }, 400);
  }

  const { data: document, error: documentError } = await adminClient
    .from("documents")
    .select("id, user_id, filename, extracted_text")
    .eq("id", documentId)
    .eq("user_id", userData.user.id)
    .single();

  if (documentError || !document) {
    return jsonResponse({ error: "Document not found" }, 404);
  }

  if (!document.extracted_text) { //check if exist 
    return jsonResponse(
      { error: "No extracted text is available for this document" },
      409,
    );
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY"); //damn impt here, make sure we load our api correctly
  const model = Deno.env.get("OPENAI_MODEL"); //rmb to top up if finished from testing
  const baseUrl = Deno.env.get("OPENAI_BASE_URL")?.replace(/\/+$/, "");
  if (!apiKey || !model || !baseUrl) {
    return jsonResponse({ error: "AI provider secrets are incomplete" }, 500);
  }
//impt to set limit, coz we poor 
  const extractedText = document.extracted_text.slice(0, 120_000);

  await adminClient
    .from("documents")
    .update({ processing_status: "mindmap_generating", processing_error: null })
    .eq("id", documentId)
    .eq("user_id", userData.user.id);

  const requestBody = { //rules to openai, we can edit further if we want
    model,
    input: [
      {
        role: "system",
        content: `Create a concise study mindmap  using only facts found in the source document.
Return valid Mermaid mindmap syntax in mermaid_code.
Use two spaces for each indentation level.
Use one root, at most six main branches, and at most three levels below the root.
Start with a generic content heading, subsequent points can be more detailed. Provide evidence, 
mathematical proof or support to back the general points posited by the upper headings, only do this
if the evidence can be found withint the document. 
For the more detailed points, ensure they are in coherent sentences.
Avoid HTML, links, click directives, config directives, markdown fences, and semicolons.`,
      },
      {
        role: "user",
        content: `Create a study mindmap from this extracted PDF text:\n\n${extractedText}`,
      },
    ],
    text: { //json schema 
      format: {
        type: "json_schema",
        name: "study_mindmap",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            mermaid_code: { type: "string" },
          },
          required: ["title", "mermaid_code"],
        },
      },
    },
  };

  let providerResponse: Response; //call our api
  try {
    providerResponse = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (error) { //if fail then prompt error
    console.error("Mindmap provider request error:", error);
    await adminClient
      .from("documents")
      .update({
        processing_status: "failed",
        processing_error: "Could not reach the AI provider.",
      })
      .eq("id", documentId);
    return jsonResponse({ error: "Could not reach the AI provider" }, 502);
  }

  const responseText = await providerResponse.text();
  let providerData: Record<string, unknown>;

  try {
    providerData = JSON.parse(responseText);
  } catch {
    return jsonResponse(
      { error: "AI provider returned a non-JSON response" },
      502,
    );
  }

  if (!providerResponse.ok) { //handle diff status 
    const providerError = providerData.error as { message?: unknown } | undefined;
    const message =
      typeof providerError?.message === "string"
        ? providerError.message
        : "Mindmap generation failed.";

    await adminClient
      .from("documents")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", documentId);
    return jsonResponse({ error: message }, 502);
  }

  const outputText = getOutputText(providerData);
  if (!outputText) {
    return jsonResponse({ error: "AI provider returned no mindmap" }, 502);
  }

  let result: { title?: unknown; mermaid_code?: unknown }; //parse Mindmap JSON
  try {
    result = JSON.parse(outputText);
  } catch {
    return jsonResponse({ error: "AI provider returned invalid mindmap JSON" }, 502);
  }

  if (typeof result.title !== "string" || typeof result.mermaid_code !== "string") {
    return jsonResponse({ error: "AI provider returned an invalid mindmap shape" }, 502);
  }

  const mermaidCode = cleanMermaidSource(result.mermaid_code); //clean adn check
  if (!isSafeMindmap(mermaidCode)) {
    return jsonResponse({ error: "AI provider returned unsafe Mermaid code" }, 422);
  }

  const { error: saveError } = await adminClient //save to supabase,i scare too many ppl use will finish out free plan
    .from("documents")
    .update({
      mermaid_code: mermaidCode,
      processing_status: "mindmap_completed",
      processing_error: null,
    })
    .eq("id", documentId)
    .eq("user_id", userData.user.id);

  if (saveError) {
    console.error("Mindmap save error:", saveError);
    return jsonResponse({ error: "Could not save generated mindmap" }, 500);
  }

  return jsonResponse({ //return to react
    ok: true,
    document_id: documentId,
    filename: document.filename,
    title: result.title,
    mermaid_code: mermaidCode,
  });
});