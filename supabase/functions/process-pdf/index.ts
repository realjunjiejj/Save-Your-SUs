import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
import * as pdfjsLib from "npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs";


// fn that transforms uploaded pdf into plain text 

async function extractTextFromPdf(pdfFile: Blob) {   
  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer()); //converts file into bytes

  const pdf = await pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true,
  }).promise;

  const pages: string[] = []; 

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();  //loop thru each page and extract text

    const pageText = textContent.items
      .map(function (item) {
        if ("str" in item) {
          return item.str;
        }

        return "";
      })
      .join(" ");

    pages.push(pageText);
  }

  return pages.join("\n\n").trim(); //combines all text into one big string 
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
      .select("id, user_id, filename, file_path")
      .eq("id", document_id)
      .single();
    if (documentError || !document) {
      console.error("Document lookup error:", documentError);

      return Response.json(
        { error: "Document not found" },
        { status: 404 },
      );
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

const extractedText = await extractTextFromPdf(pdfFile);

await ctx.supabaseAdmin
  .from("documents")
  .update({
    extracted_text: extractedText,
    processing_status: "extracted",
    processing_error: null,
  })
  .eq("id", document_id);
  
    return Response.json({
      ok: true,
      document_id: document.id,
      filename: document.filename,
      file_path: document.file_path,
      pdf_size: pdfFile.size,
      pdf_type: pdfFile.type,
      extracted_text_length: extractedText.length,
    });
  }),
};
