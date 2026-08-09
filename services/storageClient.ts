
// Utility for client-side image compression & instant Base64 storage

/**
 * Compresses an image file client-side to speed up upload & reduce size
 */
const compressImageIfNeeded = async (file: File): Promise<File | Blob> => {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxWidth = 1200;
      const maxHeight = 1200;
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.75
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
};

const fileToDataUrl = (file: Blob | File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Converts a file/image to a compressed Data URL (Base64).
 * This eliminates Firebase Storage CORS errors completely, makes uploads instant,
 * and ensures pictures load reliably without external storage bucket permissions.
 */
export const uploadFile = async (file: File, folder: string = 'general'): Promise<string | null> => {
  try {
    const processedFile = await compressImageIfNeeded(file);
    const dataUrl = await fileToDataUrl(processedFile);
    return dataUrl;
  } catch (error: any) {
    console.error('File processing error:', error);
    alert('Failed to process image/file: ' + (error?.message || 'Unknown error'));
    return null;
  }
};


