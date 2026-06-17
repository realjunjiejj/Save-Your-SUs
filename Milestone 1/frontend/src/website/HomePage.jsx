import { useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "./Navbar";

export default function HomePage({ session }) {
  const [signOutError, setSignOutError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null); {/* creates memory box*/}
  const [uploading, setUploading] = useState(false); {/*check if upload is happening */}
  const [uploadMessage, setUploadMessage] = useState("");  {/* stores messages */}



  const handleSignOut = async () => {
    setSignOutError("");
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setSignOutError("Could not sign out. Please try again.");
    }
  };

{/* This fn handles pdf upload */}

const handleUpload = async () => {


  if (!selectedFile) {
    setUploadMessage("Please choose a PDF first.");
    return;
  }

  if (selectedFile.type !== "application/pdf") {
    setUploadMessage("Only PDF files are allowed.");
    return;
  }

  setUploading(true);
  setUploadMessage("");

  const userId = session.user.id;
  const filePath = `${userId}/${Date.now()}-${selectedFile.name}`;

  const { error: uploadError } = await supabase.storage
    .from("pdfs")
    .upload(filePath, selectedFile);

  if (uploadError) {
    console.error("Upload error:", uploadError);
    setUploadMessage("Upload failed.");
    setUploading(false);
    return;
  }

  const {data: insertedDocument, error: databaseError} = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      filename: selectedFile.name,
      file_path: filePath,
      file_size: selectedFile.size,

    })
    .select()
    .single();

  if (databaseError) {
    setUploadMessage("File failed to save, please try again.");
    setUploading(false);
    return;
  }
  /* bro this part calls for supabase fn */
  console.log("Calling process-pdf with:", insertedDocument.id);

  const { data: functionData, error: functionError } = await supabase.functions.invoke("process-pdf", {
    body: {
      document_id: insertedDocument.id,
    },
  });

  console.log("Function response:", functionData);

  if (functionError) {
    console.error("Function error:", functionError);
    setUploadMessage("PDF uploaded, but processing failed to start.");
    setUploading(false);
    return;
  }

  console.log("Inserted document id:", insertedDocument.id);

  setUploadMessage("PDF uploaded. Processing started.");
  setSelectedFile(null);
  setUploading(false);
};



  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} onSignOut={handleSignOut} />

      <main className="p-6">
        {signOutError ? (
          <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{signOutError}</p>
        ) : null}

        <div className="gap-6 lg:flex ">
          <aside className="mb-6 rounded-3xl border bg-white p-6 shadow-sm lg:mb-0 lg:w-64">
            <h2 className="text-lg font-bold">History</h2>
            <div className="mt-6 flex h-32 items-center justify-center rounded-2xl border">
              <p className="text-lg font-bold text-red-600">Coming soon</p>
            </div>
          </aside>

 {/* jic I forget margin, rounded corner, borders and white bg */}

          <div className = "flex-1">
            <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Upload PDF</h2>
              <div className="mt-6 flex rounded-3xl border-2 border-dashed p-6 flex-col items-center">
             <label className="cursor-pointer rounded-xl border bg-white px-4 py-2 font-bold text-gray-700 hover:bg-gray-100">
              Choose PDF <input type="file" accept="application/pdf" onChange={(event) => setSelectedFile(event.target.files[0])} className="hidden"/>
              </label>{/* tells react to select the right file */}
          
          {selectedFile ? ( <p className="mt-3 text-sm font-bold text-gray-700">{selectedFile.name}</p>) :
           (<p className="mt-3 text-sm text-gray-500">No file chosen</p>
)}

              <button type="button"
               onClick={handleUpload}  disabled={uploading}
              className="mt-4 block rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700">
              {uploading ? "Uploading wait ah..." : "Click here to upload!"}
              </button>

            {uploadMessage ? (
            <p className="mt-4 font-bold text-gray-700">{uploadMessage}</p>) : null}
          </div>
            </section>            

            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Generate Flow Chart / Summary Sheet</h2>
              <div className="mt-6 flex h-32 items-center justify-center rounded-3xl border">
                <p className="text-xl font-bold text-red-600">Coming soon</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
