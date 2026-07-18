import { useEffect, useState } from "react";
import mermaid from "mermaid";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs"; // chnaged it here coz edge fn cannot be more than 20mb
//extracts selectable text in the browser before the file is uploaded
import { supabase } from "../supabaseClient";

// reads selectable text from the PDF in the browser before upload.
async function extractTextFromPdf(pdfFile) {
  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(function (item) {
        return "str" in item ? item.str : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText) {
      pages.push(pageText);
    }
  }

  return pages.join("\n\n").trim();
}

// converts special characters into safe HTML text for printing window
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightKeywordsForPrint(text, keywords = []) { //fn receives one bullet point and words to highlight
  const safeKeywords = keywords.filter(Boolean).map(escapeRegExp); //removes empty keywords

  if (safeKeywords.length === 0) {
    return escapeHtml(text);
  }

  const parts = String(text).split(new RegExp(`(${safeKeywords.join("|")})`, "gi")); //splits into keywords and normal text

  return parts
    .map(function (part) {
      const isKeyword = keywords.some(function (keyword) {
        return part.toLowerCase() === String(keyword).toLowerCase();
      });  //check whether current part is one keywords, return T/F

      if (isKeyword) {
        return `<mark>${escapeHtml(part)}</mark>`;
      }

      return escapeHtml(part);
    })
    .join("");
}

