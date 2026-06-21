import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export const A4_MARGIN_MM = 10;

const getPageDimensions = (orientation) =>
  orientation === 'l' ? { width: 297, height: 210 } : { width: 210, height: 297 };

const getA4Layout = (orientation, marginMm) => {
  const { width, height } = getPageDimensions(orientation);
  const margin = Math.max(0, Number(marginMm != null ? marginMm : A4_MARGIN_MM));
  return {
    pageWidth: width,
    pageHeight: height,
    margin,
    contentWidth: Math.max(0, width - margin * 2),
    contentHeight: Math.max(0, height - margin * 2)
  };
};

const applyCaptureStyles = (element, widthOverride) => {
  const originalStyles = {
    position: element.style.position,
    left: element.style.left,
    top: element.style.top,
    visibility: element.style.visibility,
    zIndex: element.style.zIndex,
    display: element.style.display,
    width: element.style.width
  };

  element.style.position = 'fixed';
  element.style.left = '-9999px';
  element.style.top = '-9999px';
  element.style.visibility = 'visible';
  element.style.zIndex = '-1';
  element.style.display = 'block';

  if (widthOverride) {
    element.style.width = widthOverride;
  }

  return originalStyles;
};

const restoreCaptureStyles = (element, originalStyles) => {
  Object.keys(originalStyles).forEach((key) => {
    element.style[key] = originalStyles[key];
  });
};

export const runPdfDownload = async (
  task,
  {
    loadingMessage = 'Preparing PDF...',
    successMessage = 'PDF downloaded successfully',
    errorMessage = 'Failed to generate PDF'
  } = {}
) => {
  void loadingMessage;
  void successMessage;
  void errorMessage;
  try {
    const result = await task();
    return result;
  } catch (error) {
    console.error('[PDF] Download error:', error);
    return null;
  }
};

const renderElementToPdfDoc = async ({
  element,
  orientation = 'p',
  widthOverride,
  scale = 2,
  skipStyleAdjust = false,
  marginMm,
  fitToPage = false,
  singlePage = false,
  allowScaleUp = false,
  fitAlign = 'center'
}) => {
  if (!element) {
    throw new Error('Report element not found');
  }

  const { pageWidth, pageHeight, margin, contentWidth, contentHeight } = getA4Layout(orientation, marginMm);
  const resolvedWidthOverride = widthOverride || `${contentWidth}mm`;
  const originalStyles = skipStyleAdjust ? null : applyCaptureStyles(element, resolvedWidthOverride);

  try {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const canvas = await html2canvas(element, {
      scale,
      allowTaint: true,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    const pdf = new jsPDF(orientation, 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png');
    const baseWidth = contentWidth || pageWidth;
    const baseHeight = contentHeight || pageHeight;
    let imgWidth = baseWidth;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;
    let drawX = margin;
    let drawY = margin;

    if (fitToPage) {
      const widthScale = baseWidth > 0 ? baseWidth / imgWidth : 1;
      const heightScale = baseHeight > 0 ? baseHeight / imgHeight : 1;
      let scaleFactor = Math.min(widthScale, heightScale);
      if (!allowScaleUp) {
        scaleFactor = Math.min(1, scaleFactor);
      }
      if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
        scaleFactor = 1;
      }
      imgWidth *= scaleFactor;
      imgHeight *= scaleFactor;

      if (fitAlign === 'topleft') {
        drawX = margin;
        drawY = margin;
      } else if (fitAlign === 'top') {
        drawX = margin + Math.max(0, (baseWidth - imgWidth) / 2);
        drawY = margin;
      } else {
        drawX = margin + Math.max(0, (baseWidth - imgWidth) / 2);
        drawY = margin + Math.max(0, (baseHeight - imgHeight) / 2);
      }
    }

    let heightLeft = imgHeight;
    let position = drawY;

    pdf.addImage(imgData, 'PNG', drawX, position, imgWidth, imgHeight);

    if (singlePage || fitToPage) {
      return pdf;
    }

    heightLeft -= contentHeight || pageHeight;

    while (heightLeft > 0) {
      const offset = imgHeight - heightLeft;
      position = margin - offset;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= contentHeight || pageHeight;
    }
    return pdf;
  } finally {
    if (!skipStyleAdjust && originalStyles) {
      restoreCaptureStyles(element, originalStyles);
    }
  }
};

export const captureElementToPdf = async ({
  element,
  filename,
  orientation = 'p',
  widthOverride,
  scale = 2,
  skipStyleAdjust = false,
  marginMm,
  fitToPage = false,
  singlePage = false,
  allowScaleUp = false,
  fitAlign = 'center'
}) => {
  const pdf = await renderElementToPdfDoc({
    element,
    orientation,
    widthOverride,
    scale,
    skipStyleAdjust,
    marginMm,
    fitToPage,
    singlePage,
    allowScaleUp,
    fitAlign
  });
  pdf.save(filename || 'document.pdf');
};

export const captureElementToPdfBlob = async ({
  element,
  orientation = 'p',
  widthOverride,
  scale = 2,
  skipStyleAdjust = false,
  marginMm,
  fitToPage = false,
  singlePage = false,
  allowScaleUp = false,
  fitAlign = 'center'
}) => {
  const pdf = await renderElementToPdfDoc({
    element,
    orientation,
    widthOverride,
    scale,
    skipStyleAdjust,
    marginMm,
    fitToPage,
    singlePage,
    allowScaleUp,
    fitAlign
  });

  return pdf.output('blob');
};

export const saveBlobAsFile = (blob, filename = 'document.pdf') => {
  if (!blob) {
    throw new Error('No file available for download');
  }

  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};

export const printElementAsPdf = async ({
  element,
  orientation = 'p',
  widthOverride,
  scale = 2,
  skipStyleAdjust = false,
  marginMm,
  fitToPage = false,
  singlePage = false,
  allowScaleUp = false,
  fitAlign = 'center'
}) => {
  const pdf = await renderElementToPdfDoc({
    element,
    orientation,
    widthOverride,
    scale,
    skipStyleAdjust,
    marginMm,
    fitToPage,
    singlePage,
    allowScaleUp,
    fitAlign
  });

  const blob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.src = blobUrl;
  document.body.appendChild(iframe);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    URL.revokeObjectURL(blobUrl);
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while loading printable PDF'));
    }, 10000);

    iframe.onload = () => {
      clearTimeout(timeoutId);
      resolve();
    };
  });

  const printWindow = iframe.contentWindow;
  if (!printWindow) {
    cleanup();
    throw new Error('Unable to open print window');
  }

  const fallbackCleanupTimer = setTimeout(cleanup, 60000);
  printWindow.onafterprint = () => {
    clearTimeout(fallbackCleanupTimer);
    cleanup();
  };

  printWindow.focus();
  printWindow.print();
};

export const captureHtmlToPdf = async ({
  html,
  filename,
  orientation = 'p',
  widthOverride,
  scale,
  marginMm
}) => {
  if (!html) {
    throw new Error('No content available for PDF');
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.background = '#ffffff';
  document.body.appendChild(container);

  try {
    await captureElementToPdf({
      element: container,
      filename,
      orientation,
      widthOverride,
      scale,
      marginMm
    });
  } finally {
    document.body.removeChild(container);
  }
};
