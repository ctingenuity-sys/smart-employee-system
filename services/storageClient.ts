
import { supabase } from './supabase';

/**
 * Uploads a file to Supabase Storage
 * @param file The file to upload
 * @param folder The folder path (e.g., 'user_documents/123')
 * @returns The public download URL or null if failed
 */
export const uploadFile = async (file: File, folder: string = 'general'): Promise<string | null> => {
  try {
    // 1. Sanitize filename
    const fileExt = file.name.split('.').pop() || 'bin';
    const cleanFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
    const fullPath = `${folder}/${cleanFileName}`;

    // 2. Upload to Supabase
    // Assuming a bucket named 'documents' exists
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(fullPath, file);

    if (error) throw error;

    // 3. Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fullPath);

    return publicUrlData.publicUrl;
  } catch (error: any) {
    console.error('Supabase Upload Error:', error);
    alert('Upload failed: ' + error.message);
    return null;
  }
};