// ppens a new tab, allows user to print the window
function openPrintWindow(title, bodyHtml) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            color: #111827;
            font-family: Arial, sans-serif;
            padding: 32px;
          }

          h1 {
            font-size: 26px;
            margin-bottom: 24px;
          }

          h2 {
            font-size: 18px;
            margin-top: 24px;
          }

          li {
            margin-bottom: 8px;
          }

          .quiz-options {
            list-style: none;
            padding-left: 0;
          }

          mark {
            background: yellow; 
            font-weight: 700;
            padding: 0 2px;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
          }
          svg {
            height: auto;
            max-width: 100%;
          }
        </style> 
      </head>
      <body>${bodyHtml}</body>
    </html>
  `); 

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

// custom hook stores the states and helper functions for HomePage
// HomePage.jsx uses the values/functions returned at the bottom of this file
export function useStateAndHelperFns(session) {
  const [signOutError, setSignOutError] = useState("");

  // Uploading memory boxes
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  const [processedDocumentId, setProcessedDocumentId] = useState("");

  // Summary memory boxes
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMessage, setSummaryMessage] = useState("");
  const [summaryData, setSummaryData] =  useState(null);

  // mindmap memory boxes
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const [mindmapMessage, setMindmapMessage] = useState("");
  const [mindmapData, setMindmapData] = useState(null);

  // documents is the History list, and selectedDocument is the PDF clicked
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);

  //quiz feature
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizMessage, setQuizMessage] = useState("");
  const [quizData, setQuizData] = useState(null);

// useEffect --> only run fn again if session.user.id changes
  useEffect(() => {
    const fetchDocuments = async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, filename, summary_json, mermaid_code, quiz_json, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("History Error:", error);
        return;
      }

      setDocuments(data); // Saves the PDF list into React state
    };

    fetchDocuments();
  }, [session.user.id]);

  const handleSignOut = async () => {
    setSignOutError("");
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setSignOutError("Could not sign out. Please try again.");
    }
  }; // Signs user out

  // Sends doc-id to generate-summary fn
  const handleGenerateSummary = async () => {
    if (!processedDocumentId) {
      setSummaryMessage("Please upload and process a PDF first.");
      return;
    }

    setSummaryLoading(true);
    setSummaryMessage("");
    setSummaryData(null);

    const { data, error } = await supabase.functions.invoke("generate-summary", {
      body: {
        document_id: processedDocumentId,
      },
    });

    if (error) {
      console.error("Summary error:", error);
      setSummaryMessage("Could not generate summary.");
      setSummaryLoading(false);
      return;
    }

    setSummaryData(data.summary);

    // updates the History copy of the doc too
    setDocuments(function (currentDocuments) {
      return currentDocuments.map(function (document) {
        if (document.id === processedDocumentId) {
          return {
            ...document,
            summary_json: data.summary,
          };
        }

        return document;
      });
    });
    setSummaryMessage("Summary generated.");
    setSummaryLoading(false);
  };

  // Sends the doc-id to the generate-mindmap
  const handleGenerateMindmap = async () => {
    if (!processedDocumentId) {
      setMindmapMessage("Please upload and process a PDF first.");
      return;
    }

    setMindmapLoading(true);
    setMindmapMessage("");
    setMindmapData(null);

    const { data, error } = await supabase.functions.invoke("generate-mindmap", {
      body: {
        document_id: processedDocumentId,
      },
    });

    if (error) {
      console.error("Mindmap error:", error);
      setMindmapMessage("Could not generate mindmap.");
      setMindmapLoading(false);
      return;
    }

    setMindmapData(data); // Shows the mindmap on the page

    setDocuments(function (currentDocuments) {
      return currentDocuments.map(function (document) {
        if (document.id === processedDocumentId) {
          return {
            ...document,
            mermaid_code: data.mermaid_code,
          };
        }

        return document;
      });
    });
    setMindmapMessage("Mindmap generated.");
    setMindmapLoading(false);
  };

  // Sends doc-id to generate-quiz fn
  const handleGenerateQuiz = async () => {
    if (!processedDocumentId) {
      setQuizMessage("Please upload and process a PDF first.");
      return;
    }

    setQuizLoading(true); // Changes the button text/loading state
    setQuizMessage("");
    setQuizData(null);

    const { data, error } = await supabase.functions.invoke("generate-quiz", {
      body: {
        document_id: processedDocumentId,
      },
    });

    if (error) {
      console.error("Quiz error:", error);
      setQuizMessage("Could not generate quiz.");
      setQuizLoading(false);
      return;
    }

    setQuizData(data.quiz);
    setDocuments(function (currentDocuments) {
      return currentDocuments.map(function (document) {
        if (document.id === processedDocumentId) {
          return {
            ...document,
            quiz_json: data.quiz,
          };
        }

        return document;
      });
    });
    setQuizMessage("Quiz generated.");
    setQuizLoading(false);
  };

  // choose PDF -> upload to Storage -> insert database row -> extract PDF text
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

    let extractedText = "";

    try {
      extractedText = await extractTextFromPdf(selectedFile);
    } catch (error) {
      console.error("Browser PDF extraction error:", error);
    }

    const userId = session.user.id;
    const filePath = `${userId}/${Date.now()}-${selectedFile.name}`;

    // Uploads the actual PDF file into Supabase pdf storage
    const { error: uploadError } = await supabase.storage
      .from("pdfs")
      .upload(filePath, selectedFile);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      setUploadMessage("Upload failed.");
      setUploading(false);
      return;
    }

    const { data: insertedDocument, error: databaseError } = await supabase //inserts row into Supabase table
      .from("documents")
      .insert({
        user_id: userId,
        filename: selectedFile.name,
        file_path: filePath,
        file_size: selectedFile.size,
        extracted_text: extractedText || null,
      })
      .select()
      .single();

    if (databaseError) {
      setUploadMessage("File failed to save, please try again.");
      setUploading(false);
      return;
    }

    console.log("Calling process-pdf with:", insertedDocument.id);

    // Calls process-pdf so the backend can use OCR when no text was found
    const { data: functionData, error: functionError } =
      await supabase.functions.invoke("process-pdf", {
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

    setProcessedDocumentId(insertedDocument.id); // Lets summary/mindmap know which PDF to use

    // Adds the new PDF to the top of history list
    setDocuments(function (currentDocuments) {
      return [
        {
          id: insertedDocument.id,
          filename: insertedDocument.filename,
          summary_json: insertedDocument.summary_json ?? null,
          mermaid_code: insertedDocument.mermaid_code ?? null,
          created_at: insertedDocument.created_at,
        },
        ...currentDocuments,
      ];
    });
    setUploadMessage("Upload successful. You can generate a summary now!");
    setSelectedFile(null);
    setUploading(false);
  };

  // Runs when the user clicks a document from history
  const handleSelectDocument = (document) => {
    setSelectedDocument(document);
    setProcessedDocumentId(document.id);
    setSummaryData(document.summary_json);

    if (document.mermaid_code) {
      setMindmapData({
        title: document.filename,
        mermaid_code: document.mermaid_code,
      });
    } else {
      setMindmapData(null);
    }

    setSummaryMessage("");
    setMindmapMessage("");
  };
// Converts the current summary into printable HTML
  const handleViewSummaryPdf = () => {
    if (!summaryData) {
      return;
    }

    const sectionsHtml = (summaryData.sections ?? [])
      .map(function (section) {
        const bulletPointsHtml = (section.bullet_points ?? [])
          .map(function (point) {
            return `<li>${highlightKeywordsForPrint(point, section.keywords)}</li>`;
          })
          .join("");

        return `
          <section>
            <h2>${escapeHtml(section.heading)}</h2>
            <ul>${bulletPointsHtml}</ul>
          </section>
        `;
      })
      .join("");

    openPrintWindow(
      summaryData.title,
      `<h1>${escapeHtml(summaryData.title)}</h1>${sectionsHtml}`,
    );
  };

  const handleViewMindmapPdf = async () => { // same as summary
    if (!mindmapData) {
      return;
    }

    const renderId = `print-mindmap-${Date.now()}`;
    const { svg } = await mermaid.render(renderId, mindmapData.mermaid_code);

    openPrintWindow(
      mindmapData.title,
      `<h1>${escapeHtml(mindmapData.title)}</h1>${svg}`,
    );
  };

  const handleViewQuizPdf = () => {
  if (!quizData) {
    return;
  }

  const questionsHtml = quizData.questions
    .map(function (question, index) {
      const optionsHtml = question.options
        .map(function (option, optionIndex) {
          const letter = ["A", "B", "C", "D"][optionIndex];
          const optionText = String(option).replace(/^[A-D][.)]\s*/i, "");

          return `<li>${letter}. ${escapeHtml(optionText)}</li>`;
        }) //escape html prevents string from being treated as literal HTML code
        .join("");

      return `
        <section>
          <h2>Question ${index + 1}</h2>
          <p>${escapeHtml(question.question)}</p>
          <ul class="quiz-options">${optionsHtml}</ul>
          <p><strong>Answer:</strong> ${escapeHtml(question.correct_option ?? question.answer)}</p>
          <p><strong>Explanation:</strong> ${escapeHtml(question.explanation)}</p>
        </section>
      `;
    })
    .join("");

  openPrintWindow(
    quizData.quiz_title,
    `<h1>${escapeHtml(quizData.quiz_title)}</h1>${questionsHtml}`,
  );
};

  return {
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
    selectedDocument,
    quizLoading,
    quizMessage,
    quizData,
    handleGenerateQuiz,
    handleViewQuizPdf,
    handleSignOut,
    handleGenerateSummary,
    handleGenerateMindmap,
    handleUpload,
    handleSelectDocument,
    handleViewSummaryPdf,
    handleViewMindmapPdf,
  }; // send these back for homepage.jsx to use
}
