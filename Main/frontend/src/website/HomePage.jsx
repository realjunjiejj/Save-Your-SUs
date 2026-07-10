import { useEffect, useRef } from "react";
import mermaid from "mermaid";
import Navbar from "./Navbar";
import { useStateAndHelperFns } from "./useStateAndHelperFns";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
});

// receives Mermaid text code, then turns it into an SVG diagram

function MermaidMindmap({ code }) {
  // useRef lets React remember the actual <div> where the pic will go
  const containerRef = useRef(null);

  useEffect(() => {
    const renderMindmap = async () => {
      if (!code || !containerRef.current) {
        return;
      }

      const renderId = `mindmap-${Date.now()}`;
      const { svg } = await mermaid.render(renderId, code);

      containerRef.current.innerHTML = svg; //svg goes inside div
    };

    renderMindmap();
  }, [code]);

  return <div ref={containerRef} className="min-h-64 overflow-auto" />;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

//highlight word helper fn 
function highlightKeywords(text, keywords = []) {
  const safeKeywords = keywords.filter(Boolean).map(escapeRegExp);

  if (safeKeywords.length === 0) {
    return text;
  }

  const parts = text.split(new RegExp(`(${safeKeywords.join("|")})`, "gi")); //"gi" means global and case insensitive

  return parts.map(function (part, index) {
    const isKeyword = keywords.some(function (keyword) {
      return part.toLowerCase() === keyword.toLowerCase();
    });

    if (isKeyword) {
      return (
        <span key={index} className=" bg-yellow-300 font-bold">
          {part}
        </span>
      );
    }
    return part;
  });
}


export default function HomePage({ session }) {
  // Pulls all states and functions from the custom hook
  const {
    signOutError,
    selectedFile,
    setSelectedFile,
    uploading,
    uploadMessage,
    processedDocumentId,
    summaryLoading,
    summaryMessage,
    summaryData,
    mindmapLoading,
    mindmapMessage,
    mindmapData,
    documents,
    handleSignOut,
    handleGenerateSummary,
    handleGenerateMindmap,
    handleUpload,
    handleSelectDocument,
    handleViewSummaryPdf,
    handleViewMindmapPdf,
  } = useStateAndHelperFns(session);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} onSignOut={handleSignOut} />

      <main className="p-6">
        {signOutError ? (
          <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {signOutError}
          </p>
        ) : null}

        <div className="gap-6 lg:flex">
          {/* History sidebar */}
          <aside className="mb-6 rounded-3xl border bg-white p-6 shadow-sm lg:mb-0 lg:w-64">
            <h2 className="text-lg font-bold">History</h2>

            <div className="mt-6 max-h-80 space-y-2 overflow-y-auto">
              {documents.length === 0 ? (
                <p className="text-sm font-bold text-red-500">No PDFs yet</p>
              ) : (
                documents.map(function (document, index) {
                  return (
                    <button
                      key={document.id}
                      type="button"
                      onClick={() => handleSelectDocument(document)}
                      className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-gray-100 hover:text-red-500"
                      title={document.filename}
                    >
                      {index + 1}. {document.filename}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <div className="flex-1">
            {/* Upload PDF section */}
            <section className="mb-6 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Upload PDF</h2>

              <div className="mt-6 flex flex-col items-center rounded-3xl border-2 border-dashed p-6">
                <label className="cursor-pointer rounded-xl border bg-white px-4 py-2 font-bold text-gray-700 hover:bg-gray-100">
                  Choose PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    // Saves the chosen PDF into selectedFile state
                    onChange={(event) => setSelectedFile(event.target.files[0])}
                    className="hidden"
                  />
                </label>

                {selectedFile ? (
                  <p className="mt-3 text-sm font-bold text-gray-700">
                    {selectedFile.name}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">No file chosen</p>
                )}

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="mt-4 block rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  {uploading ? "Uploading wait ah..." : "Click here to upload!"}
                </button>

                {uploadMessage ? (
                  <p className="mt-4 font-bold text-gray-700">{uploadMessage}</p>
                ) : null}
              </div>
            </section>

            {/* Summary section */}
            <section className="rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Generate Summary Sheet</h2>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleGenerateSummary}
                  disabled={summaryLoading || !processedDocumentId}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  {summaryLoading ? "Generating summary..." : "Generate Summary"}
                </button>

                <button
                  type="button"
                  onClick={handleViewSummaryPdf}
                  disabled={!summaryData}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  View as PDF
                </button>
              </div>

              {summaryMessage ? (
                <p className="mt-4 font-bold text-gray-700">{summaryMessage}</p>
              ) : null}

              {summaryData ? (
                <div className="mt-6 h-[700px] overflow-y-auto rounded-2xl border p-4">
                  <h3 className="text-xl font-bold">{summaryData.title}</h3>

                  <div className="mt-4 space-y-4">
                    {summaryData.sections.map(function (section, index) {
                      return (
                        <div key={index}>
                          <h4 className="font-bold text-indigo-700">
                            {section.heading}
                          </h4>
                          <ul className="mt-2 list-disc pl-6 text-gray-700">
                            {section.bullet_points.map(function (
                              point,
                              pointIndex,
                            ) {
                              return(
                                  <li key={pointIndex}>
                                    {highlightKeywords(point, section.keywords)}
                                      </li>);; // helper fn will return bullet point with keywords highlighted 
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Mindmap section */}
            <section className="mt-6 rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold">Generate Mindmap</h2>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleGenerateMindmap}
                  disabled={mindmapLoading || !processedDocumentId}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  {mindmapLoading ? "Generating mindmap..." : "Generate Mindmap"}
                </button>

                <button
                  type="button"
                  onClick={handleViewMindmapPdf}
                  disabled={!mindmapData}
                  className="rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  View as PDF
                </button>
              </div>

              {mindmapMessage ? (
                <p className="mt-4 font-bold text-gray-700">{mindmapMessage}</p>
              ) : null}

              {mindmapData ? (
                <div className="mt-6 rounded-2xl border p-4">
                  <h3 className="text-xl font-bold">{mindmapData.title}</h3>
                  <div className="mt-4 h -[650px] overflow-auto rounded-2xl border bg-gray-50 p-4">
                    <div classname = "min-w-[1200px]">
                    {/* Sends Mermaid source code into MermaidMindmap to render the diagram*/}
                    <MermaidMindmap code={mindmapData.mermaid_code}/>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
