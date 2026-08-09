// email.js
// Handles PDF generation and email notification to the Admin and Student.

// --- Configuration (Environment Variables Equivalent) ---
const EMAIL_CONFIG = {
    // The Google Apps Script URL (should match your main API_URL)
    API_URL:
        "https://script.google.com/macros/s/AKfycbyu6I2NW_XjxqwUXSRJ2MXYvoyDcFa6soMNy1pCzMdgC1k6Rxt92WkB5Xz4M7oeL3cM/exec",

    // Admin email address to receive notifications. UPDATE THIS!
    ADMIN_EMAIL: "admin_email_here@example.com",
};

/**
 * Main function to generate PDF and send email.
 * @param {Object} resultData - The evaluated result data from the backend.
 * @param {Object} payloadData - The original payload submitted by the student.
 * @param {Object} testDetails - The details of the test.
 */
async function sendAdminNotification(resultData, payloadData, testDetails) {
    // 1. Check if email was already sent for this specific result to prevent duplicates
    const resultId = resultData.resultId;
    if (sessionStorage.getItem(`email_sent_${resultId}`)) {
        console.log("Notification already sent for this result. Skipping.");
        return;
    }

    try {
        console.log("Preparing PDF report...");

        // Ensure jsPDF is loaded
        if (!window.jspdf) {
            throw new Error("jsPDF library is not loaded.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let yPos = 20;
        const margin = 14;
        const maxWidth = 180;
        const lineHeight = 6;

        // Helper function to handle page breaks
        const checkPageBreak = (neededSpace) => {
            if (yPos + neededSpace > 280) {
                doc.addPage();
                yPos = 20;
            }
        };

        // --- Build PDF Content ---

        // Title
        doc.setFontSize(18);
        doc.setFont(undefined, "bold");
        doc.text("Student Test Result", margin, yPos);
        yPos += 10;

        // Summary Info
        doc.setFontSize(11);
        doc.setFont(undefined, "normal");
        doc.text(`Student Name: ${payloadData.studentName}`, margin, yPos);
        yPos += lineHeight;
        doc.text(`Student ID: ${payloadData.studentId}`, margin, yPos);
        yPos += lineHeight;
        doc.text(`Test Name: ${payloadData.testName}`, margin, yPos);
        yPos += lineHeight;
        doc.text(
            `Date/Time: ${new Date(resultData.timestamp).toLocaleString()}`,
            margin,
            yPos,
        );
        yPos += lineHeight;
        doc.text(`Time Taken: ${payloadData.timeTaken}`, margin, yPos);
        yPos += lineHeight;

        yPos += 4;
        doc.setFont(undefined, "bold");
        doc.text(
            `Final Score: ${resultData.finalScore} / ${resultData.total}`,
            margin,
            yPos,
        );
        yPos += lineHeight;
        doc.text(`Percentage: ${resultData.percentage}`, margin, yPos);
        yPos += lineHeight;

        yPos += 10;
        doc.setFontSize(14);
        doc.text("Detailed Review", margin, yPos);
        yPos += 10;

        // Detailed Questions
        if (resultData.detailedReview && resultData.detailedReview.length > 0) {
            resultData.detailedReview.forEach((item, index) => {
                checkPageBreak(30); // Pre-check for space

                doc.setFontSize(10);
                doc.setFont(undefined, "bold");
                const qText = doc.splitTextToSize(
                    `Q${index + 1}: ${item.question}`,
                    maxWidth,
                );
                doc.text(qText, margin, yPos);
                yPos += qText.length * lineHeight;

                if (item.code) {
                    checkPageBreak(20);
                    doc.setFont("courier", "normal");
                    const codeText = doc.splitTextToSize(
                        `Code:\n${item.code}`,
                        maxWidth,
                    );
                    doc.text(codeText, margin, yPos);
                    yPos += codeText.length * 5 + 2;
                }

                doc.setFont("helvetica", "normal");

                const getOptText = (key) => {
                    if (!key || key === "Not Answered") return "Not Answered";
                    let k = key.toString().trim().toLowerCase();
                    if (k === "a" || k === "optiona") return item.optionA;
                    if (k === "b" || k === "optionb") return item.optionB;
                    if (k === "c" || k === "optionc") return item.optionC;
                    if (k === "d" || k === "optiond") return item.optionD;
                    return key;
                };

                const selectedText = getOptText(item.selectedOption);
                const correctText = getOptText(item.correctOption);
                const statusText = item.isCorrect ? "Correct" : "Incorrect";

                checkPageBreak(20);

                // Set color based on correct/incorrect
                if (item.isCorrect) {
                    doc.setTextColor(16, 185, 129); // Success Green
                } else {
                    doc.setTextColor(239, 68, 68); // Danger Red
                }
                doc.text(
                    `Student Answer: ${selectedText} (${statusText})`,
                    margin,
                    yPos,
                );
                yPos += lineHeight;

                doc.setTextColor(16, 185, 129); // Correct answer always green
                doc.text(`Correct Answer: ${correctText}`, margin, yPos);
                yPos += lineHeight;

                doc.setTextColor(0, 0, 0); // Reset to black

                if (item.explanation) {
                    checkPageBreak(15);
                    doc.setFont(undefined, "italic");
                    const expText = doc.splitTextToSize(
                        `Explanation: ${item.explanation}`,
                        maxWidth,
                    );
                    doc.text(expText, margin, yPos);
                    yPos += expText.length * lineHeight;
                    doc.setFont(undefined, "normal");
                }

                yPos += 6; // Spacing between questions
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, yPos - 3, margin + maxWidth, yPos - 3);
            });
        }

        // 2. Convert PDF to Base64 (ready to attach to email)
        const pdfDataUri = doc.output("datauristring");
        const pdfBase64 = pdfDataUri.split(",")[1];

        // 3. Prepare Email Payload
        const emailSummary = `
A new test result has been submitted by ${payloadData.studentName}.

Test: ${payloadData.testName}
Score: ${resultData.finalScore} / ${resultData.total}
Percentage: ${resultData.percentage}
Time Taken: ${payloadData.timeTaken}

Please find the detailed result attached as a PDF.
        `.trim();

        const emailPayload = {
            action: "sendAdminEmail",
            data: {
                adminEmail: EMAIL_CONFIG.ADMIN_EMAIL,
                studentId: payloadData.studentId, // <-- ADDED: Pass student ID to backend
                subject: `Test Result: ${payloadData.studentName} - ${payloadData.testName}`,
                body: emailSummary,
                pdfBase64: pdfBase64,
                fileName: `${payloadData.studentName.replace(/\s+/g, "_")}_Result.pdf`,
            },
        };

        console.log("Sending email notification...");

        // 4. Send to Apps Script Backend
        const response = await fetch(EMAIL_CONFIG.API_URL, {
            method: "POST",
            body: JSON.stringify(emailPayload),
            headers: { "Content-Type": "text/plain;charset=utf-8" },
        });

        const result = await response.json();
        if (result.status === "success") {
            console.log("Email notification sent successfully.");
            // Mark as sent in session storage
            sessionStorage.setItem(`email_sent_${resultId}`, "true");
        } else {
            console.error("Failed to send email:", result.message);
        }
    } catch (error) {
        console.error("Error generating PDF or sending email:", error);
    }
}

// Expose to global scope for index.html to use
window.sendAdminNotification = sendAdminNotification;
