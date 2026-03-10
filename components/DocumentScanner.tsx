import React, { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface DocumentScannerProps {
    onSave: (file: File) => void;
    onCancel: () => void;
}

const DocumentScanner: React.FC<DocumentScannerProps> = ({ onSave, onCancel }) => {
    const [images, setImages] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Cropping state
    const [srcToCrop, setSrcToCrop] = useState<string | null>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const imgRef = useRef<HTMLImageElement>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // Process the first file for cropping
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                setSrcToCrop(event.target.result as string);
                setCrop(undefined);
                setCompletedCrop(null);
            }
        };
        reader.readAsDataURL(file);
        
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const confirmCrop = () => {
        if (!completedCrop || !imgRef.current || completedCrop.width === 0 || completedCrop.height === 0) {
            // If no crop, use original
            if (srcToCrop) {
                setImages(prev => [...prev, srcToCrop]);
                setSrcToCrop(null);
            }
            return;
        }

        const image = imgRef.current;
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        
        canvas.width = completedCrop.width;
        canvas.height = completedCrop.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            completedCrop.width,
            completedCrop.height
        );

        const croppedImageUrl = canvas.toDataURL('image/jpeg', 0.9);
        setImages(prev => [...prev, croppedImageUrl]);
        setSrcToCrop(null);
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const generatePDF = async () => {
        if (images.length === 0) return;
        setIsProcessing(true);

        try {
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            for (let i = 0; i < images.length; i++) {
                if (i > 0) pdf.addPage();

                const imgData = images[i];
                const compressedImgData = await compressImage(imgData);

                const imgProps = pdf.getImageProperties(compressedImgData);
                const ratio = imgProps.width / imgProps.height;
                
                let renderWidth = pdfWidth;
                let renderHeight = pdfWidth / ratio;

                if (renderHeight > pdfHeight) {
                    renderHeight = pdfHeight;
                    renderWidth = pdfHeight * ratio;
                }

                const x = (pdfWidth - renderWidth) / 2;
                const y = (pdfHeight - renderHeight) / 2;

                pdf.addImage(compressedImgData, 'JPEG', x, y, renderWidth, renderHeight, undefined, 'MEDIUM');
            }

            const pdfBlob = pdf.output('blob');
            const file = new File([pdfBlob], `Scanned_Document_${Date.now()}.pdf`, { type: 'application/pdf' });
            onSave(file);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("حدث خطأ أثناء إنشاء ملف PDF");
        } finally {
            setIsProcessing(false);
        }
    };

    const compressImage = (dataUrl: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_WIDTH = 1600;
                const MAX_HEIGHT = 2000;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                if (ctx) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } else {
                    resolve(dataUrl);
                }
            };
            img.src = dataUrl;
        });
    };

    if (srcToCrop) {
        return (
            <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[110] flex flex-col p-4 md:p-8 overflow-hidden" dir="rtl">
                <div className="flex justify-between items-center mb-6 text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <i className="fas fa-crop-alt text-sky-400"></i> قص المستند
                    </h2>
                    <button onClick={() => setSrcToCrop(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                
                <div className="flex-1 overflow-hidden flex items-center justify-center bg-black/50 rounded-2xl border border-white/10 p-2">
                    <ReactCrop
                        crop={crop}
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        onComplete={(c) => setCompletedCrop(c)}
                        className="max-h-full"
                    >
                        <img 
                            ref={imgRef}
                            src={srcToCrop} 
                            alt="Crop me" 
                            className="max-h-[70vh] object-contain"
                            onLoad={(e) => {
                                // Set default crop to center 80%
                                const { width, height } = e.currentTarget;
                                setCrop({
                                    unit: '%',
                                    x: 10,
                                    y: 10,
                                    width: 80,
                                    height: 80
                                });
                            }}
                        />
                    </ReactCrop>
                </div>

                <div className="flex justify-center gap-4 mt-6">
                    <button 
                        onClick={() => setSrcToCrop(null)}
                        className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors"
                    >
                        إلغاء
                    </button>
                    <button 
                        onClick={confirmCrop}
                        className="px-8 py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-sky-500/30 transition-all"
                    >
                        <i className="fas fa-check"></i> تأكيد وإضافة
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex flex-col p-4 md:p-8 overflow-hidden" dir="rtl">
            <div className="flex justify-between items-center mb-6 text-white">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <i className="fas fa-file-pdf text-red-400"></i> إنشاء تقرير PDF
                </h2>
                <button onClick={onCancel} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-800/50 rounded-2xl border border-white/10 p-4 mb-6">
                {images.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <i className="fas fa-camera text-6xl mb-4 opacity-50"></i>
                        <p className="text-lg font-bold">لم يتم إضافة أي صفحات بعد</p>
                        <p className="text-sm opacity-70 mt-2">قم بالتقاط صورة أو اختيار صور من المعرض</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {images.map((img, idx) => (
                            <div key={idx} className="relative aspect-[3/4] bg-black rounded-xl overflow-hidden group border-2 border-slate-600">
                                <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-contain" />
                                <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-bold backdrop-blur-sm">
                                    صفحة {idx + 1}
                                </div>
                                <button 
                                    onClick={() => removeImage(idx)}
                                    className="absolute top-2 left-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    ref={cameraInputRef}
                    onChange={handleFileChange}
                />
                <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={galleryInputRef}
                    onChange={handleFileChange}
                />
                
                <button 
                    onClick={() => cameraInputRef.current?.click()}
                    className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                    <i className="fas fa-camera"></i>
                    <span>تصوير مستند</span>
                </button>

                <button 
                    onClick={() => galleryInputRef.current?.click()}
                    className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                >
                    <i className="fas fa-image"></i>
                    <span>استيراد من الهاتف</span>
                </button>

                {images.length > 0 && (
                    <button 
                        onClick={generatePDF}
                        disabled={isProcessing}
                        className="px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/30 disabled:opacity-50"
                    >
                        {isProcessing ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-check-circle"></i>}
                        <span>حفظ كملف PDF ({images.length} صفحات)</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default DocumentScanner;
