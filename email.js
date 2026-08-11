        // email.js
        // Handles PDF generation and email notification to the Admin and Student.

        const EMAIL_CONFIG = {
            API_URL:
                "https://script.google.com/macros/s/AKfycbyu6I2NW_XjxqwUXSRJ2MXYvoyDcFa6soMNy1pCzMdgC1k6Rxt92WkB5Xz4M7oeL3cM/exec",     
        };

        async function sendAdminNotification(resultData, payloadData, testDetails) {
            const resultId = resultData.resultId;
            if (sessionStorage.getItem(`email_sent_${resultId}`)) {
                console.log("Notification already sent for this result. Skipping.");
                return;
            }

            try {
                console.log("Preparing PDF report...");

                if (!window.jspdf) throw new Error("jsPDF library is not loaded.");

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                let yPos = 20;
                const margin = 14;
                const maxWidth = 180;
                const lineHeight = 6;

                const checkPageBreak = (neededSpace) => {
                    if (yPos + neededSpace > 280) {
                        doc.addPage();
                        yPos = 20;
                    }
                };

                doc.setFontSize(18);
                doc.setFont(undefined, "bold");
                doc.text("Student Test Result", margin, yPos);
                yPos += 10;

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

                if (resultData.detailedReview && resultData.detailedReview.length > 0) {
                    resultData.detailedReview.forEach((item, index) => {
                        checkPageBreak(30);

                        const qData = item.questionData || {};
                        const type = qData.type || "mcq";

                        doc.setFontSize(10);
                        doc.setFont(undefined, "bold");
                        const qText = doc.splitTextToSize(
                            `Q${index + 1}: ${qData.question}`,
                            maxWidth,
                        );
                        doc.text(qText, margin, yPos);
                        yPos += qText.length * lineHeight;

                        if (type === "code_output" && qData.code) {
                            checkPageBreak(20);
                            doc.setFont("courier", "normal");
                            const codeText = doc.splitTextToSize(
                                `Code:\n${qData.code}`,
                                maxWidth,
                            );
                            doc.text(codeText, margin, yPos);
                            yPos += codeText.length * 5 + 2;
                        }

                        doc.setFont("helvetica", "normal");

                        const getOptText = (val) => {
                            if (!val || val === "Not Answered") return "Not Answered";
                            if (type === "mcq" || type === "code_output") {
                                const k = String(val).trim().toUpperCase();
                                return qData.options && qData.options[k]
                                    ? `${k}: ${qData.options[k]}`
                                    : val;
                            } else if (type === "true_false") {
                                return String(val).toLowerCase() === "true"
                                    ? "True"
                                    : "False";
                            }
                            return val;
                        };

                        const selectedText = getOptText(item.selectedOption);
                        const correctText = getOptText(qData.answer);
                        const statusText = item.isCorrect ? "Correct" : "Incorrect";

                        checkPageBreak(20);

                        if (item.isCorrect) doc.setTextColor(16, 185, 129);
                        else doc.setTextColor(239, 68, 68);

                        doc.text(
                            `Student Answer: ${selectedText} (${statusText})`,
                            margin,
                            yPos,
                        );
                        yPos += lineHeight;

                        doc.setTextColor(16, 185, 129);
                        doc.text(`Correct Answer: ${correctText}`, margin, yPos);
                        yPos += lineHeight;

                        doc.setTextColor(0, 0, 0);

                        if (qData.explanation) {
                            checkPageBreak(15);
                            doc.setFont(undefined, "italic");
                            const expText = doc.splitTextToSize(
                                `Explanation: ${qData.explanation}`,
                                maxWidth,
                            );
                            doc.text(expText, margin, yPos);
                            yPos += expText.length * lineHeight;
                            doc.setFont(undefined, "normal");
                        }

                        yPos += 6;
                        doc.setDrawColor(200, 200, 200);
                        doc.line(margin, yPos - 3, margin + maxWidth, yPos - 3);
                    });
                }

                const pdfDataUri = doc.output("datauristring");
                const pdfBase64 = pdfDataUri.split(",")[1];

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
                        studentId: payloadData.studentId,
                        subject: `Test Result: ${payloadData.studentName} - ${payloadData.testName}`,
                        body: emailSummary,
                        pdfBase64: pdfBase64,
                        fileName: `${payloadData.studentName.replace(/\s+/g, "_")}_Result.pdf`,
                    },
                };

                console.log("Sending email notification...");

                const response = await fetch(EMAIL_CONFIG.API_URL, {
                    method: "POST",
                    body: JSON.stringify(emailPayload),
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                });

                const result = await response.json();
                if (result.status === "success") {
                    console.log("Email notification sent successfully.");
                    sessionStorage.setItem(`email_sent_${resultId}`, "true");
                } else {
                    console.error("Failed to send email:", result.message);
                }
            } catch (error) {
                console.error("Error generating PDF or sending email:", error);
            }
        }

        window.sendAdminNotification = sendAdminNotification;
