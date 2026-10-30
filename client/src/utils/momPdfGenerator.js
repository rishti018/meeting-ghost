import { jsPDF } from 'jspdf';

/**
 * Generates and downloads a clean, professional PDF of the Minutes of Meeting
 */
export function downloadMomPdf(mom, fallbackTitle = 'Meeting') {
  if (!mom) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 16;
  const usableWidth = pageWidth - (marginX * 2); // 178mm
  const marginBottom = 20;

  let currentY = 18;

  function checkPageBreak(requiredHeight) {
    if (currentY + requiredHeight > pageHeight - marginBottom) {
      doc.addPage();
      currentY = 18;
      renderRunningHeader();
    }
  }

  function renderRunningHeader() {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 145, 170);
    doc.text('MEETING GHOST  |  OFFICIAL MINUTES OF MEETING', marginX, currentY);
    doc.setDrawColor(220, 226, 235);
    doc.setLineWidth(0.2);
    doc.line(marginX, currentY + 2, marginX + usableWidth, currentY + 2);
    currentY += 8;
  }

  // --- Document Header ---
  doc.setFillColor(244, 246, 250);
  doc.rect(marginX, currentY, usableWidth, 24, 'F');
  doc.setDrawColor(205, 215, 230);
  doc.setLineWidth(0.3);
  doc.rect(marginX, currentY, usableWidth, 24, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(81, 69, 205); // Brand Accent
  doc.text('MEETING GHOST  •  MINUTES OF MEETING', marginX + 4, currentY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(23, 32, 51); // Dark Navy
  const titleText = doc.splitTextToSize(mom.title || fallbackTitle, usableWidth - 8);
  doc.text(titleText[0] || 'Meeting Minutes', marginX + 4, currentY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(82, 96, 120);
  const genDateStr = mom.generatedAt ? new Date(mom.generatedAt).toLocaleDateString() : new Date().toLocaleDateString();
  doc.text(`Generated: ${genDateStr}${mom.isEdited ? ' (Edited)' : ''}`, marginX + usableWidth - 4, currentY + 7, { align: 'right' });

  currentY += 28;

  // --- Metadata Box (Date, Time, Department, Participants) ---
  checkPageBreak(30);

  const metaBoxY = currentY;
  const colWidth = usableWidth / 3;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(220, 226, 235);
  doc.roundedRect(marginX, metaBoxY, usableWidth, 22, 1, 1, 'FD');

  // Col 1: Date & Time
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 96, 120);
  doc.text('DATE & TIME', marginX + 4, metaBoxY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(23, 32, 51);
  const timeStr = mom.meetingTime && mom.meetingTime !== 'Not specified' ? ` @ ${mom.meetingTime}` : '';
  doc.text(`${mom.meetingDate || 'Not specified'}${timeStr}`, marginX + 4, metaBoxY + 13);

  // Col 2: Department / Scope
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 96, 120);
  doc.text('DEPARTMENT / SCOPE', marginX + colWidth + 4, metaBoxY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(23, 32, 51);
  doc.text(`${mom.department || 'General'}`, marginX + colWidth + 4, metaBoxY + 13);

  // Col 3: Status / Deliverables
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(82, 96, 120);
  doc.text('TOTAL ACTION ITEMS', marginX + (colWidth * 2) + 4, metaBoxY + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(23, 32, 51);
  const actionCount = Array.isArray(mom.actionItems) ? mom.actionItems.length : 0;
  const decisionCount = Array.isArray(mom.decisions) ? mom.decisions.length : 0;
  doc.text(`${actionCount} Deliverables  |  ${decisionCount} Decisions`, marginX + (colWidth * 2) + 4, metaBoxY + 13);

  currentY += 26;

  // --- Section 1: Participants ---
  renderSectionHeading('1. PARTICIPANTS');
  const participantsList = Array.isArray(mom.participants) && mom.participants.length > 0
    ? mom.participants.join(', ')
    : 'Not specified';
  renderParagraph(participantsList);

  // --- Section 2: Meeting Objective / Purpose ---
  renderSectionHeading('2. MEETING OBJECTIVE / PURPOSE');
  renderParagraph(mom.objective || 'Not specified');

  // --- Section 3: Agenda Items ---
  renderSectionHeading('3. AGENDA ITEMS');
  if (Array.isArray(mom.agenda) && mom.agenda.length > 0 && mom.agenda[0] !== 'Not specified') {
    renderBulletList(mom.agenda);
  } else {
    renderParagraph('Not specified');
  }

  // --- Section 4: Key Discussion Points ---
  renderSectionHeading('4. KEY DISCUSSION POINTS');
  if (Array.isArray(mom.keyDiscussionPoints) && mom.keyDiscussionPoints.length > 0) {
    renderBulletList(mom.keyDiscussionPoints);
  } else {
    renderParagraph('Not specified');
  }

  // --- Section 5: Important Questions & Responses ---
  renderSectionHeading('5. IMPORTANT QUESTIONS & RESPONSES');
  if (Array.isArray(mom.questionsAndResponses) && mom.questionsAndResponses.length > 0) {
    for (const qr of mom.questionsAndResponses) {
      checkPageBreak(18);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginX, currentY, usableWidth, 14, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(81, 69, 205);
      const asker = qr.askedBy && qr.askedBy !== 'Not specified' ? ` (${qr.askedBy})` : '';
      doc.text(`Q${asker}: ${qr.question}`, marginX + 3, currentY + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(38, 50, 70);
      doc.text(`A: ${qr.response}`, marginX + 3, currentY + 10);

      currentY += 17;
    }
  } else {
    renderParagraph('No specific questions logged.');
  }

  // --- Section 6: Decisions Made ---
  renderSectionHeading('6. DECISIONS MADE');
  if (Array.isArray(mom.decisions) && mom.decisions.length > 0) {
    renderDecisionsTable(mom.decisions);
  } else {
    renderParagraph('No decisions recorded.');
  }

  // --- Section 7: Action Items & Deliverables ---
  renderSectionHeading('7. ACTION ITEMS & DELIVERABLES');
  if (Array.isArray(mom.actionItems) && mom.actionItems.length > 0) {
    renderActionItemsTable(mom.actionItems);
  } else {
    renderParagraph('No action items recorded.');
  }

  // --- Section 8: Pending Issues / Unresolved Questions ---
  renderSectionHeading('8. PENDING ISSUES / UNRESOLVED QUESTIONS');
  if (Array.isArray(mom.pendingIssues) && mom.pendingIssues.length > 0) {
    renderBulletList(mom.pendingIssues);
  } else {
    renderParagraph('No pending issues identified.');
  }

  // --- Section 9: Follow-up Meeting Details ---
  renderSectionHeading('9. FOLLOW-UP MEETING DETAILS');
  const fu = mom.followUpMeeting || {};
  const fuDetails = fu.details && fu.details !== 'Not specified' ? fu.details : (fu.agenda || 'Not specified');
  const fuDate = fu.date && fu.date !== 'Not specified' ? `Date: ${fu.date}` : '';
  const fuTime = fu.time && fu.time !== 'Not specified' ? `Time: ${fu.time}` : '';
  const fuLine = [fuDetails, fuDate, fuTime].filter(Boolean).join(' | ');
  renderParagraph(fuLine || 'Not specified');

  // --- Section 10: Conclusion / Summary ---
  renderSectionHeading('10. CONCLUSION / SUMMARY');
  renderParagraph(mom.conclusion || 'Not specified');

  // --- Page Numbering Footers on all pages ---
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 155, 175);
    doc.setDrawColor(220, 226, 235);
    doc.line(marginX, pageHeight - 12, marginX + usableWidth, pageHeight - 12);
    doc.text('Meeting Ghost AI Minutes of Meeting', marginX, pageHeight - 7);
    doc.text(`Page ${i} of ${totalPages}`, marginX + usableWidth, pageHeight - 7, { align: 'right' });
  }

  // Helper functions
  function renderSectionHeading(title) {
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(38, 58, 90);
    doc.text(title, marginX, currentY);
    doc.setDrawColor(213, 221, 234);
    doc.setLineWidth(0.3);
    doc.line(marginX, currentY + 1.5, marginX + usableWidth, currentY + 1.5);
    currentY += 6.5;
  }

  function renderParagraph(text) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(38, 50, 70);
    const lines = doc.splitTextToSize(String(text || 'Not specified'), usableWidth);
    const height = lines.length * 4.5;
    checkPageBreak(height + 2);
    doc.text(lines, marginX, currentY);
    currentY += height + 4;
  }

  function renderBulletList(items) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(38, 50, 70);

    for (const item of items) {
      const bulletText = `•  ${item}`;
      const lines = doc.splitTextToSize(bulletText, usableWidth - 4);
      const height = lines.length * 4.5;
      checkPageBreak(height + 1);
      doc.text(lines, marginX + 2, currentY);
      currentY += height + 1.5;
    }
    currentY += 2;
  }

  function renderDecisionsTable(decisions) {
    const tableHeaderHeight = 6;
    checkPageBreak(tableHeaderHeight + (decisions.length * 8));

    // Table Header
    doc.setFillColor(244, 246, 250);
    doc.rect(marginX, currentY, usableWidth, tableHeaderHeight, 'F');
    doc.setDrawColor(220, 226, 235);
    doc.rect(marginX, currentY, usableWidth, tableHeaderHeight, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(82, 96, 120);
    doc.text('CONFIRMED DECISION', marginX + 3, currentY + 4.2);
    doc.text('RATIONALE / CONTEXT', marginX + 90, currentY + 4.2);
    currentY += tableHeaderHeight;

    // Table Rows
    for (const d of decisions) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const decisionLines = doc.splitTextToSize(d.decision || '', 82);
      const rationaleLines = doc.splitTextToSize(d.rationale || 'Agreed upon during discussion', 82);
      const rowHeight = Math.max(decisionLines.length, rationaleLines.length) * 4 + 4;

      checkPageBreak(rowHeight);

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, currentY, marginX + usableWidth, currentY);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(23, 32, 51);
      doc.text(decisionLines, marginX + 3, currentY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(70, 80, 95);
      doc.text(rationaleLines, marginX + 90, currentY + 4);

      currentY += rowHeight;
    }
    currentY += 3;
  }

  function renderActionItemsTable(items) {
    const tableHeaderHeight = 6;
    checkPageBreak(tableHeaderHeight + (items.length * 8));

    // Table Header
    doc.setFillColor(244, 246, 250);
    doc.rect(marginX, currentY, usableWidth, tableHeaderHeight, 'F');
    doc.setDrawColor(220, 226, 235);
    doc.rect(marginX, currentY, usableWidth, tableHeaderHeight, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(82, 96, 120);
    doc.text('DELIVERABLE', marginX + 3, currentY + 4.2);
    doc.text('OWNER', marginX + 85, currentY + 4.2);
    doc.text('DEADLINE', marginX + 120, currentY + 4.2);
    doc.text('PRIORITY', marginX + 155, currentY + 4.2);
    currentY += tableHeaderHeight;

    // Table Rows
    for (const item of items) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const taskLines = doc.splitTextToSize(item.task || '', 78);
      const rowHeight = Math.max(taskLines.length * 4 + 3, 7);

      checkPageBreak(rowHeight);

      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, currentY, marginX + usableWidth, currentY);

      doc.setTextColor(23, 32, 51);
      doc.text(taskLines, marginX + 3, currentY + 4);

      doc.setTextColor(50, 60, 75);
      doc.text(String(item.owner || 'Unassigned'), marginX + 85, currentY + 4);

      doc.setTextColor(70, 80, 95);
      doc.text(String(item.deadline || 'Not specified'), marginX + 120, currentY + 4);

      // Priority color indicator
      if (item.priority === 'High') {
        doc.setTextColor(185, 28, 28);
      } else if (item.priority === 'Low') {
        doc.setTextColor(21, 128, 61);
      } else {
        doc.setTextColor(82, 96, 120);
      }
      doc.text(String(item.priority || 'Medium'), marginX + 155, currentY + 4);

      currentY += rowHeight;
    }
    currentY += 4;
  }

  // File Download
  const safeTitle = (mom.title || fallbackTitle)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const fileName = `MoM_${safeTitle}_${mom.meetingDate || 'report'}.pdf`;

  doc.save(fileName);
}

