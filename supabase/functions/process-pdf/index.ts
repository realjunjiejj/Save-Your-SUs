import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
// Checks whether the browser extracted enough text to skip OCR.
function hasUsefulText(text: string) {
  const cleanedText = text.replace(/\s+/g, " ").trim();
  return cleanedText.length >= 40 && /[A-Za-z0-9]/.test(cleanedText);
}

//send the scanned PDF to OCR.space and combines the text returned from each page
async function extractTextWithOcr(pdfFile: Blob, filename: string) {
  const apiKey = Deno.env.get("OCR_SPACE_API_KEY");

  if (!apiKey) {
    throw new Error("OCR_SPACE_API_KEY is missing");
  }
  const formData = new FormData();
  formData.append("file", pdfFile, filename || "document.pdf");
  formData.append("language", "eng");
  formData.append("filetype", "PDF");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    headers: { apikey: apiKey },
    body: formData,
  });
  const result = await response.json();

  if (
    !response.ok ||
    result.IsErroredOnProcessing ||
    !Array.isArray(result.ParsedResults)
  ) {
    const errorMessage =
      typeof result.ErrorMessage === "string"
        ? result.ErrorMessage
        : "OCR request failed";
    throw new Error(errorMessage);
  }

  const ocrText = result.ParsedResults
    .map((page: { ParsedText?: unknown }) =>
      typeof page.ParsedText === "string" ? page.ParsedText.trim() : ""
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!hasUsefulText(ocrText)) {
    throw new Error("OCR did not return useful text");
  }

  return ocrText;
}


export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {

    const body = await req.json();
    const document_id = body.document_id;

    if (!document_id) {
      return Response.json(
        { error: "document_id is required" },
        { status: 400 },
      );
    }

    const { data: document, error: documentError } = await ctx.supabaseAdmin
      .from("documents")
      .select("id, user_id, filename, file_path, extracted_text")
      .eq("id", document_id)
      .single();
    if (documentError || !document) {
      console.error("Document lookup error:", documentError);

      return Response.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

  const { error: statusError } = await ctx.supabaseAdmin
  .from("documents")
  .update({
    processing_status: "extracting",
    processing_error: null,
  })
  .eq("id", document_id);

  if (statusError) {
    console.error("Status update error:", statusError);

  return Response.json(
    { error: "Could not update document status" },
    { status: 500 },
  );
}

const existingText = document.extracted_text ?? "";

if (hasUsefulText(existingText)) {
  const { error: extractedStatusError } = await ctx.supabaseAdmin
    .from("documents")
    .update({
      processing_status: "extracted",
      processing_error: null,
    })
    .eq("id", document_id);

  if (extractedStatusError) {
    console.error("Extracted status update error:", extractedStatusError);

    return Response.json(
      { error: "Could not update document status" },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    document_id: document.id,
    filename: document.filename,
    file_path: document.file_path,
    extracted_text_length: existingText.length,
    extraction_method: "pdf_text",
  });
}

const { data: pdfFile, error: downloadError } = await ctx.supabaseAdmin.storage
  .from("pdfs")
  .download(document.file_path);

if (downloadError || !pdfFile) {
  console.error("PDF download error:", downloadError);

  return Response.json(
    { error: "Could not download PDF" },
    { status: 500 },
  );
}

await ctx.supabaseAdmin
  .from("documents")
  .update({
    processing_status: "ocr_processing",
    processing_error: null,
  })
  .eq("id", document_id);

let extractedText = "";

try {
  extractedText = await extractTextWithOcr(pdfFile, document.filename);
} catch (error) {
  console.error("OCR extraction error:", error);

  await ctx.supabaseAdmin
    .from("documents")
    .update({
      processing_status: "failed",
      processing_error: "Could not extract text using OCR.",
    })
    .eq("id", document_id);

  return Response.json(
    { error: "Could not extract text from this PDF" },
    { status: 422 },
  );
}

const { error: saveError } = await ctx.supabaseAdmin
  .from("documents")
  .update({
    extracted_text: extractedText,
    processing_status: "extracted",
    processing_error: null,
  })
  .eq("id", document_id);

if (saveError) {
  console.error("Extracted text save error:", saveError);

  return Response.json(
    { error: "Could not save extracted text" },
    { status: 500 },
  );
}
  
    return Response.json({
      ok: true,
      document_id: document.id,
      filename: document.filename,
      file_path: document.file_path,
      pdf_size: pdfFile.size,
      pdf_type: pdfFile.type,
      extracted_text_length: extractedText.length,
      extraction_method: "ocr",
    });
  }),
};
