
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

console.log("Hello from Functions!");


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

    return Response.json({
      ok: true,
      document_id: document.id,
      filename: document.filename,
      file_path: document.file_path,
      pdf_size: pdfFile.size,
      pdf_type: pdfFile.type,
    });
  }),
};
