export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    isLoading = true;

    loadPromise = new Promise(async (resolve, reject) => {
        try {
            // IMPORTANT: Let the module import handle its own version
            // Don't specify version, let it use what's installed
            const lib = await import("pdfjs-dist/build/pdf.mjs");

            // Get the version from the imported library
            const version = lib.version || '3.11.174';
            console.log(`PDF.js version: ${version}`);

            // Use the correct worker URL based on the actual version
            const workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`;

            // Set worker source
            lib.GlobalWorkerOptions.workerSrc = workerSrc;
            console.log(`Setting worker source to: ${workerSrc}`);

            pdfjsLib = lib;
            isLoading = false;
            resolve(lib);

        } catch (error) {
            console.error("Failed to load PDF.js:", error);

            // Try alternative loading method
            try {
                console.log("Trying alternative loading method...");

                // Create a global reference for PDF.js
                if (typeof window !== 'undefined') {
                    // Load PDF.js via script tag
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
                    script.onload = () => {
                        if ((window as any).pdfjsLib) {
                            pdfjsLib = (window as any).pdfjsLib;
                            pdfjsLib.GlobalWorkerOptions.workerSrc =
                                'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
                            isLoading = false;
                            resolve(pdfjsLib);
                        }
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                }
            } catch (fallbackError) {
                console.error("Fallback also failed:", fallbackError);
                isLoading = false;
                reject(error);
            }
        }
    });

    return loadPromise;
}

// Alternative simpler approach - Use same version consistently
export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        // Validate file
        if (!file || !(file instanceof File)) {
            return {
                imageUrl: "",
                file: null,
                error: "Invalid file provided",
            };
        }

        // Check if file is a PDF
        const isPdf = file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf');

        if (!isPdf) {
            return {
                imageUrl: "",
                file: null,
                error: "File is not a PDF",
            };
        }

        console.log("Starting PDF conversion for:", file.name);

        // Try loading with CDN first (most reliable)
        let lib;
        try {
            // Try to get the version from package.json or use a fixed version
            const version = '3.11.174'; // Use a fixed version that matches worker

            // Load from CDN as a script
            if (typeof window !== 'undefined') {
                // Check if already loaded
                if ((window as any).pdfjsLib) {
                    lib = (window as any).pdfjsLib;
                } else {
                    // Load dynamically
                    await new Promise<void>((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.min.js`;
                        script.onload = () => {
                            lib = (window as any).pdfjsLib;
                            lib.GlobalWorkerOptions.workerSrc =
                                `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.js`;
                            resolve();
                        };
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }
            }
        } catch (cdnError) {
            console.log("CDN loading failed, trying local import...", cdnError);

            // Fallback to local import
            try {
                lib = await loadPdfJs();
            } catch (localError) {
                throw new Error(`Failed to load PDF.js: ${localError.message}`);
            }
        }

        if (!lib) {
            return {
                imageUrl: "",
                file: null,
                error: "PDF.js library failed to load",
            };
        }

        const arrayBuffer = await file.arrayBuffer();
        console.log("PDF loaded into array buffer, size:", arrayBuffer.byteLength);

        // Load PDF document with error handling
        let pdf;
        try {
            const loadingTask = lib.getDocument({ data: arrayBuffer });
            pdf = await loadingTask.promise;
        } catch (pdfError) {
            return {
                imageUrl: "",
                file: null,
                error: `Failed to parse PDF file. It may be corrupted or password protected.`,
            };
        }

        console.log("PDF document loaded, pages:", pdf.numPages);

        // Get first page
        const page = await pdf.getPage(1);
        console.log("Got page 1");

        // Set scale for better quality
        const scale = 2; // Reduced for better compatibility
        const viewport = page.getViewport({ scale });
        console.log("Viewport dimensions:", viewport.width, "x", viewport.height);

        // Create canvas
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            return {
                imageUrl: "",
                file: null,
                error: "Canvas context is not available",
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Set canvas rendering options
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        // Render PDF page to canvas
        console.log("Rendering PDF to canvas...");
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };

        await page.render(renderContext).promise;
        console.log("PDF rendered successfully");

        // Convert canvas to blob
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        console.error("Canvas toBlob returned null");
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image from canvas",
                        });
                        return;
                    }

                    try {
                        // Create a File from the blob with the same name as the pdf
                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.png`, {
                            type: "image/png",
                        });

                        const imageUrl = URL.createObjectURL(blob);
                        console.log("Conversion successful, image URL created:", imageUrl);

                        resolve({
                            imageUrl,
                            file: imageFile,
                        });
                    } catch (fileError) {
                        console.error("Error creating file:", fileError);
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: `Failed to create image file: ${fileError}`,
                        });
                    }
                },
                "image/png",
                0.95
            );
        });

    } catch (err) {
        console.error("PDF conversion error:", err);

        let errorMessage = "Failed to convert PDF";
        if (err instanceof Error) {
            errorMessage += `: ${err.message}`;
        } else {
            errorMessage += `: ${String(err)}`;
        }

        return {
            imageUrl: "",
            file: null,
            error: errorMessage,
        };
    }
}

// Simple version without dynamic imports (most reliable)
export async function convertPdfToImageSimple(
    file: File
): Promise<PdfConversionResult> {
    return new Promise(async (resolve) => {
        try {
            // Check if PDF.js is available globally
            if (typeof window === 'undefined') {
                return resolve({
                    imageUrl: "",
                    file: null,
                    error: "Window is not available",
                });
            }

            // Load PDF.js from CDN if not already loaded
            if (!(window as any).pdfjsLib) {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

                script.onload = async () => {
                    // Set worker
                    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    // Now convert
                    const result = await performConversion(file);
                    resolve(result);
                };

                script.onerror = () => {
                    resolve({
                        imageUrl: "",
                        file: null,
                        error: "Failed to load PDF.js library",
                    });
                };

                document.head.appendChild(script);
            } else {
                // Already loaded, just convert
                const result = await performConversion(file);
                resolve(result);
            }
        } catch (err) {
            resolve({
                imageUrl: "",
                file: null,
                error: `Conversion failed: ${err}`,
            });
        }
    });
}

async function performConversion(file: File): Promise<PdfConversionResult> {
    const lib = (window as any).pdfjsLib;

    if (!lib) {
        return {
            imageUrl: "",
            file: null,
            error: "PDF.js not loaded",
        };
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            return {
                imageUrl: "",
                file: null,
                error: "Canvas context not available",
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;

        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const originalName = file.name.replace(/\.pdf$/i, "");
                        const imageFile = new File([blob], `${originalName}.png`, {
                            type: "image/png",
                        });

                        resolve({
                            imageUrl: URL.createObjectURL(blob),
                            file: imageFile,
                        });
                    } else {
                        resolve({
                            imageUrl: "",
                            file: null,
                            error: "Failed to create image",
                        });
                    }
                },
                "image/png",
                1.0
            );
        });
    } catch (err) {
        return {
            imageUrl: "",
            file: null,
            error: `Conversion error: ${err}`,
        };
    }
}